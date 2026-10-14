/* Cloud progress bridge for the main game. Uses the same Apps Script API as test-sync. */
(function () {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbzlFRNKm6RIg_sQ3O4gID8ICmNhtO6qInSKZTQOIeUidB8lmssI0fnxGtkLedffCgRl/exec';
  const tg = window.Telegram && window.Telegram.WebApp;
  let callbackCounter = 0;
  let active = false;
  let currentProgress = null;
  let readyPromise = null;
  const completedKey = 'analystSimulatorCompletedEpisodes';

  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(completedKey) || '[]');
      return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
    } catch (_) { return []; }
  }
  function writeLocal(ids) {
    const unique = Array.from(new Set((ids || []).map(Number).filter(Number.isFinite))).sort((a, b) => a - b);
    try { localStorage.setItem(completedKey, JSON.stringify(unique)); } catch (_) {}
    return unique;
  }
  function makeNonce() {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Браузер не поддерживает защищённую генерацию случайных чисел.');
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  async function createSession() {
    const initData = tg && typeof tg.initData === 'string' ? tg.initData : '';
    if (!initData) throw new Error('Telegram initData не найден. Открой игру через кнопку Mini App в боте.');
    const sessionNonce = makeNonce();
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ initData, nonce: sessionNonce }).toString()
    });
    return sessionNonce;
  }
  function jsonp(sessionNonce, action, extra) {
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
        reject(new Error('Сервер облачного прогресса не ответил за 12 секунд.'));
      }, 12000);
      window[callback] = result => {
        cleanup();
        if (!result || !result.ok) {
          const error = result && result.error || 'unknown_error';
          reject(new Error('Облачный прогресс: ' + error));
        } else resolve(result);
      };
      const query = new URLSearchParams(Object.assign({ action, nonce: sessionNonce, callback }, extra || {}));
      script.onerror = () => { cleanup(); reject(new Error('Не удалось получить ответ от облачного сервера.')); };
      script.src = API_URL + '?' + query.toString();
      document.head.appendChild(script);
    });
  }
  async function request(action, extra) {
    const nonce = await createSession();
    await jsonp(nonce, 'diagnose');
    return jsonp(nonce, action, extra);
  }
  function applyCloudProgress(progress) {
    if (!progress || !Array.isArray(progress.completedEpisodes)) return;
    currentProgress = progress;
    // When signed-in cloud data is available, it is authoritative. Do not merge
    // another Telegram user's browser-local progress into this account.
    writeLocal(progress.completedEpisodes);
    window.dispatchEvent(new CustomEvent('analyst-cloud-progress', { detail: progress }));
  }
  async function load() {
    if (!tg || typeof tg.initData !== 'string' || !tg.initData) return { ok: false, reason: 'not_telegram' };
    try {
      if (typeof tg.ready === 'function') tg.ready();
      const result = await request('load');
      applyCloudProgress(result.progress);
      setStatus('Облачный прогресс синхронизирован.');
      return { ok: true, progress: result.progress };
    } catch (error) {
      setStatus('Облако временно недоступно; используется локальный прогресс.');
      console.warn('[AnalystCloud] load failed:', error.message);
      return { ok: false, error };
    }
  }
  function setStatus(message) {
    const node = document.getElementById('cloudSyncStatus');
    if (node) node.textContent = message;
  }
  async function completeEpisode(id) {
    if (!tg || typeof tg.initData !== 'string' || !tg.initData) {
      const ids = readLocal();
      if (!ids.includes(Number(id))) ids.push(Number(id));
      writeLocal(ids);
      return { ok: false, reason: 'not_telegram' };
    }
    try {
      const result = await request('complete', { episodeId: String(id) });
      applyCloudProgress(result.progress);
      setStatus('Прогресс сохранён в облаке.');
      return { ok: true, progress: result.progress };
    } catch (error) {
      setStatus('Не удалось сохранить в облако. Локальный прогресс сохранён.');
      console.warn('[AnalystCloud] complete failed:', error.message);
      const ids = readLocal();
      if (!ids.includes(Number(id))) ids.push(Number(id));
      writeLocal(ids);
      return { ok: false, error };
    }
  }
  readyPromise = load();
  window.AnalystCloud = {
    ready: () => readyPromise,
    load,
    completeEpisode,
    getProgress: () => currentProgress,
    isEpisodeSaved: id => !!currentProgress && Array.isArray(currentProgress.completedEpisodes) && currentProgress.completedEpisodes.includes(Number(id)),
    getLocalCompleted: readLocal,
    setStatus
  };
})();