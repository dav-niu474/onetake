import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  invalidateProviderConfigCache,
  isCapability,
  migrateLegacyProviderRows,
} from '@/lib/ai-canvas/provider-config'
import { loadProvidersState, toAccountView } from '@/lib/ai-canvas/provider-server'
import { normalizeBaseUrl } from '@/lib/ai-canvas/provider-protocol'
import { CUSTOM_PRESET_ID, PROVIDER_PRESETS } from '@/lib/ai-canvas/provider-presets'

/**
 * 供应商账户 API
 *
 * GET   返回 { accounts, capabilities }：账户列表（密钥脱敏）+ 4 能力路由视图；
 *       首次访问时自动把 v1 旧版 openai_compatible 直填配置迁移为账户。
 * POST  upsert 账户。apiKey 语义：'' 保留原值 / '-' 清除 / 新值覆盖。
 *       保存时携带测试结果（models/status/latencyMs），实现「测试通过才保存」的体验。
 * PUT   更新能力路由（capability → account/model/voice/enabled）。
 */

const PRESET_IDS = new Set([CUSTOM_PRESET_ID, ...PROVIDER_PRESETS.map((p) => p.id)])
const PROTOCOLS = new Set(['openai', 'anthropic', 'gemini'])

export async function GET() {
  try {
    const migrated = await migrateLegacyProviderRows().catch(() => 0)
    if (migrated > 0) {
      console.log('[providers] 已迁移旧版直填配置为账户:', migrated)
    }
    const state = await loadProvidersState()
    return NextResponse.json(state)
  } catch (err) {
    console.error('[providers] GET 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '读取供应商配置失败，请稍后重试' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
    }

    const id = typeof body.id === 'string' && body.id.trim() !== '' ? body.id.trim() : null
    const presetId =
      typeof body.presetId === 'string' && PRESET_IDS.has(body.presetId) ? body.presetId : CUSTOM_PRESET_ID
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : ''
    const protocol = typeof body.protocol === 'string' && PROTOCOLS.has(body.protocol) ? body.protocol : 'openai'
    const enabled = body.enabled === undefined ? true : body.enabled === true

    if (!name) {
      return NextResponse.json({ error: '请填写供应商名称' }, { status: 400 })
    }

    const baseUrl = normalizeBaseUrl(typeof body.baseUrl === 'string' ? body.baseUrl : null)
    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Base URL 必须是以 http:// 或 https:// 开头的合法地址' },
        { status: 400 },
      )
    }

    // 本地推理（localhost/127.0.0.1）允许无密钥
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl)
    const existing = id ? await db.providerAccount.findUnique({ where: { id } }) : null

    let apiKey: string | null = existing?.apiKey ?? null
    if (typeof body.apiKey === 'string') {
      if (body.apiKey === '-') apiKey = null
      else if (body.apiKey.trim() !== '') apiKey = body.apiKey.trim()
    }
    if (!apiKey && !isLocal) {
      return NextResponse.json(
        { error: '请填写 API Key（本地服务除外）；已有密钥可留空不修改' },
        { status: 400 },
      )
    }

    // 模型列表：测试连接拉取的 + 手动添加的
    let models: string[] | undefined
    if (Array.isArray(body.models)) {
      models = body.models
        .filter((m): m is string => typeof m === 'string')
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 500)
    }

    // 测试状态：仅接受合法枚举
    const status =
      typeof body.status === 'string' && ['unverified', 'ok', 'error'].includes(body.status)
        ? body.status
        : (existing?.status ?? 'unverified')
    const statusMessage =
      typeof body.statusMessage === 'string' ? body.statusMessage.slice(0, 300) : (existing?.statusMessage ?? null)
    const latencyMs = typeof body.latencyMs === 'number' && Number.isFinite(body.latencyMs) ? Math.round(body.latencyMs) : (existing?.latencyMs ?? null)

    const data = {
      presetId,
      name,
      protocol,
      baseUrl,
      apiKey,
      enabled,
      ...(models !== undefined ? { models: JSON.stringify(models) } : {}),
      status,
      statusMessage,
      latencyMs,
    }

    const saved = existing
      ? await db.providerAccount.update({ where: { id }, data })
      : await db.providerAccount.create({ data })

    invalidateProviderConfigCache()

    return NextResponse.json({
      ok: true,
      item: toAccountView(saved),
      message: `「${saved.name}」已保存`,
    })
  } catch (err) {
    console.error('[providers] POST 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '保存供应商失败，请稍后重试' }, { status: 500 })
  }
}

/** 能力路由更新（PUT /api/providers） */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || !isCapability(body.capability)) {
      return NextResponse.json(
        { error: '参数错误：capability 必须是 llm / image / tts / video 之一' },
        { status: 400 },
      )
    }
    const capability = body.capability
    const providerKind = body.providerKind === 'account' ? 'account' : 'builtin'
    const enabled = body.enabled === undefined ? true : body.enabled === true

    let accountId: string | null = null
    if (providerKind === 'account') {
      accountId = typeof body.accountId === 'string' ? body.accountId : ''
      if (!accountId) {
        return NextResponse.json({ error: '请选择供应商账户' }, { status: 400 })
      }
      const acct = await db.providerAccount.findUnique({ where: { id: accountId } })
      if (!acct) {
        return NextResponse.json({ error: '所选供应商账户不存在，请刷新后重试' }, { status: 400 })
      }
    }

    const model =
      typeof body.model === 'string' && body.model.trim() !== '' ? body.model.trim() : null
    const voice =
      typeof body.voice === 'string' && body.voice.trim() !== '' ? body.voice.trim() : null

    const existing = await db.providerSetting.findUnique({ where: { capability } })
    const data = { capability, providerKind, accountId, model, voice, enabled }
    const saved = existing
      ? await db.providerSetting.update({ where: { capability }, data })
      : await db.providerSetting.create({ data })

    invalidateProviderConfigCache(capability)

    return NextResponse.json({
      ok: true,
      message: `${CAP_LABEL[capability] ?? capability}路由已更新`,
      item: { capability: saved.capability, providerKind: saved.providerKind, accountId: saved.accountId },
    })
  } catch (err) {
    console.error('[providers] PUT 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '更新能力路由失败，请稍后重试' }, { status: 500 })
  }
}

const CAP_LABEL: Record<string, string> = {
  llm: '文本生成（LLM）',
  image: '图像生成',
  tts: '语音合成（TTS）',
  video: '视频生成',
}
