import { initData, tryLocalData, buildIndexes, loadSampleData } from "./data.js";
import { initRender, renderSidebar, renderTrackList, renderCatalogList, renderVisibleRows, renderVisibleCatalogRows, renderVisibleGridRows, updateSortHeaders } from "./render.js";
import { computeStats, renderStatsPage } from "./stats.js";
import { renderWrappedPage } from "./wrapped.js";
import { loadSettings, saveSettings, getSettings } from "./settings.js";
import { clearCachedData } from "./cache.js";
import { closePlayer, togglePlayPause, isResultsPanelOpen, closeResultsPanel } from "./player.js";
import { initLastFm, isLinked, getAuthUrl, unlinkLastFm } from "./lastfm.js";

// ── Constants ──
export const ROW_H = 32;
export let TRACK_ROW_H = 32;
export const RENDER_BUFFER = 10;
export const GRID_ROW_H = 220;
export const GRID_CARD_W = 160;
export const GRID_GAP = 16;

// ── Shared state ──
export const state = {
  library: null,
  playlists: [],
  activeId: null,
  currentTracks: [],
  filteredTracks: [],
  filterTimer: null,
  sortCol: null,
  sortAsc: true,
  isDetailView: false,
  catalogMode: null,
  artistIndex: [],
  albumIndex: [],
  catalogItems: [],
  filteredCatalog: [],
  navHistory: [],
  lastScrollTop: -1,
  visibleRows: [],
  statsOpen: false,
  wrappedYears: [],
  wrappedOpen: false,
  trackUriIndex: null,
  albumGridView: true,
};

