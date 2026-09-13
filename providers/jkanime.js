/**
 * JKAnime - Nuvio Provider
 * Site: https://jkanime.net/*
 * Search: /?s={query}
 * Episode: /ver/{slug}-{episode}
 */
"use strict";

const TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
const BASE_URL = "https://jkanime.net";
const EPISODE_PATH = "/ver/{slug}-{episode}"; // null => resolved by scanning the detail page
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function log(...args) {
  console.log(`[jkanime]`, ...args);
}

async function makeRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        options.accept ||
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
      Referer: options.referer || BASE_URL + "/",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

async function getHtml(url, referer) {
  const res = await makeRequest(url, { referer });
  return res.text();
}

async function getJson(url) {
  const res = await makeRequest(url, { accept: "application/json" });
  return res.json();
}

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getTmdbInfo(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const data = await getJson(
    `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`
  );
  const title = mediaType === "tv" ? data.name : data.title;
  const year = (mediaType === "tv" ? data.first_air_date : data.release_date || "").substring(0, 4);
  if (!title) {
    throw new Error("Could not extract title from TMDB response");
  }
  log(`TMDB: "${title}" (${year})`);
  return { title, year, data };
}

function collectLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith("/")) href = BASE_URL + href;
    if (!href.startsWith(BASE_URL)) continue;
    const path = href
      .slice(BASE_URL.length)
      .split("?")[0]
      .split("#")[0]
      .replace(/^\/+|\/+$/g, "");
    if (!path || path.split("/").length > 3) continue;
    if (/\/(category|tag|page|author|genero|generos|tipo|estado|letra|feed|wp-|login|register|contacto|dmca|aviso|pedido|donar)/i.test(path)) continue;
    if (/\.(png|jpe?g|gif|css|js|ico|svg|webp|mp4|m3u8)$/i.test(path)) continue;
    const slug = path.split("/").pop();
    if (!slug || !slug.includes("-")) continue;
    links.push({ href: BASE_URL + "/" + path, slug });
  }
  return links;
}

// WordPress REST API fallback: works even on SPA themes built on WP
async function searchWpRest(title) {
  try {
    const url = `${BASE_URL}/wp-json/wp/v2/search?search=${encodeURIComponent(title)}&per_page=5`;
    log(`WP REST fallback: ${url}`);
    const items = await getJson(url);
    if (!Array.isArray(items)) return [];
    return items
      .filter((it) => it && it.url)
      .map((it) => ({ href: it.url, slug: decodeURIComponent(it.url.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop() || "") }))
      .filter((c) => c.slug);
  } catch (err) {
    log(`WP REST fallback failed: ${err.message}`);
    return [];
  }
}

async function searchSite(title) {
  const url = BASE_URL + "/?s={query}".replace("{query}", encodeURIComponent(title));
  log(`Searching: ${url}`);
  const html = await getHtml(url);
  const candidates = collectLinks(html);
  const score = (slug) => {
    const s = slugify(slug).replace(/-/g, "");
    const w = slugify(title).replace(/-/g, "");
    if (s === w) return 0;
    if (s.startsWith(w)) return 1;
    if (s.includes(w)) return 2;
    // token overlap: fewer unmatched tokens is better
    const tokens = slugify(title).split("-").filter(Boolean);
    const matched = tokens.filter((t) => s.includes(t)).length;
    if (matched === 0) return 9;
    return 3 + (1 - matched / tokens.length) * 5;
  };
  candidates.sort((a, b) => score(a.slug) - score(b.slug));
  let best = candidates.length > 0 ? candidates[0] : null;

  if (!best || score(best.slug) >= 9) {
    // Nothing matched on the HTML page: try WP REST API (covers SPA themes)
    const rest = await searchWpRest(title);
    if (rest.length > 0) {
      rest.sort((a, b) => score(a.slug) - score(b.slug));
      if (!best || score(rest[0].slug) < score(best.slug)) best = rest[0];
    }
  }

  // Retry with a shortened title when nothing matched (e.g. drop subtitles)
  if (!best || score(best.slug) >= 9) {
    const short = title.split(/[:\-–—]/)[0].trim();
    if (short && short.toLowerCase() !== title.toLowerCase()) {
      log(`No match, retrying with: "${short}"`);
      const html2 = await getHtml(
        BASE_URL + "/?s={query}".replace("{query}", encodeURIComponent(short))
      );
      const candidates2 = collectLinks(html2);
      if (candidates2.length > 0) {
        candidates2.sort((a, b) => score(a.slug) - score(b.slug));
        if (!best || score(candidates2[0].slug) < score(best.slug)) best = candidates2[0];
      } else {
        const rest2 = await searchWpRest(short);
        rest2.sort((a, b) => score(a.slug) - score(b.slug));
        if (rest2.length > 0 && (!best || score(rest2[0].slug) < score(best.slug))) best = rest2[0];
      }
    }
  }

  if (!best) {
    throw new Error("No results found on site search");
  }
  log(`Best match: ${best.href} (score ${score(best.slug)})`);
  return best.href;
}

