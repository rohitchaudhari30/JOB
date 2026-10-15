import asyncio
import logging
import re
import uuid
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.ashby")


class AshbyAdapter(BaseJobSourceAdapter):
    """Job Discovery and Application Adapter for Ashby ATS (jobs.ashbyhq.com)."""

    @property
    def source_type(self) -> str:
        return "ashby"

    async def health_check(self, context: BrowserContext) -> bool:
        return True

    async def search_jobs(self, context: BrowserContext, filters: SearchQueryFilter, **kwargs) -> AsyncGenerator[Job, None]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            if not filters.companies:
                raise ValueError("Ashby discovery needs at least one company board name in 'companies'.")
            company_slug = filters.companies[0].lower().replace(" ", "")
            target_url = f"https://jobs.ashbyhq.com/{company_slug}"
            logger.info(f"Navigating to Ashby board: {target_url}")

            await page.goto(target_url, timeout=30000, wait_until="domcontentloaded")
            await asyncio.sleep(1.5)

            postings = await page.query_selector_all("a[class*='ashby-job-posting'], a[href*='/jobs.ashbyhq.com/']")
            for post in postings:
                title_el = await post.query_selector("h3, h2, span[class*='title']")
                loc_el = await post.query_selector("span[class*='location'], p[class*='location']")

                apply_url = await post.get_attribute("href") or ""
                if not apply_url:
                    continue
                if not apply_url.startswith("http"):
                    apply_url = f"https://jobs.ashbyhq.com{apply_url}"

                title = (await title_el.inner_text()).strip() if title_el else "Software Engineer"
                location = (await loc_el.inner_text()).strip() if loc_el else "Remote"

                job_id_match = re.search(r"/([a-f0-9\-]+)$", apply_url)
                external_id = job_id_match.group(1) if job_id_match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))

                yield Job(
                    id=str(uuid.uuid4()),
                    source_id="ashby",
                    external_job_id=str(external_id),
                    title=title,
                    company=company_slug.capitalize(),
                    location=location,
                    apply_url=apply_url,
                    raw_description=f"{title} at {company_slug.capitalize()}",
                    is_active=True,
                )
        except Exception as e:
            logger.error(f"Ashby job extraction failed: {e}")
            raise
        finally:
            if page and not page.is_closed():
                await page.close()

    async def fetch_job_details(self, context: BrowserContext, external_job_id: str, apply_url: str) -> Optional[Job]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(apply_url, timeout=25000, wait_until="domcontentloaded")
            desc_el = await page.query_selector("div[class*='description'], section#description, main")
            desc_text = (await desc_el.inner_text()).strip() if desc_el else ""
            return Job(
                id=str(uuid.uuid4()),
                source_id="ashby",
                external_job_id=external_job_id,
                title="",
                company="",
                location="",
                apply_url=apply_url,
                raw_description=desc_text,
            )
        except Exception as e:
            logger.warning(f"Failed to fetch Ashby job details: {e}")
            return None
        finally:
            if page and not page.is_closed():
                await page.close()
