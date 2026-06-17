# WhatsNew MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable WhatsNew MVP: an independent new movie/new show monitoring dashboard with typed media, release calendar, popularity signals, source status, demo seed data, and a backend/frontend foundation ready for real adapters.

**Architecture:** Use a small monorepo with `backend`, `frontend`, and `shared`. Backend is Express + TypeScript + Prisma + MySQL, with source adapters funneled through normalizer/matcher/sync/event modules. Frontend is React + Vite + TypeScript, showing an information-dense dashboard, discover list, trending board, calendar, source health, and media detail pages.

**Tech Stack:** Node.js 20 via fnm, npm workspaces, Express 5, TypeScript, Prisma MySQL, Vitest, React 18, Vite, Zustand, React Router, TanStack Query, TailwindCSS, lucide-react.

---

## Decisions Locked For MVP

- Project root: `/Users/zaynzhu/code/claude code/project/whatsnew`
- Database: NAS MySQL via Prisma
- UI language: Chinese-first, no i18n in MVP
- API key config: `.env` in `backend`
- Docker Compose: not in MVP because NAS already has MySQL
- First China adapter: `youku`, implemented as adapter shape + demo-backed output in MVP; `iqiyi` remains the fallback adapter after Youku
- Demo data: required, so UI/API work without external API keys
- External requests: every adapter must use timeout + source RateLimiter, same service interval >= 2 seconds

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `package.json` | Create | npm workspace scripts |
| `.gitignore` | Create | ignore Node, env, local DB dumps, build artifacts |
| `README.md` | Create | local dev setup and current MVP scope |
| `shared/package.json` | Create | shared type package |
| `shared/src/media.ts` | Create | shared enums and API response types |
| `backend/package.json` | Create | backend scripts and dependencies |
| `backend/tsconfig.json` | Create | backend TypeScript config |
| `backend/.env.example` | Create | env variable template |
| `backend/prisma/schema.prisma` | Create | MySQL data model |
| `backend/src/config/env.ts` | Create | env parsing |
| `backend/src/config/db.ts` | Create | Prisma singleton |
| `backend/src/utils/rateLimiter.ts` | Create | source-level request limiter |
| `backend/src/utils/http.ts` | Create | timeout fetch wrapper |
| `backend/src/domain/types.ts` | Create | adapter input and domain types |
| `backend/src/domain/mediaClassifier.ts` | Create | source type -> mediaType/releaseForm mapping |
| `backend/src/domain/matcher.ts` | Create | high-confidence media matching |
| `backend/src/domain/normalizer.ts` | Create | title/date/platform normalization |
| `backend/src/services/sourceSyncService.ts` | Create | run adapters, persist items, status |
| `backend/src/services/eventService.ts` | Create | generate change events |
| `backend/src/adapters/demoSeedAdapter.ts` | Create | deterministic demo source |
| `backend/src/adapters/tmdbAdapter.ts` | Create | TMDb adapter skeleton with real fetch functions guarded by API key |
| `backend/src/adapters/tvmazeAdapter.ts` | Create | TVmaze adapter skeleton with live fetch functions |
| `backend/src/adapters/traktAdapter.ts` | Create | Trakt adapter skeleton guarded by API key |
| `backend/src/adapters/youkuAdapter.ts` | Create | First China adapter shape and demo-backed output |
| `backend/src/adapters/iqiyiAdapter.ts` | Create | Fallback China adapter shape |
| `backend/src/routes/*.ts` | Create | API endpoints |
| `backend/src/app.ts` | Create | Express app wiring |
| `backend/src/server.ts` | Create | HTTP server |
| `backend/src/scheduler.ts` | Create | cron registration |
| `backend/tests/*.test.ts` | Create | backend unit and API tests |
| `frontend/package.json` | Create | frontend scripts and dependencies |
| `frontend/tsconfig.json` | Create | frontend TypeScript config |
| `frontend/vite.config.ts` | Create | Vite config and `/api` proxy |
| `frontend/index.html` | Create | app entry HTML |
| `frontend/src/main.tsx` | Create | React entry |
| `frontend/src/App.tsx` | Create | routes |
| `frontend/src/api/client.ts` | Create | API fetch helper |
| `frontend/src/components/*.tsx` | Create | reusable UI pieces |
| `frontend/src/pages/*.tsx` | Create | dashboard, discover, trending, calendar, sources, detail |
| `frontend/src/styles.css` | Create | Tailwind and app theme |
| `frontend/tests/*.test.tsx` | Create | frontend smoke tests |

---

## Task 1: Workspace Baseline

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `shared/package.json`
- Create: `shared/src/media.ts`

- [ ] **Step 1: Write root workspace files**

Create `package.json`:

```json
{
  "name": "whatsnew",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": [
    "backend",
    "frontend",
    "shared"
  ],
  "scripts": {
    "dev": "npm run dev --workspace backend",
    "dev:backend": "npm run dev --workspace backend",
    "dev:frontend": "npm run dev --workspace frontend",
    "build": "npm run build --workspace shared && npm run build --workspace backend && npm run build --workspace frontend",
    "test": "npm run test --workspace backend && npm run test --workspace frontend",
    "typecheck": "npm run typecheck --workspace shared && npm run typecheck --workspace backend && npm run typecheck --workspace frontend"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.local
*.log
*.db
*.sql
.DS_Store
coverage/
frontend/.vite/
```

Create `README.md`:

```markdown
# WhatsNew

新片新剧监控情报台，用来追踪全球与中国影视内容的上新、播出、上架和热度变化。

## MVP 范围

- 电影、剧集、动漫、综艺、短剧、纪录片分类型展示
- 展示今日上线、本周新片新剧、热度上升、数据源状态
- 支持 demo seed，无 API key 也能启动和验证
- 后端使用 Express + TypeScript + Prisma + MySQL
- 前端使用 React + Vite + TypeScript

## 开发

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

前端默认端口 `19992`，后端默认端口 `19993`。
```

- [ ] **Step 2: Write shared package**

Create `shared/package.json`:

```json
{
  "name": "@whatsnew/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/media.js",
  "types": "dist/media.d.ts",
  "exports": {
    "./media": {
      "types": "./dist/media.d.ts",
      "default": "./dist/media.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

Create `shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `shared/src/media.ts`:

```ts
export const MEDIA_TYPES = ["movie", "series", "anime", "variety", "short_drama", "documentary"] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

export const RELEASE_FORMS = [
  "theatrical_movie",
  "streaming_movie",
  "tv_series",
  "web_series",
  "animated_series",
  "anime_season",
  "variety_season",
  "micro_drama",
  "documentary_film",
  "documentary_series"
] as const
export type ReleaseForm = (typeof RELEASE_FORMS)[number]

export const RELEASE_STATUS = ["announced", "upcoming", "airing_today", "available", "delayed", "ended", "unknown"] as const
export type ReleaseStatus = (typeof RELEASE_STATUS)[number]

export const MEDIA_STATUS = ["upcoming", "released", "ongoing", "ended", "returning", "unknown"] as const
export type MediaStatus = (typeof MEDIA_STATUS)[number]

export interface MediaSummary {
  id: string
  mediaType: MediaType
  releaseForm: ReleaseForm
  titleDisplay: string
  titleOriginal: string | null
  posterUrl: string | null
  firstReleaseDate: string | null
  status: MediaStatus
  heatScore: number
}

export interface SourceStatus {
  source: string
  status: "running" | "success" | "warning" | "failed"
  startedAt: string
  finishedAt: string | null
  itemCount: number
  errorMessage: string | null
  nextRunAt: string | null
}
```

