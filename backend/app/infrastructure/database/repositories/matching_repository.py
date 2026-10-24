"""
Matching repositories module facade.
Provides backward-compatible exports for MatchResult and MatchingTask repositories.
"""
from app.infrastructure.database.repositories.match_result_repository import (
    SqlAlchemyMatchResultRepository,
    is_unique_constraint_violation,
)
from app.infrastructure.database.repositories.matching_task_repository import (
    SqlAlchemyMatchingTaskRepository,
)

__all__ = [
    "SqlAlchemyMatchResultRepository",
    "SqlAlchemyMatchingTaskRepository",
    "is_unique_constraint_violation",
]
