import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const browserSource = readFileSync(new URL("../KvKeyBrowser.vue", import.meta.url), "utf8");

describe("KvKeyBrowser compact layout for narrow hosts", () => {
  it("measures the browser root so a right-side small window rotates the split", () => {
    expect(browserSource).toContain('<div ref="browserRootRef" class="flex h-full min-h-0 flex-col bg-background">');
    expect(browserSource).toContain("const kvBrowserCompactWidthPx = 640;");
    expect(browserSource).toContain("const kvBrowserCompact = ref(false);");
    expect(browserSource).toContain("kvBrowserCompactObserver = new ResizeObserver((entries) => {");
    expect(browserSource).toContain('typeof ResizeObserver !== "undefined"');
    expect(browserSource).toContain("kvBrowserCompactObserver?.disconnect();");
    expect(browserSource).toContain("kvBrowserCompact.value = width < kvBrowserCompactWidthPx;");
  });

  it("stacks the key tree and the value pane vertically in compact mode", () => {
    expect(browserSource).toContain('<Splitpanes class="kv-browser-splitpanes min-h-0 flex-1" :horizontal="kvBrowserCompact" @resized="handleKvBrowserSplitResized">');
    expect(browserSource).toContain("kv-browser-splitpanes.splitpanes--horizontal :deep(> .splitpanes__splitter)");
    expect(browserSource).toContain("cursor: row-resize;");
  });

  it("wraps the toolbar and detail actions instead of clipping them off-screen", () => {
    expect(browserSource).toContain('<div class="flex flex-wrap shrink-0 items-center gap-2 border-b bg-muted/15 px-3 py-2.5 overflow-x-auto">');
    expect(browserSource).toContain('<div class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3">');
    expect(browserSource).toContain('<div class="flex shrink-0 flex-wrap justify-end gap-2">');
  });
});
