let TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
let BASE_URL = 'https://doramasflix.co';
let EPISODE_PATH = null;
let UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function log() {
  let args = ['[DoramasFlix]'].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
}

function request(url, opts) {
  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      'Accept': opts && opts.json ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.5',
      'Referer': BASE_URL + '/'
    },
    redirect: 'follow'
  }).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    if (opts && opts.json) return res.json();
    return res.text();
  });
}

function slugify(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function decodeEntities(v) {
  return v.replace(/&amp;|&#0?38;|&#x26;/gi, '&').replace(/&quot;|&#0?34;|&#x22;/gi, '"').replace(/&#0?39;|&#x27;|&#x2f;/gi, function(m) { return /2f/i.test(m) ? '/' : "'"; });
}

function unescapeUrl(u) {
  return decodeEntities(u).replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\-/g, '-');
}

function titleTokens(t) {
  let stop = ['the','a','an','of','and','to','in','la','el','los','las','de','y'];
  return slugify(t).split('-').filter(function(x) { return x.length > 1 && stop.indexOf(x) < 0; });
}

function matchScore(slug, title) {
  let c = slugify(slug).replace(/-/g, '');
  let ct = slugify(title).replace(/-/g, '');
  if (c === ct) return 0;
  if (c.indexOf(ct) === 0) return 1;
  let tokens = titleTokens(title);
  let matched = tokens.filter(function(t) { return slugify(slug).split('-').indexOf(t) >= 0; });
  if (tokens.length > 0 && matched.length === tokens.length) return 2;
  return 99;
}

function collectLinks(html) {
  let links = [];
  let re = /<a[^>]+href="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = decodeEntities(m[1]);
    if (href.indexOf('/') === 0) href = BASE_URL + href;
    if (href.indexOf(BASE_URL) !== 0) continue;
    let path = href.slice(BASE_URL.length).split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');
    if (!path || path.split('/').length > 3) continue;
    if (/\/(category|tag|page|author|genero|generos|tipo|estado|letra|feed|wp-|login|register|contacto|dmca|aviso|pedido|donar)/i.test(path)) continue;
    if (/\.(png|jpe?g|gif|css|js|ico|svg|webp|mp4|m3u8)$/i.test(path)) continue;
    let slug = path.split('/').pop();
    if (!slug || slug.indexOf('-') < 0) continue;
    links.push({ href: BASE_URL + '/' + path, slug: slug });
  }
  return links;
}

function searchWpRest(title) {
  return request(BASE_URL + '/wp-json/wp/v2/search?search=' + encodeURIComponent(title) + '&per_page=5', { json: true }).then(function(items) {
    if (!Array.isArray(items)) return null;
    for (let i = 0; i < items.length; i++) {
      if (items[i] && items[i].url) {
        let slug = decodeURIComponent(items[i].url.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').pop() || '');
        if (slug) return items[i].url;
      }
    }
    return null;
  }).catch(function() { return null; });
}

function searchSite(title) {
  let url = BASE_URL + '/?s=' + encodeURIComponent(title);
  log('Searching: ' + url);
  return request(url).then(function(html) {
    let candidates = collectLinks(html);
    candidates.sort(function(a, b) { return matchScore(a.slug, title) - matchScore(b.slug, title); });
    if (candidates.length > 0 && matchScore(candidates[0].slug, title) < 99) {
      return candidates[0].href;
    }
    return searchWpRest(title).then(function(restUrl) {
      if (restUrl) return restUrl;
      let short = title.split(/[:\-–—]/)[0].trim();
      if (short && short.toLowerCase() !== title.toLowerCase()) {
        return request(BASE_URL + '/?s=' + encodeURIComponent(short)).then(function(html2) {
          let c2 = collectLinks(html2);
          c2.sort(function(a, b) { return matchScore(a.slug, title) - matchScore(b.slug, title); });
          if (c2.length > 0) return c2[0].href;
          return searchWpRest(short).then(function(r2) {
            if (r2) return r2;
            throw new Error('No result found');
          });
        });
      }
      throw new Error('No result found');
    });
  });
}

function resolveEpisodeUrl(detailUrl, episodeNum) {
  if (EPISODE_PATH) {
    let slug = detailUrl.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').pop();
    let path = EPISODE_PATH.replace('{slug}', slug).replace('{season}', '1').replace('{episode}', String(episodeNum));
    let candidate = path.indexOf('http') === 0 ? path : BASE_URL + path;
    return request(candidate).then(function() { return candidate; }).catch(function() {
      return scanForEpisode(detailUrl, episodeNum);
    });
  }
  return scanForEpisode(detailUrl, episodeNum);
}

function scanForEpisode(detailUrl, episodeNum) {
  return request(detailUrl).then(function(html) {
    let showSlug = detailUrl.replace(/\/+$/, '').split('/').pop();
    let showTokens = titleTokens(showSlug);
    let re = /href="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let href = decodeEntities(m[1]);
      if (href.indexOf('/') === 0) href = BASE_URL + href;
      if (href.indexOf(BASE_URL) !== 0) continue;
      let tail = href.replace(/\/+$/, '').split('/').pop();
      let tailSlug = slugify(tail);
      let sameShow = showTokens.length > 0 && showTokens.every(function(t) { return tailSlug.indexOf(t) >= 0; });
      if (!sameShow) continue;
      if (!/ver|episode|episodio|capitulo|watch|temporada/i.test(href)) continue;
      if (new RegExp('(^|[^0-9])0*' + episodeNum + '([^0-9]|$)').test(tail)) return href;
    }
    return null;
  });
}

