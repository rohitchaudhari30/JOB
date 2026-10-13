import asyncio
import logging
import re
import uuid
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.lever")


class LeverAdapter(BaseJobSourceAdapter):
    """Job Discovery and Application Adapter for Lever ATS (jobs.lever.co)."""

    @property
    def source_type(self) -> str:
        return "lever"

    async def health_check(self, context: BrowserContext) -> bool:
        return True

    async def search_jobs(self, context: BrowserContext, filters: SearchQueryFilter) -> AsyncGenerator[Job, None]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            if not filters.companies:
                raise ValueError("Lever discovery needs at least one company board name in 'companies'.")
            company_slug = filters.companies[0].lower().replace(" ", "")
            target_url = f"https://jobs.lever.co/{company_slug}"
            logger.info(f"Navigating to Lever career board: {target_url}")

            await page.goto(target_url, timeout=30000, wait_until="domcontentloaded")
            await asyncio.sleep(1.5)

            postings = await page.query_selector_all(".posting, [data-qa='posting-item']")
            for post in postings:
                title_el = await post.query_selector("h5[data-qa='posting-name'], .posting-title h5, a")
                link_el = await post.query_selector("a.posting-title, a.posting-btn-submit, a")
                loc_el = await post.query_selector(".sort-by-location, .workplaceTypes, span.posting-categories")

                if not title_el or not link_el:
                    continue

                title = (await title_el.inner_text()).strip()
                apply_url = await link_el.get_attribute("href") or ""
                location = (await loc_el.inner_text()).strip() if loc_el else "Remote / Onsite"

                # Extract external ID from URL (e.g. /1234-abcd-5678)
                match = re.search(r"lever\.co/[^/]+/([a-f0-9\-]+)", apply_url)
                external_id = match.group(1) if match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))

                yield Job(
                    id=str(uuid.uuid4()),
                    source_id="lever",
                    external_job_id=str(external_id),
                    title=title,
                    company=company_slug.capitalize(),
                    location=location,
                    apply_url=apply_url,
                    raw_description=f"{title} at {company_slug.capitalize()}",
                    is_active=True,
                )
        except Exception as e:
            logger.error(f"Lever job extraction failed: {e}")
            raise
        finally:
            if page and not page.is_closed():
                await page.close()

    async def fetch_job_details(self, context: BrowserContext, external_job_id: str, apply_url: str) -> Optional[Job]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(apply_url, timeout=25000, wait_until="domcontentloaded")
            desc_el = await page.query_selector(".section-wrapper, .posting-page, div[data-qa='job-description']")
            desc_text = (await desc_el.inner_text()).strip() if desc_el else ""
            return Job(
                id=str(uuid.uuid4()),
                source_id="lever",
                external_job_id=external_job_id,
                title="",
                company="",
                location="",
                apply_url=apply_url,
                raw_description=desc_text,
            )
        except Exception as e:
            logger.warning(f"Failed to fetch Lever job details: {e}")
            return None
        finally:
            if page and not page.is_closed():
                await page.close()