- [ ] **Step 3: Install baseline dependencies**

Run:

```bash
npm install
```

Expected: npm creates `package-lock.json`.

- [ ] **Step 4: Verify shared typecheck**

Run:

```bash
npm run typecheck --workspace shared
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore README.md shared
git commit -m "chore: 初始化 WhatsNew 工作区"
```

---

## Task 2: Backend Baseline And Prisma Schema

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/config/db.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Test: `backend/tests/health.test.ts`

- [ ] **Step 1: Create backend package files**

Create `backend/package.json`:

```json
{
  "name": "@whatsnew/backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/server.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "@whatsnew/shared": "0.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^5.0.1",
    "node-cron": "^3.0.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^20.14.15",
    "@types/node-cron": "^3.0.11",
    "prisma": "^5.22.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src", "tests"]
}
```

Create `backend/.env.example`:

```bash
DATABASE_URL="mysql://user:password@192.168.50.233:13306/whatsnew"
PORT=19993
CORS_ORIGIN="http://localhost:19992"
TMDB_API_KEY=""
TRAKT_CLIENT_ID=""
SYNC_ON_START=false
```

- [ ] **Step 2: Create Prisma schema**

Create `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model MediaItem {
  id                  String   @id @default(cuid())
  mediaType           String
  releaseForm         String
  sourceContentType   String?
  titleDisplay        String
  titleOriginal       String?
  titleAliases        String   @default("[]")
  overview            String?
  posterUrl           String?
  productionCountries String   @default("[]")
  originalLanguage    String?
  genres              String   @default("[]")
  firstReleaseDate    String?
  status              String   @default("unknown")
  heatScore           Float    @default(0)
  tmdbId              Int?
  tvmazeId            Int?
  imdbId              String?
  traktId             Int?
  tvdbId              Int?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  releases          Release[]
  popularitySignals PopularitySignal[]
  changeEvents      ChangeEvent[]

  @@index([mediaType])
  @@index([releaseForm])
  @@index([firstReleaseDate])
  @@index([heatScore])
  @@index([tmdbId])
  @@index([tvmazeId])
  @@index([imdbId])
}

model Release {
  id             String   @id @default(cuid())
  mediaItemId    String
  platform       String
  region         String
  releaseDate    String?
  releaseTime    String?
  releasePattern String   @default("unknown")
  releaseStatus  String   @default("unknown")
  seasonNumber   Int?
  episodeNumber  Int?
  source         String
  sourceUrl      String?
  fetchedAt      DateTime @default(now())

  mediaItem MediaItem @relation(fields: [mediaItemId], references: [id], onDelete: Cascade)

  @@index([releaseDate])
  @@index([platform])
  @@index([region])
  @@index([source])
}

model PopularitySignal {
  id             String   @id @default(cuid())
  mediaItemId    String
  source         String
  sourceCategory String
  platform       String?
  region         String?
  window         String
  rank           Int?
  rankDelta      Int?
  value          Float?
  valueLabel     String?
  capturedAt     DateTime @default(now())
  sourceUrl      String?

  mediaItem MediaItem @relation(fields: [mediaItemId], references: [id], onDelete: Cascade)

  @@index([source])
  @@index([window])
  @@index([rank])
  @@index([capturedAt])
}

model SourceSyncRun {
  id           String    @id @default(cuid())
  source       String
  status       String
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
  durationMs   Int?
  itemCount    Int       @default(0)
  errorMessage String?
  nextRunAt    DateTime?

  @@index([source])
  @@index([status])
  @@index([startedAt])
}

model ChangeEvent {
  id          String   @id @default(cuid())
  mediaItemId String?
  eventType   String
  title       String
  description String
  source      String
  sourceUrl   String?
  eventAt     DateTime @default(now())
  payload     String   @default("{}")

  mediaItem MediaItem? @relation(fields: [mediaItemId], references: [id], onDelete: SetNull)

  @@index([eventType])
  @@index([eventAt])
  @@index([source])
}
```

- [ ] **Step 3: Create env and db helpers**

Create `backend/src/config/env.ts`:

```ts
import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().default("mysql://user:password@192.168.50.233:13306/whatsnew"),
  PORT: z.coerce.number().default(19993),
  CORS_ORIGIN: z.string().default("http://localhost:19992"),
  TMDB_API_KEY: z.string().optional().default(""),
  TRAKT_CLIENT_ID: z.string().optional().default(""),
  SYNC_ON_START: z.coerce.boolean().default(false)
})

export const env = envSchema.parse(process.env)
```

Create `backend/src/config/db.ts`:

```ts
import { PrismaClient } from "@prisma/client"

export const db = new PrismaClient()
```

- [ ] **Step 4: Create Express app and health route**

Create `backend/src/app.ts`:

```ts
import cors from "cors"
import express from "express"
import { env } from "./config/env"

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json())

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "whatsnew-backend" })
  })

  return app
}
```

Create `backend/src/server.ts`:

```ts
import { createApp } from "./app"
import { env } from "./config/env"

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`WhatsNew backend listening on http://localhost:${env.PORT}`)
})
```

- [ ] **Step 5: Add health test**

Create `backend/tests/health.test.ts`:

```ts
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/app"