// ── DOM refs ──
export const $ = {
  loading: document.getElementById("loading"),
  sidebar: document.getElementById("sidebar"),
  main: document.getElementById("main"),
  playlistList: document.getElementById("playlist-list"),
  sidebarSearch: document.getElementById("sidebar-search"),
  mainTitle: document.getElementById("main-title"),
  mainMeta: document.getElementById("main-meta"),
  trackFilter: document.getElementById("track-filter"),
  viewport: document.getElementById("track-viewport"),
  runway: document.getElementById("track-runway"),
  emptyState: document.getElementById("empty-state"),
  colHeader: document.getElementById("col-header"),
  trackFilterWrap: document.getElementById("track-filter-wrap"),
  statsBar: document.getElementById("stats-bar"),
  backBtn: document.getElementById("back-btn"),
  dedupToggle: document.getElementById("dedup-toggle"),
  dedupLabel: document.getElementById("dedup-label"),
  uploadScreen: document.getElementById("upload-screen"),
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  uploadError: document.getElementById("upload-error"),
  statsView: document.getElementById("stats-view"),
  statsContent: document.getElementById("stats-content"),
  statsTitle: document.getElementById("stats-title"),
  statsMeta: document.getElementById("stats-meta"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsOverlay: document.getElementById("settings-overlay"),
  hideLocalToggle: document.getElementById("hide-local-toggle"),
  clearCacheBtn: document.getElementById("clear-cache-btn"),
  privacyOverlay: document.getElementById("privacy-overlay"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  exportTxtBtn: document.getElementById("export-txt-btn"),
  exportOverlay: document.getElementById("export-overlay"),
  exportColumns: document.getElementById("export-columns"),
  exportConfirmBtn: document.getElementById("export-confirm-btn"),
  albumArtToggle: document.getElementById("album-art-toggle"),
  viewList: document.getElementById("view-list"),
  viewArt: document.getElementById("view-art"),
  viewGrid: document.getElementById("view-grid"),
  linkSpotifyToggle: document.getElementById("link-spotify-toggle"),
  lastfmBtn: document.getElementById("lastfm-btn"),
};

// ── Theme ──
const themeMQ = window.matchMedia("(prefers-color-scheme: light)");

function applyTheme() {
  const theme = getSettings().theme;
  if (theme === "light" || (theme === "system" && themeMQ.matches)) {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

themeMQ.addEventListener("change", () => applyTheme());
applyTheme();

// ── Navigation ──
export function selectPlaylist(id) {
  state.navHistory = [];
  if (id.startsWith("stats-")) {
    showStatsPage(id);
    return;
  }
  if (id.startsWith("wrapped-")) {
    showWrappedPage(id);
    return;
  }
  showPlaylist(id);
}

export function toggleStatsMenu() {
  state.statsOpen = !state.statsOpen;
}

export function toggleWrappedMenu() {
  state.wrappedOpen = !state.wrappedOpen;
}

export let cachedStats = null;

export function invalidateCachedStats() {
  cachedStats = null;
}

export function filterLocalTracks(tracks) {
  if (!getSettings().hideLocalTracks) return tracks;
  return tracks.filter((t) => !t.local);
}

function showStatsPage(id) {
  state.activeId = id;
  state.isDetailView = false;
  state.catalogMode = null;
  $.main.style.display = "none";
  $.statsView.style.display = "flex";

  // ensure menu is open when navigating to a sub-page
  state.statsOpen = true;

  document.querySelectorAll(".sidebar-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  if (!cachedStats) cachedStats = computeStats(state);

  const pageMap = { "stats-albums": "albums", "stats-artists": "artists", "stats-overview": "overview", "stats-timeline": "timeline" };
  const page = pageMap[id] || "overview";
  const titles = { overview: "Overview", artists: "Top Artists", albums: "Top Albums", timeline: "Timeline" };
  const metas = {
    overview: cachedStats.uniqueTracks.toLocaleString() + " unique tracks (deduplicated)",
    artists: cachedStats.uniqueArtists.toLocaleString() + " unique artists (deduplicated)",
    albums: cachedStats.uniqueAlbums.toLocaleString() + " unique albums (deduplicated)",
    timeline: "Tracks added over time",
  };
  $.statsTitle.textContent = titles[page];
  $.statsMeta.textContent = metas[page];
  renderStatsPage($.statsContent, cachedStats, page, {
    onArtist(name) {
      state.navHistory.push({ type: "stats", page: id });
      showArtist(name);
    },
    onAlbum(name, artist) {
      state.navHistory.push({ type: "stats", page: id });
      showAlbum(name, artist);
    },
  });
}

function showWrappedPage(id) {
  const year = parseInt(id.replace("wrapped-", ""), 10);
  const wrappedYear = state.wrappedYears.find((w) => w.year === year);
  if (!wrappedYear) return;

  state.activeId = id;
  state.isDetailView = false;
  state.catalogMode = null;
  $.main.style.display = "none";
  $.statsView.style.display = "flex";

  state.wrappedOpen = true;

  document.querySelectorAll(".sidebar-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  $.statsTitle.textContent = "Wrapped " + year;
  $.statsMeta.textContent = "Your year in music";
  renderWrappedPage($.statsContent, wrappedYear, state.trackUriIndex);
}

export function showAllPlaylistTracks() {
  state.activeId = "all-playlists";
  state.isDetailView = false;
  state.catalogMode = null;
  state.navHistory = [];
  $.backBtn.style.display = "none";
  $.statsView.style.display = "none";
  $.main.style.display = "";

  document.querySelectorAll(".sidebar-item").forEach((el) => el.classList.remove("active"));

  $.trackFilterWrap.style.display = "";
  $.colHeader.style.display = "";
  $.colHeader.querySelector(".col-source").textContent = "Source";
  $.trackFilter.placeholder = "search all tracks...";
  $.trackFilter.value = "";
  $.dedupLabel.style.display = "flex";
  $.dedupToggle.checked = true;
  $.exportCsvBtn.classList.add("visible");
  $.exportTxtBtn.classList.add("visible");
  $.viewGrid.style.display = "none";
  $.viewArt.style.display = "";
  $.viewList.style.display = "";

  const allTracks = filterLocalTracks(normalizeLibraryTracks(state.library.tracks))
    .map((t) => ({ ...t, source: "Liked Songs" }));
  for (const pl of state.playlists) {
    for (const t of filterLocalTracks(pl.tracks)) {
      allTracks.push({ ...t, source: pl.name });
    }
  }

  state.currentTracks = allTracks;
  $.mainTitle.textContent = "All Tracks";
  state.sortCol = null;
  state.sortAsc = true;
  updateSortHeaders();

  // Trigger filter pipeline (applies dedup since toggle is checked)
  $.dedupToggle.dispatchEvent(new Event("change"));
}

export function updateMainMeta() {
  if (state.activeId !== "all-playlists") return;
  const n = state.playlists.length;
  if ($.dedupToggle.checked) {
    const seen = new Set();
    for (const t of state.currentTracks) {
      seen.add(t.uri || (t.name + "|||" + t.artist).toLowerCase());
    }
    $.mainMeta.textContent = seen.size.toLocaleString() + " unique tracks across liked songs + " + n + " playlists";
  } else {
    $.mainMeta.textContent = state.currentTracks.length.toLocaleString() + " tracks across liked songs + " + n + " playlists";
  }
}

export function showPlaylist(id) {
  if (id === "all-playlists") {
    showAllPlaylistTracks();
    return;
  }
  state.activeId = id;
  state.isDetailView = false;
  state.catalogMode = null;
  $.backBtn.style.display = "none";
  $.statsView.style.display = "none";
  $.main.style.display = "";

  document.querySelectorAll(".sidebar-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  if (id === "artists") {
    showCatalogList("artists");
    return;
  }
  if (id === "albums") {
    showCatalogList("albums");
    return;
  }

  $.trackFilterWrap.style.display = "";
  $.colHeader.style.display = "";
  $.trackFilter.placeholder = "filter tracks...";
  $.dedupLabel.style.display = "none";
  $.dedupToggle.checked = false;
  $.exportCsvBtn.classList.add("visible");
  $.exportTxtBtn.classList.add("visible");
  $.viewGrid.style.display = "none";
  $.viewArt.style.display = "";
  $.viewList.style.display = "";

  if (id === "liked") {
    $.mainTitle.textContent = "Liked Songs";
    state.currentTracks = filterLocalTracks(normalizeLibraryTracks(state.library.tracks));
    $.mainMeta.textContent = state.currentTracks.length + " tracks";
  } else {
    const pl = state.playlists.find((p) => p.id === id);
    $.mainTitle.textContent = pl.name;
    state.currentTracks = filterLocalTracks(pl.tracks);
    $.mainMeta.textContent =
      state.currentTracks.length + " tracks \u00b7 updated " + pl.date;
  }

  $.trackFilter.value = "";
  state.sortCol = null;
  state.sortAsc = true;
  updateSortHeaders();
  state.filteredTracks = state.currentTracks.slice();
  renderTrackList();
}

export function showCatalogList(mode) {
  state.catalogMode = mode;
  state.isDetailView = false;
  $.statsView.style.display = "none";
  $.main.style.display = "";
  $.exportCsvBtn.classList.remove("visible");
  $.exportTxtBtn.classList.remove("visible");

  $.trackFilterWrap.style.display = "";
  const index = mode === "artists" ? state.artistIndex : state.albumIndex;
  const label = mode === "artists" ? "Artists" : "Albums";

  $.mainTitle.textContent = label;
  $.mainMeta.textContent = index.length + " " + label.toLowerCase();
  $.colHeader.style.display = "none";
  $.trackFilter.value = "";
  $.trackFilter.placeholder = "filter " + label.toLowerCase() + "...";
  $.dedupLabel.style.display = "none";
  $.dedupToggle.checked = false;

  // View toggle visibility
  if (mode === "albums") {
    $.viewGrid.style.display = "";
    $.viewArt.style.display = "";
    $.viewList.style.display = "";
    const art = getSettings().showAlbumArt;
    $.viewGrid.classList.toggle("active", state.albumGridView);
    $.viewArt.classList.toggle("active", !state.albumGridView && art);
    $.viewList.classList.toggle("active", !state.albumGridView && !art);
  } else {
    $.viewGrid.style.display = "none";
    $.viewArt.style.display = "none";
    $.viewList.style.display = "none";
  }

  state.catalogItems = index;
  state.filteredCatalog = index.slice();
  state.currentTracks = [];
  state.filteredTracks = [];
  renderCatalogList();
}

export function showDetailView(title, meta, tracks) {
  document
    .querySelectorAll(".sidebar-item")
    .forEach((el) => el.classList.remove("active"));
  state.isDetailView = true;
  state.catalogMode = null;
  $.statsView.style.display = "none";
  $.main.style.display = "";
  $.backBtn.style.display = "block";
  $.exportCsvBtn.classList.remove("visible");
  $.exportTxtBtn.classList.remove("visible");

  $.viewGrid.style.display = "none";
  $.viewArt.style.display = "";
  $.viewList.style.display = "";

  $.trackFilterWrap.style.display = "";
  $.colHeader.style.display = "";
  $.colHeader.querySelector(".col-source").textContent = "Source";
  $.trackFilter.placeholder = "filter tracks...";
  $.dedupLabel.style.display = "flex";
  $.dedupToggle.checked = false;
  $.mainTitle.textContent = title;
  $.mainMeta.textContent = meta;

  $.trackFilter.value = "";
  state.sortCol = null;
  state.sortAsc = true;
  updateSortHeaders();
  state.currentTracks = tracks;
  state.filteredTracks = tracks.slice();
  renderTrackList();
}

export function showArtist(artistName) {
  const key = artistName.toLowerCase();
  const tracks = [];

  for (const t of state.library.tracks) {
    if (t.artist.toLowerCase() === key) {
      tracks.push({
        name: t.track,
        artist: t.artist,
        album: t.album,
        uri: t.uri,
        date: "",
        local: false,
        source: "Liked Songs",
      });
    }
  }
  for (const pl of state.playlists) {
    for (const t of pl.tracks) {
      if (t.artist.toLowerCase() === key) {
        tracks.push({ ...t, source: pl.name });
      }
    }
  }

  const filtered = filterLocalTracks(tracks);
  showDetailView(
    artistName,
    filtered.length + " tracks across your library",
    filtered,
  );
}

export function showAlbum(albumName, artistName) {
  const keyAlbum = albumName.toLowerCase();
  const keyArtist = artistName.toLowerCase();
  const tracks = [];

  for (const t of state.library.tracks) {
    if (
      t.album.toLowerCase() === keyAlbum &&
      t.artist.toLowerCase() === keyArtist
    ) {
      tracks.push({
        name: t.track,
        artist: t.artist,
        album: t.album,
        uri: t.uri,
        date: "",
        local: false,
        source: "Liked Songs",
      });
    }
  }
  for (const pl of state.playlists) {
    for (const t of pl.tracks) {
      if (
        t.album.toLowerCase() === keyAlbum &&
        t.artist.toLowerCase() === keyArtist
      ) {
        tracks.push({ ...t, source: pl.name });
      }
    }
  }

  const filtered = filterLocalTracks(tracks);
  showDetailView(
    albumName + " \u2014 " + artistName,
    filtered.length + " tracks across your library",
    filtered,
  );
}

function normalizeLibraryTracks(tracks) {
  return tracks.map((t) => ({
    name: t.track,
    artist: t.artist,
    album: t.album,
    uri: t.uri,
    date: "",
    local: false,
  }));
}

// ── Back Navigation ──
$.backBtn.addEventListener("click", () => {
  const prev = state.navHistory.pop();
  if (!prev) return;
  if (prev.type === "stats") {
    showStatsPage(prev.page);
    return;
  }
  if (prev.type === "wrapped") {
    showWrappedPage(prev.page);
    return;
  }
  if (prev.type === "catalog") {
    state.activeId = prev.mode;
    document.querySelectorAll(".sidebar-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === prev.mode);
    });
    $.backBtn.style.display = "none";
    showCatalogList(prev.mode);
  } else if (prev.type === "playlist") {
    showPlaylist(prev.id);
  }
});

// ── Keyboard shortcuts ──
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    $.sidebarSearch.focus();
    $.sidebarSearch.select();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    $.trackFilter.focus();
    $.trackFilter.select();
  }
  if (e.key === " " && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    togglePlayPause();
    return;
  }
  if (e.key === "Escape") {
    if (isResultsPanelOpen()) {
      closeResultsPanel();
      return;
    }
    const open = [$.settingsOverlay, $.privacyOverlay, $.exportOverlay].find((o) => o.style.display !== "none");
    if (open) {
      open.style.display = "none";
    } else if (document.activeElement === $.sidebarSearch) {
      $.sidebarSearch.value = "";
      $.sidebarSearch.blur();
      renderSidebar("");
    } else if (document.activeElement === $.trackFilter) {
      $.trackFilter.value = "";
      $.trackFilter.blur();
      state.filteredTracks = state.currentTracks;
      renderTrackList();
    }
  }
});

// ── Scroll ──
$.viewport.addEventListener("scroll", () => {
  requestAnimationFrame(() => {
    if (state.albumGridView && state.catalogMode === "albums") renderVisibleGridRows();
    else if (state.catalogMode) renderVisibleCatalogRows();
    else renderVisibleRows();
  });
});

// ── Resize (grid reflow) ──
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.albumGridView && state.catalogMode === "albums") {
      renderCatalogList();
    }
  }, 150);
});

