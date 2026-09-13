let TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
let BASE_URL = 'https://sololatino.net';
let UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function log() {
  let args = ['[SoloLatino]'].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
}

function request(url, opts) {
  let headers = {
    'User-Agent': UA,
    'Accept': opts && opts.json ? 'application/json' : 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.5',
    'Referer': BASE_URL + '/'
  };
  if (opts && opts.body) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, {
    method: opts && opts.body ? 'POST' : 'GET',
    headers: headers,
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'follow'
  }).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    if (opts && opts.json) return res.json();
    return res.text();
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  log('getStreams tmdb=' + tmdbId + ' type=' + mediaType + ' season=' + season + ' episode=' + episode);
  let isTv = mediaType === 'tv' || mediaType === 'series';
  let endpoint = isTv ? 'tv' : 'movie';

  return request('https://api.themoviedb.org/3/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=es-ES', { json: true })
    .then(function(tmdbData) {
      let title = isTv ? tmdbData.name : tmdbData.title;
      if (!title) throw new Error('No title from TMDB');
      log('TMDB: ' + title);

      return request(BASE_URL + '/api/search/suggest?q=' + encodeURIComponent(title), { json: true });
    })
    .then(function(searchData) {
      if (!searchData || !searchData.data || !searchData.data.length) throw new Error('No search results');
      let best = searchData.data[0];
      let slug = best.slug || '';
      let typeSlug = best.type || (isTv ? 'serie' : 'pelicula');

      let detailUrl;
      if (typeSlug === 'serie') {
        detailUrl = BASE_URL + '/serie/' + slug;
        if (isTv && episode && season) {
          detailUrl += '/temporada-' + season + '/episodio-' + episode;
        }
      } else {
        detailUrl = BASE_URL + '/pelicula/' + slug;
      }
      log('Detail URL: ' + detailUrl);

      return request(detailUrl).then(function(detailHtml) {
        let tokenMatch = detailHtml.match(/token["']\s*:\s*["']([^"']+)/);
        let token = tokenMatch ? tokenMatch[1] : null;

        let serverRe = /\[\s*["']([^"']{1,40})["']\s*,\s*["'](https?:\/\/[^"']+)["']/g;
        let servers = [];
        let sm;
        let cleanHtml = detailHtml.replace(/\\\//g, '/');
        while ((sm = serverRe.exec(cleanHtml)) !== null) {
          servers.push({ name: sm[1], url: sm[2] });
        }
        log('Found ' + servers.length + ' server(s)');

        let promises = servers.map(function(svr) {
          let postHeaders = {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': detailUrl
          };
          if (token) postHeaders['Authorization'] = 'Bearer ' + token;

          return fetch(BASE_URL + '/api/player-url', {
            method: 'POST',
            headers: postHeaders,
            body: JSON.stringify({ url: svr.url })
          }).then(function(res) {
            if (!res.ok) return [];
            return res.json();
          }).then(function(playerData) {
            let streamUrl = (playerData && playerData.url) || (playerData && playerData.data && playerData.data.url);
            if (!streamUrl) return [];
            return [{
              name: 'SoloLatino',
              title: svr.name,
              url: streamUrl,
              quality: 'Auto',
              headers: { 'Referer': detailUrl, 'User-Agent': UA }
            }];
          }).catch(function() { return []; });
        });

        return Promise.all(promises).then(function(results) {
          let streams = [];
          results.forEach(function(r) { r.forEach(function(s) { streams.push(s); }); });
          return streams;
        });
      });
    })
    .catch(function(err) {
      log('Error: ' + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };
