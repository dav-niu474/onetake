/**
 * dev 热更辅助：prisma db push 重新生成客户端后，正在运行的 dev server
 * 仍持有 require 缓存中的旧 Prisma Client（新模型缺失）。
 * 该模块在 SCHEMA_VERSION 不匹配时清掉相关缓存并重新加载新客户端，
 * 使 schema 变更无需重启 dev server 即可生效。生产构建（全新进程）不经过此路径。
 */
module.exports = function loadFreshPrismaClient() {
  // Turbopack 会沙箱化 require.cache（外部依赖标记为 [externals]），
  // 真正的 Node require 缓存需通过 module 模块内置的 _cache 触达
  let Module = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Module = require('module')
  } catch {
    /* ignore */
  }
  const caches = [require.cache]
  if (Module && Module._cache && Module._cache !== require.cache) {
    caches.push(Module._cache)
  }

  for (const c of caches) {
    for (const id of Object.keys(c)) {
      if (id.includes('/.prisma/') || id.includes('@prisma')) {
        delete c[id]
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@prisma/client')
  const probe = new mod.PrismaClient()
  const ok = typeof probe.providerSetting === 'object' && typeof probe.providerAccount === 'object'
  try {
    void probe.$disconnect()
  } catch {
    /* ignore */
  }
  if (!ok) throw new Error('fresh prisma client still missing providerAccount')
  return mod.PrismaClient
}
