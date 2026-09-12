import { describe, expect, it } from "vitest";

import { Console } from "@/components/Console";
import { ConsoleShell } from "@/components/ConsoleShell";

describe("Console export", () => {
  it("re-exports ConsoleShell", () => {
    expect(Console).toBe(ConsoleShell);
  });
});
