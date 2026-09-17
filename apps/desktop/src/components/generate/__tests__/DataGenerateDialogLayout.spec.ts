import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/common/utils";

const source = readFileSync(new URL("../DataGenerateDialog.vue", import.meta.url), "utf8");

describe("DataGenerateDialog responsive layout", () => {
  it("overrides the shared max-w-sm clamp for the normal dialog", () => {
    expect(source).toContain('const normalWidth = "min(1100px, calc(100vw - 2rem))";');
    expect(source).toContain("return { width: normalWidth, maxWidth: normalWidth };");
    const contentClass = source.match(/<DialogContent class="([^"]+)"/)?.[1];
    expect(contentClass).toBeDefined();
    // The legacy !important max-w-sm rule wins over inline maxWidth unless
    // the shared class is removed by tailwind-merge, not merely overridden.
    const merged = cn("relative grid w-full max-w-sm", contentClass).split(" ");
    expect(merged).not.toContain("max-w-sm");
    expect(merged).toContain("max-w-none");
  });

  it("lets both configuration columns shrink or stack without clipping", () => {
    expect(source).toContain('class="dbx-generate-config flex flex-auto min-h-0 gap-4"');
    expect(source).toContain('class="dbx-generate-tree flex shrink-0 flex-col min-h-0 min-w-0 rounded-md border"');
    expect(source).not.toContain("md:flex-row");
    expect(source).not.toContain("@container");
    expect(source).toContain('class="min-w-0 flex-1 break-all"');
    expect(source).toContain('class="flex min-w-0 flex-1 flex-col min-h-0 rounded-md border"');
  });

  it("allows the footer actions to wrap inside the dialog", () => {
    expect(source).toContain('class="mx-2 mt-auto flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t pt-3 sm:mx-4 sm:justify-between"');
    expect(source).toContain('<div class="flex min-w-0 flex-wrap items-center gap-2">');
  });
});
