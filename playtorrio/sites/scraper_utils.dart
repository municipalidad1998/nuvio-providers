import 'dart:convert';
import 'package:http/http.dart' as http;

const String tmdbApiKey = '68e094699525b18a70bab2f86b1fa706';
const String defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

Future<String> getHtml(String url, {String? referer, String? userAgent}) async {
  final res = await http.get(
    Uri.parse(url),
    headers: {
      'User-Agent': userAgent ?? defaultUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.5',
      if (referer != null) 'Referer': referer,
    },
  );
  if (res.statusCode != 200) {
    throw Exception('HTTP ${res.statusCode} for $url');
  }
  return res.body;
}

Future<dynamic> getJson(String url, {String? referer}) async {
  final res = await http.get(
    Uri.parse(url),
    headers: {
      'User-Agent': defaultUserAgent,
      'Accept': 'application/json',
      if (referer != null) 'Referer': referer,
    },
  );
  if (res.statusCode != 200) {
    throw Exception('HTTP ${res.statusCode} for $url');
  }
  return jsonDecode(res.body);
}

String slugify(String title) {
  return title
      .toLowerCase()
      .normalize('NFD')
      .replaceAll(RegExp(r'[\u0300-\u036f]'), '')
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
}

String decodeEntities(String value) {
  return value
      .replaceAll(RegExp(r'&amp;|&#0?38;|&#x26;'), '&')
      .replaceAll(RegExp(r'&quot;|&#0?34;|&#x22;'), '"')
      .replaceAllMapped(
        RegExp(r'&#0?39;|&#x27;|&#x2f;'),
        (m) => m.group(0)!.toLowerCase().contains('2f') ? '/' : "'",
      );
}

String unescapeUrl(String url) {
  return decodeEntities(url)
      .replaceAll(RegExp(r'\\u002F', caseSensitive: false), '/')
      .replaceAll('\\/', '/')
      .replaceAll('\\-', '-');
}

String decodeBase64Custom(String value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  int bits = 0;
  int buffer = 0;
  final output = StringBuffer();
  final input = value.replaceAll(RegExp(r'[^A-Za-z0-9+/=]'), '');
  for (var i = 0; i < input.length; i++) {
    final code = alphabet.indexOf(input[i]);
    if (code < 0 || code == 64) continue;
    buffer = (buffer << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.writeCharCode((buffer >> bits) & 0xFF);
    }
  }
  return output.toString();
}

Set<String> extractMediaUrls(String html) {
  final urls = <String>{};
  final re = RegExp(r'["\']?(https?:\/\/[^"\'\)\s]+?\.(?:m3u8|mp4)(?:\?[^"\'\)\s]*)?)["\']?');
  for (final m in re.allMatches(html)) {
    urls.add(unescapeUrl(m.group(1)!));
  }
  return urls;
}

Set<String> extractIframeUrls(String html) {
  final urls = <String>{};
  final re = RegExp(r'<iframe[^>]+src=["\']([^"\']+)["\']', caseSensitive: false);
  for (final m in re.allMatches(html)) {
    var src = decodeEntities(m.group(1)!);
    if (src.startsWith('//')) src = 'https:$src';
    if (RegExp(r'^https?:\/\/').hasMatch(src)) urls.add(src);
  }
  return urls;
}

Set<String> extractBase64EmbedUrls(String html) {
  final urls = <String>{};
  final attrRe = RegExp(r'data-(?:player|key|video|url|src)="([A-Za-z0-9+/=]{8,})"');
  for (final m in attrRe.allMatches(html)) {
    try {
      final decoded = decodeBase64Custom(m.group(1)!);
      if (RegExp(r'^https?:\/\/').hasMatch(decoded)) urls.add(unescapeUrl(decoded));
    } catch (_) {}
  }
  final keyRe = RegExp(
    r'data-key="([A-Za-z0-9+/=]{8,})"[^>]*data-player="([A-Za-z0-9+/=_.-]{4,})"',
  );
  for (final m in keyRe.allMatches(html)) {
    try {
      final prefix = decodeBase64Custom(m.group(1)!);
      if (RegExp(r'^https?:\/\/').hasMatch(prefix)) {
        urls.add(unescapeUrl(prefix + m.group(2)!));
      }
    } catch (_) {}
  }
  return urls;
}

List<MapEntry<String, String>> extractVideosArrayEmbeds(String html) {
  final out = <MapEntry<String, String>>[];
  final re = RegExp(r'\[\s*["\']([^"\']{1,40})["\']\s*,\s*["\'](https?:\/\/[^"\']+)["\']');
  final clean = html.replaceAll('\\/', '/').replaceAll('\\"', '"');
  for (final m in re.allMatches(clean)) {
    out.add(MapEntry(m.group(1)!, m.group(2)!));
  }
  return out;
}

String getOrigin(String url, String fallback) {
  final match = RegExp(r'^(https?:\/\/[^/]+)').firstMatch(url);
  return match != null ? '${match.group(1)}/' : '$fallback/';
}

List<String> titleTokens(String title) {
  const stop = {
    'the', 'a', 'an', 'of', 'and', 'to', 'in', 'la', 'el', 'los', 'las', 'de', 'y',
  };
  return slugify(title)
      .split('-')
      .where((t) => t.length > 1 && !stop.contains(t))
      .toList();
}

