#!/usr/bin/env python3
"""Capture a LinkedIn browser session for the outreach worker.

Opens a real Chromium window, lets you sign in yourself (including 2FA), then writes a
Playwright storage state file. Paste that file's contents into the dashboard's LinkedIn
page; the API encrypts it and the worker uses it to send.

    python scripts/linkedin_session.py --out session.json

This never sees your password. Nothing is uploaded from this script.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="session.json", help="where to write the storage state")
    parser.add_argument("--timeout", type=int, default=300, help="seconds to wait for you to sign in")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return _fail("Playwright is not installed. Run: pip install playwright && playwright install chromium")

    path = Path(args.out).expanduser()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://www.linkedin.com/login")
        print("Sign in to LinkedIn in the browser window. Waiting for your feed…")
        try:
            page.wait_for_url("**/feed/**", timeout=args.timeout * 1000)
        except Exception:  # noqa: BLE001
            print("Did not see the feed in time — saving whatever session exists.", file=sys.stderr)
        state = context.storage_state()
        browser.close()

    if not state.get("cookies"):
        return _fail("No cookies captured, so the session is not usable. Try again and complete the login.")
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(f"Wrote {path} ({len(state['cookies'])} cookies).")
    print("Next: open the dashboard → LinkedIn → paste the file contents.")
    return 0


def _fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
