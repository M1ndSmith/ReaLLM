"use client";

import type { ModelInfo } from "@/lib/types";

type Props = {
  models: ModelInfo[];
  model: string;
  onChange: (value: string) => void;
};

export function ModelPicker({ models, model, onChange }: Props) {
  return (
    <div className="picker">
      <label className="label" htmlFor="model">
        Model
      </label>
      <select id="model" value={model} onChange={(e) => onChange(e.target.value)} disabled={!models.length}>
        {models.length ? (
          models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))
        ) : (
          <option value="">No models available</option>
        )}
      </select>
    </div>
  );
}
