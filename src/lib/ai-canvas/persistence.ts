'use client'

/**
 * 工作流持久化：保存 / 自动保存 / 打开 / 删除 / 缩略图捕获
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
  return {
    nodes: cleanNodes,
    edges: cleanEdges,
    groups: structuredClone(useCanvasStore.getState().groups),
  }
}

/**
 * 捕获画布缩略图（React Flow viewport → PNG → 降采样 JPEG dataURL）
 * 失败时返回 null，不阻塞保存流程
 */
async function captureThumbnail(): Promise<string | null> {
  try {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!viewport) return null
    const { toPng } = await import('html-to-image')
    const raw = await toPng(viewport, {
      backgroundColor: '#09090b',
      pixelRatio: 1,
      filter: (domNode) => {
        const el = domNode as HTMLElement
        if (el.classList?.contains('react-flow__node-toolbar')) return false
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return false
        return true
      },
    })
    // 降采样到最大宽度 640，控制存储体积
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('缩略图解码失败'))
      img.src = raw
    })
    const scale = Math.min(1, 640 / Math.max(1, img.width))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}

/** 保存工作流（新建或更新） */
export async function saveWorkflow(): Promise<string | null> {
  const store = useCanvasStore.getState()
  const { workflow } = store
  store.setSaving(true)
  try {
    const graph = serializeGraph()
    // 有节点时捕获画布缩略图（运行中跳过，避免卡顿）
    const thumbnail =
      graph.nodes.length > 0 && !store.running ? await captureThumbnail() : null
    let id = workflow.id
    if (id) {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workflow.name, graph, ...(thumbnail ? { thumbnail } : {}) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败')
    } else {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workflow.name, graph, ...(thumbnail ? { thumbnail } : {}) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败')
      const wf = await res.json()
      id = wf.id
    }
    useCanvasStore.getState().markSaved(id)
    // 将近期游离的执行记录挂靠到本工作流，便于刷新后恢复任务
    // （带 nodeId + nodeType 双重匹配，避免与其他工作流的同名节点误挂靠）
    try {
      await fetch('/api/executions/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: id,
          nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type })),
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
      {
        nodes,
        edges,
        groups: Array.isArray(graph.groups)
          ? (graph.groups as typeof store.groups)
          : [],
      },
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

/** 导出当前工作流为 JSON 文件 */
export function exportWorkflowJson() {
  const { workflow, showToast } = useCanvasStore.getState()
  const graph = serializeGraph()
  const payload = {
    format: 'ai-canvas-workflow',
    version: 1,
    name: workflow.name,
    exportedAt: new Date().toISOString(),
    graph,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${workflow.name || '工作流'}.json`.replace(/\s+/g, '_')
  a.click()
  URL.revokeObjectURL(url)
  showToast('success', '已导出工作流 JSON')
}

/** 从 JSON 文件导入工作流（作为新工作流载入画布） */
export function importWorkflowJson(file: File) {
  const store = useCanvasStore.getState()
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      const graph = data.graph ?? data
      if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
        throw new Error('文件格式不正确：缺少 nodes/edges')
      }
      const name = typeof data.name === 'string' ? `${data.name} (导入)` : '导入的工作流'
      const nodes = graph.nodes.map((n: Node<CanvasNodeData>) => ({
        ...n,
        selected: false,
        data: { ...n.data, runState: 'idle' as const, progress: 0 },
      }))
      const edges = graph.edges.map((e: Edge) => ({ ...e, selected: false }))
      store.loadGraph(
        {
          nodes,
          edges,
          groups: Array.isArray(graph.groups)
            ? (graph.groups as typeof store.groups)
            : [],
        },
        { id: null, name },
      )
      syncOutputsAfterLoad()
      store.showToast('success', `已导入「${name}」`)
    } catch (e) {
      store.showToast('error', e instanceof Error ? e.message : '导入失败')
    }
  }
  reader.readAsText(file)
}
