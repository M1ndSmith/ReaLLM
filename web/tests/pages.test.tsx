import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ConnectPage from "@/app/connect/page";
import PlaygroundPage from "@/app/page";
import SettingsPage from "@/app/settings/page";

vi.mock("@/components/Console", () => ({
  Console: ({ view }: { view: string }) => <div data-testid="console-view">{view}</div>,
}));

describe("app pages", () => {
  it("renders playground page with play view", () => {
    render(<PlaygroundPage />);
    expect(screen.getByTestId("console-view")).toHaveTextContent("play");
  });

  it("renders connect page with connect view", () => {
    render(<ConnectPage />);
    expect(screen.getByTestId("console-view")).toHaveTextContent("connect");
  });

  it("renders settings page with settings view", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("console-view")).toHaveTextContent("settings");
  });
});