// ── Sidebar Search ──
$.sidebarSearch.addEventListener("input", () => {
  renderSidebar($.sidebarSearch.value);
});

// ── Overlays ──
function wireOverlay(overlay, onClose) {
  const hide = () => {
    overlay.style.display = "none";
    if (onClose) onClose();
  };
  overlay.querySelector(".overlay-close").addEventListener("click", hide);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hide();
  });
}

wireOverlay($.settingsOverlay);
wireOverlay($.privacyOverlay);
wireOverlay($.exportOverlay);
// Player bar controls are self-wired in player.js

// ── Album Art ──
export function applyAlbumArt() {
  const on = getSettings().showAlbumArt;
  TRACK_ROW_H = on ? 64 : 32;
  $.viewList.classList.toggle("active", !on);
  $.viewArt.classList.toggle("active", on);
  $.albumArtToggle.checked = on;
  // Keep header spacer in sync
  const existing = $.colHeader.querySelector(".col-art");
  if (on && !existing) {
    const spacer = document.createElement("span");
    spacer.className = "col-art";
    $.colHeader.insertBefore(spacer, $.colHeader.firstChild);
  } else if (!on && existing) {
    existing.remove();
  }
  const headerPlay = $.colHeader.querySelector(".col-play");
  if (headerPlay) headerPlay.style.display = on ? "none" : "";
  if (state.library) {
    if (state.catalogMode) renderCatalogList();
    else if (state.filteredTracks.length) renderTrackList();
  }
}

