import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executeNode } from '@/lib/ai-canvas/runner'

/**
 * 查询工作流各节点最近一次执行记录（用于页面刷新后恢复运行状态）
 * GET /api/executions?workflowId=xxx
 *
 * 注：remoteTaskId 通过原生 SQL 读取（dev server 的 Prisma Client 可能先于 schema 生成，
 * 重启后可改回类型化字段；原生 SQL 与两种客户端均兼容）
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
    // 原生 SQL 批量读取 remoteTaskId
    const ids = [...latest.values()].map((r) => r.id)
    const remoteMap = new Map<string, string | null>()
    if (ids.length > 0) {
      try {
        const placeholders = ids.map(() => '?').join(',')
        const remoteRows = await db.$queryRawUnsafe<
          { id: string; remoteTaskId: string | null }[]>(
          `SELECT id, remoteTaskId FROM Execution WHERE id IN (${placeholders})`,
          ...ids,
        )
        remoteRows.forEach((r) => remoteMap.set(r.id, r.remoteTaskId))
      } catch {
        /* 列尚不存在时忽略（旧 schema 兼容） */
      }
    }
    const items = [...latest.values()].map((row) => ({
      ...row,
      remoteTaskId: remoteMap.get(row.id) ?? null,
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
 * body: { workflowId?, nodeId, nodeType, inputs, params, snapshot? }
 * snapshot = 执行时刻的画布布局快照（运行历史迷你图用）
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
    // 画布快照走原生 SQL 写入（兼容 dev server 缓存的旧 Prisma Client 运行时）
    if (body.snapshot && typeof body.snapshot === 'object') {
      try {
        const snapJson = JSON.stringify(body.snapshot)
        if (snapJson.length <= 512 * 1024) {
          void db
            .$executeRawUnsafe(
              'UPDATE Execution SET snapshot = ? WHERE id = ?',
              snapJson,
              row.id,
            )
            .catch(() => undefined)
        }
      } catch {
        /* 快照失败不影响执行 */
      }
    }

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
      // remoteTaskId 持久化走原生 SQL（兼容旧客户端运行时）
      const updateRemoteTask = (taskId: string) => {
        void db
          .$executeRawUnsafe(
            'UPDATE Execution SET remoteTaskId = ?, stage = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            taskId,
            '远端任务已受理，等待生成…',
            row.id,
          )
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
          // 视频类节点提交成功后记录远端任务 ID：超时/中断后可凭此找回云端成果
          updateRemoteTask,
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