describe("health", () => {
  it("returns service status", async () => {
    const response = await request(createApp()).get("/api/health")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, service: "whatsnew-backend" })
  })
})
```

- [ ] **Step 6: Install and generate Prisma client**

Run:

```bash
npm install
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 NAS MySQL 的真实用户名和密码
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
```

Expected: Prisma client generated and schema pushed to the NAS MySQL `whatsnew` database.

- [ ] **Step 7: Verify backend**

Run:

```bash
npm run test --workspace backend
npm run typecheck --workspace backend
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json backend
git commit -m "feat: 初始化后端与数据库模型"
```

---

## Task 3: Domain Classification, Normalization, And Matching

**Files:**
- Create: `backend/src/domain/types.ts`
- Create: `backend/src/domain/mediaClassifier.ts`
- Create: `backend/src/domain/normalizer.ts`
- Create: `backend/src/domain/matcher.ts`
- Test: `backend/tests/domain.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `backend/tests/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { classifyMedia } from "../src/domain/mediaClassifier"
import { normalizeTitle } from "../src/domain/normalizer"
import { findBestMatch } from "../src/domain/matcher"
import type { NormalizedMediaInput, ExistingMediaCandidate } from "../src/domain/types"

describe("classifyMedia", () => {
  it("keeps movie and tv types distinct", () => {
    expect(classifyMedia({ source: "tmdb", sourceContentType: "movie", genres: ["Documentary"] })).toEqual({
      mediaType: "documentary",
      releaseForm: "documentary_film"
    })

    expect(classifyMedia({ source: "tmdb", sourceContentType: "tv", genres: ["Animation"] })).toEqual({
      mediaType: "anime",
      releaseForm: "animated_series"
    })
  })

  it("maps short drama source text", () => {
    expect(classifyMedia({ source: "youku", sourceContentType: "短剧", genres: [] })).toEqual({
      mediaType: "short_drama",
      releaseForm: "micro_drama"
    })
  })
})

describe("normalizeTitle", () => {
  it("normalizes whitespace and punctuation", () => {
    expect(normalizeTitle("  The  Last of Us： Season 2 ")).toBe("the last of us season 2")
  })
})

describe("findBestMatch", () => {
  const input: NormalizedMediaInput = {
    source: "tmdb",
    sourceId: "123",
    mediaType: "series",
    releaseForm: "tv_series",
    sourceContentType: "tv",
    titleDisplay: "The Last of Us",
    titleOriginal: "The Last of Us",
    titleAliases: ["最后生还者"],
    firstReleaseDate: "2026-04-01",
    originalLanguage: "en",
    genres: ["Drama"],
    productionCountries: ["US"],
    tmdbId: 100,
    tvmazeId: null,
    imdbId: null,
    traktId: null,
    tvdbId: null,
    overview: null,
    posterUrl: null
  }

  it("matches by external id first", () => {
    const candidates: ExistingMediaCandidate[] = [
      { id: "a", titleDisplay: "Different", titleAliases: [], firstReleaseDate: null, originalLanguage: null, tmdbId: 100, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)?.id).toBe("a")
  })

  it("does not force low-confidence title matches", () => {
    const candidates: ExistingMediaCandidate[] = [
      { id: "b", titleDisplay: "The Last Ship", titleAliases: [], firstReleaseDate: "2014-06-22", originalLanguage: "en", tmdbId: null, tvmazeId: null, imdbId: null, traktId: null }
    ]

    expect(findBestMatch(input, candidates)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test --workspace backend -- domain.test.ts
```

Expected: FAIL because domain modules do not exist.

- [ ] **Step 3: Implement domain types**

Create `backend/src/domain/types.ts`:

```ts
import type { MediaStatus, MediaType, ReleaseForm } from "@whatsnew/shared/media"

export interface SourceClassificationInput {
  source: string
  sourceContentType: string | null
  genres: string[]
}

export interface NormalizedMediaInput {
  source: string
  sourceId: string
  mediaType: MediaType
  releaseForm: ReleaseForm
  sourceContentType: string | null
  titleDisplay: string
  titleOriginal: string | null
  titleAliases: string[]
  overview: string | null
  posterUrl: string | null
  productionCountries: string[]
  originalLanguage: string | null
  genres: string[]
  firstReleaseDate: string | null
  status?: MediaStatus
  tmdbId: number | null
  tvmazeId: number | null
  imdbId: string | null
  traktId: number | null
  tvdbId: number | null
}

export interface ReleaseInput {
  platform: string
  region: string
  releaseDate: string | null
  releaseTime: string | null
  releasePattern: string
  releaseStatus: string
  seasonNumber: number | null
  episodeNumber: number | null
  source: string
  sourceUrl: string | null
}

export interface PopularitySignalInput {
  source: string
  sourceCategory: string
  platform: string | null
  region: string | null
  window: string
  rank: number | null
  rankDelta: number | null
  value: number | null
  valueLabel: string | null
  sourceUrl: string | null
}

export interface AdapterItem {
  media: NormalizedMediaInput
  releases: ReleaseInput[]
  popularitySignals: PopularitySignalInput[]
}

export interface SourceAdapter {
  source: string
  fetchItems(): Promise<AdapterItem[]>
}

export interface ExistingMediaCandidate {
  id: string
  titleDisplay: string
  titleAliases: string[]
  firstReleaseDate: string | null
  originalLanguage: string | null
  tmdbId: number | null
  tvmazeId: number | null
  imdbId: string | null
  traktId: number | null
}
```

- [ ] **Step 4: Implement classification and normalization**

Create `backend/src/domain/mediaClassifier.ts`:

```ts
import type { MediaType, ReleaseForm } from "@whatsnew/shared/media"
import type { SourceClassificationInput } from "./types"

export function classifyMedia(input: SourceClassificationInput): { mediaType: MediaType; releaseForm: ReleaseForm } {
  const rawType = (input.sourceContentType ?? "").toLowerCase()
  const genreText = input.genres.join(" ").toLowerCase()
  const combined = `${rawType} ${genreText}`

  if (combined.includes("短剧") || combined.includes("micro")) {
    return { mediaType: "short_drama", releaseForm: "micro_drama" }
  }

  if (combined.includes("documentary") || combined.includes("纪录")) {
    if (rawType === "movie" || combined.includes("film")) {
      return { mediaType: "documentary", releaseForm: "documentary_film" }
    }
    return { mediaType: "documentary", releaseForm: "documentary_series" }
  }

  if (combined.includes("anime") || combined.includes("animation") || combined.includes("动画") || combined.includes("番剧") || combined.includes("国创")) {
    return { mediaType: "anime", releaseForm: "animated_series" }
  }

  if (combined.includes("variety") || combined.includes("reality") || combined.includes("综艺")) {
    return { mediaType: "variety", releaseForm: "variety_season" }
  }

  if (rawType === "movie" || combined.includes("电影")) {
    return { mediaType: "movie", releaseForm: "streaming_movie" }
  }

  if (input.source === "tvmaze" && combined.includes("web")) {
    return { mediaType: "series", releaseForm: "web_series" }
  }

  return { mediaType: "series", releaseForm: "tv_series" }
}
```

Create `backend/src/domain/normalizer.ts`:

```ts
export function normalizeTitle(title: string): string {
  return title
    .trim()
    .replace(/[：:]/g, " ")
    .replace(/[，,。.!！?？'"]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
}

export function normalizePlatform(platform: string): string {
  const trimmed = platform.trim()
  const known: Record<string, string> = {
    youku: "Youku",
    优酷: "Youku",
    iqiyi: "iQIYI",
    爱奇艺: "iQIYI",
    tencent: "Tencent Video",
    腾讯视频: "Tencent Video",
    tmdb: "TMDb",
    tvmaze: "TVmaze",
    trakt: "Trakt"
  }
  return known[trimmed] ?? known[trimmed.toLowerCase()] ?? trimmed
}

export function toJsonArray(values: string[]): string {
  return JSON.stringify([...new Set(values.filter(Boolean))])
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}
```

- [ ] **Step 5: Implement matcher**

Create `backend/src/domain/matcher.ts`:

