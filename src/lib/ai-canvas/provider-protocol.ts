/**
 * 模型供应商协议适配层（服务端专用）
 *
 * 统一封装三种协议的「拉取模型列表」与「文本生成」调用：
 * - openai    GET /models · POST /chat/completions
 * - anthropic GET /v1/models · POST /v1/messages
 * - gemini    GET /v1beta/models · POST /v1beta/models/{model}:generateContent
 *
 * 所有请求带超时保护；错误统一映射为中文提示（绝不回显 apiKey）。
 */
import type { ProviderProtocol } from './provider-presets'

const FETCH_TIMEOUT_MS = 15_000

export interface ProtocolEndpoint {
  protocol: ProviderProtocol
  /** 已归一化（无尾部斜杠）的 baseUrl */
  baseUrl: string
  apiKey: string
}

export interface FetchModelsResult {
  models: string[]
  latencyMs: number
}

/* ------------------------------- 基础工具 ------------------------------- */

/** 归一化 baseUrl：去尾部斜杠与空白；非法 URL 抛错 */
export function normalizeBaseUrl(raw?: string | null): string | null {
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

function authHeaders(protocol: ProviderProtocol, apiKey: string): Record<string, string> {
  if (protocol === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // 兼容经过 OpenAI 风格网关转发时也可能读取 Bearer
      Authorization: `Bearer ${apiKey}`,
    }
  }
  // openai / gemini(generateContent 用 query key，但带 Bearer 无害)
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

/** 带超时的 fetch（服务端出网统一入口） */
async function timedFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  const timer = setTimeout(() => {
    throw new Error(`${label}请求超时（${FETCH_TIMEOUT_MS / 1000}s），请检查网络或服务地址`)
  }, FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('abort')) {
      throw new Error(`${label}请求超时（${FETCH_TIMEOUT_MS / 1000}s），请检查服务地址与网络连通性`)
    }
    throw new Error(`${label}无法连接：${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

/** 将上游 HTTP 错误翻译为中文提示（截断上游 detail，不回显密钥） */
export async function protocolError(res: Response, label: string): Promise<Error> {
  let detail = ''
  try {
    const text = await res.text()
    if (text) {
      let msg = text
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
        if (typeof j.error === 'string') msg = j.error
        else if (j.error?.message) msg = j.error.message
        else if (j.message) msg = j.message
      } catch {
        /* 非 JSON 响应，用原文 */
      }
      detail = msg.replace(/\s+/g, ' ').slice(0, 140)
    }
  } catch {
    /* ignore */
  }
  switch (res.status) {
    case 401:
    case 403:
      return new Error(`${label}鉴权失败：API Key 无效或无权限（HTTP ${res.status}）`)
    case 404:
      return new Error(
        `${label}接口不存在（HTTP 404）：请检查 Base URL 是否正确（OpenAI 兼容地址通常需以 /v1 结尾）`,
      )
    case 429:
      return new Error(`${label}触发限流或额度不足（HTTP 429），请稍后重试${detail ? `：${detail}` : ''}`)
    default:
      return new Error(`${label}失败：HTTP ${res.status}${detail ? `（${detail}）` : ''}`)
  }
}

/* ----------------------------- 拉取模型列表 ----------------------------- */

/**
 * 按协议拉取该 Key 可用的模型列表。
 * 成功即代表「连通 + 鉴权通过」，作为测试连接的依据。
 */
export async function fetchModelList(ep: ProtocolEndpoint): Promise<FetchModelsResult> {
  const label = PROTOCOL_TEST_LABEL[ep.protocol]
  const start = Date.now()

  let url: string
  if (ep.protocol === 'anthropic') {
    url = `${ep.baseUrl}/v1/models?limit=200`
  } else if (ep.protocol === 'gemini') {
    const keyQ = ep.apiKey ? `?key=${encodeURIComponent(ep.apiKey)}&pageSize=200` : '?pageSize=200'
    url = `${ep.baseUrl}/v1beta/models${keyQ}`
  } else {
    url = `${ep.baseUrl}/models`
  }

  const res = await timedFetch(
    url,
    { method: 'GET', headers: { ...authHeaders(ep.protocol, ep.apiKey), Accept: 'application/json' } },
    label,
  )
  const latencyMs = Date.now() - start
  if (!res.ok) throw await protocolError(res, label)

  const j = (await res.json().catch(() => null)) as unknown
  let models: string[] = []

  if (ep.protocol === 'gemini') {
    const arr = (j as { models?: { name?: string; supportedGenerationMethods?: string[] }[] })?.models ?? []
    models = arr
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
  } else {
    const arr = (j as { data?: { id?: string }[] })?.data ?? []
    models = arr.map((m) => (m.id ?? '').trim()).filter(Boolean)
  }

  // 排序去重
  models = Array.from(new Set(models)).sort((a, b) => a.localeCompare(b))
  return { models, latencyMs }
}

const PROTOCOL_TEST_LABEL: Record<ProviderProtocol, string> = {
  openai: '模型服务',
  anthropic: 'Anthropic 服务',
  gemini: 'Gemini 服务',
}

/* ------------------------------- 文本生成 ------------------------------- */

export interface ChatRequest {
  /** 模型名 */
  model: string
  system?: string
  user: string
  temperature?: number
  /** 部分协议必须指定最大输出 token */
  maxTokens?: number
}

/** 按协议调用文本生成，返回拼接后的纯文本内容 */
export async function callChat(ep: ProtocolEndpoint, req: ChatRequest): Promise<string> {
  if (!req.model.trim()) {
    throw new Error('未指定模型名：请先在供应商配置中获取模型列表并选择')
  }
  switch (ep.protocol) {
    case 'anthropic':
      return callChatAnthropic(ep, req)
    case 'gemini':
      return callChatGemini(ep, req)
    default:
      return callChatOpenAI(ep, req)
  }
}

async function callChatOpenAI(ep: ProtocolEndpoint, req: ChatRequest): Promise<string> {
  const res = await timedFetch(
    `${ep.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders('openai', ep.apiKey) },
      body: JSON.stringify({
        model: req.model.trim(),
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          { role: 'user', content: req.user },
        ],
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      }),
    },
    '自定义模型',
  )
  if (!res.ok) throw await protocolError(res, '自定义模型')
  const j = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
  } | null
  const content = j?.choices?.[0]?.message?.content
  if (!content || !String(content).trim()) {
    throw new Error('自定义模型未返回有效内容（响应缺少 choices[0].message.content）')
  }
  return String(content)
}

