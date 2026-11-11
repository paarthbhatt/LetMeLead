"""Adapter registry. Add a source by implementing SourceAdapter and listing it here."""

from __future__ import annotations

from .base import RawSignal, SourceAdapter, SourceBlocked, SourceUnavailable, TargetRef
from .facebook import FacebookAdapter
from .google_maps import GoogleMapsAdapter
from .jobboard import JobBoardAdapter
from .news import NewsAdapter
from .reddit import RedditAdapter
from .reviews import ReviewsAdapter
from .x import XAdapter

ADAPTERS: dict[str, SourceAdapter] = {
    adapter.kind: adapter
    for adapter in (
        NewsAdapter(),
        JobBoardAdapter(),
        RedditAdapter(),
        XAdapter(),
        GoogleMapsAdapter(),
        FacebookAdapter(),
        ReviewsAdapter(),
    )
}

# Enabled for every new tenant. The rest are opt-in because they need credentials.
DEFAULT_SOURCES = ["news", "job_board", "reddit"]

__all__ = [
    "ADAPTERS",
    "DEFAULT_SOURCES",
    "RawSignal",
    "SourceAdapter",
    "SourceBlocked",
    "SourceUnavailable",
    "TargetRef",
]
