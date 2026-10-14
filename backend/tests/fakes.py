"""Small test doubles that behave like the real async repositories."""
from unittest.mock import AsyncMock, MagicMock


def fake_repo() -> MagicMock:
    """A repository stand-in: commit is async and the 24h submission counter says 0."""
    repo = MagicMock()
    repo._session = MagicMock()
    repo._session.commit = AsyncMock()
    repo.count_recent_submissions = AsyncMock(return_value=0)
    return repo
