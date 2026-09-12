import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatLog } from "@/components/ChatLog";
import { ConnectView } from "@/components/ConnectView";
import { SettingsView } from "@/components/SettingsView";

describe("ChatLog", () => {
  it("renders transcript kinds and disables send while busy", () => {
    render(
      <ChatLog
        log={[
          { kind: "system", text: "intro" },
          { kind: "user", text: "hi" },
          { kind: "assistant", text: "hello", meta: ["12 tok"] },
        ]}
        logRef={createRef<HTMLDivElement>()}
        draft="next"
        onDraft={() => undefined}
        onSend={(event) => event.preventDefault()}
        sendDisabled
      />,
    );
    expect(screen.getByText("intro")).toBeInTheDocument();
    expect(screen.getByText("12 tok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("submits drafts and updates composer text", async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    const onSend = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <ChatLog
        log={[{ kind: "assistant", text: "hello", meta: [] }]}
        logRef={createRef<HTMLDivElement>()}
        draft="hi"
        onDraft={onDraft}
        onSend={onSend}
        sendDisabled={false}
      />,
    );
    await user.type(screen.getByLabelText("Message"), " there");
    expect(onDraft).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalled();
  });
});

describe("ConnectView", () => {
  it("copies the selected snippet", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <ConnectView
        curl="curl-body"
        python="python-body"
        openai="openai-body"
        copied={null}
        onCopy={onCopy}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy curl" }));
    expect(onCopy).toHaveBeenCalledWith("curl", "curl-body");
    await user.click(screen.getByRole("button", { name: "Copy Python" }));
    expect(onCopy).toHaveBeenCalledWith("python", "python-body");
    await user.click(screen.getByRole("button", { name: "Copy OpenAI" }));
    expect(onCopy).toHaveBeenCalledWith("openai", "openai-body");
  });

  it("shows Copied on the active snippet button", () => {
    render(
      <ConnectView curl="curl-body" python="python-body" openai="openai-body" copied="python" onCopy={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy curl" })).toBeInTheDocument();
  });
});

describe("SettingsView", () => {
  it("keeps layer toggles disabled until a gateway key can PATCH", () => {
    render(
      <SettingsView
        config={null}
        needsAuth
        toggleBusy={null}
        onToggle={() => undefined}
        canAdmin={false}
        onAdminError={() => undefined}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Off" });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it("lets an authorized operator toggle MEMORY", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <SettingsView
        config={{
          auth_required: true,
          layers: {
            memory: false,
            pii: false,
            guard: false,
            guard_injection: true,
            guard_content: true,
          },
          restart_for: ["keys"],
        }}
        needsAuth={false}
        toggleBusy={null}
        onToggle={onToggle}
        canAdmin={false}
        onAdminError={() => undefined}
      />,
    );
    const memory = screen.getByRole("heading", { name: "MEMORY" }).closest("section");
    expect(memory).not.toBeNull();
    await user.click(within(memory as HTMLElement).getByRole("button", { name: "Off" }));
    expect(onToggle).toHaveBeenCalledWith("memory", true);
  });

  it("shows Saving while a layer PATCH is in flight", () => {
    render(
      <SettingsView
        config={{
          auth_required: true,
          layers: {
            memory: true,
            pii: false,
            guard: false,
            guard_injection: true,
            guard_content: true,
          },
          restart_for: [],
        }}
        needsAuth={false}
        toggleBusy="memory"
        onToggle={() => undefined}
        canAdmin={false}
        onAdminError={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
    expect(screen.getByText(/These flags apply on the next chat/i)).toBeInTheDocument();
  });
});
