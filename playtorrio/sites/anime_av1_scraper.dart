import 'dart:async';
import 'package:flutter/foundation.dart';
import '../stream_scraper.dart';
import '../../../models/stream/stream_model.dart';
import 'scraper_utils.dart';

class AnimeAV1Scraper extends StreamScraper {
  @override
  String get name => 'PlayTorrioHTTP';

  static const _baseUrl = 'https://animeav1.com';

  @override
  Stream<StreamSource> scrapeStream({
    required String type,
    required String title,
    int? year,
    int? season,
    int? episode,
    String? imdbId,
  }) async* {
    final isTv = type == 'tv' || type == 'series';
    final mediaType = isTv ? 'tv' : 'movie';
    try {
      final tmdbData = await getJson(
        'https://api.themoviedb.org/3/${mediaType == "tv" ? "tv" : "movie"}/$imdbId?api_key=$tmdbApiKey&language=es-ES',
      );
      final mediaTitle = mediaType == 'tv' ? tmdbData['name'] : tmdbData['title'];
      if (mediaTitle == null) return;

      final detailUrl = await searchSiteGeneric(
        baseUrl: _baseUrl,
        searchPattern: '/?s=',
        title: mediaTitle,
      );
      var pageUrl = detailUrl;
      if (isTv && episode != null) {
        final epUrl = await resolveEpisodeUrlByScanning(
          detailUrl: detailUrl,
          baseUrl: _baseUrl,
          episodeNum: episode,
        );
        if (epUrl != null) pageUrl = epUrl;
      }
      yield* _extractStreams(pageUrl);
    } catch (e) {
      if (kDebugMode) debugPrint('[AnimeAV1Scraper] error: $e');
    }
  }

  Stream<StreamSource> _extractStreams(String pageUrl) async* {
    final seen = <String>{};
    final html = await getHtml(pageUrl, referer: '$_baseUrl/');
    for (final url in extractMediaUrls(html)) {
      if (seen.add(url)) yield _makeSource(url, 'Servidor principal', pageUrl);
    }
    final candidates = <MapEntry<String, String>>[];
    for (final u in extractIframeUrls(html)) candidates.add(MapEntry(u, 'Servidor'));
    for (final u in extractBase64EmbedUrls(html)) candidates.add(MapEntry(u, 'Servidor'));
    for (final v in extractVideosArrayEmbeds(html)) candidates.add(MapEntry(v.value, v.key));
    var serverIdx = 1;
    for (final c in candidates.take(8)) {
      try {
        final embedHtml = await getHtml(c.key, referer: pageUrl);
        final label = '${c.value} ${++serverIdx}';
        for (final u in extractMediaUrls(embedHtml)) {
          if (seen.add(u)) yield _makeSource(u, label, c.key);
        }
        for (final n in extractIframeUrls(embedHtml).take(3)) {
          try {
            final nested = await getHtml(n, referer: c.key);
            for (final u in extractMediaUrls(nested)) {
              if (seen.add(u)) yield _makeSource(u, label, n);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  StreamSource _makeSource(String url, String label, String sourceUrl) {
    return StreamSource(
      name: 'PlayTorrioHTTP',
      addonName: 'PlayTorrioHTTP',
      title: 'AnimeAV1 · $label',
      url: url,
      headers: {
        'Referer': getOrigin(sourceUrl, _baseUrl),
        'User-Agent': defaultUserAgent,
      },
    );
  }
}
