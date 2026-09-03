export interface StartupErrorTheme {
  background: string;
  foreground: string;
  card: string;
  border: string;
  mutedForeground: string;
  codeBackground: string;
  shadow: string;
}

/**
 * Hard-coded startup error colors are intentional: this surface also renders
 * when the application stylesheet failed to load, so CSS custom properties
 * cannot be its only source of theme colors.
 */
export function startupErrorTheme(dark: boolean): StartupErrorTheme {
  if (dark) {
    return {
      background: "#131416",
      foreground: "#d7d7db",
      card: "#1b1b1e",
      border: "rgba(110,110,114,0.28)",
      mutedForeground: "#97989d",
      codeBackground: "#202024",
      shadow: "0 10px 30px rgba(0,0,0,0.35)",
    };
  }
  return {
    background: "#ffffff",
    foreground: "#111827",
    card: "#ffffff",
    border: "#e5e7eb",
    mutedForeground: "#4b5563",
    codeBackground: "#f9fafb",
    shadow: "0 10px 30px rgba(0,0,0,0.08)",
  };
}
