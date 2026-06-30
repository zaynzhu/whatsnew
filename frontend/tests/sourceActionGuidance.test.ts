import { describe, expect, it } from "vitest"
import type { SourceSettingsView } from "../src/api/types"
import { sourceActionGuidance } from "../src/utils/sourceActionGuidance"

const downloadCommand = "npm run download:imdb --workspace backend"
const syncCommand = "npm run sync:imdb --workspace backend"
type LatestRunFixture = NonNullable<SourceSettingsView["latestRun"]>

function sourceFixture(
  overrides: Partial<SourceSettingsView> = {}
): SourceSettingsView {
  return {
    id: "imdb",
    name: "IMDb",
    description: "日更数据集与榜单",
    group: "global_metadata",
    implementationStatus: "planned",
    enabled: false,
    runnable: false,
    proxyMode: "inherit",
    credentialsComplete: true,
    missingCredentials: [],
    supportsSync: false,
    supportsEnable: false,
    fields: [],
    semantics: {
      signalKinds: ["metadata", "rating"],
      coverage: "全球电影、剧集、单集和 IMDb ID",
      cadence: "日级或手动数据集导入",
      access: "public_api",
      freshnessNote: "优先使用 IMDb 非商业 datasets",
      riskNote: "数据集体积较大，需要本地缓存"
    },
    localState: {
      kind: "imdb_datasets",
      status: "ready",
      configured: true,
      readyFiles: 2,
      totalFiles: 2,
      files: [
        {
          fileName: "title.basics.tsv.gz",
          exists: true,
          sizeBytes: 100,
          expectedBytes: 100,
          downloadedAt: "2026-06-29T08:00:00.000Z",
          lastModified: "2026-06-29T08:00:00.000Z",
          etag: "etag-basics",
          issue: null
        }
      ]
    },
    manualCommands: [
      {
        label: "下载或刷新 IMDb 缓存",
        command: downloadCommand,
        description: "从 IMDb 官方 datasets 下载 gzip 到已配置缓存目录"
      },
      {
        label: "同步 IMDb 本地缓存",
        command: syncCommand,
        description: "只补充当前库已有作品的 IMDb ID 和评分，不创建陌生作品"
      }
    ],
    latestRun: null,
    ...overrides
  }
}

function runFixture(
  status: string,
  startedAt = "2026-06-30T00:00:00.000Z"
): LatestRunFixture {
  return {
    status,
    startedAt,
    finishedAt: "2026-06-30T00:00:04.000Z",
    durationMs: 4000,
    itemCount: 12,
    errorMessage: status === "failed" ? "缓存解析失败" : null
  }
}

describe("sourceActionGuidance", () => {
  it("缺少 IMDb 缓存目录时提示先配置目录", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      localState: {
        kind: "imdb_datasets",
        status: "missing_config",
        configured: false,
        readyFiles: 0,
        totalFiles: 0,
        files: []
      }
    }))

    expect(guidance).toMatchObject({
      tone: "warning",
      title: "先配置缓存目录",
      command: null
    })
  })

  it("缓存文件缺失时提示运行下载命令", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      localState: {
        kind: "imdb_datasets",
        status: "missing_files",
        configured: true,
        readyFiles: 0,
        totalFiles: 2,
        files: []
      }
    }))

    expect(guidance).toMatchObject({
      tone: "warning",
      title: "先刷新 IMDb 缓存",
      command: downloadCommand
    })
  })

  it("缓存就绪但未同步时提示运行同步命令", () => {
    const guidance = sourceActionGuidance(sourceFixture())

    expect(guidance).toMatchObject({
      tone: "neutral",
      title: "缓存已就绪，等待同步",
      command: syncCommand
    })
  })

  it("缓存下载时间晚于最近同步时提示重新同步", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      latestRun: runFixture("success", "2026-06-28T08:00:00.000Z")
    }))

    expect(guidance).toMatchObject({
      tone: "neutral",
      title: "缓存比同步更新",
      command: syncCommand
    })
  })

  it("最近同步失败时提示查看失败并重新同步", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      latestRun: runFixture("failed", "2026-06-30T08:00:00.000Z")
    }))

    expect(guidance).toMatchObject({
      tone: "error",
      title: "最近同步失败",
      command: syncCommand
    })
    expect(guidance?.detail).toContain("缓存解析失败")
  })

  it("最近同步运行中时不提示重复命令", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      latestRun: {
        ...runFixture("running", "2026-06-30T08:00:00.000Z"),
        finishedAt: null,
        durationMs: null,
        errorMessage: null
      }
    }))

    expect(guidance).toMatchObject({
      tone: "neutral",
      title: "同步运行中",
      command: null
    })
  })

  it("最近同步成功且缓存未更新时只展示完成状态", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      latestRun: runFixture("success", "2026-06-30T08:00:00.000Z")
    }))

    expect(guidance).toMatchObject({
      tone: "success",
      title: "最近同步完成",
      command: null
    })
    expect(guidance?.detail).toContain("12 条")
    expect(guidance?.detail).toContain("2026-06-30")
  })

  it("非 IMDb 来源不派生提示", () => {
    const guidance = sourceActionGuidance(sourceFixture({
      id: "tmdb",
      localState: null,
      manualCommands: []
    }))

    expect(guidance).toBeNull()
  })
})
