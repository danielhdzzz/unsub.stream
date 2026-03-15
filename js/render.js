import { ROW_H, TRACK_ROW_H, RENDER_BUFFER, state, $, selectPlaylist, showArtist, showAlbum, toggleStatsMenu, toggleWrappedMenu, updateMainMeta } from "./app.js";
import { getSettings } from "./settings.js";
import { openPlayer } from "./player.js";
import { getAlbumArt } from "./albumart.js";

// ── Sidebar ──
export function renderSidebar(filter) {
  const frag = document.createDocumentFragment();
  const q = filter.toLowerCase();
  const hideLocal = getSettings().hideLocalTracks;

  if (!q || "liked songs".includes(q)) {
    const likedItem = makeSidebarItem(
      "liked",
      "Liked Songs",
      state.library.tracks.length,
      "",
    );
    frag.appendChild(likedItem);
  }

  if (!q || "artists".includes(q)) {
    frag.appendChild(
      makeSidebarItem("artists", "Artists", state.artistIndex.length, ""),
    );
  }

  if (!q || "albums".includes(q)) {
    frag.appendChild(
      makeSidebarItem("albums", "Albums", state.albumIndex.length, ""),
    );
  }

  const statsMatches = !q || "stats overview top artists albums timeline added over time".includes(q);
  if (statsMatches) {
    const statsGroup = document.createElement("div");
    statsGroup.className = "sidebar-group" + (state.statsOpen ? " open" : "");

    const toggle = document.createElement("div");
    toggle.className = "sidebar-item sidebar-group-toggle";
    toggle.dataset.id = "stats";
    const toggleName = document.createElement("span");
    toggleName.className = "sidebar-item-name";
    toggleName.textContent = "Stats";
    const arrow = document.createElement("span");
    arrow.className = "sidebar-group-arrow";
    arrow.textContent = "\u25B8";
    toggle.appendChild(toggleName);
    toggle.appendChild(arrow);
    toggle.addEventListener("click", () => {
      toggleStatsMenu();
      statsGroup.classList.toggle("open", state.statsOpen);
    });

    const sub = document.createElement("div");
    sub.className = "sidebar-group-items";

    const subItems = [
      { id: "stats-overview", label: "Overview" },
      { id: "stats-artists", label: "Top Artists" },
      { id: "stats-albums", label: "Top Albums" },
      { id: "stats-timeline", label: "Timeline" },
    ];
    for (const s of subItems) {
      if (q && !s.label.toLowerCase().includes(q) && !"stats".includes(q)) continue;
      const item = document.createElement("div");
      item.className = "sidebar-item sidebar-sub-item";
      item.dataset.id = s.id;
      if (s.id === state.activeId) item.classList.add("active");
      const nameSpan = document.createElement("span");
      nameSpan.className = "sidebar-item-name";
      nameSpan.textContent = s.label;
      item.appendChild(nameSpan);
      item.addEventListener("click", () => selectPlaylist(s.id));
      sub.appendChild(item);
    }

    statsGroup.appendChild(toggle);
    statsGroup.appendChild(sub);
    frag.appendChild(statsGroup);
  }

  if (state.wrappedYears.length > 0) {
    const wrappedMatches = !q || "wrapped".includes(q) || state.wrappedYears.some((w) => String(w.year).includes(q));
    if (wrappedMatches) {
      const wrappedGroup = document.createElement("div");
      wrappedGroup.className = "sidebar-group" + (state.wrappedOpen ? " open" : "");

      const wToggle = document.createElement("div");
      wToggle.className = "sidebar-item sidebar-group-toggle";
      wToggle.dataset.id = "wrapped";
      const wToggleName = document.createElement("span");
      wToggleName.className = "sidebar-item-name";
      wToggleName.textContent = "Wrapped";
      const wArrow = document.createElement("span");
      wArrow.className = "sidebar-group-arrow";
      wArrow.textContent = "\u25B8";
      wToggle.appendChild(wToggleName);
      wToggle.appendChild(wArrow);
      wToggle.addEventListener("click", () => {
        toggleWrappedMenu();
        wrappedGroup.classList.toggle("open", state.wrappedOpen);
      });

      const wSub = document.createElement("div");
      wSub.className = "sidebar-group-items";

      for (const w of state.wrappedYears) {
        const wId = "wrapped-" + w.year;
        if (q && !String(w.year).includes(q) && !"wrapped".includes(q)) continue;
        const item = document.createElement("div");
        item.className = "sidebar-item sidebar-sub-item";
        item.dataset.id = wId;
        if (wId === state.activeId) item.classList.add("active");
        const nameSpan = document.createElement("span");
        nameSpan.className = "sidebar-item-name";
        nameSpan.textContent = String(w.year);
        item.appendChild(nameSpan);
        item.addEventListener("click", () => selectPlaylist(wId));
        wSub.appendChild(item);
      }

      wrappedGroup.appendChild(wToggle);
      wrappedGroup.appendChild(wSub);
      frag.appendChild(wrappedGroup);
    }
  }

  const sectionEl = document.createElement("div");
  sectionEl.className = "sidebar-section";
  sectionEl.textContent = "Playlists";
  frag.appendChild(sectionEl);

  for (const p of state.playlists) {
    if (q && !p.name.toLowerCase().includes(q)) continue;
    const count = hideLocal ? p.tracks.filter((t) => !t.local).length : p.trackCount;
    if (hideLocal && count === 0) continue;
    frag.appendChild(makeSidebarItem(p.id, p.name, count, p.date));
  }

  $.playlistList.innerHTML = "";
  $.playlistList.appendChild(frag);

  if (state.activeId) {
    const el = $.playlistList.querySelector(
      `[data-id="${state.activeId}"]`,
    );
    if (el) el.classList.add("active");
  }
}

