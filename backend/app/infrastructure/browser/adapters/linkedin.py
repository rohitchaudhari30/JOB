import asyncio
import logging
import re
import urllib.parse
import uuid
import inspect
from typing import AsyncGenerator, Optional
from playwright.async_api import BrowserContext, Page
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseApplicationAdapter, BaseJobSourceAdapter

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
        role_part = " ".join([f'"{r}"' if ' ' in r and not r.startswith('"') else r for r in filters.roles]) if filters.roles else "Software Engineer"
        keywords = role_part.strip() if role_part.strip() else "Software Engineer"
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
            pages = getattr(context, "pages", None)
            page = pages[0] if (isinstance(pages, list) and len(pages) > 0) else await context.new_page()
            logger.info("page_created", extra={"platform": "linkedin", "run_id": run_id})
            if user_id and run_id:
                from app.infrastructure.browser.screenshot_streamer import ScreenshotStreamer
                streamer = ScreenshotStreamer(page=page, user_id=user_id, run_id=run_id, fps=5)
                streamer.start()
                logger.info("screencast_started", extra={"platform": "linkedin", "run_id": run_id})

            search_url = self._build_search_url(filters)
            logger.info("navigation_started", extra={"platform": "linkedin", "run_id": run_id, "url": search_url})

            await page.goto(search_url, timeout=30000, wait_until="domcontentloaded")
            logger.info("navigation_completed", extra={"platform": "linkedin", "run_id": run_id, "url": search_url})

            if page.is_closed():
                raise RuntimeError("Target page, context or browser has been closed during search.")

            # Wait for job card elements to mount dynamically
            try:
                await page.wait_for_selector(
                    ".job-card-container, .jobs-search-results__list-item, div[data-job-id], ul.jobs-search__results-list li, div.base-card",
                    timeout=8000
                )
            except Exception as wait_err:
                if page.is_closed() or "closed" in str(wait_err).lower():
                    raise RuntimeError(f"Target page, context or browser has been closed: {wait_err}") from wait_err
                logger.debug(f"Selector wait non-critical timeout: {wait_err}")

            # Dismiss any open modals or backdrops
            if not page.is_closed():
                try:
                    await page.evaluate("""() => {
                        document.querySelectorAll('.modal__overlay, .artdeco-modal-overlay').forEach(el => el.remove());
                        if (document.activeElement && document.activeElement.blur) {
                            document.activeElement.blur();
                        }
                    }""")
                except Exception as eval_err:
                    if page.is_closed() or "closed" in str(eval_err).lower():
                        raise RuntimeError(f"Target page, context or browser has been closed: {eval_err}") from eval_err
                    logger.debug(f"Dismiss modal evaluation skipped: {eval_err}")

            # Natural smooth visual scan with dynamic scrolling across listings
            for _ in range(3):
                if page.is_closed():
                    raise RuntimeError("Target page, context or browser has been closed during scrolling.")
                try:
                    await page.evaluate("window.scrollBy({ top: 450, behavior: 'smooth' })")
                    await asyncio.sleep(0.35)
                except Exception as scroll_err:
                    if page.is_closed() or "closed" in str(scroll_err).lower():
                        raise RuntimeError(f"Target page, context or browser has been closed during scrolling: {scroll_err}") from scroll_err
                    logger.debug(f"Scroll pass interrupted: {scroll_err}")
                    break

            if page.is_closed():
                raise RuntimeError("Target page, context or browser has been closed prior to extraction.")

            logger.info("search_started", extra={"platform": "linkedin", "run_id": run_id})
            # Single high-performance in-browser extraction of all job cards
            try:
                raw_cards_data = await page.evaluate("""
                () => {
                    const cards = document.querySelectorAll(
                        ".job-card-container, .jobs-search-results__list-item, div[data-job-id], ul.jobs-search__results-list li, div.base-card"
                    );
                    const results = [];
                    cards.forEach(card => {
                        try {
                            card.style.transition = 'box-shadow 0.2s ease';
                            card.style.boxShadow = '0 0 0 2px rgba(10, 102, 194, 0.6)';
                        } catch (e) {}

                        const titleEl = card.querySelector(
                            ".job-card-list__title, .artdeco-entity-lockup__title a, a[data-control-name='job_card_click'], a.base-card__full-link, h3.base-search-card__title"
                        );
                        if (!titleEl) return;
                        const compEl = card.querySelector(
                            ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, h4.base-search-card__subtitle a, h4.base-search-card__subtitle"
                        );
                        const locEl = card.querySelector(
                            ".job-card-container__metadata-item, .artdeco-entity-lockup__caption, span.job-search-card__location"
                        );
                        const dateEl = card.querySelector(
                            "time, .job-search-card__listdate, .job-search-card__listdate--new, .job-card-container__listed-time, time[datetime], .job-card-list__footer-item"
                        );
                        results.push({
                            title: (titleEl.innerText || "").trim(),
                            href: titleEl.getAttribute("href") || "",
                            cardJobId: card.getAttribute("data-job-id") || "",
                            company: compEl ? (compEl.innerText || "").trim() : "Confidential Company",
                            location: locEl ? (locEl.innerText || "").trim() : "Any Location",
                            postedText: dateEl ? (dateEl.innerText || "").trim() : "",
                            postedDatetime: dateEl ? dateEl.getAttribute("datetime") || "" : "",
                        });
                    });
                    return results;
                }
            """)
            except Exception as extract_err:
                if page.is_closed() or "closed" in str(extract_err).lower():
                    raise RuntimeError(f"Target page, context or browser has been closed: {extract_err}") from extract_err
                raise extract_err

            if len(raw_cards_data) == 0 and not page.is_closed():
                try:
                    p_title = await page.title()
                    p_url = page.url
                    is_auth_wall = "login" in p_url.lower() or "checkpoint" in p_url.lower() or "authwall" in p_url.lower()
                    logger.warning(
                        "LinkedIn discovery returned 0 cards. Diagnostic: url='%s', title='%s', auth_wall=%s",
                        p_url, p_title, is_auth_wall
                    )
                except Exception as diag_err:
                    logger.debug("LinkedIn diagnostic inspect skipped: %s", diag_err)

            logger.info("search_completed", extra={"platform": "linkedin", "run_id": run_id, "cards_count": len(raw_cards_data)})

            for item in raw_cards_data:
                try:
                    job = self._build_job_from_dict(item, filters)
                    if job:
                        yield job
                except Exception as card_err:
                    logger.warning(f"Failed to parse LinkedIn job card: {card_err}")

        except Exception as e:
            logger.error(f"LinkedIn search failed: {e}")
            raise
        finally:
            if streamer:
                try:
                    await streamer.stop()
                    logger.info("screencast_stopped", extra={"platform": "linkedin", "run_id": run_id})
                except Exception:
                    pass
            if page and not page.is_closed():
                try:
                    await page.close()
                    logger.info("page_closed", extra={"platform": "linkedin", "run_id": run_id})
                except Exception:
                    pass

    def _build_job_from_dict(self, item: dict, filters: Optional[SearchQueryFilter] = None) -> Optional[Job]:
        """Fast memory-only builder from in-browser extracted dictionary."""
        title = item.get("title", "").strip()
        if not title:
            return None

        apply_url = item.get("href", "")
        if apply_url and not apply_url.startswith("http"):
            apply_url = f"{self.BASE_URL}{apply_url}"

        # Extract LinkedIn Job ID
        job_id_attr = item.get("cardJobId")
        if not job_id_attr:
            match = re.search(r"view/(\d+)", apply_url) or re.search(r"currentJobId=(\d+)", apply_url)
            external_job_id = match.group(1) if match else str(uuid.uuid5(uuid.NAMESPACE_URL, apply_url))
        else:
            external_job_id = job_id_attr

        company = item.get("company", "Confidential Company")
        location = item.get("location", "Any Location")

        raw_posted_text = item.get("postedText") or item.get("postedDatetime") or None

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