```ts
import { normalizeTitle } from "./normalizer"
import type { ExistingMediaCandidate, NormalizedMediaInput } from "./types"

function year(date: string | null): string | null {
  return date?.slice(0, 4) ?? null
}

function hasSharedAlias(input: NormalizedMediaInput, candidate: ExistingMediaCandidate): boolean {
  const inputTitles = [input.titleDisplay, input.titleOriginal ?? "", ...input.titleAliases].map(normalizeTitle).filter(Boolean)
  const candidateTitles = [candidate.titleDisplay, ...candidate.titleAliases].map(normalizeTitle).filter(Boolean)
  return inputTitles.some((title) => candidateTitles.includes(title))
}

export function findBestMatch(input: NormalizedMediaInput, candidates: ExistingMediaCandidate[]): ExistingMediaCandidate | null {
  const byExternalId = candidates.find((candidate) => {
    return (
      (input.tmdbId != null && candidate.tmdbId === input.tmdbId) ||
      (input.tvmazeId != null && candidate.tvmazeId === input.tvmazeId) ||
      (input.imdbId != null && candidate.imdbId === input.imdbId) ||
      (input.traktId != null && candidate.traktId === input.traktId)
    )
  })
  if (byExternalId) return byExternalId

  const inputYear = year(input.firstReleaseDate)
  const inputTitle = normalizeTitle(input.titleDisplay)

  return (
    candidates.find((candidate) => {
      const sameTitle = normalizeTitle(candidate.titleDisplay) === inputTitle || hasSharedAlias(input, candidate)
      const sameYear = inputYear != null && year(candidate.firstReleaseDate) === inputYear
      const sameLanguage = input.originalLanguage != null && candidate.originalLanguage === input.originalLanguage
      return sameTitle && sameYear && sameLanguage
    }) ?? null
  )
}
```

- [ ] **Step 6: Verify tests pass**

Run:

```bash
npm run test --workspace backend -- domain.test.ts
npm run typecheck --workspace backend
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/domain backend/tests/domain.test.ts
git commit -m "feat: 添加媒体类型归类与匹配逻辑"
```

---

## Task 4: Demo Adapter, Sync Persistence, And Events

**Files:**
- Create: `backend/src/adapters/demoSeedAdapter.ts`
- Create: `backend/src/services/eventService.ts`
- Create: `backend/src/services/sourceSyncService.ts`
- Test: `backend/tests/sync.test.ts`

- [ ] **Step 1: Write failing sync test**

Create `backend/tests/sync.test.ts`:

```ts
import { PrismaClient } from "@prisma/client"
import { beforeEach, describe, expect, it } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter"
import { runSourceSync } from "../src/services/sourceSyncService"

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.changeEvent.deleteMany()
  await prisma.popularitySignal.deleteMany()
  await prisma.release.deleteMany()
  await prisma.mediaItem.deleteMany()
  await prisma.sourceSyncRun.deleteMany()
})

describe("runSourceSync", () => {
  it("persists demo media, releases, popularity signals, source run, and events", async () => {
    const result = await runSourceSync(prisma, demoSeedAdapter)

    expect(result.status).toBe("success")
    expect(result.itemCount).toBeGreaterThan(0)

    const mediaCount = await prisma.mediaItem.count()
    const releaseCount = await prisma.release.count()
    const popularityCount = await prisma.popularitySignal.count()
    const eventCount = await prisma.changeEvent.count()
    const runCount = await prisma.sourceSyncRun.count()

    expect(mediaCount).toBeGreaterThanOrEqual(4)
    expect(releaseCount).toBeGreaterThanOrEqual(4)
    expect(popularityCount).toBeGreaterThanOrEqual(4)
    expect(eventCount).toBeGreaterThanOrEqual(4)
    expect(runCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test --workspace backend -- sync.test.ts
```

Expected: FAIL because adapter and services do not exist.

- [ ] **Step 3: Create demo adapter**

Create `backend/src/adapters/demoSeedAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types"

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
```

- [ ] **Step 4: Create event and sync services**

Create `backend/src/services/eventService.ts`:

```ts
import type { PrismaClient } from "@prisma/client"

export async function createMediaDetectedEvent(prisma: PrismaClient, mediaItemId: string, title: string, source: string, sourceUrl: string | null) {
  await prisma.changeEvent.create({
    data: {
      mediaItemId,
      eventType: "media_detected",
      title: `发现新条目：${title}`,
      description: `${source} 检测到 ${title}`,
      source,
      sourceUrl,
      payload: "{}"
    }
  })
}
```

Create `backend/src/services/sourceSyncService.ts`:

```ts
import type { PrismaClient } from "@prisma/client"
import { findBestMatch } from "../domain/matcher"
import { toJsonArray, parseJsonArray } from "../domain/normalizer"
import type { AdapterItem, ExistingMediaCandidate, SourceAdapter } from "../domain/types"
import { createMediaDetectedEvent } from "./eventService"

function heatFromSignals(item: AdapterItem): number {
  const ranked = item.popularitySignals
    .map((signal) => signal.rank)
    .filter((rank): rank is number => typeof rank === "number" && rank > 0)
  if (ranked.length === 0) return 0
  return Math.max(0, 100 - Math.min(...ranked))
}

async function getCandidates(prisma: PrismaClient): Promise<ExistingMediaCandidate[]> {
  const rows = await prisma.mediaItem.findMany()
  return rows.map((row) => ({
    id: row.id,
    titleDisplay: row.titleDisplay,
    titleAliases: parseJsonArray(row.titleAliases),
    firstReleaseDate: row.firstReleaseDate,
    originalLanguage: row.originalLanguage,
    tmdbId: row.tmdbId,
    tvmazeId: row.tvmazeId,
    imdbId: row.imdbId,
    traktId: row.traktId
  }))
}

async function upsertItem(prisma: PrismaClient, item: AdapterItem) {
  const candidates = await getCandidates(prisma)
  const match = findBestMatch(item.media, candidates)
  const heatScore = heatFromSignals(item)

  const mediaItem = match
    ? await prisma.mediaItem.update({
        where: { id: match.id },
        data: {
          titleAliases: toJsonArray([...new Set([...match.titleAliases, ...item.media.titleAliases])]),
          heatScore: Math.max(heatScore, 0),
          updatedAt: new Date()
        }
      })
    : await prisma.mediaItem.create({
        data: {
          mediaType: item.media.mediaType,
          releaseForm: item.media.releaseForm,
          sourceContentType: item.media.sourceContentType,
          titleDisplay: item.media.titleDisplay,
          titleOriginal: item.media.titleOriginal,
          titleAliases: toJsonArray(item.media.titleAliases),
          overview: item.media.overview,
          posterUrl: item.media.posterUrl,
          productionCountries: toJsonArray(item.media.productionCountries),
          originalLanguage: item.media.originalLanguage,
          genres: toJsonArray(item.media.genres),
          firstReleaseDate: item.media.firstReleaseDate,
          status: item.media.status ?? "unknown",
          heatScore,
          tmdbId: item.media.tmdbId,
          tvmazeId: item.media.tvmazeId,
          imdbId: item.media.imdbId,
          traktId: item.media.traktId,
          tvdbId: item.media.tvdbId
        }
      })

  await prisma.release.createMany({
    data: item.releases.map((release) => ({
      mediaItemId: mediaItem.id,
      ...release
    }))
  })

  await prisma.popularitySignal.createMany({
    data: item.popularitySignals.map((signal) => ({
      mediaItemId: mediaItem.id,
      ...signal
    }))
  })

  if (!match) {
    await createMediaDetectedEvent(prisma, mediaItem.id, mediaItem.titleDisplay, item.media.source, item.releases[0]?.sourceUrl ?? null)
  }

  return mediaItem
}

export async function runSourceSync(prisma: PrismaClient, adapter: SourceAdapter) {
  const startedAt = new Date()
  const run = await prisma.sourceSyncRun.create({
    data: { source: adapter.source, status: "running", startedAt }
  })

  try {
    const items = await adapter.fetchItems()
    for (const item of items) {
      await upsertItem(prisma, item)
    }
    const finishedAt = new Date()
    return prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        itemCount: items.length
      }
    })
  } catch (error) {
    const finishedAt = new Date()
    return prisma.sourceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    })
  }
}
```

