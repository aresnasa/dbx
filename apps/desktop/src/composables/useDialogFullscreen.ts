import { ref, onMounted, onUnmounted } from "vue";
import { isTauriRuntime } from "@/lib/backend/tauriRuntime";

const FULLSCREEN_SYNC_ATTEMPTS = 40;
const FULLSCREEN_SYNC_INTERVAL_MS = 50;

interface TauriWindowLike {
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  onResized: (handler: () => void) => Promise<() => void>;
}

/**
 * Fullscreen support for large dialog pages (data tools, diagrams, …).
 *
 * In the Tauri desktop build this toggles the *native window* fullscreen
 * state, so the dialog fills the whole screen edge to edge; in the web build
 * it falls back to the Fullscreen API on `document.documentElement`. The
 * dialog maximizes within the viewport if the native API is unavailable or
 * denied. This local fallback never claims to expand the host window. The
 * composable tracks whether it was the one that entered fullscreen ("owned")
 * so it only restores the previous window state on exit/close, never fighting
 * a fullscreen the user entered through the app toolbar.
 */
export function useDialogFullscreen() {
  const isFullscreen = ref(false);
  let ownedFullscreen = false;
  let localFullscreen = false;
  let fullscreenTransitionTarget: boolean | null = null;
  let transition: Promise<void> | null = null;
  let unlistenWindowResize: (() => void) | null = null;
  let disposed = false;

  async function resolveTauriWindow(): Promise<TauriWindowLike | null> {
    if (!isTauriRuntime()) return null;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return getCurrentWindow() as unknown as TauriWindowLike;
    } catch {
      return null;
    }
  }

  async function syncFullscreenState() {
    // Web fullscreenchange must release ownership before another entry can
    // replace fullscreenElement; an unnecessary await loses that exit event.
    const appWindow = isTauriRuntime() ? await resolveTauriWindow() : null;
    if (appWindow) {
      try {
        const actualFullscreen = await appWindow.isFullscreen();
        isFullscreen.value = localFullscreen || (fullscreenTransitionTarget ?? actualFullscreen);
      } catch {
        isFullscreen.value = localFullscreen || (fullscreenTransitionTarget ?? isFullscreen.value);
      }
    } else {
      // This composable only requests fullscreen on the document root. If
      // another element takes over, closing this dialog must not dismiss it.
      if (!localFullscreen && document.fullscreenElement !== document.documentElement) ownedFullscreen = false;
      isFullscreen.value = localFullscreen || !!document.fullscreenElement;
    }
    if (!isFullscreen.value && fullscreenTransitionTarget === null) ownedFullscreen = false;
  }

  /** Wait for the native window to report the expected fullscreen state. */
  async function waitForTauriFullscreenState(appWindow: TauriWindowLike, expected: boolean) {
    for (let attempt = 0; attempt < FULLSCREEN_SYNC_ATTEMPTS; attempt += 1) {
      if ((await appWindow.isFullscreen()) === expected) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, FULLSCREEN_SYNC_INTERVAL_MS));
    }
  }

  // Ignore repeated toggles during a native transition. Close/unmount can await
  // this same promise before releasing ownership, including a pending enter.
  function runTransition(action: () => Promise<void>): Promise<void> {
    if (transition) return transition;
    transition = action().finally(() => {
      transition = null;
    });
    return transition;
  }

  function enterFullscreen(): Promise<void> {
    return runTransition(async () => {
      await syncFullscreenState();
      if (isFullscreen.value || disposed) return;
      const appWindow = await resolveTauriWindow();
      if (appWindow) {
        fullscreenTransitionTarget = true;
        try {
          await appWindow.setFullscreen(true);
          ownedFullscreen = true;
          isFullscreen.value = true;
          await waitForTauriFullscreenState(appWindow, true);
        } catch {
          if (!ownedFullscreen) localFullscreen = true;
        } finally {
          fullscreenTransitionTarget = null;
        }
      } else {
        try {
          if (typeof document.documentElement.requestFullscreen === "function") {
            await document.documentElement.requestFullscreen();
          }
          // Some embedded engines expose an API but do not enter fullscreen.
          localFullscreen = !document.fullscreenElement;
        } catch {
          localFullscreen = true;
        }
      }
      ownedFullscreen = true;
      await syncFullscreenState();
    });
  }

  function exitFullscreen(): Promise<void> {
    return runTransition(async () => {
      if (localFullscreen) {
        localFullscreen = false;
        ownedFullscreen = false;
      } else {
        const appWindow = await resolveTauriWindow();
        fullscreenTransitionTarget = false;
        try {
          if (appWindow) {
            if (await appWindow.isFullscreen()) await appWindow.setFullscreen(false);
            isFullscreen.value = false;
            await waitForTauriFullscreenState(appWindow, false);
          } else if (document.fullscreenElement) {
            await document.exitFullscreen();
          }
        } catch (error) {
          // Preserve ownership/state so a denied exit can be retried.
          console.warn("[dialog-fullscreen] Failed to exit fullscreen", error);
        } finally {
          fullscreenTransitionTarget = null;
        }
      }
      await syncFullscreenState();
    });
  }

  /** Exit fullscreen when a dialog closes — but only if we entered it. */
  async function exitFullscreenIfOwned() {
    await transition;
    await syncFullscreenState();
    if (ownedFullscreen) await exitFullscreen();
  }

  function toggleFullscreen() {
    if (transition) return transition;
    return isFullscreen.value ? exitFullscreen() : enterFullscreen();
  }

  function handleWebFullscreenChange() {
    void syncFullscreenState();
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (localFullscreen) {
      // Local maximization has no native default action to perform.
      event.preventDefault();
      event.stopImmediatePropagation();
      localFullscreen = false;
      ownedFullscreen = false;
      isFullscreen.value = !!document.fullscreenElement;
    } else if (document.fullscreenElement) {
      // Reka dismisses dialogs on window keydown. Keep the dialog open, but
      // DO NOT preventDefault: Servo/the browser must still exit fullscreen.
      event.stopImmediatePropagation();
    } else if (isTauriRuntime() && isFullscreen.value) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void exitFullscreen();
    }
  }

  onMounted(async () => {
    document.addEventListener("fullscreenchange", handleWebFullscreenChange);
    window.addEventListener("keydown", handleEscape, true);
    const appWindow = await resolveTauriWindow();
    if (appWindow && !disposed) {
      try {
        const unlisten = await appWindow.onResized(() => {
          void syncFullscreenState();
        });
        if (disposed) unlisten();
        else unlistenWindowResize = unlisten;
      } catch {
        // Resize sync is best-effort.
      }
    }
    await syncFullscreenState();
  });

  onUnmounted(() => {
    disposed = true;
    unlistenWindowResize?.();
    unlistenWindowResize = null;
    document.removeEventListener("fullscreenchange", handleWebFullscreenChange);
    window.removeEventListener("keydown", handleEscape, true);
    void exitFullscreenIfOwned();
  });

  return { isFullscreen, enterFullscreen, exitFullscreen, exitFullscreenIfOwned, toggleFullscreen, syncFullscreenState };
}
