'use client'

/**
 * 工作流持久化：保存 / 自动保存 / 打开 / 删除
 */
import { useCanvasStore } from './store'
import { resumeWorkflowTasks, syncOutputsAfterLoad } from './executor'
import type { CanvasNodeData } from './types'
import type { Edge, Node } from '@xyflow/react'

function serializeGraph() {
  const { nodes, edges } = useCanvasStore.getState()
  const cleanNodes = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      ...n.data,
      runState: 'idle',
      stage: undefined,
      progress: 0,
      error: undefined,
      durationMs: n.data.durationMs,
    },
  }))
  const cleanEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
    type: 'canvas',
  }))
  return { nodes: cleanNodes, edges: cleanEdges }
}

/** 保存工作流（新建或更新） */
export async function saveWorkflow(): Promise<string | null> {
  const store = useCanvasStore.getState()
  const { workflow } = store
  store.setSaving(true)
  try {
    const graph = serializeGraph()
    let id = workflow.id
    if (id) {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workflow.name, graph }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败')
    } else {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workflow.name, graph }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败')
      const wf = await res.json()
      id = wf.id
    }
    useCanvasStore.getState().markSaved(id)
    // 将近期游离的执行记录挂靠到本工作流，便于刷新后恢复任务
    try {
      await fetch('/api/executions/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: id,
          nodeIds: graph.nodes.map((n) => n.id),
        }),
      })
    } catch {
      /* 挂靠失败不影响保存 */
    }
    return id
  } catch (e) {
    useCanvasStore.getState().showToast(
      'error',
      e instanceof Error ? e.message : '保存失败',
    )
    return null
  } finally {
    useCanvasStore.getState().setSaving(false)
  }
}

/** 打开工作流 */
export async function openWorkflow(id: string) {
  const store = useCanvasStore.getState()
  try {
    const res = await fetch(`/api/workflows/${id}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('工作流读取失败')
    const wf = await res.json()
    let graph: { nodes?: Node<CanvasNodeData>[]; edges?: Edge[] } = { nodes: [], edges: [] }
    try {
      graph = typeof wf.graph === 'string' ? JSON.parse(wf.graph) : wf.graph
    } catch {
      /* 保留空图 */
    }
    const nodes = (graph.nodes ?? []).map((n) => ({
      ...n,
      selected: false,
      data: { ...n.data, runState: 'idle' as const, progress: 0 },
    }))
    const edges = (graph.edges ?? []).map((e) => ({ ...e, selected: false }))
    store.loadGraph(
      { nodes, edges },
      { id: wf.id, name: wf.name, updatedAt: wf.updatedAt },
    )
    store.setLibraryOpen(false)
    store.showToast('success', `已打开「${wf.name}」`)
    // 同步节点就绪状态（有历史输出的节点直接显示完成态）
    syncOutputsAfterLoad()
    // 恢复该工作流仍在运行/已完成的后台任务
    void resumeWorkflowTasks()
  } catch (e) {
    store.showToast('error', e instanceof Error ? e.message : '打开失败')
  }
}

/** 删除工作流 */
export async function deleteWorkflow(id: string) {
  const store = useCanvasStore.getState()
  try {
    const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('删除失败')
    if (store.workflow.id === id) {
      store.setWorkflow({ id: null })
      store.setDirty(true)
    }
    store.showToast('success', '已删除')
  } catch (e) {
    store.showToast('error', e instanceof Error ? e.message : '删除失败')
  }
}