- [ ] **Step 5: Verify sync**

Run:

```bash
npm run test --workspace backend -- sync.test.ts
npm run typecheck --workspace backend
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/adapters backend/src/services backend/tests/sync.test.ts
git commit -m "feat: 添加演示数据同步与事件生成"
```

---

## Task 5: API Routes

**Files:**
- Create: `backend/src/routes/dashboard.ts`
- Create: `backend/src/routes/media.ts`
- Create: `backend/src/routes/trending.ts`
- Create: `backend/src/routes/calendar.ts`
- Create: `backend/src/routes/sources.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/api.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `backend/tests/api.test.ts`:

```ts
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { demoSeedAdapter } from "../src/adapters/demoSeedAdapter"
import { createApp } from "../src/app"
import { runSourceSync } from "../src/services/sourceSyncService"

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.changeEvent.deleteMany()
  await prisma.popularitySignal.deleteMany()
  await prisma.release.deleteMany()
  await prisma.mediaItem.deleteMany()
  await prisma.sourceSyncRun.deleteMany()
  await runSourceSync(prisma, demoSeedAdapter)
})

describe("api routes", () => {
  it("returns dashboard sections", async () => {
    const response = await request(createApp()).get("/api/dashboard")
    expect(response.status).toBe(200)
    expect(response.body.today.length).toBeGreaterThan(0)
    expect(response.body.week.length).toBeGreaterThan(0)
    expect(response.body.trending.length).toBeGreaterThan(0)
    expect(response.body.sources.length).toBeGreaterThan(0)
  })

  it("filters media by mediaType", async () => {
    const response = await request(createApp()).get("/api/media?mediaType=movie")
    expect(response.status).toBe(200)
    expect(response.body.items.every((item: any) => item.mediaType === "movie")).toBe(true)
  })

  it("returns calendar releases", async () => {
    const response = await request(createApp()).get("/api/calendar?from=2026-06-17&to=2026-06-30")
    expect(response.status).toBe(200)
    expect(response.body.items.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test --workspace backend -- api.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Create route modules**

Create `backend/src/routes/dashboard.ts`:

```ts
import { Router } from "express"
import { db } from "../config/db"

export const dashboardRouter = Router()

dashboardRouter.get("/", async (_req, res) => {
  const today = "2026-06-17"
  const weekEnd = "2026-06-30"

  const [todayReleases, weekReleases, trending, events, sources] = await Promise.all([
    db.release.findMany({ where: { releaseDate: today }, include: { mediaItem: true }, take: 12 }),
    db.release.findMany({ where: { releaseDate: { gte: today, lte: weekEnd } }, include: { mediaItem: true }, take: 24 }),
    db.mediaItem.findMany({ orderBy: { heatScore: "desc" }, take: 12 }),
    db.changeEvent.findMany({ orderBy: { eventAt: "desc" }, take: 20 }),
    db.sourceSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 })
  ])

  res.json({
    today: todayReleases,
    week: weekReleases,
    trending,
    events,
    sources
  })
})
```

Create `backend/src/routes/media.ts`:

```ts
import { Router } from "express"
import { db } from "../config/db"

export const mediaRouter = Router()

mediaRouter.get("/", async (req, res) => {
  const { mediaType, releaseForm, status, sort = "heat", limit = "50" } = req.query
  const take = Math.min(Number(limit) || 50, 100)
  const orderBy = sort === "firstReleaseDate" ? { firstReleaseDate: "asc" as const } : sort === "updatedAt" ? { updatedAt: "desc" as const } : { heatScore: "desc" as const }

  const items = await db.mediaItem.findMany({
    where: {
      mediaType: typeof mediaType === "string" ? mediaType : undefined,
      releaseForm: typeof releaseForm === "string" ? releaseForm : undefined,
      status: typeof status === "string" ? status : undefined
    },
    orderBy,
    take
  })

  res.json({ items, nextCursor: null })
})

mediaRouter.get("/:id", async (req, res) => {
  const item = await db.mediaItem.findUnique({
    where: { id: req.params.id },
    include: {
      releases: { orderBy: { releaseDate: "asc" } },
      popularitySignals: { orderBy: { capturedAt: "desc" } },
      changeEvents: { orderBy: { eventAt: "desc" } }
    }
  })

  if (!item) {
    res.status(404).json({ error: "media_not_found" })
    return
  }

  res.json(item)
})
```

Create `backend/src/routes/trending.ts`:

```ts
import { Router } from "express"
import { db } from "../config/db"

export const trendingRouter = Router()

trendingRouter.get("/", async (req, res) => {
  const { source, mediaType, releaseForm, window } = req.query
  const signals = await db.popularitySignal.findMany({
    where: {
      source: typeof source === "string" ? source : undefined,
      window: typeof window === "string" ? window : undefined,
      mediaItem: {
        mediaType: typeof mediaType === "string" ? mediaType : undefined,
        releaseForm: typeof releaseForm === "string" ? releaseForm : undefined
      }
    },
    include: { mediaItem: true },
    orderBy: [{ rank: "asc" }, { capturedAt: "desc" }],
    take: 50
  })

  res.json({ items: signals })
})
```

Create `backend/src/routes/calendar.ts`:

```ts
import { Router } from "express"
import { db } from "../config/db"

export const calendarRouter = Router()

calendarRouter.get("/", async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : "2026-06-17"
  const to = typeof req.query.to === "string" ? req.query.to : "2026-06-30"
  const { platform, region, mediaType, releaseForm } = req.query

  const items = await db.release.findMany({
    where: {
      releaseDate: { gte: from, lte: to },
      platform: typeof platform === "string" ? platform : undefined,
      region: typeof region === "string" ? region : undefined,
      mediaItem: {
        mediaType: typeof mediaType === "string" ? mediaType : undefined,
        releaseForm: typeof releaseForm === "string" ? releaseForm : undefined
      }
    },
    include: { mediaItem: true },
    orderBy: { releaseDate: "asc" },
    take: 100
  })

  res.json({ items })
})
```

Create `backend/src/routes/sources.ts`:

```ts
import { Router } from "express"
import { db } from "../config/db"
import { demoSeedAdapter } from "../adapters/demoSeedAdapter"
import { runSourceSync } from "../services/sourceSyncService"

export const sourcesRouter = Router()

sourcesRouter.get("/", async (_req, res) => {
  const runs = await db.sourceSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50
  })
  res.json({ items: runs })
})

sourcesRouter.post("/:source/sync", async (req, res) => {
  if (req.params.source !== "demo") {
    res.status(404).json({ error: "source_not_available_in_mvp" })
    return
  }
  const run = await runSourceSync(db, demoSeedAdapter)
  res.json(run)
})
```

- [ ] **Step 4: Mount routes**

Modify `backend/src/app.ts` to:

```ts
import cors from "cors"
import express from "express"
import { env } from "./config/env"
import { calendarRouter } from "./routes/calendar"
import { dashboardRouter } from "./routes/dashboard"
import { mediaRouter } from "./routes/media"
import { sourcesRouter } from "./routes/sources"
import { trendingRouter } from "./routes/trending"

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json())

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "whatsnew-backend" })
  })

  app.use("/api/dashboard", dashboardRouter)
  app.use("/api/media", mediaRouter)
  app.use("/api/trending", trendingRouter)
  app.use("/api/calendar", calendarRouter)
  app.use("/api/sources", sourcesRouter)

  return app
}
```

- [ ] **Step 5: Verify API tests**

Run:

```bash
npm run test --workspace backend -- api.test.ts
npm run typecheck --workspace backend
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes backend/src/app.ts backend/tests/api.test.ts
git commit -m "feat: 添加媒体监控 API"
```

---

## Task 6: Rate Limiter And External Adapter Skeletons

**Files:**
- Create: `backend/src/utils/rateLimiter.ts`
- Create: `backend/src/utils/http.ts`
- Create: `backend/src/adapters/tmdbAdapter.ts`
- Create: `backend/src/adapters/tvmazeAdapter.ts`
- Create: `backend/src/adapters/traktAdapter.ts`
- Create: `backend/src/adapters/youkuAdapter.ts`
- Create: `backend/src/adapters/iqiyiAdapter.ts`
- Test: `backend/tests/rateLimiter.test.ts`

- [ ] **Step 1: Write failing rate limiter test**

Create `backend/tests/rateLimiter.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { RateLimiter } from "../src/utils/rateLimiter"

describe("RateLimiter", () => {
  it("waits at least the configured interval between jobs", async () => {
    const limiter = new RateLimiter(25)
    const started: number[] = []

    await limiter.run(async () => {
      started.push(Date.now())
    })
    await limiter.run(async () => {
      started.push(Date.now())
    })

    expect(started[1] - started[0]).toBeGreaterThanOrEqual(20)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test --workspace backend -- rateLimiter.test.ts
```

Expected: FAIL because RateLimiter does not exist.

- [ ] **Step 3: Implement utilities**

Create `backend/src/utils/rateLimiter.ts`:

```ts
export class RateLimiter {
  private lastRunAt = 0
  private queue = Promise.resolve()

  constructor(private readonly minIntervalMs: number) {}

  run<T>(job: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(async () => {
      const now = Date.now()
      const waitMs = Math.max(0, this.lastRunAt + this.minIntervalMs - now)
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
      this.lastRunAt = Date.now()
      return job()
    })
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }
}
```

Create `backend/src/utils/http.ts`:

```ts
export async function fetchJson<T>(url: string, options: RequestInit & { timeoutMs: number }): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 4: Create adapter skeletons**

Create `backend/src/adapters/tmdbAdapter.ts`:

```ts
import { env } from "../config/env"
import type { SourceAdapter } from "../domain/types"

export const tmdbAdapter: SourceAdapter = {
  source: "tmdb",
  async fetchItems() {
    if (!env.TMDB_API_KEY) return []
    return []
  }
}
```

Create `backend/src/adapters/tvmazeAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types"

export const tvmazeAdapter: SourceAdapter = {
  source: "tvmaze",
  async fetchItems() {
    return []
  }
}
```

Create `backend/src/adapters/traktAdapter.ts`:

```ts
import { env } from "../config/env"
import type { SourceAdapter } from "../domain/types"

export const traktAdapter: SourceAdapter = {
  source: "trakt",
  async fetchItems() {
    if (!env.TRAKT_CLIENT_ID) return []
    return []
  }
}
```

Create `backend/src/adapters/youkuAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types"

export const youkuAdapter: SourceAdapter = {
  source: "youku",
  async fetchItems() {
    return []
  }
}
```

Create `backend/src/adapters/iqiyiAdapter.ts`:

```ts
import type { SourceAdapter } from "../domain/types"

export const iqiyiAdapter: SourceAdapter = {
  source: "iqiyi",
  async fetchItems() {
    return []
  }
}
```

- [ ] **Step 5: Verify utilities and typecheck**

Run:

```bash
npm run test --workspace backend -- rateLimiter.test.ts
npm run typecheck --workspace backend
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils backend/src/adapters/tmdbAdapter.ts backend/src/adapters/tvmazeAdapter.ts backend/src/adapters/traktAdapter.ts backend/src/adapters/youkuAdapter.ts backend/src/adapters/iqiyiAdapter.ts backend/tests/rateLimiter.test.ts
git commit -m "feat: 添加外部源限频与适配器骨架"
```

---

## Task 7: Frontend Baseline

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/styles.css`
- Test: `frontend/tests/app.test.tsx`

- [ ] **Step 1: Create frontend package**

Create `frontend/package.json`:

```json
{
  "name": "@whatsnew/frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 19992",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.15",
    "@whatsnew/shared": "0.1.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

Create `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"]
}
```

Create `frontend/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 19992,
    proxy: {
      "/api": "http://127.0.0.1:19993"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: []
  }
})
```

- [ ] **Step 2: Create app entry**

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WhatsNew</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `frontend/src/main.tsx`:

```tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"
import { App } from "./App"
import "./styles.css"

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

Create `frontend/src/App.tsx`:

```tsx
import { NavLink, Route, Routes } from "react-router-dom"

function PlaceholderPage({ title }: { title: string }) {
  return <main className="page"><h1>{title}</h1></main>
}

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">WhatsNew</div>
        <nav>
          <NavLink to="/">情报台</NavLink>
          <NavLink to="/discover">发现</NavLink>
          <NavLink to="/trending">热度</NavLink>
          <NavLink to="/calendar">日历</NavLink>
          <NavLink to="/sources">数据源</NavLink>
        </nav>
      </aside>
      <Routes>
        <Route path="/" element={<PlaceholderPage title="新片新剧雷达" />} />
        <Route path="/discover" element={<PlaceholderPage title="发现列表" />} />
        <Route path="/trending" element={<PlaceholderPage title="热度榜" />} />
        <Route path="/calendar" element={<PlaceholderPage title="播出日历" />} />
        <Route path="/sources" element={<PlaceholderPage title="数据源状态" />} />
      </Routes>
    </div>
  )
}
```

Create `frontend/src/api/client.ts`:

```ts
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`)
  }
  return response.json() as Promise<T>
}
```

Create `frontend/src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #101312;
  color: #f3f6f4;
}

