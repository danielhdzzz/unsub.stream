const ALLOWED_ORIGINS = [
  "https://unsub.stream",
  "https://danielhdzzz.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://localhost:8888",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.find((o) => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

// ── MD5 (RFC 1321) ──

function md5(string) {
  const k = [],
    s = [];
  (function () {
    for (let i = 0; i < 64; i++) {
      k[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }
    const S = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4,
      11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6,
      10, 15, 21,
    ];
    for (let i = 0; i < 64; i++) s[i] = S[i];
  })();

  const bytes = new TextEncoder().encode(string);
  let len = bytes.length;
  // Padding
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bits >>> 0, true);
  view.setUint32(padded.length - 4, (bits / 0x100000000) >>> 0, true);

  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(offset + j * 4, true);
    let A = a0,
      B = b0,
      C = c0,
      D = d0;

    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) {
        f = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        f = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        f = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      f = (f + A + k[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((f << s[i]) | (f >>> (32 - s[i])))) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const hex = (n) =>
    Array.from({ length: 4 }, (_, i) =>
      ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0"),
    ).join("");
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

function makeApiSig(params, secret) {
  const keys = Object.keys(params).sort();
  let str = "";
  for (const k of keys) str += k + params[k];
  str += secret;
  return md5(str);
}

// ── Last.fm helpers ──

async function lastfmPost(params, env) {
  params.api_key = env.LASTFM_API_KEY;
  params.api_sig = makeApiSig(params, env.LASTFM_SECRET);
  params.format = "json";

  const body = new URLSearchParams(params);
  const res = await fetch("https://ws.audioscrobbler.com/2.0/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return res.json();
}

// ── Route handlers ──

const CACHE_TTL = 60 * 60 * 24 * 365; // 1 year

function normalizeQuery(q) {
  return q
    .replace(/\s*[\(\[][^)\]]*(?:feat\.?|ft\.?|with\s)[^)\]]*[\)\]]/gi, "")
    .replace(
      /\s*[\(\[][^)\]]*(?:remaster|version|deluxe|edition|edit|live|acoustic|demo|bonus\s*track|explicit|clean)[^)\]]*[\)\]]/gi,
      "",
    )
    .replace(/\s+-\s+.+$/, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function cacheKey(query) {
  return "yt:" + normalizeQuery(query);
}

async function handleSearch(url, env, request, ctx) {
  const query = url.searchParams.get("q");
  if (!query) {
    return jsonResponse({ error: "Missing q parameter" }, 400, request);
  }

  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "API key not configured" }, 500, request);
  }

  // Check KV cache first
  const key = cacheKey(query);
  if (env.YT_CACHE) {
    try {
      const cached = await env.YT_CACHE.get(key, "json");
      if (cached) {
        return jsonResponse({ results: cached, cached: true }, 200, request);
      }
    } catch {}
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "6");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      return jsonResponse(
        { error: "YouTube search failed" },
        searchRes.status,
        request,
      );
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) {
      return jsonResponse({ results: [] }, 200, request);
    }

    const results = items.map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url,
    }));

    // Store in KV cache (non-blocking)
    if (env.YT_CACHE && results.length > 0) {
      ctx.waitUntil(
        env.YT_CACHE.put(key, JSON.stringify(results), {
          expirationTtl: CACHE_TTL,
        }),
      );
    }

    return jsonResponse({ results }, 200, request);
  } catch (e) {
    return jsonResponse({ error: "Internal error" }, 500, request);
  }
}

function handleLastfmAuth(url, env, request) {
  const cb = url.searchParams.get("cb") || "";
  if (!env.LASTFM_API_KEY) {
    return jsonResponse({ error: "Last.fm not configured" }, 500, request);
  }
  const authUrl =
    "https://www.last.fm/api/auth/?api_key=" +
    encodeURIComponent(env.LASTFM_API_KEY) +
    "&cb=" +
    encodeURIComponent(cb);
  return jsonResponse({ url: authUrl }, 200, request);
}

async function handleLastfmSession(request, env) {
  try {
    const { token } = await request.json();
    if (!token) return jsonResponse({ error: "Missing token" }, 400, request);

    const data = await lastfmPost({ method: "auth.getSession", token }, env);

    if (data.error) {
      return jsonResponse(
        { error: data.message || "Auth failed" },
        400,
        request,
      );
    }

    const session = data.session;
    return jsonResponse({ key: session.key, name: session.name }, 200, request);
  } catch (e) {
    return jsonResponse({ error: "Internal error" }, 500, request);
  }
}

async function handleLastfmNowPlaying(request, env) {
  try {
    const { sk, track, artist, album } = await request.json();
    if (!sk || !track || !artist) {
      return jsonResponse({ error: "Missing fields" }, 400, request);
    }

    const params = {
      method: "track.updateNowPlaying",
      sk,
      track,
      artist,
    };
    if (album) params.album = album;

    const data = await lastfmPost(params, env);
    return jsonResponse(data, 200, request);
  } catch (e) {
    return jsonResponse({ error: "Internal error" }, 500, request);
  }
}

async function handleLastfmScrobble(request, env) {
  try {
    const { sk, track, artist, album, timestamp } = await request.json();
    if (!sk || !track || !artist || !timestamp) {
      return jsonResponse({ error: "Missing fields" }, 400, request);
    }

    const params = {
      method: "track.scrobble",
      sk,
      track,
      artist,
      timestamp: String(timestamp),
    };
    if (album) params.album = album;

    const data = await lastfmPost(params, env);
    return jsonResponse(data, 200, request);
  } catch (e) {
    return jsonResponse({ error: "Internal error" }, 500, request);
  }
}

// ── Main handler ──

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/search") return handleSearch(url, env, request, ctx);
    if (url.pathname === "/lastfm/auth")
      return handleLastfmAuth(url, env, request);
    if (url.pathname === "/lastfm/session" && request.method === "POST")
      return handleLastfmSession(request, env);
    if (url.pathname === "/lastfm/nowplaying" && request.method === "POST")
      return handleLastfmNowPlaying(request, env);
    if (url.pathname === "/lastfm/scrobble" && request.method === "POST")
      return handleLastfmScrobble(request, env);

    return jsonResponse({ error: "Not found" }, 404, request);
  },
};
