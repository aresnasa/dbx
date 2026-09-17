// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { createApp, h, nextTick, ref, type App } from "vue";
import { TooltipProvider } from "reka-ui";
import VueVirtualScroller from "vue-virtual-scroller";
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";
import DataGrid from "../DataGrid.vue";

vi.mock("vue-i18n", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-i18n")>()), useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/composables/useSqlHighlighter", () => ({ useSqlHighlighter: () => ({ highlight: (sql: string) => sql }) }));
vi.mock("@/composables/useNavigationTargets", () => ({ useNavigationTargets: () => ({ openTableTarget: vi.fn() }) }));
vi.mock("@/lib/backend/api", () => ({
  getTableDisplayDdl: vi.fn(async () => "CREATE TABLE fixture (id INT)"),
  listIndexes: vi.fn(async () => []),
  listForeignKeys: vi.fn(async () => []),
  saveEditorSettings: vi.fn(async () => {}),
}));

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  targets = new Set<Element>();
  observe = vi.fn((target: Element, _options?: ResizeObserverOptions) => {
    this.targets.add(target);
  });
  unobserve = vi.fn((target: Element) => {
    this.targets.delete(target);
  });
  disconnect = vi.fn(() => {
    this.targets.clear();
  });
  constructor(private callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
  deliver(target: Element, width: number) {
    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, width, 200),
          contentBoxSize: [{ inlineSize: width, blockSize: 200 }],
          borderBoxSize: [{ inlineSize: width + 2, blockSize: 202 }],
          devicePixelContentBoxSize: [{ inlineSize: width * 2, blockSize: 400 }],
        },
      ],
      this as unknown as ResizeObserver,
    );
  }
}

type GridHandle = { toggleTableInfo: (tab?: "ddl") => Promise<void> };
let app: App | undefined;
let host: HTMLDivElement;
let css: HTMLStyleElement;
const source = readFileSync("apps/desktop/src/components/grid/DataGrid.vue", "utf8");

beforeEach(() => {
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  css = document.createElement("style");
  const start = source.indexOf(".table-info-action-button {");
  css.textContent = source.slice(start, source.indexOf(".detail-drawer-resizing {", start));
  document.head.append(css);
});

afterEach(async () => {
  app?.unmount();
  app = undefined;
  await nextTick();
  host?.remove();
  css.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountGrid() {
  host = document.createElement("div");
  document.body.append(host);
  const pinia = createPinia();
  const settings = useSettingsStore(pinia);
  settings.editorSettings.tableInfoDrawerWidth = 450;
  const grid = ref<GridHandle | null>(null);
  app = createApp({
    setup: () => () =>
      h(
        TooltipProvider,
        {},
        {
          default: () =>
            h(DataGrid, {
              ref: grid,
              result: { columns: ["id"], rows: [], row_count: 0, execution_time_ms: 0 },
              databaseType: "mysql",
              connectionId: "fixture-only",
              database: "fixture",
              tableMeta: { tableName: "fixture", columns: [], primaryKeys: [] },
            }),
        },
      ),
  });
  app.use(pinia);
  app.use(VueVirtualScroller);
  app.mount(host);
  await nextTick();
  return grid.value!;
}

function drawer() {
  return host.querySelector<HTMLElement>(".table-info-drawer")!;
}
function observerFor(target: Element) {
  const observer = ResizeObserverMock.instances.find((item) => item.targets.has(target));
  expect(observer, "the real drawer element must be observed").toBeDefined();
  return observer!;
}
function expectActions(compact: boolean) {
  expect(drawer().classList.contains("table-info-drawer--compact")).toBe(compact);
  for (const name of ["grid.copyDdl", "contextMenu.editStructure"]) {
    const button = drawer().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    expect(button).not.toBeNull();
    expect(button.title).toBe(name);
    expect(button.querySelector("svg")).not.toBeNull();
    const label = button.querySelector<HTMLElement>(".table-info-action-label")!;
    expect(label.textContent).toBe(name);
  }
}

describe("DataGrid table-info drawer compact actions", () => {
  it("uses ordinary descendant selectors for icon-only buttons, without container queries", () => {
    // Happy DOM does not reliably invalidate descendant computed styles when
    // an ancestor class changes; check the actual CSS declarations separately.
    const rules = Array.from(css.sheet!.cssRules) as CSSStyleRule[];
    const rule = (selector: string) => rules.find((item) => item.selectorText === selector)!.style;
    const compactButton = rule(".table-info-drawer--compact .table-info-action-button");
    expect(compactButton.width).toBe("1.5rem");
    expect(compactButton.maxWidth).toBe("1.5rem");
    expect(compactButton.getPropertyValue("padding-inline")).toBe("0");
    expect(rule(".table-info-drawer--compact .table-info-action-label").maxWidth).toBe("0");
    expect(rule(".table-info-drawer--compact .table-info-action-label").opacity).toBe("0");
    expect(rule(".table-info-action-label").maxWidth).toBe("6rem");
    expect(rule(".table-info-action-label").opacity).toBe("1");
    expect(css.textContent).not.toContain("@container");
    expect(source).not.toContain("container-type: inline-size");
  });
  it("uses observed content-box CSS pixels, including the inclusive 360px boundary", async () => {
    const grid = await mountGrid();
    expect(drawer()).toBeNull();
    await grid.toggleTableInfo("ddl");
    await nextTick();
    const target = drawer();
    const observer = observerFor(target);
    expect(observer.observe).toHaveBeenCalledWith(target, { box: "content-box" });
    expect(target.style.width).toBe("450px");
    // Unknown/zero width stays conservatively icon-only until measured.
    expectActions(true);
    for (const [width, compact] of [
      [450, false],
      [360, true],
      [360.5, false],
      [359.5, true],
      [0, true],
      [500, false],
    ] as const) {
      observer.deliver(target, width);
      await nextTick();
      expectActions(compact);
    }
  });

  it("disconnects on close/unmount and remeasures a reopened drawer", async () => {
    const grid = await mountGrid();
    await grid.toggleTableInfo("ddl");
    await nextTick();
    const first = drawer();
    const firstObserver = observerFor(first);
    firstObserver.deliver(first, 500);
    await nextTick();
    expectActions(false);
    await grid.toggleTableInfo("ddl");
    await nextTick();
    expect(drawer()).toBeNull();
    expect(firstObserver.disconnect).toHaveBeenCalledOnce();
    await grid.toggleTableInfo("ddl");
    await nextTick();
    const second = drawer();
    const secondObserver = observerFor(second);
    expect(second).not.toBe(first);
    expectActions(true);
    secondObserver.deliver(second, 500);
    await nextTick();
    expectActions(false);
    firstObserver.deliver(first, 300);
    await nextTick();
    expectActions(false);
    app!.unmount();
    app = undefined;
    expect(secondObserver.disconnect).toHaveBeenCalledOnce();
  });
});
