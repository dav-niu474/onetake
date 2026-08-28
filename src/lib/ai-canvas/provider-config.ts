/**
 * 模型供应商配置读取（服务端）
 *
 * 按「能力维度」（llm / image / tts / video）读取 ProviderSetting 配置：
 * - builtin：返回 null（调用方回落内置 z-ai-web-dev-sdk）
 * - openai_compatible：返回完整配置（baseUrl 已做尾部斜杠归一化）
 *
 * 带 30s 进程内缓存：执行引擎高频调用，避免每次节点执行都查库；
 * 配置写入（PUT /api/settings/providers）时通过 invalidateProviderConfigCache 主动失效。
 */
import { db } from '@/lib/db'

export type Capability = 'llm' | 'image' | 'tts' | 'video'

export const CAPABILITIES: Capability[] = ['llm', 'image', 'tts', 'video']

export function isCapability(v: unknown): v is Capability {
  return typeof v === 'string' && (CAPABILITIES as string[]).includes(v)
}

export interface ProviderConfig {
  /** 供应商类型：builtin | openai_compatible */
  providerKind: string
  /** OpenAI 兼容 baseUrl（无尾部斜杠），仅 openai_compatible 时存在 */
  baseUrl: string
  /** API Key（明文，仅服务端内存中使用，绝不入库日志/响应） */
  apiKey: string
  /** 模型名 */
  model: string
  /** 音色（仅 tts 能力） */
  voice: string
  /** 是否启用 */
  enabled: boolean
}

interface CacheEntry {
  /** null 表示「无自定义配置」（builtin 或记录不存在） */
  value: ProviderConfig | null
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

/** 归一化 baseUrl：去尾部斜杠与空白；非法 URL 返回 null */
function normalizeBaseUrl(raw?: string | null): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return s.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** 读取原始 DB 记录（无缓存，供 API 层 / 测试使用） */
export async function getProviderRow(capability: Capability) {
  return db.providerSetting.findUnique({ where: { capability } })
}

/**
 * 读取某能力的自定义供应商配置：
 * - 未配置 / builtin / 未启用 / 字段不完整 → null（调用方使用内置 SDK）
 * - openai_compatible 且启用 → 返回完整配置
 */
export async function getProviderConfig(
  capability: Capability,
): Promise<ProviderConfig | null> {
  const now = Date.now()
  const hit = cache().get(capability)
  if (hit && hit.expireAt > now) return hit.value

  let value: ProviderConfig | null = null
  try {
    const row = await db.providerSetting.findUnique({ where: { capability } })
    if (
      row &&
      row.providerKind === 'openai_compatible' &&
      row.enabled &&
      normalizeBaseUrl(row.baseUrl) &&
      row.apiKey
    ) {
      value = {
        providerKind: row.providerKind,
        baseUrl: normalizeBaseUrl(row.baseUrl) as string,
        apiKey: row.apiKey,
        model: (row.model ?? '').trim(),
        voice: (row.voice ?? '').trim(),
        enabled: row.enabled,
      }
    }
  } catch {
    // DB 读取失败时按未配置处理，回落内置 SDK，不阻断执行
    value = null
  }

  cache().set(capability, { value, expireAt: now + CACHE_TTL_MS })
  return value
}

/** 配置变更后主动失效缓存（PUT 保存 / 测试后调用） */
export function invalidateProviderConfigCache(capability?: Capability) {
  if (capability) {
    cache().delete(capability)
  } else {
    cache().clear()
  }
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
