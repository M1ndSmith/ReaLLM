import { authHeaders } from "@/lib/auth";

export function gatewayUrl(): string {
  return (process.env.NEXT_PUBLIC_GATEWAY_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

export class GatewayError extends Error {
  status: number;
  errorCode: string | null;

  constructor(message: string, status: number, errorCode: string | null = null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

function errorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (detail && typeof detail === "object" && "error" in detail) {
    return String((detail as { error: unknown }).error);
  }
  return null;
}

export function formatDetail(payload: unknown, fallback: string): string {
  const code = errorCode(payload);
  if (code === "gateway_unauthorized") {
    return "This gateway requires GATEWAY_API_KEY. Paste it in the console; it is not stored in .env from this page.";
  }
  if (code === "gateway_key_required") {
    return "Set GATEWAY_API_KEY in .env and restart uvicorn to change layers from this page.";
  }
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
  if ("error" in payload) {
    const err = (payload as { error: unknown }).error;
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message: unknown }).message);
    }
    return String(err);
  }
  return fallback;
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${gatewayUrl()}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new GatewayError(formatDetail(body, `Request failed (${res.status}).`), res.status, errorCode(body));
  }
  return res.json() as Promise<T>;
}
