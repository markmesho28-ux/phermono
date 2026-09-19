export function initFastTouch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return function destroy() {};
  }

  const owner = document as Document & { __phermonoFastTouch?: boolean };
  if (owner.__phermonoFastTouch) {
    return function destroy() {};
  }

  owner.__phermonoFastTouch = true;

  return function destroy() {
    owner.__phermonoFastTouch = false;
  };
}

export default initFastTouch;