int matchScore(String slug, String title) {
  final candidate = slugify(slug);
  final compactCandidate = candidate.replaceAll('-', '');
  final compactTitle = slugify(title).replaceAll('-', '');
  final tokens = titleTokens(title);
  final matched = tokens.where((t) => candidate.split('-').contains(t)).toList();
  if (compactCandidate == compactTitle) return 0;
  if (compactCandidate.startsWith(compactTitle)) return 1;
  if (tokens.isNotEmpty && matched.length == tokens.length) return 2;
  return 99;
}

Future<String> searchWpRest(String baseUrl, String title) async {
  try {
    final url =
        '$baseUrl/wp-json/wp/v2/search?search=${Uri.encodeComponent(title)}&per_page=5';
    final items = await getJson(url);
    if (items is! List) return '';
    for (final it in items) {
      if (it == null || it['url'] == null) continue;
      final itemUrl = it['url'].toString();
      final slug = Uri.decodeComponent(
        itemUrl.split('?')[0].split('#')[0].replaceAll(RegExp(r'/+$'), '').split('/').last,
      );
      if (slug.isNotEmpty) return itemUrl;
    }
  } catch (_) {}
  return '';
}

Future<String> searchSiteGeneric({
  required String baseUrl,
  required String searchPattern,
  required String title,
}) async {
  final url = '$baseUrl$searchPattern${Uri.encodeComponent(title)}';
  final html = await getHtml(url, referer: '$baseUrl/');
  final links = <MapEntry<String, String>>[];
  final re = RegExp(r'<a[^>]+href="([^"]+)"[^>]*>');
  for (final m in re.allMatches(html)) {
    var href = decodeEntities(m.group(1)!);
    if (href.startsWith('/')) href = '$baseUrl$href';
    if (!href.startsWith(baseUrl)) continue;
    final path =
        href.substring(baseUrl.length).split('?')[0].split('#')[0].replaceAll(RegExp(r'^/+|/+$'), '');
    if (path.isEmpty || path.split('/').length > 3) continue;
    if (RegExp(r'\/(category|tag|page|author|genero|generos|tipo|estado|letra|feed|wp-|login|register|contacto|dmca|aviso|pedido|donar)',
            caseSensitive: false)
        .hasMatch(path)) continue;
    if (RegExp(r'\.(png|jpe?g|gif|css|js|ico|svg|webp|mp4|m3u8)$', caseSensitive: false)
        .hasMatch(path)) continue;
    final slug = path.split('/').last;
    if (!slug.contains('-')) continue;
    links.add(MapEntry(href, slug));
  }
  links.sort((a, b) => matchScore(a.value, title).compareTo(matchScore(b.value, title)));
  if (links.isNotEmpty && matchScore(links.first.value, title) < 99) {
    return links.first.key;
  }
  final restUrl = await searchWpRest(baseUrl, title);
  if (restUrl.isNotEmpty) return restUrl;
  final short = title.split(RegExp(r'[:\-–—]')).first.trim();
  if (short.isNotEmpty && short.toLowerCase() != title.toLowerCase()) {
    final url2 = '$baseUrl$searchPattern${Uri.encodeComponent(short)}';
    final html2 = await getHtml(url2, referer: '$baseUrl/');
    final links2 = <MapEntry<String, String>>[];
    for (final m in re.allMatches(html2)) {
      var href = decodeEntities(m.group(1)!);
      if (href.startsWith('/')) href = '$baseUrl$href';
      if (!href.startsWith(baseUrl)) continue;
      final path = href
          .substring(baseUrl.length)
          .split('?')[0]
          .split('#')[0]
          .replaceAll(RegExp(r'^/+|/+$'), '');
      if (path.isEmpty || path.split('/').length > 3) continue;
      final slug = path.split('/').last;
      if (!slug.contains('-')) continue;
      links2.add(MapEntry(href, slug));
    }
    links2.sort((a, b) => matchScore(a.value, title).compareTo(matchScore(b.value, title)));
    if (links2.isNotEmpty) return links2.first.key;
  }
  throw Exception('No result found on site search for "$title"');
}

Future<String?> resolveEpisodeUrlByScanning({
  required String detailUrl,
  required String baseUrl,
  required int episodeNum,
}) async {
  final showSlug = detailUrl.replaceAll(RegExp(r'/+$'), '').split('/').last;
  final showTokens = titleTokens(showSlug);
  final html = await getHtml(detailUrl, referer: '$baseUrl/');
  final links = <String>[];
  final re = RegExp(r'href="([^"]+)"');
  for (final m in re.allMatches(html)) {
    var href = decodeEntities(m.group(1)!);
    if (href.startsWith('/')) href = '$baseUrl$href';
    if (!href.startsWith(baseUrl)) continue;
    final tail = href.replaceAll(RegExp(r'/+$'), '').split('/').last;
    final tailSlug = slugify(tail);
    final sameShow = showTokens.isNotEmpty && showTokens.every((t) => tailSlug.contains(t));
    if (!sameShow) continue;
    if (!RegExp(r'ver|episode|episodio|capitulo|watch|temporada', caseSensitive: false)
        .hasMatch(href)) continue;
    final epPattern = RegExp('(^|[^0-9])0*${episodeNum}([^0-9]|$)');
    if (epPattern.hasMatch(tail)) links.add(href);
  }
  return links.isNotEmpty ? links.first : null;
}
