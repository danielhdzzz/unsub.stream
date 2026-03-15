import { sendNowPlaying, sendScrobble } from "./lastfm.js";

const WORKER_URL = "https://youtube-search-proxy.unsub.workers.dev";

const $ = {
  overlay: document.getElementById("player-overlay"),
  title: document.getElementById("player-title"),
  embed: document.getElementById("player-embed"),
  loading: document.getElementById("player-loading"),
  error: document.getElementById("player-error"),
  results: document.getElementById("player-results"),
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

// ── YT state change handler ──

function onStateChange(event) {
  const YT = window.YT;
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      playStartTime = Date.now();
      if (!nowPlayingSent && currentTrack) {
        nowPlayingSent = true;
        scrobbleTimestamp = Math.floor(Date.now() / 1000);
        sendNowPlaying(currentTrack);
      }
      // Grab duration from player if we don't have it
      if (currentDuration <= 0 && ytPlayer && ytPlayer.getDuration) {
        currentDuration = ytPlayer.getDuration();
      }
      break;
    case YT.PlayerState.PAUSED:
    case YT.PlayerState.BUFFERING:
      accumulate();
      checkScrobble();
      break;
    case YT.PlayerState.ENDED:
      accumulate();
      checkScrobble();
      break;
  }
}

// ── Public API ──

export function openPlayer(track) {
  $.overlay.style.display = "";
  $.title.textContent = track.artist + " \u2014 " + track.name;
  $.embed.innerHTML = "";
  $.results.innerHTML = "";
  $.error.style.display = "none";
  $.loading.style.display = "";

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
  $.results.innerHTML = "";
  $.loading.style.display = "none";
  $.error.style.display = "none";
  activeVideoId = null;
  currentTrack = null;
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
      playerVars: { autoplay: 1, rel: 0 },
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
