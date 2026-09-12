import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConsoleShell } from "@/components/ConsoleShell";

const baseLayers = {
  memory: false,
  pii: false,
  guard: false,
  guard_injection: true,
  guard_content: true,
};

const keyMock = {
  gatewayKey: "",
  setGatewayKeyState: vi.fn(),
  needsAuth: true,
  setNeedsAuth: vi.fn(),
  saveKey: vi.fn(),
};

const catalogMock: any = {
  gateway: "http://127.0.0.1:8000",
    catalog: {
    health: null as { providers?: string[] } | null,
    models: [] as Array<{ id: string; provider: string }>,
    prompts: [] as Array<{ name: string; source: string }>,
    ready: null as { ready: boolean; redis_mode?: string | null } | null,
  },
  model: "",
  setModel: vi.fn(),
  promptName: "",
  setPromptName: vi.fn(),
  lamps: [] as Array<{ key: string; label: string; on: boolean }>,
  load: vi.fn(async () => ({ ok: false as const, unauthorized: true, message: "denied" })),
  refreshHealth: vi.fn(async () => undefined),
};

const chatMock = {
  log: [{ kind: "system", text: "intro" }],
  logRef: { current: null as HTMLDivElement | null },
  draft: "",
  setDraft: vi.fn(),
  onSend: vi.fn(async () => undefined),
  busy: false,
  resetChat: vi.fn(),
  reportError: vi.fn(),
};

const runtimeMock = {
  config: {
    auth_required: true,
    identity: null as { id: string; scopes: string[] } | null,
    layers: baseLayers,
    restart_for: ["keys"],
  },
  setConfig: vi.fn(),
  toggleBusy: null as string | null,
  refresh: vi.fn(async () => undefined),
  toggleLayer: vi.fn(async () => undefined),
  configError: "forbidden" as string | null,
  refreshing: false,
};

vi.mock("@/hooks/useGatewayKey", () => ({
  useGatewayKey: () => keyMock,
}));

vi.mock("@/hooks/useGatewayCatalog", () => ({
  useGatewayCatalog: () => catalogMock,
}));

vi.mock("@/hooks/useChatSession", () => ({
  useChatSession: () => chatMock,
}));

vi.mock("@/hooks/useRuntimeConfig", () => ({
  useRuntimeConfig: () => runtimeMock,
}));

vi.mock("@/lib/adminKeys", () => ({
  listGatewayKeys: vi.fn(async () => []),
  createGatewayKey: vi.fn(),
  revokeGatewayKey: vi.fn(),
}));

beforeEach(() => {
  keyMock.gatewayKey = "";
  keyMock.needsAuth = true;
  keyMock.setGatewayKeyState = vi.fn();
  keyMock.setNeedsAuth = vi.fn();
  keyMock.saveKey = vi.fn();

  catalogMock.catalog = { health: null, models: [], prompts: [], ready: null };
  catalogMock.model = "";
  catalogMock.promptName = "";
  catalogMock.lamps = [];
  catalogMock.setModel = vi.fn();
  catalogMock.setPromptName = vi.fn();
  catalogMock.load = vi.fn(async () => ({ ok: false, unauthorized: true, message: "denied" }));
  catalogMock.refreshHealth = vi.fn(async () => undefined);

  chatMock.log = [{ kind: "system", text: "intro" }];
  chatMock.draft = "";
  chatMock.busy = false;
  chatMock.setDraft = vi.fn();
  chatMock.onSend = vi.fn(async () => undefined);
  chatMock.resetChat = vi.fn();
  chatMock.reportError = vi.fn();

  runtimeMock.config = { auth_required: true, identity: null, layers: { ...baseLayers }, restart_for: ["keys"] };
  runtimeMock.configError = "forbidden";
  runtimeMock.refreshing = false;
  runtimeMock.toggleBusy = null;
  runtimeMock.setConfig = vi.fn();
  runtimeMock.refresh = vi.fn(async () => undefined);
  runtimeMock.toggleLayer = vi.fn(async () => undefined);
});

