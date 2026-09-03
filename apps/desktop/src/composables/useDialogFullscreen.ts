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
 * composable tracks whether it was the one that entered fullscreen ("owned")
 * so it only restores the previous window state on exit/close, never fighting
 * a fullscreen the user entered through the app toolbar.
 */
export function useDialogFullscreen() {
  const isFullscreen = ref(false);
  let ownedFullscreen = false;
  let fullscreenTransitionTarget: boolean | null = null;
  let unlistenWindowResize: (() => void) | null = null;

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
    const appWindow = await resolveTauriWindow();
    if (appWindow) {
      try {
        const actualFullscreen = await appWindow.isFullscreen();
        isFullscreen.value = fullscreenTransitionTarget ?? actualFullscreen;
      } catch {
        isFullscreen.value = fullscreenTransitionTarget ?? false;
      }
    } else {
      isFullscreen.value = !!document.fullscreenElement;
    }
    if (!isFullscreen.value && fullscreenTransitionTarget === null) {
      ownedFullscreen = false;
    }
  }

  /** Wait for the native window to report the expected fullscreen state. */
  async function waitForTauriFullscreenState(appWindow: TauriWindowLike, expected: boolean) {
    for (let attempt = 0; attempt < FULLSCREEN_SYNC_ATTEMPTS; attempt += 1) {
      if ((await appWindow.isFullscreen()) === expected) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, FULLSCREEN_SYNC_INTERVAL_MS));
    }
  }

  async function enterFullscreen() {
    const appWindow = await resolveTauriWindow();
    if (appWindow) {
      fullscreenTransitionTarget = true;
      try {
        await appWindow.setFullscreen(true);
        isFullscreen.value = true;
        await waitForTauriFullscreenState(appWindow, true);
      } finally {
        fullscreenTransitionTarget = null;
        await syncFullscreenState();
      }
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    ownedFullscreen = true;
    await syncFullscreenState();
  }

  async function exitFullscreen() {
    const owned = ownedFullscreen;
    const appWindow = await resolveTauriWindow();
    if (appWindow) {
      fullscreenTransitionTarget = false;
      try {
        const currently = await appWindow.isFullscreen();
        if (currently) await appWindow.setFullscreen(false);
        isFullscreen.value = false;
        await waitForTauriFullscreenState(appWindow, false);
      } finally {
        fullscreenTransitionTarget = null;
        await syncFullscreenState();
      }
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    if (owned) ownedFullscreen = false;
    await syncFullscreenState();
  }

  /** Exit fullscreen when a dialog closes — but only if we entered it. */
  async function exitFullscreenIfOwned() {
    if (isFullscreen.value && ownedFullscreen) await exitFullscreen();
  }

  async function toggleFullscreen() {
    if (isFullscreen.value) await exitFullscreen();
    else await enterFullscreen();
  }

  function handleWebFullscreenChange() {
    void syncFullscreenState();
  }

  onMounted(async () => {
    const appWindow = await resolveTauriWindow();
    if (appWindow) {
      try {
        unlistenWindowResize = await appWindow.onResized(() => {
          void syncFullscreenState();
        });
      } catch {
        // ignore — resize sync is best-effort
      }
    } else {
      document.addEventListener("fullscreenchange", handleWebFullscreenChange);
    }
    await syncFullscreenState();
  });

  onUnmounted(() => {
    unlistenWindowResize?.();
    unlistenWindowResize = null;
    document.removeEventListener("fullscreenchange", handleWebFullscreenChange);
    if (ownedFullscreen) void exitFullscreen();
  });

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    exitFullscreenIfOwned,
    toggleFullscreen,
    syncFullscreenState,
  };
}
