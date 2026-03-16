import { sendNowPlaying, sendScrobble } from "./lastfm.js";
import { getAlbumArt } from "./albumart.js";

const WORKER_URL = "https://youtube-search-proxy.unsub.workers.dev";

const $ = {
  bar: document.getElementById("player-bar"),
  title: document.getElementById("player-title"),
  artistAlbum: document.getElementById("player-artist-album"),
  art: document.getElementById("player-art"),
  embed: document.getElementById("player-embed"),
  loading: document.getElementById("player-loading"),
  error: document.getElementById("player-error"),
  results: document.getElementById("player-results"),
  progressFill: document.getElementById("player-progress-fill"),
  seek: document.getElementById("player-seek"),
  time: document.getElementById("player-time"),
  playPause: document.getElementById("player-play-pause"),
  prevBtn: document.getElementById("player-prev"),
  nextBtn: document.getElementById("player-next"),
  shuffleBtn: document.getElementById("player-shuffle"),
  closeBtn: document.getElementById("player-close"),
  videoToggle: document.getElementById("player-video-toggle"),
  resultsPanel: document.getElementById("player-results-panel"),
  resultsClose: document.getElementById("player-results-close"),
};

// ── YouTube IFrame API ──

const ytReady = new Promise((resolve) => {
  if (window.YT && window.YT.Player) {
    resolve();
    return;
  }
  window.onYouTubeIframeAPIReady = resolve;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
});

let ytPlayer = null;
let activeVideoId = null;
let onTrackEnded = null;
let onPrevTrack = null;
let shuffle = false;
let progressRAF = null;
let seeking = false;
let panelDismissed = false;

// ── Scrobble state ──

let currentTrack = null;
let currentDuration = 0; // seconds
let playStartTime = 0;
let accumulatedMs = 0;
let scrobbled = false;
let nowPlayingSent = false;
let scrobbleTimestamp = 0;

function resetScrobbleState() {
  currentDuration = 0;
  playStartTime = 0;
  accumulatedMs = 0;
  scrobbled = false;
  nowPlayingSent = false;
  scrobbleTimestamp = 0;
}

function accumulate() {
  if (playStartTime > 0) {
    accumulatedMs += Date.now() - playStartTime;
    playStartTime = 0;
  }
}

function checkScrobble() {
  if (scrobbled || !currentTrack) return;
  const dur = currentDuration || (ytPlayer && ytPlayer.getDuration ? ytPlayer.getDuration() : 0);
  if (dur <= 0) return;
  const threshold = Math.min(dur / 2, 240) * 1000;
  if (accumulatedMs >= threshold) {
    scrobbled = true;
    sendScrobble(currentTrack, scrobbleTimestamp);
  }
}

function parseDurationToSeconds(str) {
  if (!str) return 0;
  const parts = str.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function decodeHtml(html) {
  const el = document.createElement("textarea");
  el.innerHTML = html;
  return el.value;
}

// ── Progress bar ──

function formatTime(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

function startProgressLoop() {
  cancelAnimationFrame(progressRAF);
  function update() {
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
      const cur = ytPlayer.getCurrentTime();
      const dur = ytPlayer.getDuration();
      if (dur > 0 && !seeking) {
        const pct = (cur / dur) * 100;
        $.progressFill.style.width = pct + "%";
        $.seek.value = Math.round((cur / dur) * 1000);
        $.time.textContent = formatTime(cur) + " / " + formatTime(dur);
      }
    }
    progressRAF = requestAnimationFrame(update);
  }
  progressRAF = requestAnimationFrame(update);
}

function stopProgressLoop() {
  cancelAnimationFrame(progressRAF);
  progressRAF = null;
}

// ── Show / hide bar ──

function showBar() {
  $.bar.style.display = "";
  document.documentElement.style.setProperty("--player-h", "calc(7 * var(--unit))");
}

function hideBar() {
  $.bar.style.display = "none";
  document.documentElement.style.setProperty("--player-h", "0px");
}

// ── YT state change handler ──

function onStateChange(event) {
  const YT = window.YT;
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      playStartTime = Date.now();
      $.playPause.innerHTML = "&#x23F8;";
      startProgressLoop();
      if (!nowPlayingSent && currentTrack) {
        nowPlayingSent = true;
        scrobbleTimestamp = Math.floor(Date.now() / 1000);
        sendNowPlaying(currentTrack);
      }
      if (currentDuration <= 0 && ytPlayer && ytPlayer.getDuration) {
        currentDuration = ytPlayer.getDuration();
      }
      break;
    case YT.PlayerState.PAUSED:
      $.playPause.innerHTML = "&#x25B6;";
      accumulate();
      checkScrobble();
      stopProgressLoop();
      break;
    case YT.PlayerState.BUFFERING:
      accumulate();
      checkScrobble();
      break;
    case YT.PlayerState.ENDED:
      $.playPause.innerHTML = "&#x25B6;";
      accumulate();
      checkScrobble();
      stopProgressLoop();
      if (onTrackEnded) onTrackEnded(currentTrack);
      break;
  }
}

