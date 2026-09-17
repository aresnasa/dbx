import { describe, expect, it } from "vitest";
import { isServoEngine, toUsvgColor } from "@/lib/ui/servoSvgIconCompat";

describe("isServoEngine", () => {
  it("detects Servo 0.5 user agents", () => {
    expect(
      isServoEngine(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Servo/0.5.0 Firefox/140.0",
      ),
    ).toBe(true);
  });

  it("ignores Chromium / WebKit user agents", () => {
    expect(
      isServoEngine(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isServoEngine(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      ),
    ).toBe(false);
  });
});

describe("toUsvgColor", () => {
  it("passes RGB-family colors through unchanged (usvg already supports them)", () => {
    expect(toUsvgColor("rgb(215, 215, 219)")).toBe("rgb(215, 215, 219)");
    expect(toUsvgColor("rgba(10, 10, 10, 0.5)")).toBe("rgba(10, 10, 10, 0.5)");
    expect(toUsvgColor("#d7d7db")).toBe("#d7d7db");
  });

  it("converts oklch from the dbx dark palette to sRGB", () => {
    // tokens.css .dark --foreground ≈ oklch(88% .006 285) ≈ #d7d7db。
    expect(toUsvgColor("oklch(88% .006 285)")).toBe("rgb(215, 215, 219)");
    expect(toUsvgColor("oklch(0.88 0.006 285)")).toBe("rgb(215, 215, 219)");
  });

  it("converts oklch with alpha to rgba", () => {
    expect(toUsvgColor("oklch(88% .006 285 / 50%)")).toBe(
      "rgba(215, 215, 219, 0.5)",
    );
  });

  it("converts pure oklch coordinates", () => {
    expect(toUsvgColor("oklch(1 0 0)")).toBe("rgb(255, 255, 255)");
    expect(toUsvgColor("oklch(0 0 0)")).toBe("rgb(0, 0, 0)");
    // 经典红绿蓝，校验色相换算方向。
    expect(toUsvgColor("oklch(0.62796 0.25768 29.234)")).toBe("rgb(255, 0, 0)");
    expect(toUsvgColor("oklch(0.1534 0.03471 264.29 / .5)")).toMatch(
      /^rgba\(\d+, \d+, \d+, 0.5\)$/,
    );
  });

  it("converts oklab to sRGB", () => {
    expect(toUsvgColor("oklab(0.88 0 0)")).toBe("rgb(215, 215, 215)");
  });

  it("treats 'none' components as 0 (CSS Color 4 missing-component rule)", () => {
    expect(toUsvgColor("oklch(0.88 none 285)")).toBe("rgb(215, 215, 215)");
  });

  it("returns null for colors it cannot convert (leave Servo behavior untouched)", () => {
    expect(toUsvgColor("lab(50% 20 30)")).toBeNull();
    expect(toUsvgColor("color(display-p3 1 0 0)")).toBeNull();
    expect(toUsvgColor("not-a-color")).toBeNull();
    expect(toUsvgColor("")).toBeNull();
  });
});
