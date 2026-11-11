"use client";

export type Session = {
  accessToken: string;
  refreshToken: string;
  tenantId?: string;
};

const KEY = "letmelead.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("letmelead:session"));
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("letmelead:session"));
}

export function saveTokens(payload: { access_token: string; refresh_token: string }): void {
  const existing = getSession();
  setSession({ accessToken: payload.access_token, refreshToken: payload.refresh_token, tenantId: existing?.tenantId });
}

export function setTenant(tenantId: string): void {
  const existing = getSession();
  if (!existing) return;
  setSession({ ...existing, tenantId });
}
