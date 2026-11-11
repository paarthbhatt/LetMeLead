"""Playwright worker for LinkedIn, using the tenant's own stored browser session.

Safety rules baked in:
  * disabled unless OUTREACH_ENABLED=true;
  * dry-run by default, which validates and records but never opens a browser;
  * every call is jittered so no two actions share a rhythm;
  * a login wall or captcha raises instead of being worked around.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import Any

from ..config import settings

logger = logging.getLogger("letmelead.linkedin")


class OutreachDisabled(RuntimeError):
    pass


class LinkedinSessionError(RuntimeError):
    pass


@dataclass
class SendResult:
    ok: bool
    detail: str
    simulated: bool = False


async def _human_pause(rng: random.Random | None = None) -> None:
    rng = rng or random.Random()
    await asyncio.sleep(rng.uniform(1.2, 4.5))


class LinkedinWorker:
    def __init__(self, storage_state: dict[str, Any] | None, dry_run: bool | None = None) -> None:
        self.storage_state = storage_state
        self.dry_run = settings.outreach_dry_run if dry_run is None else dry_run

    def _guard(self) -> None:
        if not settings.outreach_enabled:
            raise OutreachDisabled(
                "Outreach is disabled. Set OUTREACH_ENABLED=true only after reviewing "
                "docs/compliance.md and connecting a dedicated LinkedIn account."
            )
        if not self.dry_run and not self.storage_state:
            raise LinkedinSessionError("No LinkedIn session stored for this tenant.")

    async def send(self, *, profile_url: str, kind: str, message: str) -> SendResult:
        self._guard()
        if not profile_url or "linkedin.com/in/" not in profile_url:
            return SendResult(ok=False, detail="Lead has no LinkedIn profile URL.")
        if kind not in {"connect", "message"}:
            return SendResult(ok=False, detail=f"Unsupported step kind {kind!r}.")
        if len(message.strip()) < 10:
            return SendResult(ok=False, detail="Refusing to send an empty message.")
        if self.dry_run:
            return SendResult(ok=True, detail=f"dry-run: would send {kind} to {profile_url}", simulated=True)

        from playwright.async_api import Error as PlaywrightError
        from playwright.async_api import async_playwright

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
                context = await browser.new_context(storage_state=self.storage_state, locale="en-US")
                page = await context.new_page()
                await page.goto(profile_url, wait_until="domcontentloaded", timeout=45_000)
                await _human_pause()

                if await page.locator("input[name='session_key'], form.login__form").count():
                    raise LinkedinSessionError("LinkedIn session expired; reconnect the account.")
                if await page.locator("iframe[title*='captcha'], #captcha-internal").count():
                    raise LinkedinSessionError("LinkedIn presented a challenge; stopping instead of bypassing it.")

                if kind == "connect":
                    connect = page.locator("button:has-text('Connect')").first
                    if not await connect.count():
                        more = page.locator("button:has-text('More')").first
                        if await more.count():
                            await more.click()
                            await _human_pause()
                            connect = page.locator("div[role='button']:has-text('Connect')").first
                    if not await connect.count():
                        await browser.close()
                        return SendResult(ok=False, detail="Connect button not available (already connected?).")
                    await connect.click()
                    await _human_pause()
                    send_without_note = page.locator("button:has-text('Send without a note')").first
                    add_note = page.locator("button:has-text('Add a note')").first
                    if await add_note.count():
                        await add_note.click()
                        await page.locator("textarea#custom-message").fill(message)
                    elif await send_without_note.count():
                        # A connection request without a note is still a real request.
                        await send_without_note.click()
                    submit = page.locator("button:has-text('Send')").last
                    if await submit.count():
                        await submit.click()
                else:
                    message_button = page.locator("button:has-text('Message')").first
                    if not await message_button.count():
                        await browser.close()
                        return SendResult(ok=False, detail="Message button not available (not connected yet?).")
                    await message_button.click()
                    await _human_pause()
                    box = page.locator("div[role='textbox']").last
                    await box.click()
                    await box.type(message, delay=random.randint(35, 90))
                    send = page.locator("button:has-text('Send')").last
                    await send.click()

                await _human_pause()
                await context.storage_state(path=None)
                await browser.close()
                return SendResult(ok=True, detail=f"{kind} sent")
        except LinkedinSessionError:
            raise
        except PlaywrightError as exc:
            logger.warning("linkedin_action_failed", extra={"error": str(exc)[:300]})
            return SendResult(ok=False, detail=f"Browser error: {str(exc)[:200]}")

    async def withdraw(self, *, profile_url: str) -> SendResult:
        self._guard()
        if self.dry_run:
            return SendResult(ok=True, detail=f"dry-run: would withdraw invitation to {profile_url}", simulated=True)

        from playwright.async_api import Error as PlaywrightError
        from playwright.async_api import async_playwright

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(storage_state=self.storage_state)
                page = await context.new_page()
                await page.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", timeout=45_000)
                await _human_pause()
                row = page.locator(f"li:has(a[href='{profile_url.split('?')[0]}'])").first
                if not await row.count():
                    await browser.close()
                    return SendResult(ok=False, detail="Invitation not found (already accepted or withdrawn).")
                await row.locator("button").first.click()
                await _human_pause()
                await browser.close()
                return SendResult(ok=True, detail="invitation withdrawn")
        except PlaywrightError as exc:
            return SendResult(ok=False, detail=f"Browser error: {str(exc)[:200]}")
