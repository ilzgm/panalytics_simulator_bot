(function () {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbzlFRNKm6RIg_sQ3O4gID8ICmNhtO6qInSKZTQOIeUidB8lmssI0fnxGtkLedffCgRl/exec';
  const tg = window.Telegram && window.Telegram.WebApp;
  let callbackCounter = 0;
  const $ = id => document.getElementById(id);
  const setStatus = (id, text, kind) => {
    const el = $(id);
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  };
  function nonce() {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Браузер не поддерживает защищённую генерацию случайных чисел.');
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  async function createSession() {
    const initData = tg && typeof tg.initData === 'string' ? tg.initData : '';
    if (!initData) throw new Error('Нет Telegram initData. Открой страницу именно как Mini App из кнопки бота, а не как обычную ссылку.');
    const sessionNonce = nonce();
    setStatus('actionStatus', 'Шаг 1/2: отправляем initData серверу. Содержимое initData не показывается.', 'warn');
    try {
      await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ initData, nonce: sessionNonce }).toString()
      });
    } catch (_) {
      throw new Error('Браузер не смог отправить POST-запрос. Проверь соединение и попробуй снова.');
    }
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
        reject(new Error('Тайм-аут JSONP-ответа. doGet не вернул ответ за 12 секунд.'));
      }, 12000);
      window[callback] = result => {
        cleanup();
        if (!result || !result.ok) {
          const error = result && result.error || 'unknown_error';
          const messages = {
            session_expired: 'Сервер не нашёл сессию. Проверь диагностику POST ниже.',
            session_not_created: 'POST дошёл, но сервер не создал сессию. initData мог быть отклонён.',
            telegram_init_data_rejected: 'Сервер получил POST, но отклонил Telegram initData (подпись, время или формат).',
            telegram_validation_configuration_error: 'Ошибка проверки initData или конфигурации Apps Script. Проверь Executions без публикации секретов.',
            session_creation_server_error: 'POST дошёл, но при создании сессии произошла внутренняя ошибка.',
            session_cache_miss: 'Сервер отметил сессию созданной, но не нашёл её в кэше при следующем запросе.',
            previous_episode_required: 'Ожидаемая защита сработала: сначала нужно завершить эпизод 1.',
            invalid_episode: 'Сервер отклонил неизвестный номер эпизода.',
            server_error: 'Ошибка на стороне Apps Script или Google Sheets.',
            unknown_action: 'Сервер не распознал действие.'
          };
          const err = new Error(messages[error] || ('API вернул ошибку: ' + error));
          err.payload = result;
          err.code = error;
          reject(err);
        } else resolve(result);
      };
      const query = new URLSearchParams(Object.assign({ action, nonce: sessionNonce, callback }, extra || {}));
      script.onerror = () => {
        cleanup();
        reject(new Error('Не удалось загрузить ответ API. Проверь URL и публикацию Apps Script.'));
      };
      script.src = API_URL + '?' + query.toString();
      document.head.appendChild(script);
    });
  }
  async function request(action, extra) {
    const sessionNonce = await createSession();
    setStatus('actionStatus', 'Шаг 2/2: проверяем, создалась ли сессия на сервере…', 'warn');
    await jsonp(sessionNonce, 'diagnose');
    return jsonp(sessionNonce, action, extra).then(result => result.progress || null);
  }
  function renderProgress(progress) {
    if (!progress) {
      $('progressDetails').textContent = 'Завершённые эпизоды: —\nПоследний эпизод: —';
      return;
    }
    $('progressDetails').innerHTML = '';
    const done = document.createElement('div');
    done.textContent = 'Завершённые эпизоды: ' + (progress.completedEpisodes && progress.completedEpisodes.length ? progress.completedEpisodes.join(', ') : 'нет');
    const last = document.createElement('div');
    last.textContent = 'Последний эпизод: ' + (progress.lastEpisode || 0);
    $('progressDetails').append(done, last);
  }
  async function runLoad() {
    setStatus('progressStatus', 'Отправляем запрос и читаем облачный прогресс…', 'warn');
    $('loadBtn').disabled = $('refreshBtn').disabled = true;
    try {
      const progress = await request('load');
      renderProgress(progress);
      setStatus('progressStatus', 'Успешно: сервер подтвердил сессию Telegram и вернул прогресс из Google Sheets.', 'ok');
      setStatus('actionStatus', 'Чтение данных прошло успешно.', 'ok');
    } catch (error) {
      setStatus('progressStatus', error.message, 'err');
      setStatus('actionStatus', 'Диагностический код: ' + (error.code || 'request_failed') + '. ' + error.message, 'err');
      if (error.payload && error.payload.progress) renderProgress(error.payload.progress);
    } finally {
      $('loadBtn').disabled = $('refreshBtn').disabled = false;
    }
  }
  async function runComplete(id) {
    setStatus('actionStatus', 'Отправляем команду завершения эпизода ' + id + '…', 'warn');
    $('episode1Btn').disabled = $('episode2Btn').disabled = $('episode2CompleteBtn').disabled = true;
    try {
      const progress = await request('complete', { episodeId: String(id) });
      renderProgress(progress);
      setStatus('actionStatus', 'Сервер подтвердил запись. Эпизод ' + id + ' завершён в облачном прогрессе.', 'ok');
      setStatus('progressStatus', 'Последний запрос успешно прочитал/обновил облачный прогресс.', 'ok');
    } catch (error) {
      setStatus('actionStatus', 'Диагностический код: ' + (error.code || 'request_failed') + '. ' + error.message, error.code === 'previous_episode_required' ? 'ok' : 'err');
      if (error.payload && error.payload.progress) renderProgress(error.payload.progress);
    } finally {
      $('episode1Btn').disabled = $('episode2Btn').disabled = $('episode2CompleteBtn').disabled = false;
    }
  }
  function init() {
    if (tg && typeof tg.initData === 'string' && tg.initData.length) {
      tg.ready();
      setStatus('telegramStatus', 'Telegram initData получен. Значение скрыто; серверная проверка начнётся по кнопке.', 'ok');
    } else {
      setStatus('telegramStatus', 'Telegram initData не обнаружен. Открой страницу из кнопки Mini App бота.', 'err');
    }
    $('loadBtn').addEventListener('click', runLoad);
    $('refreshBtn').addEventListener('click', runLoad);
    $('episode1Btn').addEventListener('click', () => runComplete(1));
    $('episode2Btn').addEventListener('click', () => runComplete(2));
    $('episode2CompleteBtn').addEventListener('click', () => runComplete(2));
    $('clearLogBtn').addEventListener('click', () => {
      setStatus('actionStatus', 'Сообщения на экране очищены. Данные в Google Sheets не изменены.', '');
    });
  }
  init();
})();
