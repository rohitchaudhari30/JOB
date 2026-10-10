import inspect
import logging
import re
import uuid
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseApplicationAdapter, BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.greenhouse")


class GreenhouseAdapter(BaseJobSourceAdapter):
    """Job Discovery and Application Adapter for Greenhouse ATS (boards.greenhouse.io)."""

    @property
    def source_type(self) -> str:
        return "greenhouse"

    async def health_check(self, context: BrowserContext) -> bool:
        return True  # Direct public ATS board

    async def search_jobs(self, context: BrowserContext, filters: SearchQueryFilter) -> AsyncGenerator[Job, None]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            # If target URL is not configured in filters, use company keyword if present
            company_slug = filters.roles[0].lower().replace(" ", "") if filters.roles else "stripe"
            target_url = f"https://boards.greenhouse.io/{company_slug}"
            logger.info(f"Navigating to Greenhouse board: {target_url}")

            await page.goto(target_url, timeout=30000, wait_until="domcontentloaded")
            await asyncio.sleep(1.5)

            rows = await page.query_selector_all(".opening, tr.job-post, [data-department-id]")
            for row in rows:
                link_el = await row.query_selector("a")
                loc_el = await row.query_selector(".location, td.location")

                if not link_el:
                    continue

                title = (await link_el.inner_text()).strip()
                apply_url = await link_el.get_attribute("href") or ""
                if apply_url and not apply_url.startswith("http"):
                    apply_url = f"https://boards.greenhouse.io{apply_url}"

                location = (await loc_el.inner_text()).strip() if loc_el else "Remote / Various"
                job_id_match = re.search(r"/jobs/(\d+)", apply_url)
                external_id = job_id_match.group(1) if job_id_match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))

                yield Job(
                    id=str(uuid.uuid4()),
                    source_id="greenhouse",
                    external_job_id=str(external_id),
                    title=title,
                    company=company_slug.capitalize(),
                    location=location,
                    apply_url=apply_url,
                    raw_description=f"{title} at {company_slug.capitalize()}",
                    is_active=True,
                )
        except Exception as e:
            logger.error(f"Greenhouse extraction failed: {e}")
        finally:
            if page and not page.is_closed():
                await page.close()

    async def fetch_job_details(self, context: BrowserContext, external_job_id: str, apply_url: str) -> Optional[Job]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(apply_url, timeout=25000, wait_until="domcontentloaded")
            desc_el = await page.query_selector("#content, .job-post-description, #main")
            desc_text = (await desc_el.inner_text()).strip() if desc_el else ""
            return Job(
                id=str(uuid.uuid4()),
                source_id="greenhouse",
                external_job_id=external_job_id,
                title="",
                company="",
                location="",
                apply_url=apply_url,
                raw_description=desc_text,
            )
        except Exception as e:
            logger.warning(f"Failed to fetch Greenhouse job details: {e}")
            return None
        finally:
            if page and not page.is_closed():
                await page.close()


class GreenhouseApplicationAdapter(BaseApplicationAdapter):
    """Application adapter for Greenhouse ATS."""

    @property
    def source_type(self) -> str:
        return "greenhouse"

    async def open_application(self, page, apply_url: str) -> bool:
        await page.goto(apply_url, timeout=30000, wait_until="domcontentloaded")
        return True

    async def handle_challenge(self, page) -> Optional[str]:
        return None

    async def submit_application(self, page) -> bool:
        submit_btn = page.locator("#submit_app, input[type='submit']").first
        await submit_btn.click(timeout=8000)
        return True

    async def verify_submission(self, page, original_url: str) -> Optional[tuple[bool, str]]:
        curr_url = (getattr(page, "url", "") or "").lower()
        if "/thanks" in curr_url or "#thanks" in curr_url:
            return (True, f"Greenhouse confirmation URL reached: {curr_url}")
        try:
            if hasattr(page, "evaluate"):
                check_script = """
                () => {
                    const text = ((document.body ? document.body.innerText : '') || '').toLowerCase();
                    if (text.includes('thank you for applying') || 
                        text.includes('application has been submitted') || 
                        text.includes('application has been received') ||
                        text.includes('thank you')) {
                        return true;
                    }
                    return false;
                }
                """
                res = page.evaluate(check_script)
                if inspect.isawaitable(res):
                    res = await res
                if res:
                    return (True, "Greenhouse confirmation text detected on page.")
        except Exception as e:
            logger.warning(f"Greenhouse verification error: {e}")
        return None

