import "./env.js"
import { PrismaClient } from "@prisma/client"

export const db = new PrismaClient()
