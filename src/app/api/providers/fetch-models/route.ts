import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchModelList, normalizeBaseUrl } from '@/lib/ai-canvas/provider-protocol'
import type { ProviderProtocol } from '@/lib/ai-canvas/provider-presets'

/**
 * 测试连接并拉取模型列表（POST /api/providers/fetch-models）
 *
 * 输入：{ protocol, baseUrl, apiKey?, accountId? }
 * - accountId 存在且 apiKey 留空 → 使用已保存密钥（避免明文回传）
 * - 成功 = 连通 + 鉴权通过（拉到模型列表），返回 { ok, models, latencyMs, message }
 * - 失败返回 { ok:false, error }（HTTP 200，便于前端统一以 ok 字段渲染测试结果）
 *
 * 本接口无副作用（不写库）：正式保存走 POST /api/providers 并携带测试结果。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      protocol?: unknown
      baseUrl?: unknown
      apiKey?: unknown
      accountId?: unknown
    } | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '请求体格式错误' }, { status: 400 })
    }

    const protocol =
      typeof body.protocol === 'string' && ['openai', 'anthropic', 'gemini'].includes(body.protocol)
        ? (body.protocol as ProviderProtocol)
        : 'openai'
    const baseUrl = normalizeBaseUrl(typeof body.baseUrl === 'string' ? body.baseUrl : null)
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: 'Base URL 必须是以 http:// 或 https:// 开头的合法地址' },
        { status: 200 },
      )
    }

    // 密钥：请求携带优先（新输入未保存），否则回退已保存密钥
    let apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() !== '' ? body.apiKey.trim() : ''
    if (!apiKey && typeof body.accountId === 'string' && body.accountId) {
      const acct = await db.providerAccount.findUnique({ where: { id: body.accountId } })
      if (!acct) {
        return NextResponse.json({ ok: false, error: '所选供应商账户不存在' }, { status: 200 })
      }
      apiKey = acct.apiKey ?? ''
    }

    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl)
    if (!apiKey && !isLocal) {
      return NextResponse.json(
        { ok: false, error: '请先填写 API Key 再测试连接' },
        { status: 200 },
      )
    }

    try {
      const { models, latencyMs } = await fetchModelList({ protocol, baseUrl, apiKey })
      if (models.length === 0) {
        return NextResponse.json({
          ok: true,
          models: [],
          latencyMs,
          message: '连接正常，但该密钥下未返回任何模型（部分厂商不开放列表接口，可手动添加模型名）',
        })
      }
      return NextResponse.json({
        ok: true,
        models,
        latencyMs,
        message: `连接正常，获取到 ${models.length} 个模型`,
      })
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : '测试连接失败' },
        { status: 200 },
      )
    }
  } catch (err) {
    console.error('[providers/fetch-models] 失败:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: '测试请求处理失败，请稍后重试' }, { status: 200 })
  }
}
