import asyncio
import logging
import re
import urllib.parse
import uuid
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.naukri")


class NaukriAdapter(BaseJobSourceAdapter):
    """Job Discovery and Application Adapter for Naukri.com."""

    BASE_URL = "https://www.naukri.com"

    @property
    def source_type(self) -> str:
        return "naukri"

    async def health_check(self, context: BrowserContext) -> bool:
        """Checks if the user's session on Naukri is valid and authenticated."""
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(f"{self.BASE_URL}/mnjuser/homepage", timeout=20000, wait_until="domcontentloaded")
            # If redirected to login or login button is visible, session is expired
            if "nlogin" in page.url or "/login" in page.url:
                return False
            # Check for profile icon or logged-in navigation bar
            user_icon = await page.query_selector(".nI-gNb-drawer, .user-name, .view-profile")
            return user_icon is not None
        except Exception as e:
            logger.warning(f"Naukri health check failed with error: {e}")
            return False
        finally:
            if page and not page.is_closed():
                await page.close()

    def _build_search_url(self, filters: SearchQueryFilter, page_num: int = 1) -> str:
        # Sanitize role keywords
        roles = [re.sub(r'[^a-zA-Z0-9\s]', '', r).strip() for r in (filters.roles or ["software engineer"]) if r.strip()]
        role_slug = "-".join([re.sub(r'\s+', '-', r.lower()) for r in roles]) if roles else "software-engineer"

        # Sanitize locations (split compound strings like "Pune, Mumbai, Remote")
        loc_items = []
        if filters.locations:
            for loc in filters.locations:
                for part in re.split(r'[,/|]', loc):
                    cleaned = re.sub(r'[^a-zA-Z0-9\s]', '', part).strip()
                    if cleaned and cleaned.lower() not in ['remote', 'any', 'all']:
                        loc_items.append(cleaned)

        if loc_items:
            loc_slug = "-".join([re.sub(r'\s+', '-', l.lower()) for l in loc_items[:3]])
            path = f"{role_slug}-jobs-in-{loc_slug}"
        else:
            path = f"{role_slug}-jobs"

        params = {}
        # Experience filter (Naukri supports e.g. experience=2)
        exp_target = None
        if filters.experience is not None and filters.experience >= 0:
            exp_target = int(filters.experience)
        elif filters.min_experience > 0:
            exp_target = int(filters.min_experience)

        if exp_target is not None:
            params["experience"] = exp_target

        # Freshness filter (jobAge parameter in Naukri)
        if filters.max_days_posted:
            if filters.max_days_posted <= 1:
                params["jobAge"] = 1
            elif filters.max_days_posted <= 3:
                params["jobAge"] = 3
            elif filters.max_days_posted <= 7:
                params["jobAge"] = 7
            elif filters.max_days_posted <= 15:
                params["jobAge"] = 15
            elif filters.max_days_posted <= 30:
                params["jobAge"] = 30

        # Freshness sorting (newest first)
        if getattr(filters, "sort_by_date", True):
            params["sortBy"] = "postDateDesc"

        if page_num > 1:
            params["pageNo"] = page_num

        query_str = urllib.parse.urlencode(params)
        url = f"{self.BASE_URL}/{path.lower()}"
        if query_str:
            url += f"?{query_str}"
        return url

    async def search_jobs(
        self,
        context: BrowserContext,
        filters: SearchQueryFilter,
        user_id: Optional[str] = None,
        run_id: Optional[str] = None,
        **kwargs,
    ) -> AsyncGenerator[Job, None]:
        """Navigates Naukri search results, paginates, and yields extracted jobs."""
        page: Optional[Page] = None
        streamer = None
        try:
            pages = getattr(context, "pages", None)
            page = pages[0] if (isinstance(pages, list) and len(pages) > 0) else await context.new_page()
            if user_id and run_id:
                from app.infrastructure.browser.screenshot_streamer import ScreenshotStreamer
                streamer = ScreenshotStreamer(page=page, user_id=user_id, run_id=run_id, fps=5)
                streamer.start()

            search_url = self._build_search_url(filters)
            logger.info(f"Navigating to Naukri search: {search_url}")

            await page.goto(search_url, timeout=30000, wait_until="domcontentloaded")

            # Wait for job card elements to mount dynamically
            try:
                await page.wait_for_selector(
                    ".srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, div[data-job-id], div[class*='srp-jobtuple']",
                    timeout=8000
                )
            except Exception:
                pass

            # Dismiss any open search autocomplete dropdowns or backdrops
            try:
                await page.evaluate("""() => {
                    document.querySelectorAll('.nI-gNb-backdrop, .drawer-wrapper').forEach(el => el.remove());
                    if (document.activeElement && document.activeElement.blur) {
                        document.activeElement.blur();
                    }
                }""")
            except Exception:
                pass

            # Natural smooth visual scan with dynamic scrolling across listings
            for _ in range(3):
                await page.evaluate("window.scrollBy({ top: 450, behavior: 'smooth' })")
                await asyncio.sleep(0.35)

            # Single high-performance in-browser extraction of all job cards
            raw_cards_data = await page.evaluate("""
                () => {
                    const selectors = [
                        ".srp-jobtuple-wrapper",
                        "article.jobTuple",
                        ".cust-job-tuple",
                        "div[data-job-id]",
                        "div[class*='srp-jobtuple']",
                        "div.tuple",
                        "div[class*='styles_job-tuple']",
                        "div[class*='jobTuple']",
                        "div.cust-job-tuple"
                    ];
                    const cards = document.querySelectorAll(selectors.join(", "));
                    const results = [];
                    cards.forEach(card => {
                        try {
                            card.style.transition = 'box-shadow 0.2s ease';
                            card.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.6)';
                        } catch (e) {}

                        const titleEl = card.querySelector("a.title, .title a, a[title]");
                        if (!titleEl) return;
                        const compEl = card.querySelector("a.comp-name, .subTitle a, .comp-name");
                        const expEl = card.querySelector(".exp-wrap, .experience, span[class*='exp'], li[class*='experience']");
                        const salEl = card.querySelector(".sal-wrap, .salary, span[class*='sal']");
                        const locEl = card.querySelector(".loc-wrap, .location, span[class*='loc']");
                        const descEl = card.querySelector(".job-desc, .job-description, .row6");
                        const dateEl = card.querySelector(".job-post-day, span.job-post-day, span.date, span.posted-date, span.fright, span[class*='styles_date'], span[class*='job-post-day'], span[class*='posted-by'], span[class*='date'], .tuple-footer span, .styles_jhc__desc__p_Gg5 span, .job-desc-date, .nI-gNb-timestamp, .type, .tags-gt span, span.styles_post-date");
                        
                        results.push({
                            title: (titleEl.innerText || "").trim(),
                            href: titleEl.getAttribute("href") || "",
                            cardJobId: card.getAttribute("data-job-id") || "",
                            company: compEl ? (compEl.innerText || "").trim() : "Confidential Company",
                            location: locEl ? (locEl.innerText || "").trim() : "Any Location",
                            description: descEl ? (descEl.innerText || "").trim() : "",
                            postedText: dateEl ? (dateEl.innerText || "").trim() : "",
                            cardText: card.innerText || "",
                            expText: expEl ? (expEl.innerText || "").trim() : "",
                            salText: salEl ? (salEl.innerText || "").trim() : ""
                        });
                    });
                    return results;
                }
            """)
            logger.info(f"Extracted {len(raw_cards_data)} raw job cards from Naukri in one pass.")

            for item in raw_cards_data:
                try:
                    job = self._build_job_from_dict(item)
                    if job:
                        yield job
                except Exception as card_err:
                    logger.warning(f"Failed to parse individual job card on Naukri: {card_err}")

        except Exception as e:
            logger.error(f"Naukri search failed: {e}")
        finally:
            if streamer:
                await streamer.stop()
            if page and not page.is_closed():
                await page.close()

    def _build_job_from_dict(self, item: dict) -> Optional[Job]:
        """Fast memory-only builder from in-browser extracted dictionary."""
        title = item.get("title", "").strip()
        if not title:
            return None

        apply_url = item.get("href", "")
        if apply_url and not apply_url.startswith("http"):
            apply_url = f"{self.BASE_URL}{apply_url}"

        # Extract external job ID from URL or card dataset
        job_id_attr = item.get("cardJobId")
        if not job_id_attr:
            match = re.search(r"(\d{8,14})", apply_url)
            external_job_id = match.group(1) if match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))
        else:
            external_job_id = job_id_attr

        company = item.get("company", "Confidential Company")
        location = item.get("location", "Any Location")
        raw_description = item.get("description") or f"{title} at {company}"

        raw_posted_text = item.get("postedText")
        if not raw_posted_text:
            card_text = item.get("cardText", "")
            date_match = re.search(
                r"(just now|few (?:seconds|mins?|minutes|hours?) ago|\d+\+?\s*(?:day|days|hour|hours|min|mins|minute|minutes|week|weeks|month|months)\s*ago|posted today|posted yesterday|today|yesterday|\d+\s*days?\s*ago)",
                card_text,
                re.IGNORECASE,
            )
            if date_match:
                raw_posted_text = date_match.group(1).strip()

        from app.domain.jobs.freshness import FreshnessCalculator, PostedDateParser
        posted_at, precision, _ = PostedDateParser.parse(raw_posted_text)
        freshness_bucket = FreshnessCalculator.calculate_bucket(posted_at).value if posted_at else "UNKNOWN"
        freshness_score = FreshnessCalculator.calculate_score(posted_at) if posted_at else 50.0

        # Parse experience string
        min_exp, max_exp = 0.0, 10.0
        exp_text = item.get("expText", "")
        if exp_text:
            exp_range_match = re.search(r"(\d+)\s*-\s*(\d+)", exp_text)
            if exp_range_match:
                min_exp = float(exp_range_match.group(1))
                max_exp = float(exp_range_match.group(2))
            else:
                single_exp_match = re.search(r"(\d+)\+?\s*(?:yrs|years|yr)?", exp_text, re.IGNORECASE)
                if single_exp_match:
                    min_exp = float(single_exp_match.group(1))
                    max_exp = min_exp + 3.0

        # Parse salary string
        min_sal, max_sal = None, None
        sal_text = item.get("salText", "")
        if sal_text:
            sal_match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", sal_text)
            if sal_match:
                min_sal = float(sal_match.group(1)) * 100000
                max_sal = float(sal_match.group(2)) * 100000

        return Job(
            id=str(uuid.uuid4()),
            source_id="naukri",
            source_type="naukri",
            external_job_id=str(external_job_id),
            title=title,
            company=company,
            location=location,
            min_experience_years=min_exp,
            max_experience_years=max_exp,
            min_salary=min_sal,
            max_salary=max_sal,
            salary_currency="INR",
            employment_type="Full-time",
            apply_url=apply_url,
            raw_description=raw_description,
            parsed_requirements={"mandatory_skills": [], "preferred_skills": []},
            is_active=True,
            posted_at=posted_at,
            raw_posted_text=raw_posted_text,
            posted_at_precision=precision,
            posted_at_source="naukri",
            freshness_bucket=freshness_bucket,
            freshness_score=freshness_score,
        )

    async def fetch_job_details(self, context: BrowserContext, external_job_id: str, apply_url: str) -> Optional[Job]:
        """Fetches full job description from the direct job page."""
        page: Optional[Page] = None
        try:
            page = await context.new_page()
            await page.goto(apply_url, timeout=25000, wait_until="domcontentloaded")
            desc_el = await page.query_selector(".job-desc-section, .jd-container, .styles_job-desc-container__kb-TH")
            desc_text = (await desc_el.inner_text()).strip() if desc_el else ""

            return Job(
                id=str(uuid.uuid4()),
                source_id="naukri",
                external_job_id=external_job_id,
                title="",
                company="",
                location="",
                apply_url=apply_url,
                raw_description=desc_text,
            )
        except Exception as e:
            logger.warning(f"Failed to fetch job details from {apply_url}: {e}")
            return None
        finally:
            if page and not page.is_closed():
                await page.close()
