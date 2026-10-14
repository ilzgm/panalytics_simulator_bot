const SHEET_NAME = 'Progress';
const INIT_DATA_MAX_AGE_SECONDS = 86400;
const SESSION_TTL_SECONDS = 600;
const ALLOWED_EPISODES = [1, 2];

function doPost(e) {
  const p = (e && e.parameter) || {};
  const nonce = String(p.nonce || '');
  const cache = CacheService.getScriptCache();

  if (!/^[a-f0-9]{32}$/.test(nonce)) {
    return HtmlService.createHtmlOutput('Invalid request');
  }

  try {
    let user;
    try {
      user = validateInitData_(String(p.initData || ''));
    } catch (validationError) {
      cache.put('analyst_diag_' + nonce, 'validation_error', SESSION_TTL_SECONDS);
      console.error('Telegram initData validation failed; details omitted.');
      return HtmlService.createHtmlOutput('Unauthorized');
    }

    if (!user) {
      cache.put('analyst_diag_' + nonce, 'init_data_rejected', SESSION_TTL_SECONDS);
      return HtmlService.createHtmlOutput('Unauthorized');
    }

    cache.put('analyst_session_' + nonce, String(user.id), SESSION_TTL_SECONDS);
    cache.put('analyst_diag_' + nonce, 'session_created', SESSION_TTL_SECONDS);
    return HtmlService.createHtmlOutput('OK');
  } catch (err) {
    cache.put('analyst_diag_' + nonce, 'server_error', SESSION_TTL_SECONDS);
    console.error('Session creation failed; details omitted.');
    return HtmlService.createHtmlOutput('Request failed');
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const cb = String(p.callback || '');
  if (!/^__analystProgressCallback\d+$/.test(cb)) {
    return ContentService.createTextOutput('/* invalid callback */').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  let out;
  try {
    const nonce = String(p.nonce || '');
    const cache = CacheService.getScriptCache();
    const validNonce = /^[a-f0-9]{32}$/.test(nonce);
    const telegramId = validNonce ? cache.get('analyst_session_' + nonce) : null;

    if (!telegramId) {
      const diagnostic = validNonce ? cache.get('analyst_diag_' + nonce) : null;
      const diagnosticErrors = {
        init_data_rejected: 'telegram_init_data_rejected',
        validation_error: 'telegram_validation_configuration_error',
        server_error: 'session_creation_server_error'
      };
      out = { ok: false, error: diagnosticErrors[diagnostic] || (diagnostic === 'session_created' ? 'session_cache_miss' : 'session_not_created') };
    } else if (p.action === 'diagnose') {
      out = { ok: true, diagnostic: 'session_created' };
    } else if (p.action === 'load') {
      out = { ok: true, progress: readProgress_(telegramId) };
    } else if (p.action === 'complete') {
      const id = Number(p.episodeId);
      if (!ALLOWED_EPISODES.includes(id)) {
        out = { ok: false, error: 'invalid_episode' };
      } else {
        const pr = readProgress_(telegramId);
        if (id > 1 && !pr.completedEpisodes.includes(id - 1)) {
          out = { ok: false, error: 'previous_episode_required', progress: pr };
        } else {
          if (!pr.completedEpisodes.includes(id)) pr.completedEpisodes.push(id);
          pr.completedEpisodes.sort((a, b) => a - b);
          pr.lastEpisode = id;
          writeProgress_(telegramId, pr);
          out = { ok: true, progress: pr };
        }
      }
    } else {
      out = { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    console.error('Progress request failed; details omitted.');
    out = { ok: false, error: 'server_error' };
  }

  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validateInitData_(raw) {
  if (!raw) return null;
  const token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN is not configured');

  const p = parseInitData_(raw);
  const hash = p.hash;
  const authDate = Number(p.auth_date);
  if (!hash || !authDate) return null;

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;

  const pairs = Object.keys(p)
    .filter(key => key !== 'hash')
    .map(key => key + '=' + p[key]);
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secret = Utilities.computeHmacSha256Signature(token, 'WebAppData');
  const calculated = bytesToHex_(Utilities.computeHmacSha256Signature(dataCheckString, secret));
  if (!constantTimeEquals_(calculated, hash.toLowerCase())) return null;

  let user;
  try {
    user = JSON.parse(p.user || 'null');
  } catch (_) {
    return null;
  }
  return user && user.id ? user : null;
}

function parseInitData_(raw) {
  const result = {};
  raw.split('&').forEach(part => {
    if (!part) return;
    const index = part.indexOf('=');
    const rawKey = index >= 0 ? part.slice(0, index) : part;
    const rawValue = index >= 0 ? part.slice(index + 1) : '';
    const key = decodeURIComponent(rawKey.replace(/\\+/g, ' '));
    const value = decodeURIComponent(rawValue.replace(/\\+/g, ' '));
    result[key] = value;
  });
  return result;
}

function readProgress_(telegramId) {
  const sh = getSheet_();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === telegramId) {
      let ids = [];
      try {
        ids = JSON.parse(String(rows[i][1] || '[]'));
      } catch (_) {}
      ids = ids.map(Number).filter(id => ALLOWED_EPISODES.includes(id)).sort((a, b) => a - b);
      return { completedEpisodes: ids, lastEpisode: Number(rows[i][2] || 0) };
    }
  }
  return { completedEpisodes: [], lastEpisode: 0 };
}

function writeProgress_(telegramId, pr) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_();
    const rows = sh.getDataRange().getValues();
    const row = [telegramId, JSON.stringify(pr.completedEpisodes), pr.lastEpisode, new Date()];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === telegramId) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return;
      }
    }
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID is not configured');
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['telegram_id', 'completed_episodes', 'last_episode', 'updated_at']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function bytesToHex_(bytes) {
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
