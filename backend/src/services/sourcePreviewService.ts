import type { SourcePreviewResponse, SourcePreviewSample } from "@whatsnew/shared/settings"
import type { AdapterItem, SourceAdapter, SourceFetchResult } from "../domain/types.js"

const SAMPLE_LIMIT = 12

type PreviewAdapterEntry = {
  adapter: SourceAdapter<SourceFetchResult>
}

function fetchItems(result: SourceFetchResult): AdapterItem[] {
  return Array.isArray(result) ? result : result.items
}

function firstRelease(item: AdapterItem) {
  return item.releases.find((release) => release.releaseDate != null)
    ?? item.releases[0]
    ?? null
}

function previewSample(item: AdapterItem, scope: string): SourcePreviewSample {
  const release = firstRelease(item)

  return {
    scope,
    title: item.media.titleDisplay,
    mediaType: item.media.mediaType,
    releaseForm: item.media.releaseForm,
    posterUrl: item.media.posterUrl,
    firstReleaseDate: item.media.firstReleaseDate,
    releaseDate: release?.releaseDate ?? null,
    releasePattern: release?.releasePattern ?? null,
    platform: release?.platform ?? item.popularitySignals[0]?.platform ?? null,
    region: release?.region ?? item.popularitySignals[0]?.region ?? null,
    sourceUrl: release?.sourceUrl ?? item.popularitySignals[0]?.sourceUrl ?? null
  }
}

export async function previewSourceData(
  sourceId: string,
  entries: PreviewAdapterEntry[]
): Promise<SourcePreviewResponse> {
  const scopedItems: Array<{ scope: string, items: AdapterItem[] }> = []

  for (const entry of entries) {
    const result = await entry.adapter.fetchItems()
    scopedItems.push({
      scope: entry.adapter.scope ?? "all",
      items: fetchItems(result)
    })
  }

  const items = scopedItems.flatMap((entry) => entry.items)
  const releaseDates = items.flatMap((item) => (
    item.releases.flatMap((release) => release.releaseDate ? [release.releaseDate] : [])
  )).sort()
  const mediaTypes: SourcePreviewResponse["mediaTypes"] = {}
  const releasePatterns: Record<string, number> = {}
  const samples = scopedItems.flatMap((entry) => (
    entry.items.map((item) => previewSample(item, entry.scope))
  )).sort((left, right) => Number(right.posterUrl != null) - Number(left.posterUrl != null))

  for (const item of items) {
    mediaTypes[item.media.mediaType] = (mediaTypes[item.media.mediaType] ?? 0) + 1
    for (const release of item.releases) {
      releasePatterns[release.releasePattern] = (releasePatterns[release.releasePattern] ?? 0) + 1
    }
  }

  return {
    sourceId,
    itemCount: items.length,
    withPoster: items.filter((item) => item.media.posterUrl != null).length,
    mediaTypes,
    releasePatterns,
    releaseDateStart: releaseDates[0] ?? null,
    releaseDateEnd: releaseDates.at(-1) ?? null,
    scopes: scopedItems.map((entry) => ({
      scope: entry.scope,
      itemCount: entry.items.length
    })),
    samples: samples.slice(0, SAMPLE_LIMIT),
    fetchedAt: new Date().toISOString(),
    persisted: false
  }
}
