/**
 * 模型供应商配置读取（服务端）
 *
 * 架构（v2，供应商预置体系）：
 * - ProviderAccount  供应商账户实例（预置目录或自定义：protocol/baseUrl/apiKey/models）
 * - ProviderSetting  能力路由（llm/image/tts/video → builtin | 指向某 account 的某模型）
 *
 * getProviderConfig(capability) 供执行引擎调用：
 * - builtin / 未配置 / 未启用 → null（调用方回落内置 z-ai-web-dev-sdk）
 * - account → 解析账户得到 protocol + baseUrl + apiKey + model
 * - openai_compatible（v1 旧版直填，兼容保留，protocol 固定 openai）
 *
 * 带 30s 进程内缓存；配置写入时通过 invalidateProviderConfigCache 主动失效。
 */
import { db } from '@/lib/db'
import { normalizeBaseUrl, type ProtocolEndpoint } from './provider-protocol'
import type { ProviderProtocol } from './provider-presets'

export type Capability = 'llm' | 'image' | 'tts' | 'video'

export const CAPABILITIES: Capability[] = ['llm', 'image', 'tts', 'video']

export function isCapability(v: unknown): v is Capability {
  return typeof v === 'string' && (CAPABILITIES as string[]).includes(v)
}

export interface ResolvedProvider extends ProtocolEndpoint {
  /** 配置来源：account = 供应商账户；openai_compatible = v1 旧版直填 */
  source: 'account' | 'openai_compatible'
  /** 来源账户 id / 名称（用于执行日志展示） */
  accountId?: string
  accountName?: string
  /** 该能力路由所选模型（账户模型列表中的一项） */
  model: string
  /** 音色（仅 tts 能力） */
  voice: string
  enabled: boolean
}

interface CacheEntry {
  /** null 表示「无自定义配置」（builtin 或记录不存在） */
  value: ResolvedProvider | null
  expireAt: number
}

const CACHE_TTL_MS = 30_000

const globalForProvider = globalThis as unknown as {
  providerConfigCache: Map<Capability, CacheEntry> | undefined
}

function cache(): Map<Capability, CacheEntry> {
  if (!globalForProvider.providerConfigCache) {
    globalForProvider.providerConfigCache = new Map()
  }
  return globalForProvider.providerConfigCache
}

/** 读取原始 DB 记录（无缓存，供 API 层使用） */
export async function getProviderRow(capability: Capability) {
  return db.providerSetting.findUnique({ where: { capability } })
}

/**
 * 解析某能力的生效供应商配置：
 * - 未配置 / builtin / 未启用 / 字段不完整 / 账户被禁用或删除 → null（使用内置 SDK）
 */
export async function getProviderConfig(
  capability: Capability,
): Promise<ResolvedProvider | null> {
  const now = Date.now()
  const hit = cache().get(capability)
  if (hit && hit.expireAt > now) return hit.value

  let value: ResolvedProvider | null = null
  try {
    const row = await db.providerSetting.findUnique({ where: { capability } })
    if (row && row.enabled) {
      if (row.providerKind === 'account' && row.accountId) {
        const acct = await db.providerAccount.findUnique({ where: { id: row.accountId } })
        const baseUrl = normalizeBaseUrl(acct?.baseUrl)
        // 本地推理（localhost/127.0.0.1）无需密钥；远端服务必须已保存 apiKey
        const isLocal = !!baseUrl && /^(http:\/\/)?(localhost|127\.0\.0\.1)/.test(baseUrl)
        if (acct && acct.enabled && baseUrl && (acct.apiKey || isLocal)) {
          value = {
            source: 'account',
            accountId: acct.id,
            accountName: acct.name,
            protocol: acct.protocol as ProviderProtocol,
            baseUrl,
            apiKey: acct.apiKey ?? '',
            model: (row.model ?? '').trim(),
            voice: (row.voice ?? '').trim(),
            enabled: row.enabled,
          }
        }
      } else if (
        row.providerKind === 'openai_compatible' &&
        normalizeBaseUrl(row.baseUrl) &&
        row.apiKey
      ) {
        // v1 旧版直填配置：视作 openai 协议
        value = {
          source: 'openai_compatible',
          protocol: 'openai',
          baseUrl: normalizeBaseUrl(row.baseUrl) as string,
          apiKey: row.apiKey,
          model: (row.model ?? '').trim(),
          voice: (row.voice ?? '').trim(),
          enabled: row.enabled,
        }
      }
    }
  } catch {
    // DB 读取失败时按未配置处理，回落内置 SDK，不阻断执行
    value = null
  }

  cache().set(capability, { value, expireAt: now + CACHE_TTL_MS })
  return value
}

/** 配置变更后主动失效缓存（保存账户 / 删除账户 / 改路由后调用） */
export function invalidateProviderConfigCache(capability?: Capability) {
  if (capability) {
    cache().delete(capability)
  } else {
    cache().clear()
  }
}

/**
 * v1 → v2 一次性迁移：把旧版 openai_compatible 直填行转换为 ProviderAccount
 * 并将能力路由指向新账户（幂等：仅处理仍为 openai_compatible 的行）
 */
export async function migrateLegacyProviderRows(): Promise<number> {
  const legacy = await db.providerSetting.findMany({ where: { providerKind: 'openai_compatible' } })
  let migrated = 0
  for (const row of legacy) {
    const baseUrl = normalizeBaseUrl(row.baseUrl)
    if (!baseUrl) {
      // 无法迁移的脏数据：直接重置为内置
      await db.providerSetting.update({
        where: { capability: row.capability },
        data: { providerKind: 'builtin', baseUrl: null, apiKey: null, model: null, voice: null },
      })
      continue
    }
    const acct = await db.providerAccount.create({
      data: {
        presetId: 'custom',
        name: `旧版自定义（${CAPABILITY_SHORT[row.capability] ?? row.capability}）`,
        protocol: 'openai',
        baseUrl,
        apiKey: row.apiKey,
        models: JSON.stringify(row.model ? [row.model] : []),
        enabled: row.enabled,
        status: 'unverified',
      },
    })
    await db.providerSetting.update({
      where: { capability: row.capability },
      data: {
        providerKind: 'account',
        accountId: acct.id,
        baseUrl: null,
        apiKey: null,
        voice: row.voice,
      },
    })
    migrated++
  }
  if (migrated > 0) invalidateProviderConfigCache()
  return migrated
}

const CAPABILITY_SHORT: Record<string, string> = {
  llm: '文本',
  image: '图像',
  tts: '语音',
  video: '视频',
}

/** 掩码显示 API Key：sk-abcd1234wxyz → sk-***wxyz（少于 8 位整体打码） */
export function maskApiKey(key?: string | null): string {
  if (!key) return ''
  const s = key.trim()
  if (s.length <= 8) return '***'
  const prefix = s.startsWith('sk-') || s.startsWith('Bearer ') ? s.slice(0, 3) : ''
  const head = prefix ? s.slice(3) : s
  const tail = head.slice(-4)
  return `${prefix}***${tail}`
}