function makeSidebarItem(id, name, count, date) {
  const el = document.createElement("div");
  el.className = "sidebar-item";
  if (id === state.activeId) el.classList.add("active");
  el.dataset.id = id;

  const nameSpan = document.createElement("span");
  nameSpan.className = "sidebar-item-name";
  nameSpan.textContent = name;

  const countSpan = document.createElement("span");
  countSpan.className = "sidebar-item-count";
  countSpan.textContent = count;

  el.appendChild(nameSpan);
  el.appendChild(countSpan);

  el.addEventListener("click", () => selectPlaylist(id));
  return el;
}

// ── Track Filtering ──
function refilter() {
  const q = $.trackFilter.value.toLowerCase();

  if (state.catalogMode) {
    state.filteredCatalog = q
      ? state.catalogItems.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            (item.artist && item.artist.toLowerCase().includes(q)),
        )
      : state.catalogItems.slice();
    renderCatalogList();
    return;
  }

  if (!q) {
    state.filteredTracks = state.currentTracks.slice();
  } else {
    state.filteredTracks = state.currentTracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    );
  }
  if (getSettings().hideLocalTracks) {
    state.filteredTracks = state.filteredTracks.filter((t) => !t.local);
  }
  applyDedup();
  applySort();
  renderTrackList();
  updateMainMeta();
}

