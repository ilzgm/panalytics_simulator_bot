/**
 * Analyst Simulator — Google Apps Script progress API.
 * Configure Script Properties:
 *   BOT_TOKEN = Telegram bot token (secret; never put it in the frontend)
 *   SPREADSHEET_ID = ID of the Google spreadsheet
 *
 * Deploy as a Web App: execute as yourself, access for anyone.
 * Every request must include raw Telegram WebApp.initData.
 */
const SHEET_NAME = 'Progress';
const INIT_DATA_MAX_AGE_SECONDS = 86400;
const ALLOWED_EPISODES = [1, 2];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = validateInitData_(String(body.initData || ''));
    if (!user) return json_({ ok: false, error: 'unauthorized' });

    const action = String(body.action || '');
    if (action === 'load') {
      return json_({ ok: true, progress: readProgress_(String(user.id)) });
    }
    if (action === 'complete') {
      const episodeId = Number(body.episodeId);
      if (!ALLOWED_EPISODES.includes(episodeId)) {
        return json_({ ok: false, error: 'invalid_episode' });
      }
      const progress = readProgress_(String(user.id));
      if (episodeId > 1 && !progress.completedEpisodes.includes(episodeId - 1)) {
        return json_({ ok: false, error: 'previous_episode_required', progress: progress });
      }
      if (!progress.completedEpisodes.includes(episodeId)) {
        progress.completedEpisodes.push(episodeId);
        progress.completedEpisodes.sort((a, b) => a - b);
      }
      progress.lastEpisode = episodeId;
      writeProgress_(String(user.id), progress);
      return json_({ ok: true, progress: progress });
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function validateInitData_(raw) {
  if (!raw) return null;
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN is not configured');

  const params = new URLSearchParams(raw);
  const suppliedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!suppliedHash || !authDate) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;

  const pairs = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push(key + '=' + value);
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = Utilities.computeHmacSha256Signature(token, 'WebAppData');
  const calculatedHash = bytesToHex_(Utilities.computeHmacSha256Signature(dataCheckString, secretKey));
  if (!constantTimeEquals_(calculatedHash, suppliedHash.toLowerCase())) return null;

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) { return null; }
  return user && user.id ? user : null;
}

function readProgress_(telegramId) {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === telegramId) {
      let completed = [];
      try { completed = JSON.parse(String(rows[i][1] || '[]')); } catch (_) {}
      completed = completed.map(Number).filter(id => ALLOWED_EPISODES.includes(id)).sort((a, b) => a - b);
      return { completedEpisodes: completed, lastEpisode: Number(rows[i][2] || 0) };
    }
  }
  return { completedEpisodes: [], lastEpisode: 0 };
}

function writeProgress_(telegramId, progress) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues();
    const row = [telegramId, JSON.stringify(progress.completedEpisodes), progress.lastEpisode, new Date()];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === telegramId) {
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return;
      }
    }
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID is not configured');
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(['telegram_id', 'completed_episodes', 'last_episode', 'updated_at']);
    sheet.setFrozenRows(1);
  }
  return sheet;
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

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
