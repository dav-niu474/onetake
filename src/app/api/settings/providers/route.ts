import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  CAPABILITIES,
  getProviderRow,
  invalidateProviderConfigCache,
  isCapability,
  maskApiKey,
} from '@/lib/ai-canvas/provider-config'

/**
 * 模型供应商配置 API（按能力维度：llm | image | tts | video）
 *
 * GET：返回 4 个能力的配置；apiKey 一律脱敏（掩码 + hasKey 布尔），绝不返回明文
 * PUT：按 capability upsert；apiKey 语义：
 *      - 空字符串 / 缺省 → 保留原值
 *      - "-" → 清除密钥
 *      - 其他新值 → 覆盖
 */

/** 供给前端的配置视图（无明文密钥） */
function toView(row: {
  capability: string
  providerKind: string
  baseUrl: string | null
  apiKey: string | null
  model: string | null
  voice: string | null
  enabled: boolean
  updatedAt: Date
}) {
  const hasKey = !!row.apiKey && row.apiKey.trim() !== ''
  return {
    capability: row.capability,
    providerKind: row.providerKind,
    baseUrl: row.baseUrl ?? '',
    apiKeyMask: hasKey ? maskApiKey(row.apiKey) : '',
    hasKey,
    model: row.model ?? '',
    voice: row.voice ?? '',
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET() {
  try {
    const rows = await db.providerSetting.findMany()
    const byCap = new Map(rows.map((r) => [r.capability, r]))
    const items = CAPABILITIES.map((cap) => {
      const row = byCap.get(cap)
      if (row) return toView(row)
      // 未配置过的能力返回默认值（builtin）
      return {
        capability: cap,
        providerKind: 'builtin',
        baseUrl: '',
        apiKeyMask: '',
        hasKey: false,
        model: '',
        voice: '',
        enabled: true,
        updatedAt: null,
      }
    })
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[settings/providers] GET 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '读取模型服务配置失败，请稍后重试' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      capability?: unknown
      providerKind?: unknown
      baseUrl?: unknown
      apiKey?: unknown
      model?: unknown
      voice?: unknown
      enabled?: unknown
    } | null
    if (!body || !isCapability(body.capability)) {
      return NextResponse.json(
        { error: '参数错误：capability 必须是 llm / image / tts / video 之一' },
        { status: 400 },
      )
    }
    const capability = body.capability

    const providerKind =
      body.providerKind === 'openai_compatible' ? 'openai_compatible' : 'builtin'
    const enabled = body.enabled === undefined ? true : body.enabled === true

    // openai_compatible 时校验 baseUrl 格式
    let baseUrl: string | null = null
    if (providerKind === 'openai_compatible') {
      const raw = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
      if (!raw) {
        return NextResponse.json(
          { error: '自定义供应商需要填写 Base URL' },
          { status: 400 },
        )
      }
      try {
        const u = new URL(raw)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return NextResponse.json(
            { error: 'Base URL 必须以 http:// 或 https:// 开头' },
            { status: 400 },
          )
        }
      } catch {
        return NextResponse.json({ error: 'Base URL 格式不合法' }, { status: 400 })
      }
      baseUrl = raw.replace(/\/+$/, '')
    }

    const existing = await getProviderRow(capability)

    // apiKey 语义：空串/缺省=保留原值；"-"=清除；其他=覆盖
    let apiKey: string | null = existing?.apiKey ?? null
    if (typeof body.apiKey === 'string') {
      if (body.apiKey === '-') {
        apiKey = null
      } else if (body.apiKey.trim() !== '') {
        apiKey = body.apiKey.trim()
      }
    }

    const model = typeof body.model === 'string' && body.model.trim() !== '' ? body.model.trim() : null
    const voice = typeof body.voice === 'string' && body.voice.trim() !== '' ? body.voice.trim() : null

    if (providerKind === 'openai_compatible' && !apiKey) {
      return NextResponse.json(
        { error: '自定义供应商需要填写 API Key（已有密钥可留空不修改）' },
        { status: 400 },
      )
    }

    const data = {
      capability,
      providerKind,
      baseUrl,
      apiKey,
      model,
      voice,
      enabled,
    }

    const saved = existing
      ? await db.providerSetting.update({ where: { capability }, data })
      : await db.providerSetting.create({ data })

    invalidateProviderConfigCache(capability)

    return NextResponse.json({
      ok: true,
      item: toView(saved),
      message: `${capabilityLabel(capability)}配置已保存`,
    })
  } catch (err) {
    console.error('[settings/providers] PUT 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '保存模型服务配置失败，请稍后重试' }, { status: 500 })
  }
}

function capabilityLabel(cap: string): string {
  switch (cap) {
    case 'llm':
      return '文本生成（LLM）'
    case 'image':
      return '图像生成'
    case 'tts':
      return '语音合成（TTS）'
    case 'video':
      return '视频生成'
    default:
      return cap
  }
}
