import { PrismaClient } from '@prisma/client'

// SCHEMA_VERSION: remoteTaskId added (2026-08-28) — bump to bust global client cache after prisma db:push
const SCHEMA_VERSION = 'v2'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaVersion: string | undefined
}

export const db =
  (globalForPrisma.prisma && globalForPrisma.prismaSchemaVersion === SCHEMA_VERSION
    ? globalForPrisma.prisma
    : undefined) ?? new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION
}
