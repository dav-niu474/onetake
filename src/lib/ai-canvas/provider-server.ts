/**
 * 供应商账户 / 能力路由的 API 视图（服务端共享）
 * apiKey 一律脱敏，绝不返回明文。
 */
import { db } from '@/lib/db'
import { CAPABILITIES, maskApiKey, type Capability } from './provider-config'

export interface AccountView {
  id: string
  presetId: string
  name: string
  protocol: string
  baseUrl: string
  apiKeyMask: string
  hasKey: boolean
  /** 已拉取/手动添加的模型列表 */
  models: string[]
  enabled: boolean
  /** unverified | ok | error */
  status: string
  statusMessage: string
  latencyMs: number | null
  updatedAt: string
}

interface AccountRowLike {
  id: string
  presetId: string
  name: string
  protocol: string
  baseUrl: string
  apiKey: string | null
  models: string
  enabled: boolean
  status: string
  statusMessage: string | null
  latencyMs: number | null
  updatedAt: Date
}

export function parseAccountModels(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw ?? '[]')
    return Array.isArray(arr) ? arr.filter((m): m is string => typeof m === 'string') : []
  } catch {
    return []
  }
}

export function toAccountView(row: AccountRowLike): AccountView {
  const hasKey = !!row.apiKey && row.apiKey.trim() !== ''
  return {
    id: row.id,
    presetId: row.presetId,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.baseUrl,
    apiKeyMask: hasKey ? maskApiKey(row.apiKey) : '',
    hasKey,
    models: parseAccountModels(row.models),
    enabled: row.enabled,
    status: row.status,
    statusMessage: row.statusMessage ?? '',
    latencyMs: row.latencyMs,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface CapabilityRouteView {
  capability: Capability
  providerKind: string // builtin | account | openai_compatible(legacy)
  accountId: string | null
  accountName: string
  model: string
  voice: string
  enabled: boolean
  /** 账户协议（能力路由 UI 用于过滤不支持的供应商） */
  protocol: string | null
}

interface SettingRowLike {
  capability: string
  providerKind: string
  accountId: string | null
  baseUrl: string | null
  apiKey: string | null
  model: string | null
  voice: string | null
  enabled: boolean
}

export function toCapabilityRouteView(
  cap: Capability,
  row: SettingRowLike | undefined,
  accountById: Map<string, { name: string; protocol: string }>,
): CapabilityRouteView {
  if (!row) {
    return {
      capability: cap,
      providerKind: 'builtin',
      accountId: null,
      accountName: '',
      model: '',
      voice: '',
      enabled: true,
      protocol: null,
    }
  }
  const acct = row.accountId ? accountById.get(row.accountId) : undefined
  const isLegacy = row.providerKind === 'openai_compatible'
  return {
    capability: row.capability as Capability,
    providerKind: row.providerKind,
    accountId: row.accountId,
    accountName: acct?.name ?? (isLegacy ? '旧版自定义配置' : ''),
    model: row.model ?? '',
    voice: row.voice ?? '',
    enabled: row.enabled,
    protocol: acct?.protocol ?? (isLegacy ? 'openai' : null),
  }
}

/** 拉取全部账户 + 4 能力路由视图（一次往返） */
export async function loadProvidersState() {
  const [accounts, settings] = await Promise.all([
    db.providerAccount.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.providerSetting.findMany(),
  ])
  const accountById = new Map(accounts.map((a) => [a.id, { name: a.name, protocol: a.protocol }]))
  const byCap = new Map(settings.map((s) => [s.capability, s]))
  return {
    accounts: accounts.map(toAccountView),
    capabilities: CAPABILITIES.map((cap) => toCapabilityRouteView(cap, byCap.get(cap), accountById)),
  }
}
