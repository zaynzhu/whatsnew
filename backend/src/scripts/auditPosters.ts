import { db } from "../config/db.js"
import { createPosterHealthService } from "../services/posterHealthService.js"

try {
  const service = createPosterHealthService({ database: db })
  console.log(JSON.stringify(await service.getHealth(), null, 2))
} finally {
  await db.$disconnect()
}
