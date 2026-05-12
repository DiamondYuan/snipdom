export const T = {
  accent: "#ff6b56",
  accentSoft: "rgba(255, 107, 86, 0.07)",
  accentBorder: "rgba(255, 107, 86, 0.45)",
  success: "#a3e635",
  successBg: "rgba(163, 230, 53, 0.1)",
  successGlow: "rgba(163, 230, 53, 0.35)",
  surface: "#1c1917",
  surfaceLight: "rgba(255, 252, 249, 0.92)",
  textDark: "#292524",
  radius: "12px",
  radiusSm: "8px",
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", "Fira Code", Menlo, Consolas, monospace',
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  shadow: "0 12px 40px rgba(28,25,23,0.2), 0 4px 12px rgba(28,25,23,0.1)",
  shadowSm: "0 2px 12px rgba(28,25,23,0.08), 0 1px 4px rgba(28,25,23,0.04)",
} as const;

export const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

export const ease = reducedMotion ? "linear" : T.ease;

export const dur = (ms: number): string =>
  reducedMotion ? "0ms" : ms + "ms";

export const KEYFRAMES = `
    @keyframes __snipdom-dot-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,86,0.4); }
      50% { box-shadow: 0 0 0 5px rgba(255,107,86,0); }
    }
    @keyframes __snipdom-capture-ring {
      0% { box-shadow: 0 0 0 0 ${T.successGlow}; }
      100% { box-shadow: 0 0 0 8px rgba(163,230,53,0); }
    }
  `;
