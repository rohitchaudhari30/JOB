from app.domain.jobs.entities import SearchQueryFilter
from app.infrastructure.browser.adapters.naukri import NaukriAdapter


def test_naukri_search_url_builder():
    adapter = NaukriAdapter()
    filters = SearchQueryFilter(
        roles=["Senior Data Engineer", "Python Developer"],
        locations=["Bangalore", "Pune"],
        min_experience=3.0,
        max_experience=6.0,
    )
    url = adapter._build_search_url(filters, page_num=2)

    assert "naukri.com" in url
    assert "senior-data-engineer-python-developer-jobs-in-bangalore-pune" in url
    assert "experience=3" in url
    assert "pageNo=2" in url


def test_naukri_search_url_builder_single_role_no_location():
    adapter = NaukriAdapter()
    filters = SearchQueryFilter(roles=["DevOps Engineer"], locations=[])
    url = adapter._build_search_url(filters)

    assert "naukri.com/devops-engineer-jobs" in url
