export function cleanDomain(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[),;]+$/, "");
}

export function csvCell(v: string | undefined): string {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function shortDate(value: string | undefined): string {
  const d = value ? new Date(value.length <= 10 ? `${value}T00:00:00Z` : value) : null;
  if (!d || Number.isNaN(d.getTime())) return "undated";
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

export function isoDateFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "User-Agent": "letmelead/0.1 (+local research tool)", ...(init.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
