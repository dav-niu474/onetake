import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { reclaimRemoteVideoTask } from '@/lib/ai-canvas/runner'

export const maxDuration = 300

/**
 * 找回远端视频任务成果
 * POST /api/executions/reclaim
 * body: { executionId?, workflowId?, nodeId?, waitMs? }
 *
 * 优先级：executionId > workflowId + nodeId（取该节点最近一条含 remoteTaskId 的记录）。
 * 找回成功时会把执行记录更新为 success 并返回 outputs（可直接回填画布节点）。
 *
 * 注：remoteTaskId 读写走原生 SQL（兼容旧客户端运行时，重启后可改回类型化字段）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const executionId = typeof body?.executionId === 'string' ? body.executionId : ''
    const workflowId = typeof body?.workflowId === 'string' ? body.workflowId : ''
    const nodeId = typeof body?.nodeId === 'string' ? body.nodeId : ''
    const waitMs = Math.min(Math.max(Number(body?.waitMs) || 0, 0), 4 * 60 * 1000)

    // 原生 SQL 查找最近一条含 remoteTaskId 的记录
    let record: { id: string; remoteTaskId: string; nodeId: string } | null = null
    try {
      if (executionId) {
        const rows = await db.$queryRawUnsafe<
          { id: string; remoteTaskId: string; nodeId: string }[]>(
          'SELECT id, remoteTaskId, nodeId FROM Execution WHERE id = ? AND remoteTaskId IS NOT NULL LIMIT 1',
          executionId,
        )
        record = rows[0] ?? null
      } else if (workflowId && nodeId) {
        const rows = await db.$queryRawUnsafe<
          { id: string; remoteTaskId: string; nodeId: string }[]>(
          'SELECT id, remoteTaskId, nodeId FROM Execution WHERE workflowId = ? AND nodeId = ? AND remoteTaskId IS NOT NULL ORDER BY createdAt DESC LIMIT 1',
          workflowId,
          nodeId,
        )
        record = rows[0] ?? null
      }
    } catch {
      return NextResponse.json({ error: '查询执行记录失败' }, { status: 500 })
    }
    if (!record) {
      return NextResponse.json(
        { error: '未找到可找回的任务：该节点没有已受理的远端任务记录' },
        { status: 404 },
      )
    }

    const result = await reclaimRemoteVideoTask(record.remoteTaskId, {
      waitMs,
      onProgress: (stage, progress) => {
        void db.execution
          .update({ where: { id: record!.id }, data: { stage, progress } })
          .catch(() => undefined)
      },
    })

    if (result.status === 'success' && result.output) {
      await db.execution
        .update({
          where: { id: record.id },
          data: {
            status: 'success',
            stage: '完成（找回）',
            progress: 100,
            output: JSON.stringify(result.output),
            error: null,
          },
        })
        .catch(() => undefined)
      return NextResponse.json({
        status: 'success',
        executionId: record.id,
        remoteTaskId: record.remoteTaskId,
        output: result.output,
      })
    }

    if (result.status === 'failed') {
      await db.execution
        .update({
          where: { id: record.id },
          data: { error: result.error ?? '云端任务失败' },
        })
        .catch(() => undefined)
      return NextResponse.json({
        status: 'failed',
        error: result.error,
        executionId: record.id,
      })
    }

    return NextResponse.json({
      status: 'running',
      elapsed: result.elapsed ?? 0,
      remoteTaskId: record.remoteTaskId,
      executionId: record.id,
      hint: '云端任务仍在生成中，稍后可再次找回',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '找回失败' },
      { status: 500 },
    )
  }
}