async function callChatAnthropic(ep: ProtocolEndpoint, req: ChatRequest): Promise<string> {
  const res = await timedFetch(
    `${ep.baseUrl}/v1/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders('anthropic', ep.apiKey) },
      body: JSON.stringify({
        model: req.model.trim(),
        max_tokens: req.maxTokens ?? 1024,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: 'user', content: req.user }],
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      }),
    },
    '自定义模型',
  )
  if (!res.ok) throw await protocolError(res, '自定义模型')
  const j = (await res.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[]
  } | null
  const text = (j?.content ?? [])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('')
  if (!text.trim()) throw new Error('Anthropic 未返回有效文本内容')
  return text
}

async function callChatGemini(ep: ProtocolEndpoint, req: ChatRequest): Promise<string> {
  const keyQ = ep.apiKey ? `?key=${encodeURIComponent(ep.apiKey)}` : ''
  const res = await timedFetch(
    `${ep.baseUrl}/v1beta/models/${encodeURIComponent(req.model.trim())}:generateContent${keyQ}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        },
      }),
    },
    '自定义模型',
  )
  if (!res.ok) throw await protocolError(res, '自定义模型')
  const j = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  } | null
  const text = (j?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
  if (!text.trim()) throw new Error('Gemini 未返回有效文本内容')
  return text
}
