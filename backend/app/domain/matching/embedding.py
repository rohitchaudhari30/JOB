from abc import ABC, abstractmethod
import math
from typing import List


class EmbeddingService(ABC):
    """
    Domain contract for dense vector embeddings and semantic similarity.
    Ensures vector calculation is replaceable, versioned, and normalized.
    """

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the embedding model (e.g. 'all-MiniLM-L6-v2', 'text-embedding-3-small')."""
        pass

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Version of the embedding configuration/weights (e.g. '2026.1')."""
        pass

    @abstractmethod
    async def embed_text(self, text: str) -> List[float]:
        """Generate a dense embedding vector for a single text."""
        pass

    @abstractmethod
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate dense embedding vectors for multiple texts in batch."""
        pass

    @staticmethod
    def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        """
        Calculates mathematical cosine similarity between two dense vectors:
        Cosine(u, v) = (u . v) / (||u|| * ||v||)
        Returns a float between -1.0 and 1.0.
        """
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))

        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0

        similarity = dot_product / (norm_a * norm_b)
        return max(-1.0, min(1.0, similarity))

    @classmethod
    def normalize_similarity_to_percentage(cls, similarity: float) -> float:
        """
        Normalizes cosine similarity to a 0.0 - 100.0 score.
        Cosine similarity between text embeddings typically ranges [0.0, 1.0] for non-negative
        or [-1.0, 1.0] generally; this maps non-negative range smoothly into 0-100%.
        """
        # Linear rescaling: max(0.0, similarity) * 100.0
        clamped = max(0.0, min(1.0, similarity))
        return round(clamped * 100.0, 1)
