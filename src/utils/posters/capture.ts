import html2canvas from 'html2canvas'

export interface CaptureOptions {
  /** 导出缩放倍率，默认按设备像素比封顶 2 倍 */
  scale?: number
  /** 画布底色，默认白色；设为 null 则透明 */
  backgroundColor?: string | null
}

/**
 * H5 专用：把一段已渲染的 DOM 节点截成 PNG dataURL。
 * 海报弹层用它直接截取「页面同款卡片」的预览节点，
 * 从而保证保存/分享出去的图与用户看到的预览完全一致（所见即所得）。
 *
 * 小程序端不走这里：Snapshot 截图组件仅 Skyline 渲染引擎可用，
 * 本项目默认 webview 渲染，小程序导出暂留各自的画布实现。
 */
export async function captureNodeToDataUrl(
  node: HTMLElement,
  options: CaptureOptions = {},
): Promise<string> {
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2
  const canvas = await html2canvas(node, {
    scale: options.scale ?? Math.min(Math.max(ratio, 1), 2),
    backgroundColor: options.backgroundColor ?? '#ffffff',
    useCORS: true,
    logging: false,
  })
  return canvas.toDataURL('image/png')
}
