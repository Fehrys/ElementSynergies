import type { SafeInsets } from './battleLayout';

// The ONLY DOM reader in the layout stack. The pure layout model
// (battleLayout.ts) never touches window/document/getComputedStyle; all
// measurement lives here so the model stays testable in plain Node.

// Reads env(safe-area-inset-*) via a hidden probe element. Values are CSS px.
// The var(--test-safe-inset-*, env(...)) form lets E2E inject synthetic insets by
// setting those CSS variables; in production the variables are unset, so env() wins.
export function readSafeInsetsCss(): SafeInsets {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:var(--test-safe-inset-top, env(safe-area-inset-top));' +
    'padding-right:var(--test-safe-inset-right, env(safe-area-inset-right));' +
    'padding-bottom:var(--test-safe-inset-bottom, env(safe-area-inset-bottom));' +
    'padding-left:var(--test-safe-inset-left, env(safe-area-inset-left));';
  document.body.appendChild(el);
  const s = getComputedStyle(el);
  const insets: SafeInsets = {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
  el.remove();
  return insets;
}

export function getCanvasRect(game: Phaser.Game): { width: number; height: number } {
  const c = game.canvas;
  const r = c.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

// Viewport-change signals that Phaser's Scale 'resize' can miss (URL-bar show/hide,
// rotation). Each just requests a reflow — it NEVER passes width/height; the reflow
// reads this.scale.gameSize as the source of truth. Returns an unsubscribe fn.
export function subscribeViewportChanges(onChange: () => void): () => void {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  window.addEventListener('resize', onChange); // fallback where visualViewport is absent
  return () => {
    vv?.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    window.removeEventListener('resize', onChange);
  };
}