async function resolveEpisodeUrl(detailUrl, seasonNum, episodeNum) {
  const tryScan = async () => {
    log(`Scanning detail page for episode ${episodeNum}...`);
    const html = await getHtml(detailUrl);
    const links = [];
    const re = /href="([^"]+)"/g;
    let m;
    const epNum = String(episodeNum);
    while ((m = re.exec(html)) !== null) {
      let href = m[1].replace(/&amp;/g, "&");
      if (href.startsWith("/")) href = BASE_URL + href;
      if (!href.startsWith(BASE_URL)) continue;
      if (!/ver|episode|episodio|capitulo|watch|temporada/i.test(href)) continue;
      const tail = href.replace(/\/+$/, "").split("/").pop();
      if (new RegExp(`(^|[^0-9])0*${epNum}(/|#|\\?|$)`).test(tail)) {
        links.push(href);
      }
    }
    if (links.length === 0) {
      log("No episode link found in detail page");
      return null;
    }
    log(`Episode link: ${links[0]}`);
    return links[0];
  };

  if (EPISODE_PATH) {
    const slug = detailUrl.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop();
    const path = EPISODE_PATH
      .replace("{slug}", slug)
      .replace("{season}", String(seasonNum))
      .replace("{episode}", String(episodeNum));
    const candidate = path.startsWith("http") ? path : BASE_URL + path;
    try {
      const res = await makeRequest(candidate);
      log(`Episode URL OK: ${candidate}`);
      return candidate;
    } catch (err) {
      log(`Episode URL failed (${err.message}), trying scan fallback`);
      return tryScan();
    }
  }
  return tryScan();
}

function unescapeUrl(url) {
  return url
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\-/g, "-");
}

function extractMediaUrls(html) {
  const urls = new Set();
  const re = /["'(](https?:\/\/[^"')\s]+?\.(?:m3u8|mp4)(?:\?[^"')\s]*)?)["')]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    urls.add(unescapeUrl(m[1]));
  }
  return [...urls];
}

function extractIframeUrls(html) {
  const urls = new Set();
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let src = m[1].replace(/&amp;/g, "&");
    if (src.startsWith("//")) src = "https:" + src;
    if (/^https?:\/\//.test(src)) urls.add(src);
  }
  return [...urls];
}

// Many WP anime themes hide server embeds in base64 data attributes:
// data-player / data-key / data-video / data-url
function extractBase64EmbedUrls(html) {
  const urls = new Set();
  const attrRe = /data-(?:player|key|video|url|src)="([A-Za-z0-9+/=]{8,})"/g;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], "base64").toString("utf8");
      if (/^https?:\/\//.test(decoded)) urls.add(unescapeUrl(decoded));
    } catch (e) {
      // invalid base64, skip
    }
  }
  // Some themes store a base64 prefix in data-key and a path in data-player
  const keyRe = /data-key="([A-Za-z0-9+/=]{8,})"[^>]*data-player="([A-Za-z0-9+/=_.-]{4,})"/g;
  while ((m = keyRe.exec(html)) !== null) {
    try {
      const prefix = Buffer.from(m[1], "base64").toString("utf8");
      if (/^https?:\/\//.test(prefix)) urls.add(unescapeUrl(prefix + m[2]));
    } catch (e) {
      // invalid base64, skip
    }
  }
  return [...urls];
}

