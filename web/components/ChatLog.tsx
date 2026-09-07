"use client";

import type { FormEvent, RefObject } from "react";

import type { LogItem } from "@/hooks/useChatSession";

type Props = {
  log: LogItem[];
  logRef: RefObject<HTMLDivElement | null>;
  draft: string;
  onDraft: (value: string) => void;
  onSend: (event: FormEvent) => void;
  sendDisabled: boolean;
};

export function ChatLog({ log, logRef, draft, onDraft, onSend, sendDisabled }: Props) {
  return (
    <>
      <div ref={logRef} className="log" aria-live="polite">
        {log.map((item, index) =>
          item.kind === "assistant" ? (
            <div key={index} className="bubble-wrap">
              <div className="bubble assistant">{item.text}</div>
              {item.meta.length ? <div className="meta">{item.meta.join(" · ")}</div> : null}
            </div>
          ) : (
            <div key={index} className={`bubble ${item.kind}`}>
              {item.text}
            </div>
          ),
        )}
      </div>
      <form className="composer" onSubmit={onSend}>
        <label className="sr-only" htmlFor="prompt">
          Message
        </label>
        <textarea
          id="prompt"
          rows={3}
          placeholder="Ask the selected model…"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          required
        />
        <button id="send" type="submit" disabled={sendDisabled}>
          Send
        </button>
      </form>
    </>
  );
}
