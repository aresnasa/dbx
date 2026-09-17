// @vitest-environment happy-dom

import { createApp, h, nextTick, ref } from "vue";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogFullscreen } from "../useDialogFullscreen";

const mocks = vi.hoisted(() => ({ tauri: false, actual: false, unlisten: vi.fn(), isFullscreen: vi.fn(), setFullscreen: vi.fn(), onResized: vi.fn() }));
vi.mock("@/lib/backend/tauriRuntime", () => ({ isTauriRuntime: () => mocks.tauri }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => mocks }));
let app: ReturnType<typeof createApp> | undefined;
let container: HTMLDivElement;
let element: Element | null;
let request: ReturnType<typeof vi.fn>;
let exit: ReturnType<typeof vi.fn>;
let dialogOpen = ref(true);
async function mount(withDialog = false) {
  let state!: ReturnType<typeof useDialogFullscreen>;
  container = document.createElement("div");
  document.body.append(container);
  dialogOpen = ref(true);
  app = createApp({
    setup() {
      state = useDialogFullscreen();
      return () =>
        withDialog
          ? h(
              Dialog,
              {
                open: dialogOpen.value,
                "onUpdate:open": (open: boolean) => {
                  dialogOpen.value = open;
                },
              },
              {
                default: () => h(DialogContent, {}, { default: () => [h(DialogTitle, {}, () => "Fullscreen test"), h("input", { "data-fullscreen-test-input": "" })] }),
              },
            )
          : h("div");
    },
  });
  app.mount(container);
  await state.syncFullscreenState();
  await nextTick();
  if (withDialog) await vi.waitFor(() => expect(document.querySelector("[data-fullscreen-test-input]")).not.toBeNull());
  return state;
}
beforeEach(() => {
  mocks.tauri = false;
  mocks.actual = false;
  mocks.isFullscreen.mockImplementation(async () => mocks.actual);
  mocks.setFullscreen.mockImplementation(async (value: boolean) => {
    mocks.actual = value;
  });
  mocks.onResized.mockResolvedValue(mocks.unlisten);
  element = null;
  request = vi.fn(async () => {
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  exit = vi.fn(async () => {
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element });
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
});
afterEach(async () => {
  app?.unmount();
  app = undefined;
  await nextTick();
  container?.remove();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("useDialogFullscreen", () => {
  it.each(["input", "window"])("handles fallback Escape from %s before the real Reka dialog can dismiss", async (target) => {
    request.mockRejectedValue(new Error("Fullscreen unavailable"));
    const state = await mount(true);
    await state.enterFullscreen();
    const eventTarget = target === "window" ? window : document.querySelector("[data-fullscreen-test-input]")!;
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    eventTarget.dispatchEvent(escape);
    await nextTick();
    expect(dialogOpen.value).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(state.isFullscreen.value).toBe(false);
    eventTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(dialogOpen.value).toBe(false);
  });

  it.each(["input", "window"])("leaves native Escape from %s uncancelled for Servo without dismissing the dialog", async (target) => {
    const state = await mount(true);
    await state.enterFullscreen();
    const eventTarget = target === "window" ? window : document.querySelector("[data-fullscreen-test-input]")!;
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    eventTarget.dispatchEvent(escape);
    await nextTick();
    expect(dialogOpen.value).toBe(true);
    expect(escape.defaultPrevented).toBe(false);
    expect(exit).not.toHaveBeenCalled();
    // Model the host's default action after dispatch: only preventDefault vetoes it.
    if (!escape.defaultPrevented) {
      element = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    }
    await state.syncFullscreenState();
    expect(state.isFullscreen.value).toBe(false);
    await state.exitFullscreenIfOwned();
    expect(exit).not.toHaveBeenCalled();
    eventTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(dialogOpen.value).toBe(false);
  });

  it("does not adopt external native fullscreen when leaving a local fallback", async () => {
    request.mockRejectedValue(new Error("Fullscreen unavailable"));
    const state = await mount();
    await state.enterFullscreen();
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    await state.exitFullscreenIfOwned();
    await state.exitFullscreenIfOwned();
    expect(exit).not.toHaveBeenCalled();
    expect(state.isFullscreen.value).toBe(true);
  });

  it("releases web ownership synchronously before an external re-entry", async () => {
    const state = await mount();
    await state.enterFullscreen();
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    await state.exitFullscreenIfOwned();
    expect(exit).not.toHaveBeenCalled();
  });

  it.each([true, false])("does not exit another element's fullscreen on close (change event delivered: %s)", async (dispatchChange) => {
    const state = await mount();
    await state.enterFullscreen();
    element = document.createElement("video");
    if (dispatchChange) document.dispatchEvent(new Event("fullscreenchange"));
    await state.exitFullscreenIfOwned();
    expect(exit).not.toHaveBeenCalled();
    expect(state.isFullscreen.value).toBe(true);
  });

  it("requests native web fullscreen and only releases the owned session on close", async () => {
    const state = await mount();
    await state.toggleFullscreen();
    expect(request).toHaveBeenCalledOnce();
    expect(state.isFullscreen.value).toBe(true);
    await state.exitFullscreenIfOwned();
    expect(exit).toHaveBeenCalledOnce();
    expect(state.isFullscreen.value).toBe(false);
  });

  it("does not acquire ownership of existing browser fullscreen", async () => {
    element = document.documentElement;
    const state = await mount();
    await state.enterFullscreen();
    await state.exitFullscreenIfOwned();
    expect(request).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(state.isFullscreen.value).toBe(true);
  });

  it.each(["missing", "rejected"])("maximizes locally when the web API is %s and restores on Escape", async (mode) => {
    if (mode === "missing") Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: undefined });
    else request.mockRejectedValue(new Error("Fullscreen denied"));
    const state = await mount();
    await state.toggleFullscreen();
    expect(state.isFullscreen.value).toBe(true);
    await state.syncFullscreenState();
    expect(state.isFullscreen.value).toBe(true);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    expect(state.isFullscreen.value).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it("serializes double clicks and closes fullscreen requested before a dialog closed", async () => {
    let complete!: () => void;
    request.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = () => {
            element = document.documentElement;
            resolve();
          };
        }),
    );
    const state = await mount();
    const entering = state.toggleFullscreen();
    const secondClick = state.toggleFullscreen();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const closing = state.exitFullscreenIfOwned();
    complete();
    await Promise.all([entering, secondClick, closing]);
    expect(exit).toHaveBeenCalledOnce();
    expect(state.isFullscreen.value).toBe(false);
  });

  it("restores an owned pending request after unmount", async () => {
    let complete!: () => void;
    request.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = () => {
            element = document.documentElement;
            resolve();
          };
        }),
    );
    const state = await mount();
    const entering = state.enterFullscreen();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    app?.unmount();
    app = undefined;
    complete();
    await entering;
    await vi.waitFor(() => expect(exit).toHaveBeenCalledOnce());
  });

  it("falls back when a webview resolves requestFullscreen without entering fullscreen", async () => {
    request.mockResolvedValue(undefined);
    const state = await mount();
    await state.enterFullscreen();
    expect(state.isFullscreen.value).toBe(true);
    await state.exitFullscreenIfOwned();
    expect(state.isFullscreen.value).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it("keeps ownership after a denied native exit so close can retry", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = await mount();
    await state.enterFullscreen();
    exit.mockRejectedValueOnce(new Error("exit denied"));
    await state.exitFullscreenIfOwned();
    expect(state.isFullscreen.value).toBe(true);
    await state.exitFullscreenIfOwned();
    expect(exit).toHaveBeenCalledTimes(2);
    expect(state.isFullscreen.value).toBe(false);
  });

  it("synchronizes an external browser exit", async () => {
    const state = await mount();
    await state.enterFullscreen();
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    await state.syncFullscreenState();
    expect(state.isFullscreen.value).toBe(false);
    await state.exitFullscreenIfOwned();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits Tauri fullscreen on Escape without closing the real dialog", async () => {
    mocks.tauri = true;
    const state = await mount(true);
    await state.enterFullscreen();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.querySelector("[data-fullscreen-test-input]")!.dispatchEvent(escape);
    await vi.waitFor(() => expect(state.isFullscreen.value).toBe(false));
    expect(dialogOpen.value).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(mocks.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it("respects an already prevented Escape", async () => {
    request.mockRejectedValue(new Error("Fullscreen unavailable"));
    const state = await mount();
    await state.enterFullscreen();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    escape.preventDefault();
    window.dispatchEvent(escape);
    expect(state.isFullscreen.value).toBe(true);
  });

  it("uses the Tauri window API instead of browser fullscreen", async () => {
    mocks.tauri = true;
    const state = await mount();
    await state.enterFullscreen();
    expect(mocks.setFullscreen).toHaveBeenCalledWith(true);
    expect(state.isFullscreen.value).toBe(true);
    await state.exitFullscreenIfOwned();
    expect(mocks.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(state.isFullscreen.value).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("cleans up a native resize subscription resolved after unmount", async () => {
    mocks.tauri = true;
    let subscribe!: (unlisten: () => void) => void;
    mocks.onResized.mockImplementationOnce(
      () =>
        new Promise<() => void>((resolve) => {
          subscribe = resolve;
        }),
    );
    await mount();
    await vi.waitFor(() => expect(mocks.onResized).toHaveBeenCalledOnce());
    app?.unmount();
    app = undefined;
    subscribe(mocks.unlisten);
    await vi.waitFor(() => expect(mocks.unlisten).toHaveBeenCalledOnce());
  });

  it("maximizes locally if Tauri rejects fullscreen without exiting the native window", async () => {
    mocks.tauri = true;
    mocks.setFullscreen.mockRejectedValueOnce(new Error("unavailable"));
    const state = await mount();
    await state.enterFullscreen();
    expect(state.isFullscreen.value).toBe(true);
    await state.exitFullscreenIfOwned();
    expect(state.isFullscreen.value).toBe(false);
    expect(mocks.setFullscreen).toHaveBeenCalledTimes(1);
  });

  it("preserves an existing native Tauri fullscreen session", async () => {
    mocks.tauri = true;
    mocks.actual = true;
    const state = await mount();
    await state.enterFullscreen();
    await state.exitFullscreenIfOwned();
    expect(mocks.setFullscreen).not.toHaveBeenCalled();
    expect(state.isFullscreen.value).toBe(true);
  });
});
