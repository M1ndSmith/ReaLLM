"use client";

type Lamp = { key: string; label: string; on: boolean };

type Props = {
  providers: string[] | undefined;
  lamps: Lamp[];
  redisMode?: string | null;
};

export function StatusSidebar({ providers, lamps, redisMode }: Props) {
  return (
    <div className="bus">
      <div className="label">Providers</div>
      <div className="lamps" aria-live="polite">
        {providers?.length ? (
          providers.map((name) => (
            <span key={name} className="lamp on">
              <i />
              {name}
            </span>
          ))
        ) : (
          <p className="hint">No API keys found in .env.</p>
        )}
      </div>
      <div className="label">Sidecars</div>
      <div className="lamps">
        {lamps.map((lamp) => (
          <span key={lamp.key} className={lamp.on ? "lamp on" : "lamp"}>
            <i />
            {lamp.label}
          </span>
        ))}
      </div>
      <p className="hint">
        Sidecar lamps are live state. Toggle MEMORY / PII / GUARD on Settings when a gateway key is set. Provider
        keys, Redis, and budgets stay in .env.
        {redisMode ? ` Redis mode: ${redisMode}.` : ""}
      </p>
    </div>
  );
}
