// 测试用 mock OpenAI 兼容服务：/v1/models + /v1/chat/completions
Bun.serve({
  port: 8123,
  async fetch(req) {
    const url = new URL(req.url)
    const auth = req.headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer sk-good')) {
      return Response.json({ error: { message: 'invalid api key' } }, { status: 401 })
    }
    if (url.pathname.endsWith('/models')) {
      return Response.json({
        data: [
          { id: 'mock-video-llm-v3' },
          { id: 'mock-story-writer' },
          { id: 'mock-prompt-master' },
        ],
      })
    }
    if (url.pathname.endsWith('/chat/completions')) {
      const body = (await req.json()) as { messages?: { role: string; content: string }[] }
      const last = body.messages?.[body.messages.length - 1]?.content ?? ''
      return Response.json({
        choices: [{ message: { role: 'assistant', content: `【mock 扩写】电影级画面：${String(last).slice(0, 40)}… 镜头缓缓推进，光线柔和，景深虚化，8K 超清画质。` } }],
      })
    }
    return Response.json({ error: 'not found' }, { status: 404 })
  },
})
console.log('mock-openai listening on 8123')
