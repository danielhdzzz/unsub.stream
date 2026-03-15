// ── Settings (localStorage persistence) ──

const STORAGE_KEY = "settings";
const DEFAULTS = { hideLocalTracks: false, theme: "system", showAlbumArt: true, linkToSpotify: false, lastfmSessionKey: "", lastfmUsername: "" };

let current = null;

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    current = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

export function saveSettings(settings) {
  current = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function getSettings() {
  if (!current) loadSettings();
  return current;
}