// Themes like TioAnime define: var videos = [["Server","https://embed...",0,0], ...]
function extractVideosArrayEmbeds(html) {
  const out = [];
  const re = /\[\s*["']([^"']{1,40})["']\s*,\s*["'](https?:\/\/[^"']+)["']/g;
  let m;
  const clean = html.replace(/\\\//g, "/").replace(/\\"/g, '"');
  while ((m = re.exec(clean)) !== null) {
    out.push({ name: m[1], url: m[2] });
  }
  return out;
}

async function extractStreams(pageUrl) {
  const streams = [];
  const seen = new Set();

  const addStream = (url, label) => {
    if (seen.has(url)) return;
    seen.add(url);
    const q = url.match(/(\d{3,4})p/);
    streams.push({
      name: "JKAnime",
      title: label,
      url: url,
      quality: q ? q[1] + "p" : "Auto",
      type: "direct",
      headers: {
        Referer: BASE_URL + "/",
        "User-Agent": USER_AGENT,
      },
    });
  };

  const addEmbed = (url, label) => {
    if (seen.has(url)) return null;
    seen.add(url);
    let host = "embed";
    try {
      host = new URL(url).hostname;
    } catch (e) {
      // keep default
    }
    streams.push({
      name: "JKAnime",
      title: `${label} (${host})`,
      url: url,
      quality: "Embed",
      type: "direct",
      headers: {
        Referer: BASE_URL + "/",
        "User-Agent": USER_AGENT,
      },
    });
    return url;
  };

  const html = await getHtml(pageUrl);
  log(`Page length: ${html.length}`);

  // 1. Direct media in the page itself
  const direct = extractMediaUrls(html);
  direct.forEach((u) => addStream(u, "Servidor principal"));

  // 2. Candidate embed pages: iframes + base64 attrs + videos arrays
  const embedCandidates = [];
  extractIframeUrls(html).forEach((u) => embedCandidates.push({ url: u, label: "Servidor" }));
  extractBase64EmbedUrls(html).forEach((u) => embedCandidates.push({ url: u, label: "Servidor" }));
  extractVideosArrayEmbeds(html).forEach((v) =>
    embedCandidates.push({ url: v.url, label: v.name || "Servidor" })
  );
  log(`Found ${embedCandidates.length} embed candidate(s)`);

  const results = await Promise.allSettled(
    embedCandidates.slice(0, 8).map(async (c) => ({
      ...c,
      embedHtml: await getHtml(c.url, pageUrl),
    }))
  );
  let serverIdx = 1;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const label = `${r.value.label} ${++serverIdx}`;
    const media = extractMediaUrls(r.value.embedHtml);
    media.forEach((u) => addStream(u, label));
    // nested iframes inside embed pages
    const nested = extractIframeUrls(r.value.embedHtml).slice(0, 3);
    for (const n of nested) {
      try {
        extractMediaUrls(await getHtml(n, r.value.url)).forEach((u) => addStream(u, label));
      } catch (e) {
        // ignore unreachable nested iframes
      }
    }
  }

  // 3. Last resort: expose the embed pages themselves so they are at least visible
  if (streams.length === 0 && embedCandidates.length > 0) {
    log("No direct streams found; returning embed pages as fallback");
    embedCandidates.slice(0, 8).forEach((c) => addEmbed(c.url, c.label));
  }

  return streams;
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  log(`getStreams tmdb=${tmdbId} type=${mediaType} season=${seasonNum} episode=${episodeNum}`);
  try {
    const { title } = await getTmdbInfo(tmdbId, mediaType);
    const detailUrl = await searchSite(title);

    let pageUrl = detailUrl;
    if (mediaType === "tv" && episodeNum) {
      const epUrl = await resolveEpisodeUrl(detailUrl, seasonNum || 1, episodeNum);
      if (epUrl) {
        pageUrl = epUrl;
      } else {
        log("Falling back to detail page");
      }
    }

    const streams = await extractStreams(pageUrl);
    log(`Returning ${streams.length} stream(s)`);
    return streams;
  } catch (err) {
    console.error(`[jkanime] Error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };
