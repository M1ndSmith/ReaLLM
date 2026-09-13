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
      <p className="hint">
        Copy a client for agents or workflows. This is an opinionated LiteLLM operator stack, not a
        Portkey or LiteLLM Proxy replacement. This is not a new URL and not a virtual key. Optional{" "}
        <code>response_format</code> is JSON on the request, not a control in this console. Use{" "}
        <code>/v1</code> when an OpenAI SDK needs <code>base_url</code>; native <code>/chat</code> keeps sidecar
        fields in the body.
      </p>
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
