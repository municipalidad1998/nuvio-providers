const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const BASE_URL = 'https://flixlatam.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function log() {
  const args = ['[FlixLatam]'].concat(Array.prototype.slice.call(arguments));
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
  const stop = ['the','a','an','of','and','to','in','la','el','los','las','de','y'];
  return slugify(t).split('-').filter(function(x) { return x.length > 1 && stop.indexOf(x) < 0; });
}

function matchScore(slug, title) {
  const c = slugify(slug).replace(/-/g, '');
  const ct = slugify(title).replace(/-/g, '');
  if (c === ct) return 0;
  if (c.indexOf(ct) === 0) return 1;
  const tokens = titleTokens(title);
  const matched = tokens.filter(function(t) { return slugify(slug).split('-').indexOf(t) >= 0; });
  if (tokens.length > 0 && matched.length === tokens.length) return 2;
  return 99;
}

function collectSearchResults(html) {
  const results = [];
  const re = /<article[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]*)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = decodeEntities(m[1]);
    const title = m[2].trim();
    const year = m[3].trim();
    if (href.indexOf('/') === 0) href = BASE_URL + href;
    if (href.indexOf(BASE_URL) !== 0) continue;
    results.push({ url: href, title: title, year: year });
  }
  return results;
}

function searchSite(title) {
  const url = BASE_URL + '/search?s=' + encodeURIComponent(title);
  log('Searching: ' + url);
  return request(url).then(function(html) {
    const results = collectSearchResults(html);
    if (results.length === 0) throw new Error('No search results');
    
    let best = null;
    let bestScore = 99;
    
    for (let i = 0; i < results.length; i++) {
      const score = matchScore(results[i].url.split('/').pop(), title);
      if (score < bestScore) {
        bestScore = score;
        best = results[i];
      }
    }
    
    if (!best || bestScore >= 99) {
      const short = title.split(/[:\-–—]/)[0].trim();
      if (short && short.toLowerCase() !== title.toLowerCase()) {
        return searchSite(short);
      }
      throw new Error('No match found');
    }
    
    log('Best match: ' + best.url + ' (score: ' + bestScore + ')');
    return best.url;
  });
}

function extractPlayerUrls(html) {
  const urls = [];
  const seen = {};
  
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = iframeRe.exec(html)) !== null) {
    let src = decodeEntities(m[1]);
    if (src.indexOf('//') === 0) src = 'https:' + src;
    if (/^https?:\/\//.test(src) && !seen[src]) {
      seen[src] = 1;
      urls.push(src);
    }
  }
  
  const vidUrlRe = /href=["'](\/?vidurl\/[^"']+)["']/gi;
  while ((m = vidUrlRe.exec(html)) !== null) {
    let href = decodeEntities(m[1]);
    if (href.indexOf('/') === 0) href = BASE_URL + href;
    if (!seen[href]) {
      seen[href] = 1;
      urls.push(href);
    }
  }
  
  return urls;
}

function extractEpisodeUrls(html) {
  const episodes = [];
  const seen = {};
  
  const re = /href="([^"]*\/temporada\/(\d+)\/capitulo\/(\d+)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = decodeEntities(m[1]);
    if (href.indexOf('/') === 0) href = BASE_URL + href;
    if (href.indexOf(BASE_URL) !== 0) continue;
    
    const key = m[2] + '-' + m[3];
    if (!seen[key]) {
      seen[key] = 1;
      episodes.push({ url: href, season: parseInt(m[2]), episode: parseInt(m[3]) });
    }
  }
  
  return episodes;
}

function extractMediaUrls(html) {
  const urls = [];
  const seen = {};
  const re = /["'(](https?:\/\/[^"')\s]+?\.(?:m3u8|mp4)(?:\?[^"')\s]*)?)["')]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = unescapeUrl(m[1]);
    if (!seen[u]) { seen[u] = 1; urls.push(u); }
  }
  return urls;
}

function extractIframeUrls(html) {
  const urls = [];
  const seen = {};
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let src = decodeEntities(m[1]);
    if (src.indexOf('//') === 0) src = 'https:' + src;
    if (/^https?:\/\//.test(src) && !seen[src]) { seen[src] = 1; urls.push(src); }
  }
  return urls;
}

function extractStreams(pageUrl) {
  const seen = {};
  const streams = [];
  return request(pageUrl).then(function(html) {
    const direct = extractMediaUrls(html);
    direct.forEach(function(u) {
      if (!seen[u]) {
        seen[u] = 1;
        streams.push({ name: 'FlixLatam', title: 'Servidor principal', url: u, quality: 'Auto', headers: { 'Referer': BASE_URL + '/', 'User-Agent': UA } });
      }
    });
    
    const vidUrlRe = /(?:href|src)=["'](\/?vidurl\/[^"']+)["']/gi;
    let m;
    while ((m = vidUrlRe.exec(html)) !== null) {
      let href = decodeEntities(m[1]);
      if (href.indexOf('/') === 0) href = BASE_URL + href;
      if (!seen[href]) {
        seen[href] = 1;
        streams.push({ name: 'FlixLatam', title: 'Servidor externo', url: href, quality: 'Auto', headers: { 'Referer': pageUrl, 'User-Agent': UA } });
      }
    }
    
    const candidates = [];
    extractIframeUrls(html).forEach(function(u) { 
      if (u.indexOf('vidurl') === -1 && u.indexOf('embed69') === -1) {
        candidates.push({ url: u, label: 'Servidor' }); 
      }
    });
    
    const promises = candidates.slice(0, 5).map(function(c) {
      return request(c.url).then(function(embedHtml) {
        extractMediaUrls(embedHtml).forEach(function(u) {
          if (!seen[u]) {
            seen[u] = 1;
            streams.push({ name: 'FlixLatam', title: c.label, url: u, quality: 'Auto', headers: { 'Referer': c.url, 'User-Agent': UA } });
          }
        });
      }).catch(function() { return null; });
    });
    
    return Promise.all(promises).then(function() { return streams; });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  log('getStreams tmdb=' + tmdbId + ' type=' + mediaType + ' season=' + season + ' episode=' + episode);
  const isTv = mediaType === 'tv' || mediaType === 'series';
  const endpoint = isTv ? 'tv' : 'movie';

  return request('https://api.themoviedb.org/3/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=es-ES', { json: true })
    .then(function(data) {
      const title = isTv ? data.name : data.title;
      const imdbId = data.imdb_id;
      if (!title) throw new Error('No title from TMDB');
      log('TMDB: ' + title + ' IMDB: ' + imdbId);
      
      return searchSite(title).then(function(detailUrl) {
        return { detailUrl: detailUrl, imdbId: imdbId, title: title };
      });
    })
    .then(function(info) {
      if (isTv && episode) {
        return request(info.detailUrl).then(function(html) {
          const episodes = extractEpisodeUrls(html);
          let targetEp = null;
          for (let i = 0; i < episodes.length; i++) {
            if (episodes[i].season === season && episodes[i].episode === episode) {
              targetEp = episodes[i].url;
              break;
            }
          }
          if (targetEp) return targetEp;
          
          for (let i = 0; i < episodes.length; i++) {
            if (episodes[i].episode === episode) {
              return episodes[i].url;
            }
          }
          
          return info.detailUrl;
        });
      }
      
      if (info.imdbId) {
        const vidUrl = BASE_URL + '/vidurl/' + info.imdbId + '/';
        return request(vidUrl).then(function() { return vidUrl; }).catch(function() {
          return info.detailUrl;
        });
      }
      
      return info.detailUrl;
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
