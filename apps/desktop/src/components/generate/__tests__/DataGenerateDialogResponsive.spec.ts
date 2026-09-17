// @vitest-environment happy-dom

import { createApp, h, nextTick, ref, type App } from "vue";
import { TooltipProvider } from "reka-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fullscreen = ref(false);
vi.mock("@/composables/useDialogFullscreen", () => ({ useDialogFullscreen: () => ({ isFullscreen: fullscreen, toggleFullscreen: vi.fn(), exitFullscreenIfOwned: vi.fn() }) }));
vi.mock("@/stores/connectionStore", () => ({ useConnectionStore: () => ({ getConfig: () => undefined }) }));
vi.mock("@/lib/backend/api", () => ({}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../params/GeneratorParamsPanel.vue", () => ({ default: { render: () => null } }));
import DataGenerateDialog from "../DataGenerateDialog.vue";

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
          contentRect: new DOMRect(0, 0, width, 400),
          contentBoxSize: [{ inlineSize: width, blockSize: 400 }],
          borderBoxSize: [{ inlineSize: width + 50, blockSize: 450 }],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
}
let app: App | undefined;
let host: HTMLDivElement;
const open = ref(true);
const config = () => document.querySelector<HTMLElement>(".dbx-generate-config")!;
const observerFor = (target: Element) => ResizeObserverMock.instances.find((item) => item.targets.has(target))!;
const stacked = () => config().classList.contains("dbx-generate-config--stacked");

beforeEach(async () => {
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("innerWidth", 1280);
  fullscreen.value = false;
  open.value = true;
  host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    setup: () => () =>
      h(
        TooltipProvider,
        {},
        {
          default: () =>
            h(DataGenerateDialog, {
              open: open.value,
              "onUpdate:open": (value: boolean) => {
                open.value = value;
              },
            }),
        },
      ),
  });
  app.mount(host);
  await nextTick();
  await nextTick();
});
afterEach(async () => {
  app?.unmount();
  app = undefined;
  await nextTick();
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DataGenerateDialog content-box responsiveness", () => {
  it("stacks unknown/zero/narrow widths in a desktop viewport, widening at 700 CSS px", async () => {
    const target = config();
    const observer = observerFor(target);
    expect(observer.observe).toHaveBeenCalledWith(target, { box: "content-box" });
    expect(stacked()).toBe(true);
    for (const [width, expected] of [
      [1050, false],
      [590, true],
      [334, true],
      [699.5, true],
      [700, false],
      [0, true],
      [1230, false],
    ] as const) {
      observer.deliver(target, width);
      await nextTick();
      expect(stacked()).toBe(expected);
    }
  });

  it("remeasures fullscreen/restore rather than assuming a requested size", async () => {
    const observer = observerFor(config());
    observer.deliver(config(), 590);
    fullscreen.value = true;
    await nextTick();
    expect(stacked()).toBe(true);
    observer.deliver(config(), 1230);
    await nextTick();
    expect(stacked()).toBe(false);
    fullscreen.value = false;
    observer.deliver(config(), 590);
    await nextTick();
    expect(stacked()).toBe(true);
  });

  it("disconnects on close/unmount and ignores stale observer deliveries after reopen", async () => {
    const first = config();
    const observer = observerFor(first);
    observer.deliver(first, 1050);
    await nextTick();
    open.value = false;
    await nextTick();
    await nextTick();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    open.value = true;
    await nextTick();
    await nextTick();
    const second = config();
    const current = observerFor(second);
    expect(current).not.toBe(observer);
    expect(stacked()).toBe(true);
    current.deliver(second, 1050);
    await nextTick();
    observer.deliver(first, 334);
    await nextTick();
    expect(stacked()).toBe(false);
    app!.unmount();
    app = undefined;
    expect(current.disconnect).toHaveBeenCalledOnce();
  });
});
