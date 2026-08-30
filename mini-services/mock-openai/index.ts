// 测试用 mock OpenAI 兼容服务：/v1/models + /v1/chat/completions + /v1/images/generations + /v1/audio/speech
// 模型列表覆盖多能力域（chat/image/tts/video/embedding），用于验证能力路由按能力过滤
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
          { id: 'mock-story-writer' },      // chat
          { id: 'mock-prompt-master' },     // chat
          { id: 'mock-image-master' },      // image（含 image 关键字）
          { id: 'mock-tts-voice' },         // tts（含 tts 关键字）
          { id: 'mock-video-gen' },         // video（含 video 关键字）
          { id: 'mock-embed-x' },           // embedding（应被排除）
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
    if (url.pathname.endsWith('/images/generations')) {
      // 1x1 红点 PNG（base64）
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      return Response.json({ data: [{ b64_json: png }] })
    }
    if (url.pathname.endsWith('/audio/speech')) {
      // 极短静音 WAV（44 字节头 + 少量数据）
      return new Response(Buffer.alloc(64, 0), {
        headers: { 'Content-Type': 'audio/wav' },
      })
    }
    return Response.json({ error: 'not found' }, { status: 404 })
  },
})
console.log('mock-openai listening on 8123')
