"use client";

type Props = {
  gatewayKey: string;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function GatewayKeyField({ gatewayKey, onChange, onSave }: Props) {
  return (
    <div className="picker">
      <label className="label" htmlFor="gatewayKey">
        Gateway key
      </label>
      <input
        id="gatewayKey"
        name="gatewayKey"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={gatewayKey}
        onChange={(e) => onChange(e.target.value)}
        placeholder="GATEWAY_API_KEY"
      />
      <button className="outline" type="button" onClick={onSave}>
        Use key
      </button>
    </div>
  );
}