describe("ConsoleShell", () => {
  it("shows explicit auth guidance and inline runtime error", () => {
    render(<ConsoleShell view="settings" />);
    expect(screen.getByText(/Set GATEWAY_API_KEY in .env/i)).toBeInTheDocument();
    expect(screen.getByText(/Action failed: forbidden/i)).toBeInTheDocument();
  });

  it("renders play view controls", () => {
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    catalogMock.catalog = {
      health: { providers: ["groq"] },
      models: [{ id: "groq/openai/gpt-oss-20b", provider: "groq" }],
      prompts: [{ name: "chat-assistant", source: "local" }],
      ready: { ready: true, redis_mode: "unconfigured" },
    };
    catalogMock.model = "groq/openai/gpt-oss-20b";
    keyMock.needsAuth = false;
    runtimeMock.configError = null;
    runtimeMock.config = {
      auth_required: true,
      identity: { id: "admin", scopes: ["chat", "config", "admin"] },
      layers: { ...baseLayers },
      restart_for: [],
    };

    render(<ConsoleShell view="play" />);
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "chat-assistant" })).toBeInTheDocument();
  });

  it("changes prompt and model from the sidebar", async () => {
    const user = userEvent.setup();
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    catalogMock.catalog = {
      health: { providers: ["groq"] },
      models: [{ id: "groq/openai/gpt-oss-20b", provider: "groq" }],
      prompts: [{ name: "chat-assistant", source: "langfuse" }],
      ready: { ready: true, redis_mode: "unconfigured" },
    };
    catalogMock.model = "groq/openai/gpt-oss-20b";
    catalogMock.promptName = "";
    keyMock.needsAuth = false;
    runtimeMock.configError = null;
    runtimeMock.config = {
      auth_required: true,
      identity: { id: "admin", scopes: ["chat", "config", "admin"] },
      layers: { ...baseLayers },
      restart_for: [],
    };
    render(<ConsoleShell view="play" />);
    await user.selectOptions(screen.getByLabelText("Prompt"), "chat-assistant");
    expect(catalogMock.setPromptName).toHaveBeenCalledWith("chat-assistant");
    await user.selectOptions(screen.getByLabelText("Model"), "groq/openai/gpt-oss-20b");
    expect(catalogMock.setModel).toHaveBeenCalledWith("groq/openai/gpt-oss-20b");
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(chatMock.resetChat).toHaveBeenCalled();
  });

  it("renders connect guidance text", () => {
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    runtimeMock.configError = null;

    render(<ConsoleShell view="connect" />);
    expect(screen.getByText(/Agents call POST \/chat or POST \/v1\/chat\/completions/i)).toBeInTheDocument();
  });

  it("reports refresh failures from initial load", async () => {
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    runtimeMock.configError = null;
    runtimeMock.refresh = vi.fn(async () => {
      throw new Error("refresh denied");
    });

    render(<ConsoleShell view="play" />);
    await waitFor(() => {
      expect(chatMock.reportError).toHaveBeenCalledWith("refresh denied");
    });
  });

  it("reports toggle failures in settings view", async () => {
    const user = userEvent.setup();
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    keyMock.needsAuth = false;
    runtimeMock.configError = null;
    runtimeMock.config = {
      auth_required: true,
      identity: { id: "admin", scopes: ["chat", "config", "admin"] },
      layers: { ...baseLayers },
      restart_for: [],
    };
    runtimeMock.toggleLayer = vi.fn(async () => {
      throw new Error("toggle denied");
    });

    render(<ConsoleShell view="settings" />);
    await user.click(screen.getAllByRole("button", { name: "Off" })[0]);
    await waitFor(() => {
      expect(chatMock.reportError).toHaveBeenCalledWith("toggle denied");
    });
  });

  it("saves a pasted gateway key and reloads", async () => {
    const user = userEvent.setup();
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    keyMock.needsAuth = true;
    keyMock.gatewayKey = "secret-gateway";
    runtimeMock.configError = null;

    render(<ConsoleShell view="settings" />);
    await user.click(screen.getByRole("button", { name: "Use key" }));
    expect(keyMock.saveKey).toHaveBeenCalledOnce();
    await waitFor(() => expect(catalogMock.load).toHaveBeenCalled());
  });

  it("copies connect snippets", async () => {
    const user = userEvent.setup();
    catalogMock.load = vi.fn(async () => ({ ok: true }));
    runtimeMock.configError = null;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ConsoleShell view="connect" />);
    await user.click(screen.getByRole("button", { name: "Copy curl" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("marks auth required when catalog load is unauthorized", async () => {
    catalogMock.load = vi.fn(async () => ({ ok: false, unauthorized: true, message: "denied" }));
    runtimeMock.configError = null;
    render(<ConsoleShell view="play" />);
    await waitFor(() => {
      expect(keyMock.setNeedsAuth).toHaveBeenCalledWith(true);
      expect(chatMock.reportError).toHaveBeenCalledWith("denied");
    });
  });
});
