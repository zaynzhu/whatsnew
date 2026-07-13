import { describe, expect, it } from "vitest"
import {
  isDoubanPlaceholderPosterUrl,
  normalizeDoubanPosterUrl
} from "../src/utils/doubanPosterUrl.js"

describe("douban poster URL", () => {
  it("treats Douban generic movie and TV artwork as missing", () => {
    const tvPlaceholder = "https://img2.doubanio.com/f/frodo/hash/pics/subject/tv_large.jpg"
    const moviePlaceholder = "https://img2.doubanio.com/f/frodo/hash/pics/subject/movie_large.jpg"

    expect(isDoubanPlaceholderPosterUrl(tvPlaceholder)).toBe(true)
    expect(isDoubanPlaceholderPosterUrl(moviePlaceholder)).toBe(true)
    expect(normalizeDoubanPosterUrl(tvPlaceholder)).toBeNull()
    expect(normalizeDoubanPosterUrl(moviePlaceholder)).toBeNull()
  })

  it("keeps real Douban poster assets and upgrades small ratio URLs", () => {
    expect(normalizeDoubanPosterUrl(
      "https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2933909877.jpg"
    )).toBe("https://img3.doubanio.com/view/photo/l_ratio_poster/public/p2933909877.jpg")
    expect(normalizeDoubanPosterUrl(
      "https://img1.doubanio.com/view/photo/m_ratio_poster/public/p2934049189.jpg"
    )).toBe("https://img1.doubanio.com/view/photo/l_ratio_poster/public/p2934049189.jpg")
  })
})
