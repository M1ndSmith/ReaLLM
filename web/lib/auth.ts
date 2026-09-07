export const GATEWAY_KEY = "realmm.gateway_key";

export function getGatewayKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(GATEWAY_KEY) || "";
}

export function setGatewayKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    sessionStorage.removeItem(GATEWAY_KEY);
    return;
  }
  sessionStorage.setItem(GATEWAY_KEY, trimmed);
}

export function authHeaders(): Record<string, string> {
  const key = getGatewayKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}