// ── Settings ──
loadSettings();
$.hideLocalToggle.checked = getSettings().hideLocalTracks;
$.albumArtToggle.checked = getSettings().showAlbumArt;
$.linkSpotifyToggle.checked = getSettings().linkToSpotify;

// Theme radios
const themeRadios = document.querySelectorAll('input[name="theme"]');
const currentTheme = getSettings().theme;
themeRadios.forEach((r) => {
  if (r.value === currentTheme) r.checked = true;
  r.addEventListener("change", () => {
    const s = getSettings();
    s.theme = r.value;
    saveSettings(s);
    applyTheme();
  });
});

$.settingsBtn.addEventListener("click", () => {
  $.settingsOverlay.style.display = "";
});

document.querySelectorAll(".privacy-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $.privacyOverlay.style.display = "";
  });
});

$.clearCacheBtn.addEventListener("click", async () => {
  await clearCachedData();
  location.reload();
});

$.albumArtToggle.addEventListener("change", () => {
  const s = getSettings();
  s.showAlbumArt = $.albumArtToggle.checked;
  saveSettings(s);
  applyAlbumArt();
});

$.linkSpotifyToggle.addEventListener("change", () => {
  const s = getSettings();
  s.linkToSpotify = $.linkSpotifyToggle.checked;
  saveSettings(s);
  if (state.library) {
    if (state.catalogMode) renderCatalogList();
    else if (state.filteredTracks.length) renderTrackList();
  }
});

