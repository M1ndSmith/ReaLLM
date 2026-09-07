function curlAuth(include: boolean): string {
  return include ? `  -H 'Authorization: Bearer $GATEWAY_API_KEY' \\\n` : "";
}

function pythonAuth(include: boolean): string {
  return include ? `    headers={"Authorization": f"Bearer {os.environ['GATEWAY_API_KEY']}"},\n` : "";
}

export function curlSnippet(gateway: string, model: string, auth = false): string {
  const body = {
    model,
    messages: [{ role: "user", content: "hello" }],
    user_id: "agent-42",
  };
  const commented = auth ? "" : "\n# When GATEWAY_API_KEY is set: -H 'Authorization: Bearer $GATEWAY_API_KEY'";
  return `curl -s ${gateway}/chat \\
  -H 'Content-Type: application/json' \\
${curlAuth(auth)}  -d '${JSON.stringify(body, null, 2)}'
${commented}

# Optional structured output (JSON chat only; do not set stream):
# "response_format": { "type": "json_object" }`;
}

export function pythonSnippet(gateway: string, model: string, auth = false): string {
  const commented = auth
    ? ""
    : "# When GATEWAY_API_KEY is set: headers={\"Authorization\": f\"Bearer {os.environ['GATEWAY_API_KEY']}\"}\n";
  return `import os
import httpx

${commented}r = httpx.post(
    "${gateway}/chat",
    json={
        "model": ${JSON.stringify(model)},
        "messages": [{"role": "user", "content": "hello"}],
        "user_id": "agent-42",
        # Optional: "response_format": {"type": "json_object"},
        # Omit stream when using response_format.
    },
${pythonAuth(auth)}    timeout=60.0,
)
r.raise_for_status()
print(r.json())
`;
}

export function openaiSnippet(gateway: string, model: string): string {
  return `import os
from openai import OpenAI

client = OpenAI(
    base_url="${gateway}/v1",
    api_key=os.environ.get("GATEWAY_API_KEY") or "local",
)
r = client.chat.completions.create(
    model=${JSON.stringify(model)},
    messages=[{"role": "user", "content": "hello"}],
    extra_body={"user_id": "agent-42"},
)
print(r.choices[0].message.content)
`;
}
