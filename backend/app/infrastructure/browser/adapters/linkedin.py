import asyncio
import logging
import re
import urllib.parse
import uuid
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.linkedin")


class LinkedInAdapter(BaseJobSourceAdapter):
    """Job Discovery and Easy Apply Adapter for LinkedIn."""

    BASE_URL = "https://www.linkedin.com"

    @property
    def source_type(self) -> str:
        return "linkedin"

    async def health_check(self, context: BrowserContext) -> bool:
        """Verifies if the user's LinkedIn session is active."""
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(f"{self.BASE_URL}/feed/", timeout=20000, wait_until="domcontentloaded")
            if "login" in page.url or "checkpoint" in page.url:
                return False
            nav_el = await page.query_selector(".global-nav__me, .feed-identity-module")
            return nav_el is not None
        except Exception as e:
            logger.warning(f"LinkedIn health check failed: {e}")
            return False
        finally:
            if page and not page.is_closed():
                await page.close()

    def _build_search_url(self, filters: SearchQueryFilter) -> str:
        keywords = " ".join(filters.roles) if filters.roles else "Software Engineer"
        locations = " ".join(filters.locations) if filters.locations else ""

        params = {
            "keywords": keywords,
            "f_AL": "true",  # Easy Apply filter
            "position": "1",
            "pageNum": "0",
        }
        if locations:
            params["location"] = locations

        # Dynamic Experience Level (f_E) Mapping for LinkedIn
        # 1: Internship, 2: Entry level, 3: Associate, 4: Mid-Senior, 5: Director, 6: Executive
        exp_target = None
        if filters.experience is not None and filters.experience >= 0:
            exp_target = float(filters.experience)
        elif filters.min_experience > 0:
            exp_target = float(filters.min_experience)

        if exp_target is not None:
            if exp_target <= 1.0:
                params["f_E"] = "1,2"
            elif exp_target <= 3.0:
                params["f_E"] = "2,3"
            elif exp_target <= 6.0:
                params["f_E"] = "3,4"
            elif exp_target <= 10.0:
                params["f_E"] = "4,5"
            else:
                params["f_E"] = "5,6"

        # Dynamic Freshness Filter (f_TPR)
        # r86400 = Past 24 hours, r604800 = Past week, r2592000 = Past month
        if filters.max_days_posted:
            if filters.max_days_posted <= 1:
                params["f_TPR"] = "r86400"
            elif filters.max_days_posted <= 7:
                params["f_TPR"] = "r604800"
            elif filters.max_days_posted <= 30:
                params["f_TPR"] = "r2592000"

        # Sort by date (newest first)
        if getattr(filters, "sort_by_date", True):
            params["sortBy"] = "DD"

        query_str = urllib.parse.urlencode(params)
        return f"{self.BASE_URL}/jobs/search/?{query_str}"

    async def search_jobs(
        self,
        context: BrowserContext,
        filters: SearchQueryFilter,
        user_id: Optional[str] = None,
        run_id: Optional[str] = None,
        **kwargs,
    ) -> AsyncGenerator[Job, None]:
        page: Optional[Page] = None
        streamer = None
        try:
            page = await context.new_page()
            if user_id and run_id:
                from app.infrastructure.browser.screenshot_streamer import ScreenshotStreamer
                streamer = ScreenshotStreamer(page=page, user_id=user_id, run_id=run_id, fps=5)
                streamer.start()

            search_url = self._build_search_url(filters)
            logger.info(f"Navigating to LinkedIn search: {search_url}")

            await page.goto(search_url, timeout=30000, wait_until="domcontentloaded")

            # Wait for job card elements to mount dynamically
            try:
                await page.wait_for_selector(
                    ".job-card-container, .jobs-search-results__list-item, div[data-job-id], ul.jobs-search__results-list li, div.base-card",
                    timeout=8000
                )
            except Exception:
                pass

            await asyncio.sleep(2)  # Settle delay

            cards = await page.query_selector_all(
                ".job-card-container, .jobs-search-results__list-item, div[data-job-id], ul.jobs-search__results-list li, div.base-card"
            )
            logger.info(f"Found {len(cards)} job cards on LinkedIn.")

            for card in cards:
                try:
                    job = await self._parse_job_card(card, page, filters)
                    if job:
                        yield job
                except Exception as card_err:
                    logger.warning(f"Failed to parse LinkedIn job card: {card_err}")

        except Exception as e:
            logger.error(f"LinkedIn search failed: {e}")
        finally:
            if streamer:
                await streamer.stop()
            if page and not page.is_closed():
                await page.close()

    async def _parse_job_card(self, card, page: Page, filters: Optional[SearchQueryFilter] = None) -> Optional[Job]:
        title_el = await card.query_selector(
            ".job-card-list__title, .artdeco-entity-lockup__title a, a[data-control-name='job_card_click'], a.base-card__full-link, h3.base-search-card__title"
        )
        company_el = await card.query_selector(
            ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, h4.base-search-card__subtitle a, h4.base-search-card__subtitle"
        )
        loc_el = await card.query_selector(
            ".job-card-container__metadata-item, .artdeco-entity-lockup__caption, span.job-search-card__location"
        )
        date_el = await card.query_selector(
            "time, .job-search-card__listdate, .job-search-card__listdate--new, .job-card-container__listed-time, time[datetime], .job-card-list__footer-item"
        )

        if not title_el:
            return None

        title = (await title_el.inner_text()).strip()
        apply_url = await title_el.get_attribute("href") or ""
        if apply_url and not apply_url.startswith("http"):
            apply_url = f"{self.BASE_URL}{apply_url}"

        # Extract LinkedIn Job ID
        job_id_attr = await card.get_attribute("data-job-id")
        if not job_id_attr:
            match = re.search(r"view/(\d+)", apply_url) or re.search(r"currentJobId=(\d+)", apply_url)
            external_job_id = match.group(1) if match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))
        else:
            external_job_id = job_id_attr

        company = (await company_el.inner_text()).strip() if company_el else "Confidential Company"
        location = (await loc_el.inner_text()).strip() if loc_el else "Any Location"

        # Date & Freshness parsing
        raw_posted_text = (await date_el.inner_text()).strip() if date_el else None
        if not raw_posted_text and date_el:
            raw_posted_text = await date_el.get_attribute("datetime")

        from app.domain.jobs.freshness import FreshnessCalculator, PostedDateParser
        posted_at, precision, _ = PostedDateParser.parse(raw_posted_text)
        freshness_bucket = FreshnessCalculator.calculate_bucket(posted_at).value if posted_at else "UNKNOWN"
        freshness_score = FreshnessCalculator.calculate_score(posted_at) if posted_at else 50.0

        min_exp = float(filters.min_experience if filters and filters.min_experience else 0.0)
        max_exp = float(filters.max_experience if filters and filters.max_experience else 10.0)

        return Job(
            id=str(uuid.uuid4()),
            source_id="linkedin",
            source_type="linkedin",
            external_job_id=str(external_job_id),
            title=title,
            company=company,
            location=location,
            min_experience_years=min_exp,
            max_experience_years=max_exp,
            apply_url=apply_url,
            raw_description=f"{title} at {company} ({location})",
            parsed_requirements={"mandatory_skills": [], "preferred_skills": []},
            is_active=True,
            posted_at=posted_at,
            raw_posted_text=raw_posted_text,
            posted_at_precision=precision,
            posted_at_source="linkedin",
            freshness_bucket=freshness_bucket,
            freshness_score=freshness_score,
        )

    async def fetch_job_details(self, context: BrowserContext, external_job_id: str, apply_url: str) -> Optional[Job]:
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(apply_url, timeout=25000, wait_until="domcontentloaded")
            desc_el = await page.query_selector(".jobs-description__content, .jobs-box__html-content, .show-more-less-html__markup")
            desc_text = (await desc_el.inner_text()).strip() if desc_el else ""

            return Job(
                id=str(uuid.uuid4()),
                source_id="linkedin",
                source_type="linkedin",
                external_job_id=external_job_id,
                title="",
                company="",
                location="",
                apply_url=apply_url,
                raw_description=desc_text,
            )
        except Exception as e:
            logger.warning(f"Failed to fetch LinkedIn job details: {e}")
            return None
        finally:
            if page and not page.is_closed():
                await page.close()
