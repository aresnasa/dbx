// @vitest-environment happy-dom

import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fullscreen = ref(false);
vi.mock("@/composables/useDialogFullscreen", () => ({ useDialogFullscreen: () => ({ isFullscreen: fullscreen, toggleFullscreen: vi.fn(), exitFullscreenIfOwned: vi.fn() }) }));
vi.mock("@/stores/connectionStore", () => ({ useConnectionStore: () => ({ getConfig: () => undefined }) }));
vi.mock("@/lib/backend/api", () => ({}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../params/GeneratorParamsPanel.vue", () => ({ default: { render: () => null } }));
vi.mock("@/components/ui/dialog", () => {
  const stub = (slot: string) =>
    defineComponent({
      setup:
        (_, { attrs, slots }) =>
        () =>
          h("div", { ...attrs, "data-slot": slot }, slots.default?.()),
    });
  return { Dialog: stub("dialog"), DialogContent: stub("dialog-content"), DialogHeader: stub("dialog-header"), DialogTitle: stub("dialog-title"), DialogFooter: stub("dialog-footer") };
});

import DataGenerateDialog from "../DataGenerateDialog.vue";

let app: ReturnType<typeof createApp>;
let container: HTMLDivElement;
let open: ReturnType<typeof ref<boolean>>;

beforeEach(async () => {
  fullscreen.value = false;
  vi.stubGlobal("innerWidth", 1400);
  vi.stubGlobal("innerHeight", 900);
  open = ref(true);
  container = document.createElement("div");
  document.body.append(container);
  app = createApp({ setup: () => () => h(DataGenerateDialog, { open: open.value }) });
  app.mount(container);
  await nextTick();
});

afterEach(() => {
  app.unmount();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function dialog() {
  return container.querySelector<HTMLElement>("[data-slot='dialog-content']")!;
}
function handle(edge = "se") {
  return container.querySelector<HTMLElement>(`.cursor-${edge}-resize`)!;
}
function pointer(target: HTMLElement, type: string, x: number, y: number, pointerId = 1, button = 0) {
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId, button, bubbles: true, cancelable: true, isPrimary: true }));
}
function start(edge = "se", captureFails = false, size = { width: 800, height: 500 }) {
  vi.spyOn(dialog(), "getBoundingClientRect").mockReturnValue(size as DOMRect);
  const target = handle(edge);
  target.setPointerCapture = vi.fn(() => {
    if (captureFails) throw new Error("capture unavailable");
  });
  target.releasePointerCapture = vi.fn();
  target.hasPointerCapture = vi.fn(() => true);
  pointer(target, "pointerdown", 1100, 700);
  return target;
}

describe("DataGenerateDialog centered resize", () => {
  it("uses the normal configuration height as its flex basis and fills a custom/fullscreen height", async () => {
    const panels = container.querySelector<HTMLElement>(".dbx-generate-config")!;
    expect(panels.classList.contains("flex-auto")).toBe(true);
    expect(panels.classList.contains("h-[400px]")).toBe(true);
    const target = start();
    pointer(target, "pointermove", 1150, 730);
    await nextTick();
    expect(panels.classList.contains("h-[400px]")).toBe(false);
    fullscreen.value = true;
    await nextTick();
    expect(dialog().style.height).toBe("100%");
    expect(dialog().style.maxHeight).toBe("100%");
    expect(panels.classList.contains("h-[400px]")).toBe(false);
    fullscreen.value = false;
    await nextTick();
    expect(dialog().style.height).toBe("560px");
  });

  it.each(["e", "s", "se"])("keeps the %s edge under the pointer while remaining centered", async (edge) => {
    const target = start(edge);
    pointer(target, "pointermove", 1150, 730);
    await nextTick();
    expect(dialog().style.width).toBe(edge === "s" ? "800px" : "900px");
    expect(dialog().style.height).toBe(edge === "e" ? "500px" : "560px");
  });

  it.each([
    { edge: "e", size: { width: 800, height: 300 }, expected: { width: "900px", height: "300px" } },
    { edge: "s", size: { width: 500, height: 500 }, expected: { width: "500px", height: "560px" } },
  ])("preserves the undragged axis on the $edge edge even below its preferred minimum", async ({ edge, size, expected }) => {
    const target = start(edge, false, size);
    pointer(target, "pointermove", 1150, 730);
    await nextTick();
    expect(dialog().style.width).toBe(expected.width);
    expect(dialog().style.height).toBe(expected.height);
  });

  it("does not start resizing for secondary buttons or non-primary touches", async () => {
    const target = handle();
    const initial = dialog().style.width;
    pointer(target, "pointerdown", 1100, 700, 1, 2);
    pointer(document.body, "pointermove", 1200, 800);
    target.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, button: 0, isPrimary: false, bubbles: true }));
    pointer(document.body, "pointermove", 1200, 800, 2);
    await nextTick();
    expect(dialog().style.width).toBe(initial);
    expect(target.style.touchAction).toBe("none");
  });

  it("lets the available viewport win over desktop minimum dimensions", async () => {
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 350);
    const target = start();
    pointer(target, "pointermove", 2000, 2000);
    await nextTick();
    expect(dialog().style.width).toBe("468px");
    expect(dialog().style.height).toBe("318px");
  });

  it("clamps both minimum and maximum dimensions", async () => {
    const target = start();
    pointer(target, "pointermove", -1000, -1000);
    await nextTick();
    expect(dialog().style.width).toBe("640px");
    expect(dialog().style.height).toBe("420px");
    pointer(target, "pointermove", 4000, 4000);
    await nextTick();
    expect(dialog().style.width).toBe("1368px");
    expect(dialog().style.height).toBe("868px");
  });

  it("ignores unrelated pointers and stops on lost capture", async () => {
    const target = start();
    const initial = dialog().style.width;
    pointer(target, "pointermove", 1200, 800, 2);
    await nextTick();
    expect(dialog().style.width).toBe(initial);
    pointer(target, "lostpointercapture", 1100, 700);
    pointer(target, "pointermove", 1200, 800);
    await nextTick();
    expect(dialog().style.width).toBe(initial);
  });

  it.each(["pointerup", "pointercancel"])("releases capture and ends the drag on %s", async (type) => {
    const target = start();
    pointer(target, type, 1100, 700);
    pointer(target, "pointermove", 1200, 800);
    await nextTick();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(dialog().style.width).not.toBe("1000px");
  });

  it("continues outside the handle when pointer capture is unavailable", async () => {
    start("se", true);
    pointer(document.body, "pointermove", 1150, 730);
    await nextTick();
    expect(dialog().style.width).toBe("900px");
    pointer(document.body, "pointerup", 1150, 730);
    pointer(document.body, "pointermove", 1200, 800);
    await nextTick();
    expect(dialog().style.width).toBe("900px");
  });

  it("cancels an active drag when closed or entering fullscreen", async () => {
    const target = start();
    open.value = false;
    await nextTick();
    pointer(target, "pointermove", 1200, 800);
    await nextTick();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(dialog().style.width).not.toBe("1000px");
    open.value = true;
    await nextTick();
    const nextTarget = start();
    fullscreen.value = true;
    await nextTick();
    expect(nextTarget.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(handle()).toBeNull();
  });
});
