import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../stream_scraper.dart';
import '../../../models/stream/stream_model.dart';
import 'scraper_utils.dart';

class SoloLatinoScraper extends StreamScraper {
  @override
  String get name => 'PlayTorrioHTTP';

  static const _baseUrl = 'https://sololatino.net';

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

      final client = http.Client();
      try {
        final searchRes = await client.get(
          Uri.parse('$_baseUrl/api/search/suggest?q=${Uri.encodeComponent(mediaTitle)}'),
          headers: {
            'User-Agent': defaultUserAgent,
            'Accept': 'application/json',
            'Referer': '$_baseUrl/',
          },
        ).timeout(const Duration(seconds: 8));
        if (searchRes.statusCode != 200) return;
        final searchData = jsonDecode(searchRes.body);
        if (searchData is! Map || searchData['data'] is! List) return;
        final results = searchData['data'] as List;
        if (results.isEmpty) return;

        final best = results.first;
        final slug = best['slug']?.toString() ?? '';
        final typeSlug = best['type']?.toString() ?? (isTv ? 'serie' : 'pelicula');

        String detailUrl;
        if (typeSlug == 'serie') {
          detailUrl = '$_baseUrl/serie/$slug';
          if (isTv && episode != null && season != null) {
            detailUrl += '/temporada-$season/episodio-$episode';
          }
        } else {
          detailUrl = '$_baseUrl/pelicula/$slug';
        }

        final detailRes = await client.get(
          Uri.parse(detailUrl),
          headers: {
            'User-Agent': defaultUserAgent,
            'Accept': 'text/html',
            'Referer': '$_baseUrl/',
          },
        ).timeout(const Duration(seconds: 8));
        if (detailRes.statusCode != 200) return;
        final detailHtml = detailRes.body;

        final tokenMatch = RegExp(r'token["\']\s*:\s*["\']([^"\']+)').firstMatch(detailHtml);
        final token = tokenMatch?.group(1);

        final serverMatches = RegExp(
          r'\[\s*["\']([^"\']{1,40})["\']\s*,\s*["\'](https?:\/\/[^"\']+)["\']',
        ).allMatches(detailHtml.replaceAll('\\/', '/'));

        for (final m in serverMatches) {
          final serverName = m.group(1)!;
          final serverUrl = m.group(2)!;

          try {
            final playerRes = await client.post(
              Uri.parse('$_baseUrl/api/player-url'),
              headers: {
                'User-Agent': defaultUserAgent,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Referer': detailUrl,
                if (token != null) 'Authorization': 'Bearer $token',
              },
              body: jsonEncode({'url': serverUrl}),
            ).timeout(const Duration(seconds: 8));
            if (playerRes.statusCode != 200) continue;
            final playerData = jsonDecode(playerRes.body);
            final streamUrl = playerData['url']?.toString() ?? playerData['data']?['url']?.toString();
            if (streamUrl == null || streamUrl.isEmpty) continue;
            final q = RegExp(r'(\d{3,4})p').firstMatch(streamUrl);
            yield StreamSource(
              name: 'PlayTorrioHTTP',
              addonName: 'PlayTorrioHTTP',
              title: 'SoloLatino · $serverName',
              url: streamUrl,
              headers: {
                'Referer': detailUrl,
                'User-Agent': defaultUserAgent,
              },
            );
          } catch (_) {}
        }
      } finally {
        client.close();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SoloLatinoScraper] error: $e');
    }
  }
}
