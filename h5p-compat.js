(() => {
  'use strict';

  const H5P = window.H5P;
  if (!H5P || typeof H5P.newRunnable !== 'function' || typeof H5P.ContentType !== 'function') {
    return;
  }
  if (H5P.__movidaContentTypeCompatV1) return;
  H5P.__movidaContentTypeCompatV1 = true;

  const originalNewRunnable = H5P.newRunnable;

  function resolveConstructor(libraryString) {
    const machineName = String(libraryString || '').trim().split(/\s+/)[0];
    if (!machineName) return null;
    let value = window;
    for (const part of machineName.split('.')) {
      value = value?.[part];
      if (value == null) return null;
    }
    return typeof value === 'function' ? value : null;
  }

  function mixContentTypeIntoConstructor(constructor, standalone) {
    if (!constructor?.prototype) return;
    const basePrototype = H5P.ContentType(Boolean(standalone)).prototype;
    if (!basePrototype) return;

    for (const key of Reflect.ownKeys(basePrototype)) {
      if (key === 'constructor' || key in constructor.prototype) continue;
      const descriptor = Object.getOwnPropertyDescriptor(basePrototype, key);
      if (!descriptor) continue;
      try {
        Object.defineProperty(constructor.prototype, key, descriptor);
      }
      catch (error) {
        console.warn('[H5P compat] No se pudo incorporar ' + String(key), error);
      }
    }
  }

  H5P.newRunnable = function (library, contentId, attachTo, skipResize, extras) {
    try {
      const constructor = resolveConstructor(library?.library);
      if (constructor) {
        mixContentTypeIntoConstructor(constructor, Boolean(extras?.standalone));
      }
    }
    catch (error) {
      console.warn('[H5P compat] No se pudo preparar la compatibilidad de ContentType', error);
    }

    return originalNewRunnable.apply(this, arguments);
  };
})();
