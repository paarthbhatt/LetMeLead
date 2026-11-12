"use client";

import * as React from "react";

import { getSession } from "@/lib/auth";

/**
 * Header actions depend on a session that only exists in localStorage, so
 * resolve after mount to keep the server-rendered shell static and honest
 * (a preview build must never guess that someone is signed in).
 */
export function HeaderActions() {
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    setSignedIn(Boolean(getSession()?.accessToken));
  }, []);

  if (signedIn) {
    return (
      <a className="mkt-btn" href="/overview">
        Open dashboard
      </a>
    );
  }

  return (
    <>
      <a className="mkt-btn" data-tone="quiet" href="/login">
        Sign in
      </a>
      <a className="mkt-btn" data-tone="solid" href="/signup">
        Create workspace
      </a>
    </>
  );
}

/** Footer keeps one useful, non-decorative session link. */
export function FooterSessionLink() {
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    setSignedIn(Boolean(getSession()?.accessToken));
  }, []);

  return (
    <a href={signedIn ? "/overview" : "/login"}>{signedIn ? "Dashboard" : "Sign in"}</a>
  );
}
