from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class HashingEmbeddings:
    """Small offline multilingual fallback used when no model is installed."""

    dimensions: int = 256
    model: str = "studypilot-hashing-multilingual"
    version: str = "1"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        normalized = re.sub(r"\s+", " ", text.casefold()).strip()
        words = re.findall(r"[\w]+", normalized, flags=re.UNICODE)
        compact = re.sub(r"\s+", "", normalized)
        features = words + [
            compact[index : index + 2]
            for index in range(max(0, len(compact) - 1))
        ]
        vector = [0.0] * self.dimensions
        for feature in features:
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            slot = int.from_bytes(digest, "big") % self.dimensions
            vector[slot] += 1.0
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector
