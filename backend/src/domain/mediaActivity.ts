import type { Prisma } from "@prisma/client"

export const ACTIVE_MEDIA_WHERE = {
  sourceRefs: { some: { isActive: true } }
} as const satisfies Prisma.MediaItemWhereInput
