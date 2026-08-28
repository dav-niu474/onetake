import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * 保存工作流后，将其近期游离（workflowId 为空）的执行记录挂靠到该工作流，
 * 使页面刷新后能恢复任务状态与结果
 * body: { workflowId, nodeIds: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workflowId, nodeIds } = body ?? {}
    if (typeof workflowId !== 'string' || !Array.isArray(nodeIds)) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 })
    }
    const since = new Date(Date.now() - 60 * 60 * 1000) // 最近 1 小时
    const r = await db.execution.updateMany({
      where: {
        workflowId: null,
        nodeId: { in: nodeIds.slice(0, 200) },
        createdAt: { gte: since },
      },
      data: { workflowId },
    })
    return NextResponse.json({ updated: r.count })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '挂靠失败' },
      { status: 500 },
    )
  }
}
