"use strict";
var __defProp = Object.defineProperty;
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
const BASE_URL = "https://sololatino.net";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
function log(...args) {
  console.log("[sololatino]", ...args);
}
function decodeEntities(value) {
  return value.replace(/&amp;|&#0?38;|&#x26;/gi, "&").replace(/&quot;|&#0?34;|&#x22;/gi, '"');
}
function slugify(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function request(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const response = yield fetch(url, {
      method: options.method || "GET",
      headers: __spreadValues({
        "User-Agent": USER_AGENT,
        Accept: options.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9"
      }, options.headers || {}),
      redirect: "follow",
      body: options.body
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status} for ${url}`);
    return response;
  });
}
function tmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const response = yield request(
      `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
      { accept: "application/json" }
    );
    const data = yield response.json();
    const title = mediaType === "tv" ? data.name : data.title;
    if (!title)
      throw new Error("TMDB title not found");
    return { title, data };
  });
}
function titleMatch(title, item) {
  const wanted = slugify(title);
  const candidate = slugify(item.title || item.url || "");
  if (candidate === wanted)
    return 0;
  if (candidate.includes(wanted) || wanted.includes(candidate))
    return 1;
  const tokens = wanted.split("-").filter((x) => x.length > 2);
  const matched = tokens.filter((x) => candidate.includes(x)).length;
  return tokens.length && matched === tokens.length ? 2 : 99;
}
function searchSite(title, mediaType) {
  return __async(this, null, function* () {
    const response = yield request(
      `${BASE_URL}/api/search/suggest?q=${encodeURIComponent(title)}`,
      { accept: "application/json" }
    );
    const items = yield response.json();
    const wantedType = mediaType === "tv" ? ["series", "anime"] : ["movie"];
    const candidates = (Array.isArray(items) ? items : []).filter((item) => item && item.url && wantedType.includes(item.type)).sort((a, b) => titleMatch(title, a) - titleMatch(title, b));
    if (!candidates.length || titleMatch(title, candidates[0]) >= 99) {
      throw new Error("No exact result on SoloLatino search");
    }
    log(`Match: ${candidates[0].title} -> ${candidates[0].url}`);
    return candidates[0].url;
  });
}
function setCookieHeader(existing, response) {
  let values = [];
  if (response.headers && response.headers.getSetCookie) {
    values = response.headers.getSetCookie();
  } else if (response.headers) {
    const value = response.headers.get("set-cookie");
    if (value)
      values = [value];
  }
  const map = {};
  for (const part of String(existing || "").split(";")) {
    const pair = part.trim().split("=");
    if (pair.length > 1)
      map[pair[0]] = pair.slice(1).join("=");
  }
  for (const value of values) {
    const first = value.split(";")[0];
    const pair = first.split("=");
    if (pair.length > 1)
      map[pair[0]] = pair.slice(1).join("=");
  }
  return Object.keys(map).map((key) => `${key}=${map[key]}`).join("; ");
}
function cookieValue(cookie, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie || "");
  return match ? decodeURIComponent(match[1]) : "";
}
function extractServers(html) {
  const servers = [];
  const re = /<button[^>]+data-server-btn[^>]+data-player-token=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const label = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    servers.push({ token: match[1], label: label || "Servidor" });
  }
  return servers;
}
function resolveServers(pageUrl) {
  return __async(this, null, function* () {
    let cookies = "";
    const csrfResponse = yield request(`${BASE_URL}/sanctum/csrf-cookie`);
    cookies = setCookieHeader(cookies, csrfResponse);
    const pageResponse = yield request(pageUrl, {
      headers: { Cookie: cookies, Referer: BASE_URL + "/" }
    });
    cookies = setCookieHeader(cookies, pageResponse);
    const html = yield pageResponse.text();
    const csrfMatch = /meta name=["']csrf-token["'] content=["']([^"']+)["']/i.exec(html);
    const csrf = csrfMatch ? csrfMatch[1] : "";
    const xsrf = cookieValue(cookies, "XSRF-TOKEN");
    const servers = extractServers(html);
    const streams = [];
    for (const server of servers.slice(0, 8)) {
      try {
        const response = yield request(`${BASE_URL}/api/player-url`, {
          method: "POST",
          headers: {
            Cookie: cookies,
            Referer: pageUrl,
            Origin: BASE_URL,
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": xsrf,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ t: server.token })
        });
        const data = yield response.json();
        if (!data || !data.url || !/^https?:\/\//i.test(data.url))
          continue;
        const type = data.type === "mp4" ? "direct" : "iframe";
        streams.push({
          name: "SoloLatino",
          title: server.label,
          url: decodeEntities(data.url),
          quality: type === "direct" ? "Auto" : "Embed",
          type,
          headers: { Referer: pageUrl, "User-Agent": USER_AGENT }
        });
      } catch (error) {
        log(`Server ${server.label} failed: ${error.message}`);
      }
    }
    return streams;
  });
}
function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  return __async(this, null, function* () {
    try {
      const { title } = yield tmdbInfo(tmdbId, mediaType);
      const detailUrl = yield searchSite(title, mediaType);
      let pageUrl = detailUrl;
      if (mediaType === "tv" && episodeNum) {
        const slug = detailUrl.replace(/\/+$/, "").split("/").pop();
        pageUrl = `${BASE_URL}/serie/${slug}/temporada-${seasonNum || 1}/episodio-${episodeNum}`;
      }
      const streams = yield resolveServers(pageUrl);
      log(`Returning ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error("[sololatino] Error:", error.message);
      return [];
    }
  });
}
module.exports = { getStreams };