// ── Deduplication ──
function applyDedup() {
  if (!$.dedupToggle.checked) return;
  const seen = new Set();
  state.filteredTracks = state.filteredTracks.filter((t) => {
    const key = t.uri || (t.name + "|||" + t.artist).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Sorting ──
function applySort() {
  if (!state.sortCol) return;
  const dir = state.sortAsc ? 1 : -1;
  state.filteredTracks.sort((a, b) => {
    const av = (a[state.sortCol] || "").toLowerCase();
    const bv = (b[state.sortCol] || "").toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

function toggleSort(col) {
  if (state.sortCol === col) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortCol = col;
    state.sortAsc = true;
  }
  updateSortHeaders();
  applySort();
  renderTrackList();
}

export function updateSortHeaders() {
  const map = {
    name: ".col-track",
    artist: ".col-artist",
    album: ".col-album",
    source: ".col-source",
    date: ".col-date",
  };
  $.colHeader.querySelectorAll("span").forEach((s) => {
    s.classList.remove("sorted", "desc");
  });
  if (state.sortCol && map[state.sortCol]) {
    const el = $.colHeader.querySelector(map[state.sortCol]);
    el.classList.add("sorted");
    if (!state.sortAsc) el.classList.add("desc");
  }
}

// ── Virtual Scroll Track Rendering ──
export function renderTrackList() {
  const total = state.filteredTracks.length;

  if (total === 0 && state.currentTracks.length > 0) {
    $.emptyState.textContent = "No matching tracks";
    $.emptyState.style.display = "";
    $.viewport.style.display = "none";
    $.colHeader.style.display = "none";
    return;
  }
  if (total === 0) {
    $.emptyState.textContent = "No tracks";
    $.emptyState.style.display = "";
    $.viewport.style.display = "none";
    $.colHeader.style.display = "none";
    return;
  }

  $.emptyState.style.display = "none";
  $.viewport.style.display = "";
  $.colHeader.style.display = "";

  const hasDate = state.filteredTracks.some((t) => t.date);
  $.colHeader.querySelector(".col-date").style.display = hasDate ? "" : "none";
  const showSource = state.isDetailView || state.activeId === "all-playlists";
  $.colHeader.querySelector(".col-source").style.display = showSource ? "" : "none";

  $.runway.style.height = total * TRACK_ROW_H + "px";

  state.visibleRows.forEach((r) => r.el.remove());
  state.visibleRows = [];
  state.lastScrollTop = -1;

  $.viewport.scrollTop = 0;
  renderVisibleRows();
}

export function renderVisibleRows() {
  const scrollTop = $.viewport.scrollTop;
  const viewH = $.viewport.clientHeight;
  const total = state.filteredTracks.length;

  const startIdx = Math.max(
    0,
    Math.floor(scrollTop / TRACK_ROW_H) - RENDER_BUFFER,
  );
  const endIdx = Math.min(
    total,
    Math.ceil((scrollTop + viewH) / TRACK_ROW_H) + RENDER_BUFFER,
  );

  const needed = new Set();
  for (let i = startIdx; i < endIdx; i++) needed.add(i);

  state.visibleRows = state.visibleRows.filter((r) => {
    if (needed.has(r.idx)) {
      needed.delete(r.idx);
      return true;
    }
    r.el.remove();
    return false;
  });

  const hasDate = state.filteredTracks.some((t) => t.date);
  const showSource = state.isDetailView || state.activeId === "all-playlists";
  const showArt = getSettings().showAlbumArt;

  for (const idx of needed) {
    const t = state.filteredTracks[idx];
    const row = document.createElement("div");
    row.className = "track-row";
    row.style.top = idx * TRACK_ROW_H + "px";
    row.style.height = TRACK_ROW_H + "px";

    const numSpan = document.createElement("span");
    numSpan.className = "col-num";
    numSpan.textContent = idx + 1;

    const trackSpan = document.createElement("span");
    trackSpan.className = "col-track";

    if (t.uri && !t.local && getSettings().linkToSpotify) {
      const a = document.createElement("a");
      const trackId = t.uri.split(":").pop();
      const type = t.isAlbum ? "album" : "track";
      a.href = "https://open.spotify.com/" + type + "/" + trackId;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = t.name;
      trackSpan.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.className = t.local ? "local-track" : "";
      span.textContent = t.name;
      trackSpan.appendChild(span);
    }

    const artistSpan = document.createElement("span");
    artistSpan.className = "col-artist";
    artistSpan.textContent = t.artist;
    artistSpan.addEventListener("click", () => {
      if (state.activeId)
        state.navHistory.push({ type: "playlist", id: state.activeId });
      showArtist(t.artist);
    });

    const albumSpan = document.createElement("span");
    albumSpan.className = "col-album";
    albumSpan.textContent = t.album;
    if (t.album) {
      albumSpan.addEventListener("click", () => {
        if (state.activeId)
          state.navHistory.push({ type: "playlist", id: state.activeId });
        showAlbum(t.album, t.artist);
      });
    }

    const sourceSpan = document.createElement("span");
    sourceSpan.className = "col-source";
    sourceSpan.textContent = t.source || "";
    sourceSpan.style.display = showSource ? "" : "none";

    const dateSpan = document.createElement("span");
    dateSpan.className = "col-date";
    dateSpan.textContent = t.date || "";
    dateSpan.style.display = hasDate ? "" : "none";

    const playCell = document.createElement("span");
    playCell.className = "col-play";
    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.textContent = "\u25B6";
    playBtn.title = "Play on YouTube";
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPlayer(t);
    });
    playCell.appendChild(playBtn);

    if (showArt) {
      const artCell = document.createElement("span");
      artCell.className = "col-art";
      const img = document.createElement("img");
      img.alt = "";
      const cachedUrl = getAlbumArt(t, (url) => { img.src = url; img.classList.add("loaded"); });
      if (cachedUrl) { img.src = cachedUrl; img.classList.add("loaded"); }
      artCell.appendChild(img);
      artCell.appendChild(playBtn);
      row.appendChild(artCell);
    } else {
      row.appendChild(playCell);
    }
    row.appendChild(numSpan);
    row.appendChild(trackSpan);
    row.appendChild(artistSpan);
    row.appendChild(albumSpan);
    row.appendChild(sourceSpan);
    row.appendChild(dateSpan);

    $.runway.appendChild(row);
    state.visibleRows.push({ idx, el: row });
  }
}

// ── Catalog List ──
export function renderCatalogList() {
  const total = state.filteredCatalog.length;
  $.emptyState.style.display = total === 0 ? "" : "none";
  $.emptyState.textContent = "No matches";
  $.viewport.style.display = total === 0 ? "none" : "";

  $.runway.style.height = total * ROW_H + "px";

  state.visibleRows.forEach((r) => r.el.remove());
  state.visibleRows = [];
  state.lastScrollTop = -1;
  $.viewport.scrollTop = 0;
  renderVisibleCatalogRows();
}

export function renderVisibleCatalogRows() {
  const scrollTop = $.viewport.scrollTop;
  const viewH = $.viewport.clientHeight;
  const total = state.filteredCatalog.length;

  const startIdx = Math.max(
    0,
    Math.floor(scrollTop / ROW_H) - RENDER_BUFFER,
  );
  const endIdx = Math.min(
    total,
    Math.ceil((scrollTop + viewH) / ROW_H) + RENDER_BUFFER,
  );

  const needed = new Set();
  for (let i = startIdx; i < endIdx; i++) needed.add(i);

  state.visibleRows = state.visibleRows.filter((r) => {
    if (needed.has(r.idx)) {
      needed.delete(r.idx);
      return true;
    }
    r.el.remove();
    return false;
  });

  const isAlbumCatalog = state.catalogMode === "albums";

  for (const idx of needed) {
    const item = state.filteredCatalog[idx];
    const row = document.createElement("div");
    row.className = "track-row";
    row.style.top = idx * ROW_H + "px";
    row.style.cursor = "pointer";

    const numSpan = document.createElement("span");
    numSpan.className = "col-num";
    numSpan.textContent = idx + 1;

    const nameSpan = document.createElement("span");
    nameSpan.className = "col-track";
    nameSpan.textContent = item.name;
    nameSpan.style.color = "var(--text-bright)";

    row.appendChild(numSpan);
    row.appendChild(nameSpan);

    if (isAlbumCatalog) {
      const artistSpan = document.createElement("span");
      artistSpan.className = "col-artist";
      artistSpan.textContent = item.artist;
      artistSpan.style.cursor = "default";
      row.appendChild(artistSpan);
    }

    const countSpan = document.createElement("span");
    countSpan.className = "col-date";
    countSpan.style.display = "";
    countSpan.textContent = item.count + " tracks";

    row.appendChild(countSpan);

    row.addEventListener("click", () => {
      state.navHistory.push({ type: "catalog", mode: state.catalogMode });
      if (isAlbumCatalog) {
        showAlbum(item.name, item.artist);
      } else {
        showArtist(item.name);
      }
    });

    $.runway.appendChild(row);
    state.visibleRows.push({ idx, el: row });
  }
}

// ── Init (wires up event listeners that belong to render) ──
export function initRender() {
  $.trackFilter.addEventListener("input", () => {
    clearTimeout(state.filterTimer);
    state.filterTimer = setTimeout(refilter, 120);
  });

  $.dedupToggle.addEventListener("change", () => {
    refilter();
  });

  $.colHeader
    .querySelector(".col-track")
    .addEventListener("click", () => toggleSort("name"));
  $.colHeader
    .querySelector(".col-artist")
    .addEventListener("click", () => toggleSort("artist"));
  $.colHeader
    .querySelector(".col-album")
    .addEventListener("click", () => toggleSort("album"));
  $.colHeader
    .querySelector(".col-source")
    .addEventListener("click", () => toggleSort("source"));
  $.colHeader
    .querySelector(".col-date")
    .addEventListener("click", () => toggleSort("date"));
}
