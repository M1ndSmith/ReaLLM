"use client";

import type { FormEvent, RefObject } from "react";

import { ChatLog } from "@/components/ChatLog";
import type { LogItem } from "@/hooks/useChatSession";

type Props = {
  log: LogItem[];
  logRef: RefObject<HTMLDivElement | null>;
  draft: string;
  onDraft: (value: string) => void;
  onSend: (event: FormEvent) => void;
  sendDisabled: boolean;
};

export function PlaygroundView(props: Props) {
  return <ChatLog {...props} />;
}
