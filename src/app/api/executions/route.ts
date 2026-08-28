import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executeNode } from '@/lib/ai-canvas/runner'

/**
 * 查询工作流各节点最近一次执行记录（用于页面刷新后恢复运行状态）
 * GET /api/executions?workflowId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const workflowId = req.nextUrl.searchParams.get('workflowId')
    if (!workflowId) {
      return NextResponse.json({ error: '缺少 workflowId' }, { status: 400 })
    }
    const rows = await db.execution.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: {
        id: true,
        nodeId: true,
        nodeType: true,
        status: true,
        progress: true,
        stage: true,
        output: true,
        error: true,
        createdAt: true,
      },
    })
    // 每个节点只保留最新一条
    const latest = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!latest.has(row.nodeId)) latest.set(row.nodeId, row)
    }
    const items = [...latest.values()].map((row) => ({
      ...row,
      output: row.output ? (() => {
        try {
          return JSON.parse(row.output as string)
        } catch {
          return null
        }
      })() : null,
    }))
    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    )
  }
}

/**
 * 创建节点执行任务并立即返回（后台异步运行）
 * body: { workflowId?, nodeId, nodeType, inputs, params }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workflowId, nodeId, nodeType } = body ?? {}
    if (!nodeId || !nodeType) {
      return NextResponse.json({ error: '缺少 nodeId / nodeType' }, { status: 400 })
    }
    const row = await db.execution.create({
      data: {
        workflowId: typeof workflowId === 'string' && workflowId ? workflowId : null,
        nodeId: String(nodeId),
        nodeType: String(nodeType),
        status: 'running',
        stage: '任务已提交…',
        input: JSON.stringify(body.inputs ?? {}),
        params: JSON.stringify(body.params ?? {}),
      },
    })

    // 后台执行（fire-and-forget），客户端轮询进度
    void (async () => {
      const update = (data: {
        status?: string
        stage?: string
        progress?: number
        output?: string
        error?: string
      }) => {
        void db.execution
          .update({ where: { id: row.id }, data })
          .catch(() => undefined)
      }
      try {
        const outputs = await executeNode(
          String(nodeType),
          {
            inputs: body.inputs ?? {},
            params: body.params ?? {},
          },
          (stage, progress) => update({ stage, progress }),
        )
        update({
          status: 'success',
          stage: '完成',
          progress: 100,
          output: JSON.stringify(outputs),
        })
      } catch (err) {
        update({
          status: 'failed',
          stage: '失败',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    return NextResponse.json({
      id: row.id,
      status: row.status,
      nodeId: row.nodeId,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '创建执行任务失败' },
      { status: 500 },
    )
  }
}
