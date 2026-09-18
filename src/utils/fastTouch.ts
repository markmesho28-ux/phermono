/**
 * Native Touch & Event Architecture
 *
 * All aggressive global synthetic tap interceptors, capture listeners,
 * stopImmediatePropagation, and click-canceling logic have been completely removed.
 *
 * The application relies 100% on standard, native browser touch-to-click execution,
 * backed by CSS `touch-action: manipulation;` and `pointer-events: auto !important;`.
 *
 * This ensures:
 * 1. Every tap on buttons, header items, and sidebar links executes immediately
 *    on the very first touch via standard React `onClick` events.
 * 2. All `<input>`, `<textarea>`, and form fields receive native touch and focus,
 *    instantly opening the on-screen virtual keyboard without obstruction.
 * 3. Desktop mouse clicks and keyboard navigation remain 100% native and intact.
 */

export function initFastTouch() {
  // Completely neutral — no aggressive event interceptors or synthetic click dispatchers.
  return function destroy() {};
}

export default initFastTouch;
