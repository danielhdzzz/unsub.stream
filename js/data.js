import { state, $, showAllPlaylistTracks } from "./app.js";
import { renderSidebar } from "./render.js";
import { getSettings } from "./settings.js";
import { cacheData, getCachedData } from "./cache.js";
import { parseWrappedFile } from "./wrapped.js";

// ── Data Loading ──
export async function tryLocalData() {
  try {
    const res = await fetch("data/YourLibrary.json");
    if (!res.ok) throw new Error("not found");
    const libData = await res.json();

    const playlistFiles = [];
    for (let i = 1; i <= 20; i++) {
      try {
        const pr = await fetch("data/Playlist" + i + ".json");
        if (!pr.ok) break;
        playlistFiles.push(await pr.json());
      } catch {
        break;
      }
    }

    const wrappedFiles = [];
    for (let y = 2016; y <= 2030; y++) {
      try {
        const wr = await fetch("data/Wrapped" + y + ".json");
        if (!wr.ok) continue;
        wrappedFiles.push({ name: "Wrapped" + y + ".json", data: await wr.json() });
      } catch {
        continue;
      }
    }

    processData(libData, playlistFiles, wrappedFiles);
  } catch {
    const cached = await getCachedData();
    if (cached) {
      processData(cached.libData, cached.playlistFiles, cached.wrappedFiles || []);
    } else {
      $.loading.classList.add("hidden");
      $.uploadScreen.style.display = "flex";
    }
  }
}

export async function loadSampleData() {
  $.uploadScreen.style.display = "none";
  $.loading.classList.remove("hidden");
  const noCache = { cache: "no-store" };
  try {
    const res = await fetch("sample/YourLibrary.json", noCache);
    if (!res.ok) throw new Error("not found");
    const libData = await res.json();

    const playlistFiles = [];
    for (let i = 1; i <= 20; i++) {
      try {
        const pr = await fetch("sample/Playlist" + i + ".json", noCache);
        if (!pr.ok) break;
        playlistFiles.push(await pr.json());
      } catch {
        break;
      }
    }

    const wrappedFiles = [];
    for (let y = 2016; y <= 2030; y++) {
      try {
        const wr = await fetch("sample/Wrapped" + y + ".json", noCache);
        if (!wr.ok) continue;
        wrappedFiles.push({ name: "Wrapped" + y + ".json", data: await wr.json() });
      } catch {
        continue;
      }
    }

    processData(libData, playlistFiles, wrappedFiles, { skipCache: true });
  } catch {
    $.loading.classList.add("hidden");
    $.uploadScreen.style.display = "flex";
  }
}

function processData(libData, playlistFiles, wrappedFiles = [], { skipCache = false } = {}) {
  state.library = libData;

  const allPlaylists = [];
  for (const pf of playlistFiles) {
    if (pf.playlists) allPlaylists.push(...pf.playlists);
  }

  allPlaylists.sort((a, b) =>
    b.lastModifiedDate.localeCompare(a.lastModifiedDate),
  );

  state.playlists = allPlaylists.map((p, i) => ({
    id: "pl_" + i,
    name: p.name,
    date: p.lastModifiedDate,
    trackCount: p.items.length,
    tracks: normalizePlaylistTracks(p.items),
  }));

  buildIndexes();

  // Parse wrapped files
  state.wrappedYears = [];
  for (const wf of wrappedFiles) {
    const parsed = parseWrappedFile(wf.name, wf.data);
    if (parsed) state.wrappedYears.push(parsed);
  }
  state.wrappedYears.sort((a, b) => b.year - a.year);

  const totalTracks =
    state.library.tracks.length +
    state.playlists.reduce((s, p) => s + p.trackCount, 0);
  const $statsText = $.statsBar.querySelector(".stats-text");
  if ($statsText)
    $statsText.textContent = `${state.library.tracks.length} liked songs \u00b7 ${state.playlists.length} playlists \u00b7 ${totalTracks.toLocaleString()} total tracks`;

  $.loading.classList.add("hidden");
  $.uploadScreen.style.display = "none";
  $.sidebar.style.display = "";
  $.main.style.display = "";
  $.statsBar.style.display = "";

  renderSidebar("");
  showAllPlaylistTracks();
  if (!skipCache) cacheData(libData, playlistFiles, wrappedFiles);
}