// ── Public API ──

export function openPlayer(track) {
  showBar();
  $.title.textContent = track.name;
  $.artistAlbum.textContent = track.artist + (track.album ? " \u2014 " + track.album : "");
  $.art.src = "";
  $.art.classList.remove("loaded");
  const cachedUrl = getAlbumArt(track, (url) => { $.art.src = url; $.art.classList.add("loaded"); });
  if (cachedUrl) { $.art.src = cachedUrl; $.art.classList.add("loaded"); }
  $.embed.innerHTML = "";
  $.results.innerHTML = "";
  $.error.style.display = "none";
  $.loading.style.display = "";
  $.playPause.innerHTML = "&#x25B6;";
  $.progressFill.style.width = "0%";
  $.seek.value = 0;
  $.time.textContent = "0:00 / 0:00";
  if (!panelDismissed) {
    $.resultsPanel.style.display = "";
    $.videoToggle.classList.add("active");
  }

  // Finalize any previous track
  finalizeCurrentTrack();
  activeVideoId = null;
  currentTrack = track;
  resetScrobbleState();

  const query = track.artist + " " + track.name;
  fetch(WORKER_URL + "/search?q=" + encodeURIComponent(query))
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      $.loading.style.display = "none";
      if (data.error) {
        showError(data.error);
        return;
      }
      if (!data.results || data.results.length === 0) {
        showError("No YouTube results found for this track.");
        return;
      }
      const first = data.results[0];
      currentDuration = parseDurationToSeconds(first.duration);
      playVideo(first.videoId);
      renderResults(data.results);
    })
    .catch(() => {
      $.loading.style.display = "none";
      showError("Could not search YouTube. Try again later.");
    });
}

export function closePlayer() {
  finalizeCurrentTrack();
  destroyPlayer();
  stopProgressLoop();
  $.results.innerHTML = "";
  $.loading.style.display = "none";
  $.error.style.display = "none";
  activeVideoId = null;
  currentTrack = null;
  closeResultsPanel();
  panelDismissed = false;
  hideBar();
}

