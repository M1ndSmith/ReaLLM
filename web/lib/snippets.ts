export function curlSnippet(gateway: string, model: string): string {
  const body = {
    model,
    messages: [{ role: "user", content: "hello" }],
    user_id: "agent-42",
  };
  return `curl -s ${gateway}/chat \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(body, null, 2)}'

# Optional structured output (JSON chat only; do not set stream):
# "response_format": { "type": "json_object" }`;
}

export function pythonSnippet(gateway: string, model: string): string {
  return `import httpx

r = httpx.post(
    "${gateway}/chat",
    json={
        "model": ${JSON.stringify(model)},
        "messages": [{"role": "user", "content": "hello"}],
        "user_id": "agent-42",
        # Optional: "response_format": {"type": "json_object"},
        # Omit stream when using response_format.
    },
    timeout=60.0,
)
r.raise_for_status()
print(r.json())
`;
}
