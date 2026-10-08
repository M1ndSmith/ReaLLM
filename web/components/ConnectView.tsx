"use client";

type Props = {
  curl: string;
  python: string;
  openai: string;
  copied: string | null;
  onCopy: (label: string, text: string) => void;
};

const SNIPPETS = [
  ["curl", "Copy curl", "curl"],
  ["Python", "Copy Python", "python"],
  ["OpenAI SDK", "Copy OpenAI", "openai"],
] as const;

export function ConnectView({ curl, python, openai, copied, onCopy }: Props) {
  const bodies = { curl, python, openai };
  return (
    <div className="stack">
      {SNIPPETS.map(([title, action, key]) => (
        <section key={key} className="card">
          <div className="card-head">
            <h2 className="card-title">{title}</h2>
            <div aria-live="polite">
              <button className="outline" type="button" onClick={() => void onCopy(key, bodies[key])}>
                {copied === key ? "Copied" : action}
              </button>
            </div>
          </div>
          <div className="card-body">
            <pre>{bodies[key]}</pre>
          </div>
        </section>
      ))}
    </div>
  );
}
