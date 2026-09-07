import { describe, expect, it } from "vitest";

import { curlSnippet, openaiSnippet, pythonSnippet } from "@/lib/snippets";

describe("snippets", () => {
  it("includes Authorization when auth is on", () => {
    const curl = curlSnippet("http://127.0.0.1:8000", "groq/openai/gpt-oss-20b", true);
    expect(curl).toContain("Authorization: Bearer $GATEWAY_API_KEY");
    expect(curl).not.toContain("# When GATEWAY_API_KEY is set");
    const python = pythonSnippet("http://127.0.0.1:8000", "groq/openai/gpt-oss-20b", true);
    expect(python).toContain('headers={"Authorization": f"Bearer {os.environ[\'GATEWAY_API_KEY\']}"},');
    expect(python).not.toContain("# When GATEWAY_API_KEY is set");
  });

  it("comments the header when auth is off", () => {
    const curl = curlSnippet("http://127.0.0.1:8000", "groq/openai/gpt-oss-20b", false);
    expect(curl).toContain("# When GATEWAY_API_KEY is set: -H 'Authorization: Bearer $GATEWAY_API_KEY'");
    expect(curl).not.toMatch(/^-H 'Authorization/m);
    const python = pythonSnippet("http://127.0.0.1:8000", "groq/openai/gpt-oss-20b", false);
    expect(python).toContain("# When GATEWAY_API_KEY is set");
  });

  it("points the OpenAI SDK at /v1", () => {
    const openai = openaiSnippet("http://127.0.0.1:8000", "groq/openai/gpt-oss-20b");
    expect(openai).toContain('base_url="http://127.0.0.1:8000/v1"');
    expect(openai).toContain("GATEWAY_API_KEY");
  });
});