export function togglePlayPause() {
  if (!ytPlayer || !ytPlayer.getPlayerState) return;
  const YT = window.YT;
  const s = ytPlayer.getPlayerState();
  if (s === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

export function nextTrack() {
  if (onTrackEnded && currentTrack) onTrackEnded(currentTrack);
}

export function previousTrack() {
  if (onPrevTrack && currentTrack) onPrevTrack(currentTrack);
}

export function setOnTrackEnded(cb) {
  onTrackEnded = cb;
}

export function setOnPrevTrack(cb) {
  onPrevTrack = cb;
}

export function isShuffle() {
  return shuffle;
}

export function toggleShuffle() {
  shuffle = !shuffle;
  $.shuffleBtn.classList.toggle("active", shuffle);
  return shuffle;
}

export function getCurrentTrack() {
  return currentTrack;
}

export function isResultsPanelOpen() {
  return $.resultsPanel.style.display !== "none";
}

export function closeResultsPanel() {
  $.resultsPanel.style.display = "none";
  $.videoToggle.classList.remove("active");
  panelDismissed = true;
}

function finalizeCurrentTrack() {
  accumulate();
  checkScrobble();
}

function destroyPlayer() {
  if (ytPlayer) {
    try { ytPlayer.destroy(); } catch {}
    ytPlayer = null;
  }
  $.embed.innerHTML = "";
}

function showError(msg) {
  $.error.textContent = msg;
  $.error.style.display = "";
}

function playVideo(videoId) {
  // If switching videos, finalize the previous one
  if (activeVideoId && activeVideoId !== videoId) {
    finalizeCurrentTrack();
    resetScrobbleState();
  }

  activeVideoId = videoId;
  destroyPlayer();

  const div = document.createElement("div");
  div.id = "yt-player-target";
  $.embed.appendChild(div);

  ytReady.then(() => {
    ytPlayer = new YT.Player("yt-player-target", {
      videoId,
      playerVars: { autoplay: 1, rel: 0, controls: 0 },
      events: { onStateChange },
    });
  });

  highlightActive(videoId);
}

function renderResults(results) {
  $.results.innerHTML = "";
  for (const r of results) {
    const row = document.createElement("div");
    row.className = "player-result";
    row.dataset.id = r.videoId;

    const thumb = document.createElement("img");
    thumb.className = "player-result-thumb";
    thumb.src = r.thumbnail;
    thumb.alt = "";
    thumb.loading = "lazy";

    const info = document.createElement("div");
    info.className = "player-result-info";

    const title = document.createElement("div");
    title.className = "player-result-title";
    title.textContent = decodeHtml(r.title);

    const meta = document.createElement("div");
    meta.className = "player-result-meta";
    meta.textContent = r.channel + (r.duration ? " \u00b7 " + r.duration : "");

    info.appendChild(title);
    info.appendChild(meta);
    row.appendChild(thumb);
    row.appendChild(info);

    const duration = parseDurationToSeconds(r.duration);
    row.addEventListener("click", () => {
      // Switching to a different result — finalize + reset
      finalizeCurrentTrack();
      resetScrobbleState();
      currentDuration = duration;
      playVideo(r.videoId);
    });

    $.results.appendChild(row);
  }
  highlightActive(activeVideoId);
}

function highlightActive(videoId) {
  for (const el of $.results.querySelectorAll(".player-result")) {
    el.classList.toggle("active", el.dataset.id === videoId);
  }
}

// ── Wire controls ──

$.playPause.addEventListener("click", togglePlayPause);
$.nextBtn.addEventListener("click", nextTrack);
$.prevBtn.addEventListener("click", previousTrack);
$.shuffleBtn.addEventListener("click", () => toggleShuffle());
$.closeBtn.addEventListener("click", closePlayer);

$.videoToggle.addEventListener("click", () => {
  if ($.resultsPanel.style.display === "none") {
    $.resultsPanel.style.display = "";
    $.videoToggle.classList.add("active");
  } else {
    closeResultsPanel();
  }
});

$.resultsClose.addEventListener("click", closeResultsPanel);

// ── Seek ──

$.seek.addEventListener("input", () => {
  seeking = true;
  const pct = $.seek.value / 1000;
  $.progressFill.style.width = (pct * 100) + "%";
  if (ytPlayer && ytPlayer.getDuration) {
    const dur = ytPlayer.getDuration();
    if (dur > 0) {
      $.time.textContent = formatTime(pct * dur) + " / " + formatTime(dur);
    }
  }
});

$.seek.addEventListener("change", () => {
  if (ytPlayer && ytPlayer.seekTo && ytPlayer.getDuration) {
    const dur = ytPlayer.getDuration();
    if (dur > 0) {
      ytPlayer.seekTo(($.seek.value / 1000) * dur, true);
    }
  }
  // Delay unsetting so the rAF loop doesn't read stale getCurrentTime()
  setTimeout(() => { seeking = false; }, 200);
});