class LinkedInApplicationAdapter(BaseApplicationAdapter):
    """Application adapter for LinkedIn (Easy Apply and Direct Apply)."""

    @property
    def source_type(self) -> str:
        return "linkedin"

    async def open_application(self, page, apply_url: str) -> bool:
        await page.goto(apply_url, timeout=30000, wait_until="domcontentloaded")
        return True

    async def handle_challenge(self, page) -> Optional[str]:
        content = await page.content()
        if "security verification" in content.lower() or "checkpoint" in getattr(page, "url", "").lower():
            return "CAPTCHA"
        return None

    async def submit_application(self, page) -> bool:
        submit_btn = page.locator("button:has-text('Submit application'), button[aria-label='Submit application']").first
        await submit_btn.click(timeout=8000)
        return True

    async def verify_submission(self, page, original_url: str) -> Optional[tuple[bool, str]]:
        """
        LinkedIn-specific post-submit confirmation verification.
        Detects:
        - Easy Apply success modal: 'Your application was sent to', 'Application submitted'
        - Post-apply 'Done' button or dismissed dialog
        - Error alert inside modal: '.artdeco-inline-feedback--error'
        """
        try:
            if hasattr(page, "evaluate"):
                check_script = """
                () => {
                    const bodyText = (document.body ? document.body.innerText : '') || '';
                    if (bodyText.includes('Your application was sent to') || 
                        bodyText.includes('Application submitted') ||
                        bodyText.includes('Application was sent')) {
                        return { confirmed: true, message: 'LinkedIn Easy Apply confirmation modal detected.' };
                    }
                    
                    const doneBtn = Array.from(document.querySelectorAll('button')).find(b => {
                        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                        const txt = (b.innerText || '').trim().toLowerCase();
                        return aria === 'dismiss' || txt === 'done';
                    });
                    const modalHeader = document.querySelector('.artdeco-modal__header');
                    if (modalHeader && (modalHeader.innerText.includes('Application sent') || modalHeader.innerText.includes('Submitted'))) {
                        return { confirmed: true, message: 'LinkedIn modal header confirmation detected.' };
                    }
                    
                    const errorFeedback = document.querySelector('.artdeco-inline-feedback--error');
                    if (errorFeedback && errorFeedback.innerText && errorFeedback.innerText.trim().length > 0) {
                        return { confirmed: false, message: 'LinkedIn inline error: ' + errorFeedback.innerText.trim().slice(0, 150) };
                    }
                    
                    return null;
                }
                """
                res = page.evaluate(check_script)
                if inspect.isawaitable(res):
                    res = await res
                if res and isinstance(res, dict):
                    return (res.get("confirmed", False), res.get("message", "LinkedIn outcome detected."))
        except Exception as e:
            logger.warning(f"LinkedIn verification hook error: {e}")
        return None

