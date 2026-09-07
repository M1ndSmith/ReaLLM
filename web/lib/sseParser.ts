export type NativeSseEvent =
  | { kind: "done" }
  | { kind: "error"; message: string }
  | { kind: "json"; payload: Record<string, unknown> };

export function parseSseBuffer(buffer: string): { events: NativeSseEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";
  const events: NativeSseEvent[] = [];
  for (const part of parts) {
    const line = part.split("\n").find((row) => row.startsWith("data: "));
    if (!line) continue;
    const payload = line.slice(6);
    if (payload === "[DONE]") {
      events.push({ kind: "done" });
      continue;
    }
    try {
      const json = JSON.parse(payload) as Record<string, unknown>;
      if (json.error) {
        events.push({ kind: "error", message: String(json.error) });
        continue;
      }
      events.push({ kind: "json", payload: json });
    } catch {
      events.push({ kind: "error", message: "Malformed SSE payload." });
    }
  }
  return { events, rest };
}

export function flushSseBuffer(buffer: string): NativeSseEvent[] {
  if (!buffer.trim()) return [];
  const { events } = parseSseBuffer(`${buffer}\n\n`);
  return events;
}
