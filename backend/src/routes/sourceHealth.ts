import type { SourceHealthResponse } from "@whatsnew/shared/settings"
import { Router } from "express"
import { sourceHealthService } from "../services/sourceHealthService.js"

type SourceHealthService = {
  getSourceHealth(): Promise<SourceHealthResponse>
}

type SourceHealthRouterDependencies = {
  service?: SourceHealthService
}

export function createSourceHealthRouter(dependencies: SourceHealthRouterDependencies = {}): Router {
  const router = Router()
  const service = dependencies.service ?? sourceHealthService

  router.get("/", async (_req, res) => {
    res.json(await service.getSourceHealth())
  })

  return router
}

export const sourceHealthRouter = createSourceHealthRouter()
