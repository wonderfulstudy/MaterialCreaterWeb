import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import styles from './index.module.scss'

/** 海报逻辑画布宽度：与设计稿 375 一致，导出按 2 倍 → 750 宽 */
export const POSTER_CANVAS_WIDTH = 375
/** 导出倍率：D80 口径 */
export const POSTER_EXPORT_SCALE = 2

const IS_H5 = process.env.TARO_ENV === 'h5'

export type PosterCardKey = 'today' | 'history'

const CARD_TABS: { key: PosterCardKey; label: string }[] = [
  { key: 'today', label: '今日推荐' },
  { key: 'history', label: '历史结果' },
]

export interface PosterSegmentsProps {
  value: PosterCardKey
  onChange: (value: PosterCardKey) => void
}

/** 页顶分段：只换当前那张卡，不做横向封面流（D75 按来源单张） */
export function PosterSegments({ value, onChange }: PosterSegmentsProps) {
  return (
    <View className={styles.seg}>
      {CARD_TABS.map((tab) => (
        <View
          key={tab.key}
          className={classnames(styles.segItem, tab.key === value ? styles.segItemOn : null)}
          onClick={() => onChange(tab.key)}
        >
          <Text className={classnames(styles.segText, tab.key === value ? styles.segTextOn : null)}>{tab.label}</Text>
        </View>
      ))}
    </View>
  )
}

/** H5 上 ref 拿到的是真实 DOM，小程序上不是，用属性探测兜底 */
function asHtmlElement(node: unknown): HTMLElement | null {
  if (node && typeof node === 'object' && 'offsetHeight' in node) {
    return node as HTMLElement
  }
  return null
}

export interface PosterStageProps {
  /** 1:1 截图副本的节点 id，与 SharePoster 的 PREVIEW_NODE_ID 是同一个 */
  captureNodeId: string
  children: ReactNode
}

/**
 * 预览舞台：可见预览按容器宽度等比缩放到完整显示（裁剪交给滚动，不裁内容），
 * 另渲染一份 1:1 离屏副本承载 captureNodeId —— 预览与截图是同一份 DOM 结构，切换卡片不重建。
 */
export default function PosterStage({ captureNodeId, children }: PosterStageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState({ scale: 1, height: 0 })

  const measure = useCallback(() => {
    const frame = asHtmlElement(frameRef.current)
    const canvas = asHtmlElement(canvasRef.current)
    if (!frame || !canvas) return
    const available = frame.clientWidth || frame.offsetWidth
    const height = canvas.offsetHeight
    if (!available || !height) return
    const scale = Math.min(1, available / POSTER_CANVAS_WIDTH)
    setMetrics((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }))
  }, [])

  useEffect(() => {
    if (!IS_H5) return
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const frame = asHtmlElement(frameRef.current)
    const canvas = asHtmlElement(canvasRef.current)
    const observer = new ResizeObserver(() => measure())
    if (frame) observer.observe(frame)
    if (canvas) observer.observe(canvas)
    return () => observer.disconnect()
  }, [measure])

  const scaled = metrics.scale < 1 && metrics.height > 0
  const sizerStyle = scaled ? { width: POSTER_CANVAS_WIDTH * metrics.scale + 'px', height: metrics.height * metrics.scale + 'px' } : undefined
  // 画布宽度必须走内联 px：SCSS 里的 px 会被 pxtransform 转成 rem（1rem≈18px），
  // 10rem 只有半屏宽，海报内容会挤在 180px 里，导出也就只有 344px 宽
  const canvasBase = { width: POSTER_CANVAS_WIDTH + 'px' }
  const canvasStyle = IS_H5 && scaled ? { ...canvasBase, transform: 'scale(' + metrics.scale + ')' } : canvasBase

  return (
    <View className={styles.stage}>
      <View className={styles.scroll}>
        <View className={styles.frame} ref={frameRef}>
          <View className={styles.sizer} style={sizerStyle}>
            <View className={styles.canvas} ref={canvasRef} style={canvasStyle}>
              {children}
            </View>
          </View>
        </View>
      </View>
      {IS_H5 ? (
        <View className={styles.captureStage} style={canvasBase}>
          <View id={captureNodeId} className={styles.canvas} style={canvasBase}>
            {children}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export { default as PlanPosterA } from './PlanPosterA'
export type { PlanPosterAProps } from './PlanPosterA'
export { default as PlanPosterB } from './PlanPosterB'
export type { PlanPosterBProps } from './PlanPosterB'
export * from './model'
