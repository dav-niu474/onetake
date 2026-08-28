'use client'

/**
 * 客户端导出工具：把画布产物（视频/音频/图像）归档到服务端 download 目录
 */
import { useCanvasStore } from './store'

export async function exportUrlToDownload(url: string) {
  const showToast = useCanvasStore.getState().showToast
  if (!url || !url.startsWith('/')) {
    showToast('error', '仅支持画布产物路径（/generated 或 /uploads）')
    return
  }
  try {
    const res = await fetch('/api/assets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error || '导出失败')
    showToast('success', `已导出到 download/${j.name}`)
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : '导出失败')
  }
}
