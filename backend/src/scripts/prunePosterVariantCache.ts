import {
  DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES,
  prunePosterVariantCache
} from "../services/posterVariantCacheMaintenanceService.js"

function maxBytesFromArguments(): number {
  const argument = process.argv.find((value) => value.startsWith("--max-mb="))
  if (!argument) return DEFAULT_POSTER_VARIANT_CACHE_MAX_BYTES
  const megabytes = Number(argument.slice("--max-mb=".length))
  if (!Number.isInteger(megabytes) || megabytes < 64 || megabytes > 10240) {
    throw new Error("--max-mb 必须是 64 到 10240 之间的整数")
  }
  return megabytes * 1024 * 1024
}

const result = await prunePosterVariantCache({
  maxBytes: maxBytesFromArguments(),
  apply: process.argv.includes("--apply")
})
console.log(JSON.stringify(result, null, 2))
