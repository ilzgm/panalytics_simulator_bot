const SHEET_NAME = 'Progress';
const INIT_DATA_MAX_AGE_SECONDS = 86400;
const SESSION_TTL_SECONDS = 600;
const ALLOWED_EPISODES = [1, 2];

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    const user = validateInitData_(String(p.initData || ''));
    const nonce = String(p.nonce || '');
    if (!user || !/^[a-f0-9]{32}$/.test(nonce)) {
      return HtmlService.createHtmlOutput('Unauthorized');
    }
    CacheService.getScriptCache().put('analyst_session_' + nonce, String(user.id), SESSION_TTL_SECONDS);
    return HtmlService.createHtmlOutput('OK');
  } catch (err) {
    console.error(err);
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
    const telegramId = /^[a-f0-9]{32}$/.test(nonce)
      ? CacheService.getScriptCache().get('analyst_session_' + nonce)
      : null;

    if (!telegramId) {
      out = { ok: false, error: 'session_expired' };
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
    console.error(err);
    out = { ok: false, error: 'server_error' };
  }

  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validateInitData_(raw) {
  if (!raw) return null;
  const token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN is not configured');

  const p = new URLSearchParams(raw);
  const hash = p.get('hash');
  const authDate = Number(p.get('auth_date'));
  if (!hash || !authDate) return null;

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;

  const pairs = [];
  p.forEach((value, key) => {
    if (key !== 'hash') pairs.push(key + '=' + value);
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secret = Utilities.computeHmacSha256Signature(token, 'WebAppData');
  const calculated = bytesToHex_(Utilities.computeHmacSha256Signature(dataCheckString, secret));
  if (!constantTimeEquals_(calculated, hash.toLowerCase())) return null;

  let user;
  try {
    user = JSON.parse(p.get('user') || 'null');
  } catch (_) {
    return null;
  }
  return user && user.id ? user : null;
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
