import { PrismaClient } from '@prisma/client'

// SCHEMA_VERSION: ProviderSetting added — model provider config per capability (2026-02-14) — bump to bust global client cache after prisma db:push
const SCHEMA_VERSION = 'v4'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaVersion: string | undefined
}

/* eslint-disable @typescript-eslint/no-require-imports */
function makeClient(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaSchemaVersion === SCHEMA_VERSION) {
    return globalForPrisma.prisma
  }
  if (globalForPrisma.prisma && globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
    // 版本不匹配：dev 热更场景下 require 缓存里可能是 db:push 前的旧客户端（新模型缺失），
    // 清缓存重新加载新生成的客户端，schema 变更免重启即生效（见 prisma-fresh.cjs）
    try {
      const loadFresh = require('./prisma-fresh.cjs') as () => typeof PrismaClient
      const Fresh = loadFresh()
      console.log('[db] SCHEMA_VERSION 变更，已重载新 Prisma Client:', SCHEMA_VERSION)
      return new Fresh({ log: ['query'] }) as PrismaClient
    } catch (e) {
      console.error('[db] 重载 Prisma Client 失败，退回常规路径:', e)
    }
  }
  return new PrismaClient({ log: ['query'] })
}

export const db = makeClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION
}
