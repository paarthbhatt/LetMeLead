"""Contact enrichment behind a swappable provider interface.

The default provider is deliberately conservative: it guesses a corporate email from
a *known* person name and the company domain, marks it unverified, and records the
limitation. It never invents a person.
"""

from __future__ import annotations

import re
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from ...config import settings
from ..qualification import DecisionMaker


@dataclass
class EnrichedContact:
    title: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    source: str = "pattern"
    confidence: float = 0.3
    verified: bool = False


@dataclass
class EnrichmentResult:
    contacts: list[EnrichedContact] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)


class EnrichmentProvider(ABC):
    name: str = "base"

    @abstractmethod
    def available(self) -> bool: ...

    @abstractmethod
    async def enrich(
        self, *, company: str, domain: str, decision_makers: list[DecisionMaker]
    ) -> EnrichmentResult: ...


def _slug(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", normalized.lower())


class PatternEnrichment(EnrichmentProvider):
    name = "pattern"

    def available(self) -> bool:
        return True

    async def enrich(
        self, *, company: str, domain: str, decision_makers: list[DecisionMaker]
    ) -> EnrichmentResult:
        contacts: list[EnrichedContact] = []
        limitations = [
            "Email addresses are pattern guesses (first.last@domain), not verified mailboxes.",
        ]
        for maker in decision_makers:
            email = None
            if maker.name:
                parts = maker.name.split()
                if len(parts) >= 2:
                    email = f"{_slug(parts[0])}.{_slug(parts[-1])}@{domain}"
            contacts.append(
                EnrichedContact(
                    title=maker.title,
                    name=maker.name,
                    email=email,
                    linkedin_url=maker.linkedin_url,
                    confidence=maker.confidence if maker.name else 0.2,
                    verified=False,
                )
            )
        return EnrichmentResult(contacts=contacts, limitations=limitations)


class NoopEnrichment(EnrichmentProvider):
    name = "none"

    def available(self) -> bool:
        return True

    async def enrich(
        self, *, company: str, domain: str, decision_makers: list[DecisionMaker]
    ) -> EnrichmentResult:
        return EnrichmentResult(
            contacts=[EnrichedContact(title=m.title, name=m.name, confidence=0.2) for m in decision_makers],
            limitations=["No enrichment provider configured: contacts carry titles only."],
        )


def get_enrichment() -> EnrichmentProvider:
    if settings.enrichment_provider == "pattern":
        return PatternEnrichment()
    return NoopEnrichment()


__all__ = ["EnrichedContact", "EnrichmentProvider", "EnrichmentResult", "get_enrichment"]
