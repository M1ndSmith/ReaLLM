"use client";

type Props = {
  curl: string;
  python: string;
  openai: string;
  copied: string | null;
  onCopy: (label: string, text: string) => void;
};

export function ConnectView({ curl, python, openai, copied, onCopy }: Props) {
  return (
    <div className="snippets">
      <section className="callout">
        <p className="hint">
          Copy production-ready snippets for agents and workflows. This is an opinionated LiteLLM operator stack, not a
          Portkey or LiteLLM Proxy replacement. Calls are usage-billed by model and enabled sidecars, so route each team
          through scoped gateway keys and policy caps.
        </p>
        <p className="hint">
          Optional <code>response_format</code> is request JSON, not a console toggle. Use <code>/v1</code> when an OpenAI
          SDK needs <code>base_url</code>; native <code>/chat</code> preserves sidecar metadata.
        </p>
      </section>
      <section>
        <div className="snippet-head">
          <h2>curl</h2>
          <button className="ghost" type="button" onClick={() => void onCopy("curl", curl)}>
            {copied === "curl" ? "Copied" : "Copy curl"}
          </button>
        </div>
        <pre>{curl}</pre>
      </section>
      <section>
        <div className="snippet-head">
          <h2>Python</h2>
          <button className="ghost" type="button" onClick={() => void onCopy("python", python)}>
            {copied === "python" ? "Copied" : "Copy Python"}
          </button>
        </div>
        <pre>{python}</pre>
      </section>
      <section>
        <div className="snippet-head">
          <h2>OpenAI SDK</h2>
          <button className="ghost" type="button" onClick={() => void onCopy("openai", openai)}>
            {copied === "openai" ? "Copied" : "Copy OpenAI"}
          </button>
        </div>
        <pre>{openai}</pre>
      </section>
    </div>
  );
}
