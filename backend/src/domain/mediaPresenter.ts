import { normalizePlatform } from "./normalizer.js"

type SourceRelations = {
  releases: Array<{ source: string }>
  popularitySignals: Array<{ source: string }>
}

export function withDataSources<T extends SourceRelations>(item: T) {
  const { releases, popularitySignals, ...media } = item
  const dataSources = [...new Set([
    ...releases.map((release) => normalizePlatform(release.source)),
    ...popularitySignals.map((signal) => normalizePlatform(signal.source))
  ])]

  return { ...media, dataSources }
}
