# Google Sheets progress sync

## Files
- `Code.gs`: Google Apps Script API; validates signed Telegram Mini App `initData` and stores progress by Telegram ID.
- `engine/progress-sync.js`: optional client integration; localStorage remains a fallback and existing local progress is migrated on first cloud load.
- The client sends signed Telegram `initData` in a POST body to create a short-lived server-side session. Subsequent JSONP requests use a random session nonce instead of putting `initData` in the URL.

## Setup
1. Create a Google Sheet.
2. Open **Extensions → Apps Script** and paste `Code.gs` into the editor.
3. In Apps Script **Project Settings → Script Properties**, add `BOT_TOKEN` (secret bot token) and `SPREADSHEET_ID` (the ID from the spreadsheet URL between `/d/` and `/edit`).
4. **Deploy → New deployment → Web app**. Execute as **Me**; access **Anyone**. Deploy and copy the URL ending in `/exec`.
5. Put that URL into `API_URL` in `engine/progress-sync.js`. Never put the bot token or Telegram `initData` in GitHub Pages.
6. Ensure the Mini App is launched from Telegram and its URL is configured in BotFather.
7. After changing `Code.gs`, publish a new version of the deployment: **Deploy → Manage deployments → Edit → Version: New version → Deploy**. The `/exec` URL usually remains the same for an existing deployment.

## Test
- Open the Mini App inside Telegram; complete episode 1 and check that a `Progress` sheet is created with a row for your Telegram ID.
- Reopen on the same device and on another device using the same Telegram account.
- Episode 2 should not be recorded as completed unless episode 1 is completed.
- Open the web app outside Telegram: cloud sync should be unavailable, while local progress should still work.

## Security and limits
- The client sends `initData` in the POST body rather than in the URL. The server validates its Telegram signature and freshness, then caches a random session identifier for 10 minutes.
- This reduces exposure in URL logs; it is not a substitute for testing the deployment, reviewing Google permissions, and protecting the spreadsheet's sharing settings.
- The prototype currently allows episodes 1 and 2; update `ALLOWED_EPISODES` as new episodes are added.
- Google quotas apply. The client cannot prove that every slide was read; this is progress sync, not anti-cheat protection.
