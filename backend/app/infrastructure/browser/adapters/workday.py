import asyncio
import logging
import re
import uuid
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.workday")


class WorkdayAdapter(BaseJobSourceAdapter):
    """Job Discovery and Application Adapter for Workday ATS portals."""

    @property
    def source_type(self) -> str:
        return "workday"

    async def health_check(self, context: BrowserContext) -> bool:
        return True

    async def search_jobs(self, context: BrowserContext, filters: SearchQueryFilter) -> AsyncGenerator[Job, None]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            company_slug = filters.roles[0].lower().replace(" ", "") if filters.roles else "adobe"
            target_url = f"https://{company_slug}.wd5.myworkdayjobs.com/en-US/external"
            logger.info(f"Navigating to Workday portal: {target_url}")

            await page.goto(target_url, timeout=30000, wait_until="domcontentloaded")
            await asyncio.sleep(2)

            postings = await page.query_selector_all("li.css-1q2dra3, li[data-automation-id='job-item'], ul[role='list'] li")
            for post in postings:
                link_el = await post.query_selector("a[data-automation-id='jobTitle'], a")
                loc_el = await post.query_selector("span[data-automation-id='jobLocation'], span.css-150937n")

                if not link_el:
                    continue

                title = (await link_el.inner_text()).strip()
                apply_url = await link_el.get_attribute("href") or ""
                if apply_url and not apply_url.startswith("http"):
                    apply_url = f"https://{company_slug}.wd5.myworkdayjobs.com{apply_url}"

                location = (await loc_el.inner_text()).strip() if loc_el else "Any Location"
                job_id_match = re.search(r"/job/[^/]+/([A-Za-z0-9_\-]+)", apply_url)
                external_id = job_id_match.group(1) if job_id_match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))

                yield Job(
                    id=str(uuid.uuid4()),
                    source_id="workday",
                    external_job_id=str(external_id),
                    title=title,
                    company=company_slug.capitalize(),
                    location=location,
                    apply_url=apply_url,
                    raw_description=f"{title} at {company_slug.capitalize()}",
                    is_active=True,
                )
        except Exception as e:
            logger.error(f"Workday extraction failed: {e}")
        finally:
            if page and not page.is_closed():
                await page.close()

    async def fetch_job_details(self, context: BrowserContext, external_job_id: str, apply_url: str) -> Optional[Job]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(apply_url, timeout=25000, wait_until="domcontentloaded")
            desc_el = await page.query_selector("div[data-automation-id='jobPostingDescription'], .css-cyx99x")
            desc_text = (await desc_el.inner_text()).strip() if desc_el else ""
            return Job(
                id=str(uuid.uuid4()),
                source_id="workday",
                external_job_id=external_job_id,
                title="",
                company="",
                location="",
                apply_url=apply_url,
                raw_description=desc_text,
            )
        except Exception as e:
            logger.warning(f"Failed to fetch Workday job details: {e}")
            return None
        finally:
            if page and not page.is_closed():
                await page.close()
