"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
const TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
const BASE_URL = "https://gambeta.vip";
const EPISODE_PATH = null;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
function log(...args) {
  console.log(`[gambeta]`, ...args);
}
function makeRequest(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const response = yield fetch(url, {
      method: options.method || "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
        Referer: options.referer || BASE_URL + "/"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
  });
}
function getHtml(url, referer) {
  return __async(this, null, function* () {
    const res = yield makeRequest(url, { referer });
    return res.text();
  });
}
function getJson(url) {
  return __async(this, null, function* () {
    const res = yield makeRequest(url, { accept: "application/json" });
    return res.json();
  });
}
function slugify(title) {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const data = yield getJson(
      `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`
    );
    const title = mediaType === "tv" ? data.name : data.title;
    const year = (mediaType === "tv" ? data.first_air_date : data.release_date || "").substring(0, 4);
    if (!title) {
      throw new Error("Could not extract title from TMDB response");
    }
    log(`TMDB: "${title}" (${year})`);
    return { title, year, data };
  });
}
function decodeEntities(value) {
  return value.replace(/&amp;|&#0?38;|&#x26;/gi, "&").replace(/&quot;|&#0?34;|&#x22;/gi, '"').replace(
    /&#0?39;|&#x27;|&#x2f;/gi,
    (match) => /2f/i.test(match) ? "/" : "'"
  );
}
function collectLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = decodeEntities(m[1]);
    if (href.startsWith("/"))
      href = BASE_URL + href;
    if (!href.startsWith(BASE_URL))
      continue;
    const path = href.slice(BASE_URL.length).split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "");
    if (!path || path.split("/").length > 3)
      continue;
    if (/\/(category|tag|page|author|genero|generos|tipo|estado|letra|feed|wp-|login|register|contacto|dmca|aviso|pedido|donar)/i.test(path))
      continue;
    if (/\.(png|jpe?g|gif|css|js|ico|svg|webp|mp4|m3u8)$/i.test(path))
      continue;
    const slug = path.split("/").pop();
    if (!slug || !slug.includes("-"))
      continue;
    links.push({ href: BASE_URL + "/" + path, slug });
  }
  return links;
}
function searchWpRest(title) {
  return __async(this, null, function* () {
    try {
      const url = `${BASE_URL}/wp-json/wp/v2/search?search=${encodeURIComponent(title)}&per_page=5`;
      log(`WP REST fallback: ${url}`);
      const items = yield getJson(url);
      if (!Array.isArray(items))
        return [];
      return items.filter((it) => it && it.url).map((it) => ({ href: it.url, slug: decodeURIComponent(it.url.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop() || "") })).filter((c) => c.slug);
    } catch (err) {
      log(`WP REST fallback failed: ${err.message}`);
      return [];
    }
  });
}
function titleTokens(title) {
  const stop = /* @__PURE__ */ new Set(["the", "a", "an", "of", "and", "to", "in", "la", "el", "los", "las", "de", "y"]);
  return slugify(title).split("-").filter((token) => token.length > 1 && !stop.has(token));
}
function matchScore(slug, title) {
  const candidate = slugify(slug);
  const compactCandidate = candidate.replace(/-/g, "");
  const compactTitle = slugify(title).replace(/-/g, "");
  const tokens = titleTokens(title);
  const matched = tokens.filter((token) => candidate.split("-").includes(token));
  if (compactCandidate === compactTitle)
    return 0;
  if (compactCandidate.startsWith(compactTitle))
    return 1;
  if (tokens.length > 0 && matched.length === tokens.length)
    return 2;
  return 99;
}
function searchSite(title) {
  return __async(this, null, function* () {
    const url = BASE_URL + "/?s={query}".replace("{query}", encodeURIComponent(title));
    log(`Searching: ${url}`);
    const html = yield getHtml(url);
    const candidates = collectLinks(html);
    const score = (slug) => matchScore(slug, title);
    candidates.sort((a, b) => score(a.slug) - score(b.slug));
    let best = candidates.length > 0 ? candidates[0] : null;
    if (!best || score(best.slug) >= 99) {
      const rest = yield searchWpRest(title);
      if (rest.length > 0) {
        rest.sort((a, b) => score(a.slug) - score(b.slug));
        if (!best || score(rest[0].slug) < score(best.slug))
          best = rest[0];
      }
    }
    if (!best || score(best.slug) >= 99) {
      const short = title.split(/[:\-–—]/)[0].trim();
      if (short && short.toLowerCase() !== title.toLowerCase()) {
        log(`No match, retrying with: "${short}"`);
        const html2 = yield getHtml(
          BASE_URL + "/?s={query}".replace("{query}", encodeURIComponent(short))
        );
        const candidates2 = collectLinks(html2);
        if (candidates2.length > 0) {
          candidates2.sort((a, b) => score(a.slug) - score(b.slug));
          if (!best || score(candidates2[0].slug) < score(best.slug))
            best = candidates2[0];
        } else {
          const rest2 = yield searchWpRest(short);
          rest2.sort((a, b) => score(a.slug) - score(b.slug));
          if (rest2.length > 0 && (!best || score(rest2[0].slug) < score(best.slug)))
            best = rest2[0];
        }
      }
    }
    if (!best || score(best.slug) >= 99) {
      throw new Error("No exact result found on site search");
    }
    log(`Best match: ${best.href} (score ${score(best.slug)})`);
    return best.href;
  });
}
function resolveEpisodeUrl(detailUrl, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    const showSlug = detailUrl.replace(/\/+$/, "").split("/").pop();
    const showTokens = titleTokens(showSlug);
    const tryScan = () => __async(this, null, function* () {
      log(`Scanning detail page for episode ${episodeNum}...`);
      const html = yield getHtml(detailUrl);
      const links = [];
      const re = /href="([^"]+)"/g;
      let m;
      const epNum = String(episodeNum);
      while ((m = re.exec(html)) !== null) {
        let href = decodeEntities(m[1]);
        if (href.startsWith("/"))
          href = BASE_URL + href;
        if (!href.startsWith(BASE_URL))
          continue;
        const tail = href.replace(/\/+$/, "").split("/").pop();
        const tailSlug = slugify(tail);
        const sameShow = showTokens.length > 0 && showTokens.every((token) => tailSlug.includes(token));
        if (!sameShow)
          continue;
        if (!/ver|episode|episodio|capitulo|watch|temporada/i.test(href))
          continue;
        const epPattern = new RegExp(`(^|[^0-9])0*${episodeNum}([^0-9]|$)`);
        if (epPattern.test(tail)) {
          links.push(href);
        }
      }
      if (links.length === 0) {
        log("No episode link found in detail page");
        return null;
      }
      log(`Episode link: ${links[0]}`);
      return links[0];
    });
    if (EPISODE_PATH) {
      const slug = detailUrl.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop();
      const path = EPISODE_PATH.replace("{slug}", slug).replace("{season}", String(seasonNum)).replace("{episode}", String(episodeNum));
      const candidate = path.startsWith("http") ? path : BASE_URL + path;
      try {
        const res = yield makeRequest(candidate);
        log(`Episode URL OK: ${candidate}`);
        return candidate;
      } catch (err) {
        log(`Episode URL failed (${err.message}), trying scan fallback`);
        return tryScan();
      }
    }
    return tryScan();
  });
}
function unescapeUrl(url) {
  return decodeEntities(url).replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/\\-/g, "-");
}
function decodeBase64(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let bits = 0;
  let buffer = 0;
  let output = "";
  const input = value.replace(/[^A-Za-z0-9+/=]/g, "");
  for (let i = 0; i < input.length; i += 1) {
    const code = alphabet.indexOf(input.charAt(i));
    if (code < 0 || code === 64)
      continue;
    buffer = buffer << 6 | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode(buffer >> bits & 255);
    }
  }
  return output;
}
function extractMediaUrls(html) {
  const urls = /* @__PURE__ */ new Set();
  const re = /["'(](https?:\/\/[^"')\s]+?\.(?:m3u8|mp4)(?:\?[^"')\s]*)?)["')]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    urls.add(unescapeUrl(m[1]));
  }
  return [...urls];
}
function extractIframeUrls(html) {
  const urls = /* @__PURE__ */ new Set();
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let src = decodeEntities(m[1]);
    if (src.startsWith("//"))
      src = "https:" + src;
    if (/^https?:\/\//.test(src))
      urls.add(src);
  }
  return [...urls];
}
function extractBase64EmbedUrls(html) {
  const urls = /* @__PURE__ */ new Set();
  const attrRe = /data-(?:player|key|video|url|src)="([A-Za-z0-9+/=]{8,})"/g;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    try {
      const decoded = decodeBase64(m[1]);
      if (/^https?:\/\//.test(decoded))
        urls.add(unescapeUrl(decoded));
    } catch (e) {
    }
  }
  const keyRe = /data-key="([A-Za-z0-9+/=]{8,})"[^>]*data-player="([A-Za-z0-9+/=_.-]{4,})"/g;
  while ((m = keyRe.exec(html)) !== null) {
    try {
      const prefix = decodeBase64(m[1]);
      if (/^https?:\/\//.test(prefix))
        urls.add(unescapeUrl(prefix + m[2]));
    } catch (e) {
    }
  }
  return [...urls];
}
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
function getOrigin(url) {
  const match = /^(https?:\/\/[^/]+)/i.exec(url);
  return match ? match[1] + "/" : BASE_URL + "/";
}
function extractStreams(pageUrl) {
  return __async(this, null, function* () {
    const streams = [];
    const seen = /* @__PURE__ */ new Set();
    const addStream = (url, label, sourceUrl) => {
      if (!/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url))
        return;
      if (seen.has(url))
        return;
      seen.add(url);
      const q = url.match(/(\d{3,4})p/);
      streams.push({
        name: "Gambeta",
        title: label,
        url,
        quality: q ? q[1] + "p" : "Auto",
        type: "direct",
        headers: {
          Referer: getOrigin(sourceUrl || pageUrl),
          "User-Agent": USER_AGENT
        }
      });
    };
    const html = yield getHtml(pageUrl);
    log(`Page length: ${html.length}`);
    const direct = extractMediaUrls(html);
    direct.forEach((u) => addStream(u, "Servidor principal"));
    const embedCandidates = [];
    extractIframeUrls(html).forEach((u) => embedCandidates.push({ url: u, label: "Servidor" }));
    extractBase64EmbedUrls(html).forEach((u) => embedCandidates.push({ url: u, label: "Servidor" }));
    extractVideosArrayEmbeds(html).forEach(
      (v) => embedCandidates.push({ url: v.url, label: v.name || "Servidor" })
    );
    log(`Found ${embedCandidates.length} embed candidate(s)`);
    const results = yield Promise.allSettled(
      embedCandidates.slice(0, 8).map((c) => __async(this, null, function* () {
        return __spreadProps(__spreadValues({}, c), {
          embedHtml: yield getHtml(c.url, pageUrl)
        });
      }))
    );
    let serverIdx = 1;
    for (const r of results) {
      if (r.status !== "fulfilled")
        continue;
      const label = `${r.value.label} ${++serverIdx}`;
      const media = extractMediaUrls(r.value.embedHtml);
      media.forEach((u) => addStream(u, label, r.value.url));
      const nested = extractIframeUrls(r.value.embedHtml).slice(0, 3);
      for (const n of nested) {
        try {
          extractMediaUrls(yield getHtml(n, r.value.url)).forEach((u) => addStream(u, label, n));
        } catch (e) {
        }
      }
    }
    return streams;
  });
}
function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  return __async(this, null, function* () {
    log(`getStreams tmdb=${tmdbId} type=${mediaType} season=${seasonNum} episode=${episodeNum}`);
    try {
      const { title } = yield getTmdbInfo(tmdbId, mediaType);
      const detailUrl = yield searchSite(title);
      let pageUrl = detailUrl;
      if (mediaType === "tv" && episodeNum) {
        const epUrl = yield resolveEpisodeUrl(detailUrl, seasonNum || 1, episodeNum);
        if (epUrl) {
          pageUrl = epUrl;
        } else {
          log("Falling back to detail page");
        }
      }
      const streams = yield extractStreams(pageUrl);
      log(`Returning ${streams.length} stream(s)`);
      return streams;
    } catch (err) {
      console.error(`[gambeta] Error: ${err.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
