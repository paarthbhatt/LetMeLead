"""Job-board adapter.

Finds a company's public applicant-tracking-system feed (Greenhouse, Lever, Ashby,
Personio) and turns recent postings into role-hiring signals. Free, no keys.
"""

from __future__ import annotations

import re
from typing import Any
from xml.etree import ElementTree

from ..intent import classify
from .base import RawSignal, SourceAdapter, TargetRef, cutoff, parse_date

BOARD_LINKS = {
    "greenhouse": re.compile(r"(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/(?:embed/job_board\?for=)?([\w-]+)"),
    "lever": re.compile(r"jobs\.lever\.co/([\w-]+)"),
    "ashby": re.compile(r"jobs\.ashbyhq\.com/([\w.-]+)"),
    "personio": re.compile(r"([\w-]+)\.jobs\.personio\.(?:de|com)"),
}


def detect_board(html: str) -> tuple[str, str] | None:
    for board, rx in BOARD_LINKS.items():
        match = rx.search(html or "")
        if match:
            return board, match.group(1)
    return None


async def _greenhouse(adapter: SourceAdapter, name: str) -> list[dict[str, Any]]:
    data = await adapter.get_json(f"https://boards-api.greenhouse.io/v1/boards/{name}/jobs")
    jobs = []
    for job in (data or {}).get("jobs", []):
        jobs.append(
            {
                "title": job.get("title", ""),
                "url": job.get("absolute_url"),
                "date": parse_date(job.get("first_published") or job.get("updated_at")),
                "location": (job.get("location") or {}).get("name"),
            }
        )
    return jobs


async def _lever(adapter: SourceAdapter, name: str) -> list[dict[str, Any]]:
    data = await adapter.get_json(f"https://api.lever.co/v0/postings/{name}?mode=json")
    return [
        {
            "title": job.get("text", ""),
            "url": job.get("hostedUrl"),
            "date": parse_date(job.get("createdAt")),
            "location": (job.get("categories") or {}).get("location"),
        }
        for job in (data or [])
    ]


async def _ashby(adapter: SourceAdapter, name: str) -> list[dict[str, Any]]:
    data = await adapter.get_json(f"https://api.ashbyhq.com/posting-api/job-board/{name}")
    return [
        {
            "title": job.get("title", ""),
            "url": job.get("jobUrl"),
            "date": parse_date(job.get("publishedAt")),
            "location": job.get("location"),
        }
        for job in (data or {}).get("jobs", [])
    ]


async def _personio(adapter: SourceAdapter, name: str) -> list[dict[str, Any]]:
    text = await adapter.get_text(f"https://{name}.jobs.personio.de/xml")
    if not text:
        return []
    root = ElementTree.fromstring(text)
    jobs = []
    for position in root.iter("position"):
        jobs.append(
            {
                "title": position.findtext("name") or "",
                "url": f"https://{name}.jobs.personio.de/job/{position.findtext('id')}",
                "date": parse_date(position.findtext("createdAt")),
                "location": position.findtext("office"),
            }
        )
    return jobs


BOARDS = {"greenhouse": _greenhouse, "lever": _lever, "ashby": _ashby, "personio": _personio}


class JobBoardAdapter(SourceAdapter):
    kind = "job_board"
    label = "Company job boards"
    requires = "public ATS feeds (no key)"

    async def fetch(self, targets: list[TargetRef], config: dict[str, Any]) -> list[RawSignal]:
        roles = [r.lower() for r in (config.get("roles") or [])]
        lookback = int(config.get("lookback_days") or 28)
        since = cutoff(lookback)
        out: list[RawSignal] = []

        for target in targets[:40]:
            board = None
            if target.careers_url:
                board = detect_board(target.careers_url)
            if not board:
                html = await self.get_text(f"https://{target.domain}")
                board = detect_board(html or "")
            if not board:
                continue
            board_kind, name = board
            try:
                jobs = await BOARDS[board_kind](self, name)
            except ElementTree.ParseError:
                continue
            if not jobs:
                continue

            recent = [j for j in jobs if j["date"] and j["date"] >= since]
            matched = [j for j in recent if any(role in (j["title"] or "").lower() for role in roles)]
            for job in matched[:5]:
                signal_type, strength = classify(job["title"])
                out.append(
                    RawSignal(
                        source=self.kind,
                        type="hiring_signal",
                        strength="strong" if any(r in job["title"].lower() for r in roles) else strength,
                        title=f"Open role: {job['title']}",
                        company=target.company,
                        domain=target.domain,
                        url=job["url"],
                        published_at=job["date"],
                        detail={"board": board_kind, "board_name": name, "location": job["location"],
                                "matched_roles": [r for r in roles if r in job["title"].lower()]},
                    )
                )
            if recent:
                # Only emit hiring volume when there is real movement: the legacy
                # engine emitted this even with zero postings, which produced phantom points.
                out.append(
                    RawSignal(
                        source=self.kind,
                        type="hiring_signal",
                        strength="normal",
                        title=f"{len(recent)} postings in the last {lookback} days ({len(jobs)} open)",
                        company=target.company,
                        domain=target.domain,
                        url=jobs[0]["url"],
                        published_at=recent[0]["date"],
                        detail={"board": board_kind, "recent": len(recent), "open": len(jobs)},
                    )
                )
        return out
