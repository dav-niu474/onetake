import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * 保存工作流后，将其近期游离（workflowId 为空）的执行记录挂靠到该工作流，
 * 使页面刷新后能恢复任务状态与结果
 * body: { workflowId, nodes: [{ id, type }] }
 *
 * 加固策略：nodeId + nodeType 双重匹配 —— 模板类节点 id 固定（v1/t1 等），
 * 不同工作流可能存在同名节点 id，仅按 nodeId 匹配会把其他工作流的执行记录
 * 错误挂靠到本工作流（Task 5 已知风险），故要求类型也一致才允许挂靠。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workflowId, nodes } = body ?? {}
    if (
      typeof workflowId !== 'string' ||
      !Array.isArray(nodes) ||
      nodes.length === 0
    ) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 })
    }
    // nodeId → nodeType 映射（过滤非法项）
    const typeMap = new Map<string, string>()
    for (const n of nodes.slice(0, 200)) {
      if (n && typeof n.id === 'string' && typeof n.type === 'string') {
        typeMap.set(n.id, n.type)
      }
    }
    if (typeMap.size === 0) {
      return NextResponse.json({ updated: 0 })
    }
    const since = new Date(Date.now() - 60 * 60 * 1000) // 最近 1 小时
    const orphans = await db.execution.findMany({
      where: {
        workflowId: null,
        nodeId: { in: [...typeMap.keys()] },
        createdAt: { gte: since },
      },
      select: { id: true, nodeId: true, nodeType: true },
    })
    const matchedIds = orphans
      .filter((o) => {
        const expectedType = typeMap.get(o.nodeId)
        // 执行记录缺 nodeType 时保守放行（历史数据兼容），否则必须完全一致
        return !o.nodeType || !expectedType || o.nodeType === expectedType
      })
      .map((o) => o.id)
    if (matchedIds.length === 0) {
      return NextResponse.json({ updated: 0 })
    }
    const r = await db.execution.updateMany({
      where: { id: { in: matchedIds } },
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
