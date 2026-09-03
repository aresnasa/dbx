import { describe, expect, it } from "vitest";
import { startupErrorTheme } from "@/lib/startup/startupErrorTheme";

describe("startup error theme", () => {
  it("uses a light surface in light mode", () => {
    const theme = startupErrorTheme(false);
    expect(theme.background).toBe("#ffffff");
    expect(theme.card).toBe("#ffffff");
    expect(theme.foreground).toBe("#111827");
  });

  it("uses a dark surface in dark mode even when CSS variables are unavailable", () => {
    const theme = startupErrorTheme(true);
    expect(theme.background).toBe("#131416");
    expect(theme.card).toBe("#1b1b1e");
    expect(theme.foreground).toBe("#d7d7db");
    expect(theme.shadow).toContain("0.35");
  });
});
