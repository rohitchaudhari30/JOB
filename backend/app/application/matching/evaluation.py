"""Plain measurements for judging a matching rule against hand-labelled examples (AI-03).

A labelled example is a job plus a grade from 0 (poor fit) to 3 (strong fit). A good rule
gives higher scores to higher grades and does not squash strong fits into one value.
"""
from dataclasses import dataclass
from itertools import combinations
from typing import List, Sequence


@dataclass
class EvaluationReport:
    pairwise_accuracy: float  # share of differently-graded pairs ranked in the right order
    rank_correlation: float  # Spearman, -1 to 1
    at_cap_share: float  # share of jobs stuck at the maximum score
    distinct_scores: int  # how many different scores the rule produced

    def as_dict(self) -> dict:
        return {
            "pairwise_accuracy": round(self.pairwise_accuracy, 3),
            "rank_correlation": round(self.rank_correlation, 3),
            "at_cap_share": round(self.at_cap_share, 3),
            "distinct_scores": self.distinct_scores,
        }


def pairwise_accuracy(scores: Sequence[float], grades: Sequence[int]) -> float:
    """Ties count as half right, so a rule that scores everything the same gets 0.5, not 0."""
    right = 0.0
    total = 0
    for i, j in combinations(range(len(scores)), 2):
        if grades[i] == grades[j]:
            continue
        total += 1
        higher, lower = (i, j) if grades[i] > grades[j] else (j, i)
        if scores[higher] > scores[lower]:
            right += 1
        elif scores[higher] == scores[lower]:
            right += 0.5
    return right / total if total else 1.0


def _average_ranks(values: Sequence[float]) -> List[float]:
    order = sorted(range(len(values)), key=lambda k: values[k])
    ranks = [0.0] * len(values)
    pos = 0
    while pos < len(order):
        end = pos
        while end + 1 < len(order) and values[order[end + 1]] == values[order[pos]]:
            end += 1
        average = (pos + end) / 2 + 1
        for k in range(pos, end + 1):
            ranks[order[k]] = average
        pos = end + 1
    return ranks


def spearman(scores: Sequence[float], grades: Sequence[int]) -> float:
    a, b = _average_ranks(scores), _average_ranks(grades)
    mean_a, mean_b = sum(a) / len(a), sum(b) / len(b)
    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    var_a = sum((x - mean_a) ** 2 for x in a)
    var_b = sum((y - mean_b) ** 2 for y in b)
    if var_a == 0 or var_b == 0:
        return 0.0
    return cov / (var_a ** 0.5 * var_b ** 0.5)


def build_report(scores: Sequence[float], grades: Sequence[int], cap: float = 100.0) -> EvaluationReport:
    return EvaluationReport(
        pairwise_accuracy=pairwise_accuracy(scores, grades),
        rank_correlation=spearman(scores, grades),
        at_cap_share=sum(1 for s in scores if s >= cap) / len(scores),
        distinct_scores=len(set(scores)),
    )