function extractMediaUrls(html) {
  let urls = [];
  let seen = {};
  let re = /["'(](https?:\/\/[^"')\s]+?\.(?:m3u8|mp4)(?:\?[^"')\s]*)?)["')]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let u = unescapeUrl(m[1]);
    if (!seen[u]) { seen[u] = 1; urls.push(u); }
  }
  return urls;
}

function extractIframeUrls(html) {
  let urls = [];
  let seen = {};
  let re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let src = decodeEntities(m[1]);
    if (src.indexOf('//') === 0) src = 'https:' + src;
    if (/^https?:\/\//.test(src) && !seen[src]) { seen[src] = 1; urls.push(src); }
  }
  return urls;
}

function extractStreams(pageUrl) {
  let seen = {};
  let streams = [];
  return request(pageUrl).then(function(html) {
    let direct = extractMediaUrls(html);
    direct.forEach(function(u) {
      if (!seen[u]) {
        seen[u] = 1;
        streams.push({ name: 'DoramasFlix', title: 'Servidor principal', url: u, quality: 'Auto', headers: { 'Referer': BASE_URL + '/', 'User-Agent': UA } });
      }
    });
    let candidates = [];
    extractIframeUrls(html).forEach(function(u) { candidates.push({ url: u, label: 'Servidor' }); });
    let promises = candidates.slice(0, 5).map(function(c) {
      return request(c.url).then(function(embedHtml) {
        extractMediaUrls(embedHtml).forEach(function(u) {
          if (!seen[u]) {
            seen[u] = 1;
            streams.push({ name: 'DoramasFlix', title: c.label, url: u, quality: 'Auto', headers: { 'Referer': c.url, 'User-Agent': UA } });
          }
        });
      }).catch(function() { return null; });
    });
    return Promise.all(promises).then(function() { return streams; });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  log('getStreams tmdb=' + tmdbId + ' type=' + mediaType + ' season=' + season + ' episode=' + episode);
  let isTv = mediaType === 'tv' || mediaType === 'series';
  let endpoint = isTv ? 'tv' : 'movie';
  return request('https://api.themoviedb.org/3/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=es-ES', { json: true })
    .then(function(data) {
      let title = isTv ? data.name : data.title;
      if (!title) throw new Error('No title from TMDB');
      log('TMDB: ' + title);
      return searchSite(title);
    })
    .then(function(detailUrl) {
      if (isTv && episode) {
        return resolveEpisodeUrl(detailUrl, episode).then(function(epUrl) {
          return epUrl || detailUrl;
        });
      }
      return detailUrl;
    })
    .then(function(pageUrl) {
      return extractStreams(pageUrl);
    })
    .catch(function(err) {
      log('Error: ' + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };
