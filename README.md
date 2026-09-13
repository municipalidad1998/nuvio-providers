# nuvio-providers

Providers de anime, peliculas, series y doramas en espanol para **Nuvio** y **PlayTorrio**.

---

## Nuvio

Manifest URL:

```
https://raw.githubusercontent.com/municipalidad1998/nuvio-providers/main/manifest.json
```

### Providers incluidos (Nuvio)

| Provider | Tipo | Idioma | Estado |
|----------|------|--------|--------|
| LatAnime | Anime | ES | Habilitado |
| JKAnime | Anime | ES | Habilitado |
| AnimeJara | Anime | ES | Habilitado |
| TioAnime | Anime | ES | Habilitado |
| VeraNimes | Anime | ES | Habilitado |
| AnimeAV1 | Anime | ES | Habilitado |
| MundoDonghua | Donghua | ES | Habilitado |
| EstrenosAnime | Anime | ES | Habilitado |
| PelisPedia MOV | Peliculas/Series | ES | Habilitado |
| PelisPedia IS | Peliculas/Series | ES | Habilitado |
| Gambeta | Peliculas/Series | ES | Habilitado |
| TLNovelas | Telenovelas | ES | Habilitado |
| DoramasFlix | Doramas | ES | Habilitado |
| DoramaYT | Doramas | ES | Habilitado |
| SoloLatino | Peliculas/Series/Anime | ES | Habilitado |

---

## PlayTorrio

Los scrapers Dart se encuentran en `playtorrio/sites/`.

### Como agregar a PlayTorrio

1. Copia los archivos `.dart` de `playtorrio/sites/` a tu proyecto PlayTorrio en `lib/services/scraper/sites/`
2. Asegurate de que `stream_scraper.dart` y `tmdb_helper.dart` esten en la ruta correcta
3. Registra cada scraper en tu `ScraperManager`:

```dart
ScraperManager.instance.registerScraper(LatAnimeScraper());
ScraperManager.instance.registerScraper(JKAnimeScraper());
ScraperManager.instance.registerScraper(AnimeJaraScraper());
ScraperManager.instance.registerScraper(TioAnimeScraper());
ScraperManager.instance.registerScraper(VeraNimesScraper());
ScraperManager.instance.registerScraper(AnimeAV1Scraper());
ScraperManager.instance.registerScraper(MundoDonghuaScraper());
ScraperManager.instance.registerScraper(EstrenosAnimeScraper());
ScraperManager.instance.registerScraper(PelisPediaMovScraper());
ScraperManager.instance.registerScraper(PelisPediaIsScraper());
ScraperManager.instance.registerScraper(GambetaScraper());
ScraperManager.instance.registerScraper(TLNovelasScraper());
ScraperManager.instance.registerScraper(DoramasFlixScraper());
ScraperManager.instance.registerScraper(DoramaYTScraper());
ScraperManager.instance.registerScraper(SoloLatinoScraper());
```

### Scrapers incluidos (PlayTorrio)

| Scraper | Archivo | Fuente |
|---------|---------|--------|
| LatAnimeScraper | `lat_anime_scraper.dart` | latanime.org |
| JKAnimeScraper | `jk_anime_scraper.dart` | jkanime.net |
| AnimeJaraScraper | `anime_jara_scraper.dart` | animejara.com |
| TioAnimeScraper | `tio_anime_scraper.dart` | tioanime.com |
| VeraNimesScraper | `veranimes_scraper.dart` | veranimes.net |
| AnimeAV1Scraper | `anime_av1_scraper.dart` | animeav1.com |
| MundoDonghuaScraper | `mundodonghua_scraper.dart` | mundodonghua.com |
| EstrenosAnimeScraper | `estrenos_anime_scraper.dart` | estrenosanime.net |
| PelisPediaMovScraper | `pelispedia_mov_scraper.dart` | pelispedia.mov |
| PelisPediaIsScraper | `pelispedia_is_scraper.dart` | pelispedia.is |
| GambetaScraper | `gambeta_scraper.dart` | gambeta.vip |
| TLNovelasScraper | `tlnovelas_scraper.dart` | tlnovelas.net |
| DoramasFlixScraper | `doramasflix_scraper.dart` | doramasflix.co |
| DoramaYTScraper | `doramasyt_scraper.dart` | doramasyt.com |
| SoloLatinoScraper | `sololatino_scraper.dart` | sololatino.net |

### Requisitos

- Dart 3.0+
- Paquete `http` en `pubspec.yaml`

---

## Providers deshabilitados

Estos providers estan deshabilitados en Nuvio porque son SPAs que no permiten scraping directo:

- LaMovie (lamovie.org) — WordPress SPA, API interna
- HackStore (hackstore2.com) — WordPress SPA, API interna
- Aether (aether.ist) — SPA, API interna
- StreamXHD (streamxhd.com) — JavaScript renderizado, sin HTML
- DeTodoPeliculas (detodopeliculas.nu) — Cloudflare 403
- EntrePeliculasySeries (entrepeliculasyseries.nz) — Cloudflare 403

---

## Licencia

GPL-3.0
