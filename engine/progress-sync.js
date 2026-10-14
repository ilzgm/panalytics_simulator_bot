/* Optional cloud progress sync. Local progress remains available when API is not configured. */
(function () {
  'use strict';
  const API_URL = ''; // Set to the deployed Apps Script /exec URL.
  const STORAGE_KEY = 'analystSimulatorCompletedEpisodes';
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = tg && typeof tg.initData === 'string' ? tg.initData : '';

  async function request(action, extra) {
    if (!API_URL || !initData) return null;
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ action: action, initData: initData }, extra || {}))
    });
    if (!response.ok) throw new Error('Progress API returned HTTP ' + response.status);
    const result = await response.json();
    if (!result || !result.ok) throw new Error((result && result.error) || 'Progress API failed');
    return result.progress || null;
  }

  function normalize(ids) {
    return Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))).sort((a, b) => a - b);
  }

  function saveLocal(ids) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(ids))); } catch (_) {}
  }

  async function load() {
    if (!API_URL || !initData) return null;
    const progress = await request('load');
    if (progress) saveLocal(progress.completedEpisodes);
    return progress;
  }

  async function completeEpisode(id) {
    if (!API_URL || !initData) return null;
    return request('complete', { episodeId: Number(id) });
  }

  window.AnalystProgressSync = {
    isConfigured: function () { return Boolean(API_URL && initData); },
    load: load,
    completeEpisode: completeEpisode
  };
})();
