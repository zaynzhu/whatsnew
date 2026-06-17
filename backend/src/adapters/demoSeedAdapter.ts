import type { SourceAdapter } from "../domain/types.js"

export const demoSeedAdapter: SourceAdapter = {
  source: "demo",
  async fetchItems() {
    return [
      {
        media: {
          source: "demo",
          sourceId: "demo-movie-1",
          mediaType: "movie",
          releaseForm: "streaming_movie",
          sourceContentType: "movie",
          titleDisplay: "星际回声",
          titleOriginal: "Echoes Beyond",
          titleAliases: ["Echoes Beyond"],
          overview: "一部即将在流媒体上线的科幻电影。",
          posterUrl: null,
          productionCountries: ["US"],
          originalLanguage: "en",
          genres: ["Science Fiction"],
          firstReleaseDate: "2026-06-21",
          status: "upcoming",
          tmdbId: 900001,
          tvmazeId: null,
          imdbId: "tt900001",
          traktId: null,
          tvdbId: null
        },
        releases: [
          {
            platform: "Netflix",
            region: "US",
            releaseDate: "2026-06-21",
            releaseTime: null,
            releasePattern: "streaming_drop",
            releaseStatus: "upcoming",
            seasonNumber: null,
            episodeNumber: null,
            source: "demo",
            sourceUrl: "https://example.com/echoes-beyond"
          }
        ],
        popularitySignals: [
          {
            source: "demo_trending",
            sourceCategory: "metadata_community",
            platform: null,
            region: "global",
            window: "week",
            rank: 4,
            rankDelta: -6,
            value: 82,
            valueLabel: "demo heat",
            sourceUrl: "https://example.com/trending"
          }
        ]
      },
      {
        media: {
          source: "demo",
          sourceId: "demo-series-1",
          mediaType: "series",
          releaseForm: "tv_series",
          sourceContentType: "tv",
          titleDisplay: "雨城迷案",
          titleOriginal: "雨城迷案",
          titleAliases: ["Rain City Case"],
          overview: "一部本周开播的悬疑剧。",
          posterUrl: null,
          productionCountries: ["CN"],
          originalLanguage: "zh",
          genres: ["Mystery"],
          firstReleaseDate: "2026-06-17",
          status: "ongoing",
          tmdbId: 900002,
          tvmazeId: 800002,
          imdbId: null,
          traktId: null,
          tvdbId: null
        },
        releases: [
          {
            platform: "Youku",
            region: "CN",
            releaseDate: "2026-06-17",
            releaseTime: "20:00",
            releasePattern: "weekly",
            releaseStatus: "airing_today",
            seasonNumber: 1,
            episodeNumber: 1,
            source: "demo",
            sourceUrl: "https://example.com/rain-city-case"
          }
        ],
        popularitySignals: [
          {
            source: "demo_china_rank",
            sourceCategory: "official_platform",
            platform: "Youku",
            region: "CN",
            window: "current",
            rank: 2,
            rankDelta: -3,
            value: 91,
            valueLabel: "站内热度",
            sourceUrl: "https://example.com/youku-rank"
          }
        ]
      },
      {
        media: {
          source: "demo",
          sourceId: "demo-anime-1",
          mediaType: "anime",
          releaseForm: "anime_season",
          sourceContentType: "anime",
          titleDisplay: "银河食堂 第二季",
          titleOriginal: "銀河食堂 Season 2",
          titleAliases: ["Galaxy Diner S2"],
          overview: "一部即将回归的番剧季度。",
          posterUrl: null,
          productionCountries: ["JP"],
          originalLanguage: "ja",
          genres: ["Animation"],
          firstReleaseDate: "2026-06-20",
          status: "returning",
          tmdbId: 900003,
          tvmazeId: null,
          imdbId: null,
          traktId: null,
          tvdbId: null
        },
        releases: [
          {
            platform: "Bilibili",
            region: "CN",
            releaseDate: "2026-06-20",
            releaseTime: null,
            releasePattern: "weekly",
            releaseStatus: "upcoming",
            seasonNumber: 2,
            episodeNumber: 1,
            source: "demo",
            sourceUrl: "https://example.com/galaxy-diner"
          }
        ],
        popularitySignals: [
          {
            source: "demo_trending",
            sourceCategory: "metadata_community",
            platform: "Bilibili",
            region: "CN",
            window: "week",
            rank: 9,
            rankDelta: -2,
            value: 73,
            valueLabel: "demo heat",
            sourceUrl: "https://example.com/anime-rank"
          }
        ]
      },
      {
        media: {
          source: "demo",
          sourceId: "demo-doc-1",
          mediaType: "documentary",
          releaseForm: "documentary_series",
          sourceContentType: "documentary",
          titleDisplay: "深海边界",
          titleOriginal: "Ocean Frontier",
          titleAliases: ["Ocean Frontier"],
          overview: "纪录片剧集，本月上线。",
          posterUrl: null,
          productionCountries: ["GB"],
          originalLanguage: "en",
          genres: ["Documentary"],
          firstReleaseDate: "2026-06-25",
          status: "upcoming",
          tmdbId: 900004,
          tvmazeId: null,
          imdbId: "tt900004",
          traktId: null,
          tvdbId: null
        },
        releases: [
          {
            platform: "Apple TV+",
            region: "US",
            releaseDate: "2026-06-25",
            releaseTime: null,
            releasePattern: "batch",
            releaseStatus: "upcoming",
            seasonNumber: 1,
            episodeNumber: null,
            source: "demo",
            sourceUrl: "https://example.com/ocean-frontier"
          }
        ],
        popularitySignals: [
          {
            source: "demo_trending",
            sourceCategory: "metadata_community",
            platform: "Apple TV+",
            region: "US",
            window: "week",
            rank: 15,
            rankDelta: null,
            value: 65,
            valueLabel: "demo heat",
            sourceUrl: "https://example.com/doc-rank"
          }
        ]
      }
    ]
  }
}
