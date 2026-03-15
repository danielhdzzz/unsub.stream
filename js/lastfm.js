import { getSettings, saveSettings } from "./settings.js";

const WORKER_URL = "https://youtube-search-proxy.unsub.workers.dev";

export function isLinked() {
  return !!getSettings().lastfmSessionKey;
}

export async function initLastFm() {
  const url = new URL(location.href);
  const token = url.searchParams.get("token");
  if (!token) return;

  url.searchParams.delete("token");
  history.replaceState(null, "", url.pathname + url.search + url.hash);

  try {
    const res = await fetch(WORKER_URL + "/lastfm/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data.key) {
      const s = getSettings();
      s.lastfmSessionKey = data.key;
      s.lastfmUsername = data.name;
      saveSettings(s);
    }
  } catch {
    // Auth failed silently — user can retry
  }
}

export async function getAuthUrl(callbackUrl) {
  const res = await fetch(
    WORKER_URL + "/lastfm/auth?cb=" + encodeURIComponent(callbackUrl),
  );
  const data = await res.json();
  return data.url;
}

export function unlinkLastFm() {
  const s = getSettings();
  s.lastfmSessionKey = "";
  s.lastfmUsername = "";
  saveSettings(s);
}

export function sendNowPlaying(track) {
  if (!isLinked()) return;
  const s = getSettings();
  fetch(WORKER_URL + "/lastfm/nowplaying", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sk: s.lastfmSessionKey,
      track: track.name,
      artist: track.artist,
      album: track.album || "",
    }),
  }).catch(() => {});
}

export function sendScrobble(track, timestamp) {
  if (!isLinked()) return;
  const s = getSettings();
  fetch(WORKER_URL + "/lastfm/scrobble", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sk: s.lastfmSessionKey,
      track: track.name,
      artist: track.artist,
      album: track.album || "",
      timestamp,
    }),
  }).catch(() => {});
}
