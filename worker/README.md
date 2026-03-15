# YouTube Search Proxy — Setup & Deploy

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- A [YouTube Data API v3 key](https://console.cloud.google.com/apis/credentials)
- Node.js installed

## 1. Get a YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services > Library**, search for **YouTube Data API v3**, and enable it
4. Go to **APIs & Services > Credentials**, click **Create Credentials > API Key**
5. Copy the key — you'll need it in step 4
6. (Optional but recommended) Click **Edit API key** and restrict it to **YouTube Data API v3** only

## 2. Install Wrangler

```sh
npm install -g wrangler
```

Then log in:

```sh
wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

## 3. Deploy the Worker

From the repo root:

```sh
cd worker
wrangler deploy
```

Wrangler will print the worker URL, something like:

```
https://youtube-search-proxy.<your-subdomain>.workers.dev
```

## 4. Set Secrets

### YouTube (required)

```sh
wrangler secret put YOUTUBE_API_KEY
```

Paste your YouTube API key when prompted. This stores it securely — it never appears in your code or config.

### Last.fm (optional — enables scrobbling)

```sh
wrangler secret put LASTFM_API_KEY
wrangler secret put LASTFM_SECRET
```

Both values come from your [Last.fm API account page](https://www.last.fm/api/accounts). `LASTFM_API_KEY` is the API Key and `LASTFM_SECRET` is the Shared Secret shown next to it.

If you don't have a Last.fm API account yet, create one at [last.fm/api/account/create](https://www.last.fm/api/account/create). The callback URL you enter there doesn't matter — the app passes it dynamically.

## 5. Update the Frontend

Open `js/player.js` and update the `WORKER_URL` on line 1 to match your actual worker URL:

```js
const WORKER_URL = "https://youtube-search-proxy.<your-subdomain>.workers.dev";
```

The same URL is used in `js/lastfm.js` — update it there too.

## 6. Update CORS Origins (if needed)

If your GitHub Pages URL or local dev port differs from the defaults, edit the `ALLOWED_ORIGINS` array at the top of `worker/src/index.js`:

```js
const ALLOWED_ORIGINS = [
  "https://danielhdzzz.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
];
```

Then redeploy: `wrangler deploy`

## 7. Test

Verify the worker is responding:

```sh
curl "https://youtube-search-proxy.unsub.workers.dev/search?q=radiohead+creep"
```

You should get back JSON with a `results` array containing `videoId`, `title`, `channel`, `thumbnail`, and `duration` fields.

Then open the app locally, load your library data, hover over any track row, and click the ▶ button.

## Worker Routes

| Route | Method | Description |
|---|---|---|
| `/search?q=...` | GET | YouTube video search (returns title, channel, thumbnail, duration) |
| `/lastfm/auth?cb=...` | GET | Returns Last.fm auth URL for the given callback |
| `/lastfm/session` | POST | Exchanges a Last.fm auth token for a session key |
| `/lastfm/nowplaying` | POST | Sends "now playing" update to Last.fm |
| `/lastfm/scrobble` | POST | Scrobbles a track to Last.fm |

## Costs & Quotas

- **Cloudflare Workers free tier**: 100,000 requests/day — more than enough
- **YouTube Data API v3 free quota**: 10,000 units/day. Each search call costs 100 units, each video details call costs 1 unit per video. That's ~100 searches/day on the free tier. If you hit the limit, results will return an error until the quota resets at midnight Pacific time
- **Last.fm API**: No rate limit for scrobbling under normal usage