// ── Last.fm ──
function updateLastfmUI() {
  if (isLinked()) {
    $.lastfmBtn.textContent = "Unlink (" + getSettings().lastfmUsername + ")";
  } else {
    $.lastfmBtn.textContent = "Link Last.fm";
  }
}

$.lastfmBtn.addEventListener("click", async () => {
  if (isLinked()) {
    unlinkLastFm();
    updateLastfmUI();
  } else {
    const url = await getAuthUrl(location.origin + location.pathname);
    location.href = url;
  }
});

initLastFm().then(() => updateLastfmUI());

function setViewMode(showArt) {
  const s = getSettings();
  if (s.showAlbumArt === showArt && !state.albumGridView) return;
  s.showAlbumArt = showArt;
  saveSettings(s);
  if (state.albumGridView && state.catalogMode === "albums") {
    state.albumGridView = false;
    $.viewGrid.classList.remove("active");
    $.viewArt.classList.toggle("active", showArt);
    $.viewList.classList.toggle("active", !showArt);
    renderCatalogList();
    return;
  }
  applyAlbumArt();
}
$.viewList.addEventListener("click", () => setViewMode(false));
$.viewArt.addEventListener("click", () => setViewMode(true));
$.viewGrid.addEventListener("click", () => {
  if (state.albumGridView) return;
  state.albumGridView = true;
  $.viewGrid.classList.add("active");
  $.viewArt.classList.remove("active");
  $.viewList.classList.remove("active");
  renderCatalogList();
});

