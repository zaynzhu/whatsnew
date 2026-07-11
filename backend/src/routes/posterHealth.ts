import { Router } from "express"
import { db } from "../config/db.js"
import { createPosterHealthService, type PosterHealthResponse } from "../services/posterHealthService.js"

type PosterHealthService = {
  getHealth(): Promise<PosterHealthResponse>
}

export function createPosterHealthRouter(dependencies: { service?: PosterHealthService } = {}): Router {
  const router = Router()
  const service = dependencies.service ?? createPosterHealthService({ database: db })

  router.get("/", async (_req, res) => {
    res.json(await service.getHealth())
  })

  return router
}

export const posterHealthRouter = createPosterHealthRouter()
