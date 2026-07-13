import { describe, expect, it, vi } from "vitest"
import { createPrimeVideoAdapter } from "../src/adapters/primeVideoAdapter.js"

const indexUrl = "https://www.aboutamazon.com/news/entertainment"
const articleUrl = "https://www.aboutamazon.com/news/entertainment/prime-video-july-2026"

describe("PrimeVideoAdapter", () => {
  it("discovers the monthly article and maps official releases", async () => {
    const fetchText = vi.fn()
      .mockResolvedValueOnce(`<a href="${articleUrl}">What's new on Prime Video in July 2026</a>`)
      .mockResolvedValueOnce(`
        <h1>What's new on Prime Video in July 2026</h1>
        <div class="ArticlePage-articleBody"><article>
          <div class="contentContainer"><div class="contentItem-role-heading2"><h2>Full list of what’s new</h2></div></div>
          <div class="contentContainer"><div class="contentItem-role-heading3"><h3>July 17</h3></div></div>
          <div class="contentContainer"><div class="contentItem-role-text"><span><div>
            <a href="https://www.amazon.com/gp/video/detail/B0TEST">The Amateur</a> (2025)<br>
          </div></span></div></div>
        </article></div>
      `)
    const settings = {
      view: () => ({
        get: (key: string) => key === "SOURCE_PRIME_VIDEO_BASE_URL" ? indexUrl : "",
        sourceProxyMode: () => "inherit"
      })
    }
    const adapter = createPrimeVideoAdapter({
      httpClient: { fetchText } as never,
      settings: settings as never,
      minIntervalMs: 0,
      today: () => "2026-07-13"
    })

    const result = await adapter.fetchItems()

    expect(fetchText).toHaveBeenCalledTimes(2)
    expect(fetchText.mock.calls.map((call) => call[1])).toEqual([indexUrl, articleUrl])
    expect(result.completeMediaSources).toEqual(["prime_video"])
    expect(result.completeReleaseSources).toEqual(["prime_video"])
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      media: {
        source: "prime_video",
        mediaType: "movie",
        releaseForm: "streaming_movie",
        titleDisplay: "The Amateur",
        firstReleaseDate: "2025"
      },
      releases: [{
        platform: "Prime Video",
        region: "US",
        releaseDate: "2026-07-17",
        releasePattern: "catalog_addition",
        releaseStatus: "upcoming",
        source: "prime_video",
        sourceUrl: "https://www.amazon.com/gp/video/detail/B0TEST"
      }]
    })
  })
})