// ── Index Building (deduplicated, respects hideLocalTracks) ──
export function buildIndexes() {
  const hideLocal = getSettings().hideLocalTracks;
  const seen = new Set();
  const artistMap = new Map();
  const albumMap = new Map();

  function addTrack(name, artist, album, uri, isLocal) {
    if (hideLocal && isLocal) return;
    const key = uri || (name + "|||" + artist).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const aKey = artist.toLowerCase();
    if (!artistMap.has(aKey)) artistMap.set(aKey, { name: artist, count: 0 });
    artistMap.get(aKey).count++;

    const abKey = (album + "|||" + artist).toLowerCase();
    if (!albumMap.has(abKey)) albumMap.set(abKey, { name: album, artist: artist, count: 0 });
    albumMap.get(abKey).count++;
  }

  for (const t of state.library.tracks) {
    addTrack(t.track, t.artist, t.album, t.uri, false);
  }
  for (const pl of state.playlists) {
    for (const t of pl.tracks) {
      addTrack(t.name, t.artist, t.album, t.uri, t.local);
    }
  }

  state.artistIndex = Array.from(artistMap.values()).sort((a, b) => b.count - a.count);
  state.albumIndex = Array.from(albumMap.values()).sort((a, b) => b.count - a.count);

  // Build track URI index for wrapped resolution
  const trackUriMap = new Map();
  for (const t of state.library.tracks) {
    if (t.uri && !trackUriMap.has(t.uri)) {
      trackUriMap.set(t.uri, { name: t.track, artist: t.artist, album: t.album });
    }
  }
  for (const pl of state.playlists) {
    for (const t of pl.tracks) {
      if (t.uri && !t.local && !trackUriMap.has(t.uri)) {
        trackUriMap.set(t.uri, { name: t.name, artist: t.artist, album: t.album });
      }
    }
  }
  state.trackUriIndex = trackUriMap;
}

// ── File Upload ──
function showUploadError(msg) {
  $.uploadError.textContent = msg;
  $.uploadError.style.display = "";
}

function readFileAsJSON(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve({ name: file.name, data: JSON.parse(reader.result) });
      } catch {
        resolve({ name: file.name, data: null });
      }
    };
    reader.onerror = () => resolve({ name: file.name, data: null });
    reader.readAsText(file);
  });
}

function processUploadedFiles(results) {
  const libFile = results.find((r) => r.name === "YourLibrary.json");
  if (!libFile || !libFile.data) {
    showUploadError(
      "YourLibrary.json not found. Make sure to include it in your selection.",
    );
    return;
  }

  const playlistFiles = results
    .filter((r) => /^Playlist\d+\.json$/i.test(r.name) && r.data)
    .map((r) => r.data);

  const wrappedFiles = results
    .filter((r) => /^Wrapped\d{4}\.json$/i.test(r.name) && r.data)
    .map((r) => ({ name: r.name, data: r.data }));

  processData(libFile.data, playlistFiles, wrappedFiles);
}

function handleFiles(files) {
  $.uploadError.style.display = "none";
  const jsonFiles = Array.from(files).filter((f) =>
    f.name.endsWith(".json"),
  );
  if (jsonFiles.length === 0) {
    showUploadError(
      "No JSON files found. Select the files from your Spotify data export.",
    );
    return;
  }
  Promise.all(jsonFiles.map(readFileAsJSON)).then(processUploadedFiles);
}

function readEntries(dirReader) {
  return new Promise((resolve) => {
    const all = [];
    (function read() {
      dirReader.readEntries((entries) => {
        if (entries.length === 0) return resolve(all);
        all.push(...entries);
        read();
      });
    })();
  });
}

function entryToFile(entry) {
  return new Promise((resolve) => entry.file(resolve));
}

async function collectJSONFiles(entries) {
  const files = [];
  for (const entry of entries) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      files.push(await entryToFile(entry));
    } else if (entry.isDirectory) {
      const subEntries = await readEntries(entry.createReader());
      files.push(...(await collectJSONFiles(subEntries)));
    }
  }
  return files;
}

function normalizePlaylistTracks(items) {
  return items
    .map((item) => {
      if (item.track) {
        return {
          name: item.track.trackName,
          artist: item.track.artistName,
          album: item.track.albumName,
          uri: item.track.trackUri,
          date: item.addedDate || "",
          local: false,
        };
      }
      if (item.localTrack) {
        const parts = item.localTrack.uri
          .replace("spotify:local:", "")
          .split(":");
        const dec = (s) => decodeURIComponent((s || "").replace(/\+/g, " "));
        return {
          name: dec(parts[2]) || "Unknown",
          artist: dec(parts[0]) || "Unknown",
          album: dec(parts[1]),
          uri: null,
          date: item.addedDate || "",
          local: true,
        };
      }
      return null;
    })
    .filter(Boolean);
}

// ── Init (wires up upload event listeners) ──
export function initData() {
  $.dropZone.addEventListener("click", () => $.fileInput.click());
  $.fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  $.uploadScreen.addEventListener("dragover", (e) => {
    e.preventDefault();
    $.dropZone.classList.add("dragover");
  });
  $.uploadScreen.addEventListener("dragleave", (e) => {
    if (!$.uploadScreen.contains(e.relatedTarget))
      $.dropZone.classList.remove("dragover");
  });

  $.uploadScreen.addEventListener("drop", async (e) => {
    e.preventDefault();
    $.dropZone.classList.remove("dragover");
    $.uploadError.style.display = "none";

    const items = e.dataTransfer.items;
    if (items && items.length > 0 && items[0].webkitGetAsEntry) {
      const entries = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      const files = await collectJSONFiles(entries);
      if (files.length === 0) {
        showUploadError(
          "No JSON files found. Drop your Spotify data folder or select the JSON files inside it.",
        );
        return;
      }
      Promise.all(files.map(readFileAsJSON)).then(processUploadedFiles);
    } else {
      handleFiles(e.dataTransfer.files);
    }
  });
}
