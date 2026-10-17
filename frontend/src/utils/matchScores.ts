import type { MatchResult } from '../types';

/**
 * Score accessors. Keep MatchScore (pure candidate–job fit) and
 * RecommendationScore (operational priority, includes freshness) separate:
 * never average or substitute one for the other.
 *
 * `overall_score` is a deprecated alias of `match_score` kept by the backend
 * for backward compatibility, so it is only a fallback for the match score.
 */
export function getMatchScore(m: Pick<MatchResult, 'match_score' | 'overall_score'>): number {
  return m.match_score ?? m.overall_score ?? 0;
}

export function getRecommendationScore(m: Pick<MatchResult, 'recommendation_score'>): number | null {
  return typeof m.recommendation_score === 'number' ? m.recommendation_score : null;
}
