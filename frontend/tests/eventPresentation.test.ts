import { describe, expect, it } from "vitest"
import type { ChangeEvent } from "../src/api/types"
import { eventPresentation } from "../src/utils/eventPresentation"

function eventFixture(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
  return {
    id: "event-1",
    mediaItemId: "media-1",
    eventType: "rank_changed",
    title: "Enola Holmes 在 trakt_trending 排名发生变化",
    description: "Enola Holmes 在 trakt_trending 排名发生变化",
    source: "trakt_trending",
    sourceUrl: null,
    eventAt: "2026-07-11T07:02:47.524Z",
    payload: JSON.stringify({
      previousRank: 44,
      currentRank: 48,
      rankDelta: -4
    }),
    mediaItem: { id: "media-1", titleDisplay: "Enola Holmes" },
    ...overrides
  }
}

describe("eventPresentation", () => {
  it("turns a falling rank payload into concise copy", () => {
    expect(eventPresentation(eventFixture())).toEqual({
      headline: "Enola Holmes 回落至第 48 名",
      detail: "从第 44 名下降 4 位"
    })
  })

  it("turns a rising rank payload into concise copy", () => {
    expect(eventPresentation(eventFixture({
      eventType: "heat_rising",
      payload: JSON.stringify({
        previousRank: 50,
        currentRank: 42,
        rankDelta: 8
      })
    }))).toEqual({
      headline: "Enola Holmes 升至第 42 名",
      detail: "从第 50 名上升 8 位"
    })
  })

  it("removes duplicate fallback descriptions", () => {
    expect(eventPresentation(eventFixture({
      eventType: "media_detected",
      title: "发现新条目：沙丘",
      description: "发现新条目：沙丘"
    }))).toEqual({
      headline: "发现新条目：沙丘",
      detail: null
    })
  })
})