$.hideLocalToggle.addEventListener("change", () => {
  const s = getSettings();
  s.hideLocalTracks = $.hideLocalToggle.checked;
  saveSettings(s);
  invalidateCachedStats();
  if (state.library) buildIndexes();
  renderSidebar($.sidebarSearch.value);
  // Reapply current view
  if (state.activeId) {
    if (state.isDetailView) {
      const prev = state.navHistory[state.navHistory.length - 1];
      if (prev) {
        $.backBtn.click();
      }
    } else {
      selectPlaylist(state.activeId);
    }
  }
});

// ── Library title (reset to home) ──
document.getElementById("library-title").addEventListener("click", () => {
  showAllPlaylistTracks();
});

// ── Export ──
const EXPORT_COLUMNS = [
  { key: "playlist", label: "Playlist", header: "Playlist Name" },
  { key: "name",     label: "Title",    header: "Track Name" },
  { key: "artist",   label: "Artist",   header: "Artist" },
  { key: "album",    label: "Album",    header: "Album" },
  { key: "source",   label: "Source",   header: "Source" },
  { key: "uri",      label: "Spotify URI", header: "Spotify URI" },
  { key: "date",     label: "Date Added",  header: "Date Added" },
];

function csvEscape(val) {
  if (!val) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getTrackValue(track, key) {
  if (key === "uri") return track.uri || "";
  if (key === "date") return track.date || "";
  return track[key] || "";
}

function getAllTracks() {
  const tracks = [];
  const likedTracks = filterLocalTracks(normalizeLibraryTracks(state.library.tracks));
  for (const t of likedTracks) {
    tracks.push({ playlist: "Liked Songs", ...t });
  }
  for (const pl of state.playlists) {
    for (const t of filterLocalTracks(pl.tracks)) {
      tracks.push({ playlist: pl.name, ...t });
    }
  }
  return tracks;
}

let pendingExportFormat = null;
let pendingExportScope = null;

function openExportOverlay(format, scope) {
  pendingExportFormat = format;
  pendingExportScope = scope;

  const isAllTracks = state.activeId === "all-playlists";
  const isGlobal = scope === "global";
  const tracks = isGlobal ? null : state.filteredTracks;
  const hasDates = !isGlobal && tracks && tracks.some((t) => t.date);

  // Determine available columns + defaults
  const columns = [];
  for (const col of EXPORT_COLUMNS) {
    let available = false;
    let checked = false;

    if (col.key === "playlist") {
      if (isGlobal) { available = true; checked = true; }
    } else if (col.key === "name" || col.key === "artist" || col.key === "album") {
      available = true; checked = true;
    } else if (col.key === "source") {
      if (isAllTracks && !isGlobal) { available = true; checked = false; }
    } else if (col.key === "uri") {
      available = true; checked = true;
    } else if (col.key === "date") {
      if (!isGlobal && hasDates) { available = true; checked = false; }
    }

    if (available) columns.push({ ...col, checked });
  }

  // Build checkboxes
  $.exportColumns.innerHTML = "";
  for (const col of columns) {
    const label = document.createElement("label");
    label.className = "overlay-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = col.checked;
    cb.dataset.key = col.key;
    const span = document.createElement("span");
    span.textContent = col.label;
    label.append(cb, span);
    $.exportColumns.appendChild(label);
  }

  $.exportOverlay.style.display = "";
}

function executePlaylistExport(format, selectedKeys) {
  const tracks = state.filteredTracks;
  if (!tracks || tracks.length === 0) return;
  const filename = ($.mainTitle.textContent || "export") + "." + format;

  if (format === "csv") {
    const cols = EXPORT_COLUMNS.filter((c) => selectedKeys.includes(c.key));
    const rows = [cols.map((c) => c.header).join(",")];
    for (const t of tracks) {
      rows.push(cols.map((c) => csvEscape(getTrackValue(t, c.key))).join(","));
    }
    downloadFile(rows.join("\n"), filename, "text/csv;charset=utf-8");
  } else {
    const keys = EXPORT_COLUMNS.filter((c) => selectedKeys.includes(c.key)).map((c) => c.key);
    const lines = tracks.map((t) => keys.map((k) => getTrackValue(t, k)).filter(Boolean).join(" - "));
    downloadFile(lines.join("\n"), filename, "text/plain;charset=utf-8");
  }
}

function executeGlobalExport(format, selectedKeys) {
  if (!state.library) return;
  const tracks = getAllTracks();
  const filename = "spotify-library." + format;

  if (format === "csv") {
    const cols = EXPORT_COLUMNS.filter((c) => selectedKeys.includes(c.key));
    const rows = [cols.map((c) => c.header).join(",")];
    for (const t of tracks) {
      rows.push(cols.map((c) => csvEscape(getTrackValue(t, c.key))).join(","));
    }
    downloadFile(rows.join("\n"), filename, "text/csv;charset=utf-8");
  } else {
    const hasPlaylist = selectedKeys.includes("playlist");
    const valueKeys = EXPORT_COLUMNS.filter((c) => selectedKeys.includes(c.key) && c.key !== "playlist").map((c) => c.key);
    if (hasPlaylist) {
      let currentPlaylist = null;
      const lines = [];
      for (const t of tracks) {
        if (t.playlist !== currentPlaylist) {
          if (currentPlaylist !== null) lines.push("");
          lines.push("## " + t.playlist);
          lines.push("");
          currentPlaylist = t.playlist;
        }
        lines.push(valueKeys.map((k) => getTrackValue(t, k)).filter(Boolean).join(" - "));
      }
      downloadFile(lines.join("\n"), filename, "text/plain;charset=utf-8");
    } else {
      const lines = tracks.map((t) => valueKeys.map((k) => getTrackValue(t, k)).filter(Boolean).join(" - "));
      downloadFile(lines.join("\n"), filename, "text/plain;charset=utf-8");
    }
  }
}

$.exportConfirmBtn.addEventListener("click", () => {
  const selectedKeys = [];
  for (const cb of $.exportColumns.querySelectorAll("input[type=checkbox]")) {
    if (cb.checked) selectedKeys.push(cb.dataset.key);
  }
  if (selectedKeys.length === 0) return;

  $.exportOverlay.style.display = "none";

  if (pendingExportScope === "global") {
    executeGlobalExport(pendingExportFormat, selectedKeys);
  } else {
    executePlaylistExport(pendingExportFormat, selectedKeys);
  }
});

$.exportCsvBtn.addEventListener("click", () => {
  if (!state.filteredTracks || state.filteredTracks.length === 0) return;
  openExportOverlay("csv", "playlist");
});

$.exportTxtBtn.addEventListener("click", () => {
  if (!state.filteredTracks || state.filteredTracks.length === 0) return;
  openExportOverlay("txt", "playlist");
});

document.querySelectorAll(".export-all-csv-btn").forEach((btn) =>
  btn.addEventListener("click", () => openExportOverlay("csv", "global")),
);
document.querySelectorAll(".export-all-txt-btn").forEach((btn) =>
  btn.addEventListener("click", () => openExportOverlay("txt", "global")),
);

// ── Mobile overlay ──
document.getElementById("mobile-dismiss").addEventListener("click", () => {
  document.getElementById("mobile-overlay").classList.add("dismissed");
});

// ── Sample Library ──
document.getElementById("sample-btn").addEventListener("click", () => {
  loadSampleData();
});

// ── Init ──
applyAlbumArt();
initRender();
initData();
tryLocalData();
