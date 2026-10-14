(function () {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbzlFRNKm6RIg_sQ3O4gID8ICmNhtO6qInSKZTQOIeUidB8lmssI0fnxGtkLedffCgRl/exec';
  const KEY = 'analystSimulatorCompletedEpisodes';
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = tg && typeof tg.initData === 'string' ? tg.initData : '';
  let callbackCounter = 0;

  function normalize(ids) {
    return Array.from(new Set((Array.isArray(ids) ? ids : [])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)))
      .sort((a, b) => a - b);
  }

  function localProgress() {
    try {
      return normalize(JSON.parse(localStorage.getItem(KEY) || '[]'));
    } catch (_) {
      return [];
    }
  }

  function saveLocal(ids) {
    try {
      localStorage.setItem(KEY, JSON.stringify(normalize(ids)));
    } catch (_) {}
  }

  function createNonce() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
      throw new Error('Secure random generator is unavailable');
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function createSession() {
    if (!API_URL || !initData) return null;
    const nonce = createNonce();

    // Send signed Telegram initData in a POST body, not in the URL.
    // Apps Script's no-CORS response is opaque, so the subsequent JSONP
    // request confirms whether the short-lived session was actually created.
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ initData: initData, nonce: nonce }).toString()
    });

    return nonce;
  }

  async function request(action, extra) {
    if (!API_URL || !initData) return null;
    const nonce = await createSession();

    return new Promise((resolve, reject) => {
      const callback = '__analystProgressCallback' + Date.now() + (++callbackCounter);
      const script = document.createElement('script');
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        delete window[callback];
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Progress API timeout'));
      }, 12000);

      window[callback] = result => {
        cleanup();
        if (!result || !result.ok) reject(new Error(result && result.error || 'Progress API failed'));
        else resolve(result.progress || null);
      };

      const query = new URLSearchParams(Object.assign({
        action: action,
        nonce: nonce,
        callback: callback
      }, extra || {}));
      script.onerror = () => {
        cleanup();
        reject(new Error('Progress API could not be reached'));
      };
      script.src = API_URL + (API_URL.indexOf('?') < 0 ? '?' : '&') + query.toString();
      document.head.appendChild(script);
    });
  }

  async function load() {
    if (!API_URL || !initData) return null;
    const result = await request('load');
    if (!result) return null;

    let ids = normalize(result.completedEpisodes);
    for (const id of localProgress()) {
      if (!ids.includes(id)) {
        try {
          const merged = await request('complete', { episodeId: String(id) });
          if (merged) ids = normalize(merged.completedEpisodes);
        } catch (error) {
          console.warn('Could not migrate local progress', error);
        }
      }
    }

    saveLocal(ids);
    return { completedEpisodes: ids, lastEpisode: result.lastEpisode || 0 };
  }

  async function completeEpisode(id) {
    if (!API_URL || !initData) return null;
    const result = await request('complete', { episodeId: String(id) });
    if (result) saveLocal(result.completedEpisodes);
    return result;
  }

  window.AnalystProgressSync = {
    isConfigured: () => Boolean(API_URL && initData),
    load: load,
    completeEpisode: completeEpisode
  };
})();