a {
  color: inherit;
  text-decoration: none;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}

.sidebar {
  border-right: 1px solid #26312e;
  padding: 20px;
  background: #151a18;
}

.brand {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 28px;
}

.sidebar nav {
  display: grid;
  gap: 8px;
}

.sidebar a {
  padding: 10px 12px;
  border-radius: 8px;
  color: #aebbb6;
}

.sidebar a.active {
  background: #d7ff66;
  color: #101312;
}

.page {
  padding: 28px;
}
```

- [ ] **Step 3: Create frontend smoke test**

Create `frontend/tests/app.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { App } from "../src/App"

describe("App", () => {
  it("renders dashboard navigation", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText("WhatsNew")).toBeInTheDocument()
    expect(screen.getByText("新片新剧雷达")).toBeInTheDocument()
    expect(screen.getByText("热度")).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Install and verify frontend**

Run:

```bash
npm install
npm run test --workspace frontend
npm run typecheck --workspace frontend
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add package-lock.json frontend
git commit -m "feat: 初始化前端应用壳"
```

---

## Task 8: Frontend Pages With API Data

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/DiscoverPage.tsx`
- Create: `frontend/src/pages/TrendingPage.tsx`
- Create: `frontend/src/pages/CalendarPage.tsx`
- Create: `frontend/src/pages/SourcesPage.tsx`
- Create: `frontend/src/pages/MediaDetailPage.tsx`
- Create: `frontend/src/components/MediaCard.tsx`
- Create: `frontend/src/components/StatusBadge.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/pages.test.tsx`

- [ ] **Step 1: Create reusable components**

Create `frontend/src/components/StatusBadge.tsx`:

```tsx
export function StatusBadge({ children }: { children: string }) {
  return <span className="status-badge">{children}</span>
}
```

Create `frontend/src/components/MediaCard.tsx`:

```tsx
import type { MediaSummary } from "@whatsnew/shared/media"
import { StatusBadge } from "./StatusBadge"

export function MediaCard({ item }: { item: MediaSummary }) {
  return (
    <article className="media-card">
      <div className="poster">{item.posterUrl ? <img src={item.posterUrl} alt="" /> : <span>{item.mediaType}</span>}</div>
      <div>
        <h3>{item.titleDisplay}</h3>
        <p>{item.releaseForm}</p>
        <StatusBadge>{item.status}</StatusBadge>
        <strong>Heat {Math.round(item.heatScore)}</strong>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Create pages**

Create `frontend/src/pages/DashboardPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<any>("/api/dashboard") })
  if (isLoading) return <main className="page">加载中...</main>

  return (
    <main className="page">
      <h1>新片新剧雷达</h1>
      <section className="dashboard-grid">
        <div className="panel"><h2>今日上线</h2><p>{data?.today?.length ?? 0} 条</p></div>
        <div className="panel"><h2>本周新片新剧</h2><p>{data?.week?.length ?? 0} 条</p></div>
        <div className="panel"><h2>热度上升</h2><p>{data?.trending?.length ?? 0} 条</p></div>
        <div className="panel"><h2>数据源状态</h2><p>{data?.sources?.length ?? 0} 条</p></div>
      </section>
    </main>
  )
}
```

Create `frontend/src/pages/DiscoverPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query"
import type { MediaSummary } from "@whatsnew/shared/media"
import { apiGet } from "../api/client"
import { MediaCard } from "../components/MediaCard"

export function DiscoverPage() {
  const { data, isLoading } = useQuery({ queryKey: ["media"], queryFn: () => apiGet<{ items: MediaSummary[] }>("/api/media") })
  if (isLoading) return <main className="page">加载中...</main>

  return (
    <main className="page">
      <h1>发现列表</h1>
      <div className="media-grid">
        {(data?.items ?? []).map((item) => <MediaCard key={item.id} item={item} />)}
      </div>
    </main>
  )
}
```

Create `frontend/src/pages/TrendingPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"

export function TrendingPage() {
  const { data, isLoading } = useQuery({ queryKey: ["trending"], queryFn: () => apiGet<any>("/api/trending") })
  if (isLoading) return <main className="page">加载中...</main>

  return (
    <main className="page">
      <h1>热度榜</h1>
      <div className="list">
        {(data?.items ?? []).map((signal: any) => (
          <article className="row" key={signal.id}>
            <strong>{signal.mediaItem.titleDisplay}</strong>
            <span>{signal.source} #{signal.rank ?? "-"}</span>
          </article>
        ))}
      </div>
    </main>
  )
}
```

Create `frontend/src/pages/CalendarPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"

export function CalendarPage() {
  const { data, isLoading } = useQuery({ queryKey: ["calendar"], queryFn: () => apiGet<any>("/api/calendar?from=2026-06-17&to=2026-06-30") })
  if (isLoading) return <main className="page">加载中...</main>

  return (
    <main className="page">
      <h1>播出日历</h1>
      <div className="list">
        {(data?.items ?? []).map((release: any) => (
          <article className="row" key={release.id}>
            <strong>{release.releaseDate}</strong>
            <span>{release.mediaItem.titleDisplay}</span>
            <span>{release.platform}</span>
          </article>
        ))}
      </div>
    </main>
  )
}
```

Create `frontend/src/pages/SourcesPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"

export function SourcesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["sources"], queryFn: () => apiGet<any>("/api/sources") })
  if (isLoading) return <main className="page">加载中...</main>

  return (
    <main className="page">
      <h1>数据源状态</h1>
      <div className="list">
        {(data?.items ?? []).map((run: any) => (
          <article className="row" key={run.id}>
            <strong>{run.source}</strong>
            <span>{run.status}</span>
            <span>{run.errorMessage ?? "无错误"}</span>
          </article>
        ))}
      </div>
    </main>
  )
}
```

Create `frontend/src/pages/MediaDetailPage.tsx`:

```tsx
export function MediaDetailPage() {
  return <main className="page"><h1>作品详情</h1></main>
}
```

- [ ] **Step 3: Wire routes**

Modify `frontend/src/App.tsx`:

```tsx
import { NavLink, Route, Routes } from "react-router-dom"
import { CalendarPage } from "./pages/CalendarPage"
import { DashboardPage } from "./pages/DashboardPage"
import { DiscoverPage } from "./pages/DiscoverPage"
import { MediaDetailPage } from "./pages/MediaDetailPage"
import { SourcesPage } from "./pages/SourcesPage"
import { TrendingPage } from "./pages/TrendingPage"

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">WhatsNew</div>
        <nav>
          <NavLink to="/">情报台</NavLink>
          <NavLink to="/discover">发现</NavLink>
          <NavLink to="/trending">热度</NavLink>
          <NavLink to="/calendar">日历</NavLink>
          <NavLink to="/sources">数据源</NavLink>
        </nav>
      </aside>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/media/:id" element={<MediaDetailPage />} />
      </Routes>
    </div>
  )
}
```

- [ ] **Step 4: Extend styles**

Append to `frontend/src/styles.css`:

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.panel,
.media-card,
.row {
  border: 1px solid #26312e;
  background: #171d1b;
  border-radius: 8px;
  padding: 16px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.media-card {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px;
}

.poster {
  width: 72px;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  background: #24302c;
  display: grid;
  place-items: center;
  color: #d7ff66;
  overflow: hidden;
}

.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.status-badge {
  display: inline-flex;
  border-radius: 999px;
  padding: 2px 8px;
  background: #26312e;
  color: #d7ff66;
  font-size: 12px;
}

.list {
  display: grid;
  gap: 10px;
}

.row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) repeat(2, minmax(120px, auto));
  gap: 12px;
  align-items: center;
}
```

- [ ] **Step 5: Verify frontend build**

Run:

```bash
npm run typecheck --workspace frontend
npm run build --workspace frontend
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/tests
git commit -m "feat: 添加前端情报台页面"
```

---

## Task 9: Scheduler, Seed Command, And README Verification

**Files:**
- Create: `backend/src/scheduler.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/package.json`
- Modify: `README.md`

- [ ] **Step 1: Create scheduler**

Create `backend/src/scheduler.ts`:

```ts
import cron from "node-cron"
import { db } from "./config/db"
import { env } from "./config/env"
import { demoSeedAdapter } from "./adapters/demoSeedAdapter"
import { runSourceSync } from "./services/sourceSyncService"

export async function runInitialSync() {
  await runSourceSync(db, demoSeedAdapter)
}

export function registerScheduler() {
  cron.schedule("0 * * * *", async () => {
    await runSourceSync(db, demoSeedAdapter)
  })

  if (env.SYNC_ON_START) {
    runInitialSync().catch((error) => {
      console.error("Initial sync failed", error)
    })
  }
}
```

- [ ] **Step 2: Register scheduler in server**

Modify `backend/src/server.ts`:

```ts
import { createApp } from "./app"
import { env } from "./config/env"
import { registerScheduler } from "./scheduler"

const app = createApp()

registerScheduler()

app.listen(env.PORT, () => {
  console.log(`WhatsNew backend listening on http://localhost:${env.PORT}`)
})
```

- [ ] **Step 3: Add seed script**

Modify `backend/package.json` scripts object to include:

```json
"seed": "tsx src/scripts/seed.ts"
```

Create `backend/src/scripts/seed.ts`:

```ts
import { db } from "../config/db"
import { demoSeedAdapter } from "../adapters/demoSeedAdapter"
import { runSourceSync } from "../services/sourceSyncService"

const run = await runSourceSync(db, demoSeedAdapter)
console.log(`Seed complete: ${run.itemCount} items, status=${run.status}`)
await db.$disconnect()
```

- [ ] **Step 4: Update README**

Replace `README.md` with:

```markdown
# WhatsNew

新片新剧监控情报台，用来追踪全球与中国影视内容的上新、播出、上架和热度变化。

## MVP 范围

- 电影、剧集、动漫、综艺、短剧、纪录片分类型展示
- 展示今日上线、本周新片新剧、热度上升、数据源状态
- 支持 demo seed，无 API key 也能启动和验证
- 后端使用 Express + TypeScript + Prisma + MySQL
- 前端使用 React + Vite + TypeScript

## 开发

```bash
npm install
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 NAS MySQL 的真实用户名和密码
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
npm run seed --workspace backend
npm run dev:backend
npm run dev:frontend
```

前端默认端口 `19992`，后端默认端口 `19993`。

## 验证

```bash
npm run typecheck
npm run test
npm run build
```

## GitHub remote

等空仓库地址确认后，再执行：

```bash
git remote add origin <github-empty-repo-url>
git push -u origin main
```
```

- [ ] **Step 5: Full verification**

Run:

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add README.md backend/src/scheduler.ts backend/src/server.ts backend/src/scripts/seed.ts backend/package.json
git commit -m "docs: 补充启动与验证流程"
```

---

## Task 10: Manual Runtime Verification

**Files:**
- No code changes expected

- [ ] **Step 1: Start backend**

Run:

```bash
npm run dev:backend
```

Expected: backend prints `WhatsNew backend listening on http://localhost:19993`.

- [ ] **Step 2: Seed data in another terminal**

Run:

```bash
npm run seed --workspace backend
```

Expected: output contains `Seed complete: 4 items, status=success`.

- [ ] **Step 3: Check API endpoints**

Run:

```bash
curl -s http://127.0.0.1:19993/api/health
curl -s http://127.0.0.1:19993/api/dashboard
curl -s http://127.0.0.1:19993/api/media?mediaType=movie
curl -s 'http://127.0.0.1:19993/api/calendar?from=2026-06-17&to=2026-06-30'
curl -s http://127.0.0.1:19993/api/sources
```

Expected:

- health returns `{ "ok": true, "service": "whatsnew-backend" }`
- dashboard has `today`, `week`, `trending`, `events`, `sources`
- media filter returns only `mediaType: "movie"`
- calendar returns release rows
- sources returns at least one `demo` sync run

- [ ] **Step 4: Start frontend**

Run:

```bash
npm run dev:frontend
```

Expected: Vite serves `http://127.0.0.1:19992`.

- [ ] **Step 5: Browser verification**

Open `http://127.0.0.1:19992` and verify:

- 首页显示四个信息面板
- `/discover` shows demo media cards
- `/trending` shows ranked signals with source and rank
- `/calendar` shows release dates
- `/sources` shows sync status
- Browser console has no application errors

- [ ] **Step 6: Commit if runtime fixes were needed**

If manual verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: 修复首版运行验证问题"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Typed media: Task 1, Task 3, Task 8
  - MySQL/Prisma model: Task 2
  - Demo seed without API keys: Task 4, Task 9
  - Source status: Task 4, Task 5, Task 8
  - Dashboard/discover/trending/calendar/sources/detail routes: Task 5, Task 8
  - RateLimiter and timeout: Task 6
  - External adapter structure: Task 6
  - Verification standards: Task 9, Task 10
- Red-flag scan:
  - Executable steps contain concrete file paths, commands, and code blocks.
  - Adapter skeletons intentionally return `[]` when keys are missing; that is MVP behavior for disabled external sources.
- Type consistency:
  - Shared `mediaType` and `releaseForm` values match spec.
  - API paths use `/api/media`, `/api/trending`, `/api/calendar`, `/api/sources`, `/api/dashboard`.
  - Frontend routes use `/`, `/discover`, `/trending`, `/calendar`, `/sources`, `/media/:id`.
