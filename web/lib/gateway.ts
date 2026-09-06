export function gatewayUrl(): string {
  return (process.env.NEXT_PUBLIC_GATEWAY_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

export function formatDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  if (detail && typeof detail === "object" && "error" in detail) {
    return String((detail as { error: unknown }).error);
  }
  if ("error" in payload) return String((payload as { error: unknown }).error);
  return fallback;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${gatewayUrl()}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(formatDetail(body, `Request failed (${res.status}).`));
  }
  return res.json() as Promise<T>;
}
