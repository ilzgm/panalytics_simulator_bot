/* Small, priority-aware image preloader for scenes and catalog previews. */
(() => {
  'use strict';
  const pending = new Map();

  function resolveAsset(path) {
    // Scene paths are written relative to episode pages; normalize them on the catalog page.
    if (!document.body.dataset.episode && path.startsWith('../images/')) {
      path = path.slice(3);
    }
    return new URL(path, document.baseURI).href;
  }

  function preload(paths, priority = 'low') {
    (paths || []).filter(Boolean).forEach(path => {
      let url;
      try { url = resolveAsset(path); } catch (_) { return; }
      if (pending.has(url)) return;

      const image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      try { image.fetchPriority = priority === 'high' ? 'high' : 'low'; } catch (_) {}
      pending.set(url, image);
      image.onload = () => pending.delete(url);
      image.onerror = () => pending.delete(url);
      image.src = url;
    });
  }

  window.AnalystImagePreloader = { preload };
})();
