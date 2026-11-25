import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import type { PosterPagingInput } from './model'
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

/** 分张渲染的一张：id 是截图节点 id，label 只在多张时给预览用，node 是海报内容 */
export interface PosterPage {
  id: string
  label?: string
  node: ReactNode
}

export interface PosterStageProps {
  /** 要渲染的一或多张海报；单张时 id 就是 PREVIEW_NODE_ID */
  pages: PosterPage[]
}

/**
 * 预览舞台：可见预览按容器宽度等比缩放到完整显示（裁剪交给滚动，不裁内容），
 * 另渲染一份 1:1 离屏副本承载截图节点 id —— 预览与截图是同一份 DOM 结构，切换卡片不重建。
 * 超长 B 卡分成多张时，每张都是独立的截图节点（id 由调用方给）。
 */
export default function PosterStage({ pages }: PosterStageProps) {
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
  // 分张时两张之间留缝，只在预览里出现（截图节点各张独立），px 走内联避开 pxtransform
  const sheetGapStyle = { marginTop: '10px' }
  const canvasStyle = IS_H5 && scaled ? { ...canvasBase, transform: 'scale(' + metrics.scale + ')' } : canvasBase

  return (
    <View className={styles.stage}>
      <View className={styles.scroll}>
        <View className={styles.frame} ref={frameRef}>
          <View className={styles.sizer} style={sizerStyle}>
            <View className={styles.canvas} ref={canvasRef} style={canvasStyle}>
              {pages.map((page, index) => (
                <View key={page.id} className={styles.sheet} style={index > 0 ? sheetGapStyle : undefined}>
                  {page.label ? <Text className={styles.sheetLabel}>{page.label}</Text> : null}
                  {page.node}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
      {IS_H5 ? (
        <View className={styles.captureStage} style={canvasBase}>
          {pages.map((page) => (
            <View key={page.id} id={page.id} className={styles.canvas} style={canvasBase}>
              {page.node}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** PlanPosterB 单张渲染时 .po 的直接子节点：页顶 / 封面 / 表头 / 表格 / 说明 / 引流 */
const B_POSTER_PART_COUNT = 6

/**
 * 量当前 1:1 副本的分张高度（成品 px = CSS 高 × POSTER_EXPORT_SCALE）。
 *
 * 只认 PlanPosterB 的单张结构：6 块齐全、表格子节点数 = 行数、行数 > 0；
 * 任何一条不满足就返回 null，调用方回落成「整张一次导出」，行为与分张上线前一致。
 */
export function measureRecordPaging(node: HTMLElement, rowCount: number): PosterPagingInput | null {
  if (rowCount <= 0) return null
  const poster = node.firstElementChild as HTMLElement | null
  if (!poster) return null
  const parts = Array.from(poster.children) as HTMLElement[]
  if (parts.length !== B_POSTER_PART_COUNT) return null
  const table = parts[3]
  const rowNodes = Array.from(table.children) as HTMLElement[]
  if (rowNodes.length !== rowCount) return null
  // 用相邻块的 offsetTop 差算「块 + 其下外边距」占的高度：只读 rect.height 会漏掉块间 margin
  // 与海报自身的 padding，少算几十 px 就可能让某一页超过 3000
  const posterRect = poster.getBoundingClientRect()
  const starts = parts.map((part) => part.getBoundingClientRect().top - posterRect.top)
  const span = (index: number): number =>
    (index + 1 < parts.length ? starts[index + 1] - starts[index] : posterRect.height - starts[index]) *
    POSTER_EXPORT_SCALE
  const spans = parts.map((_, index) => span(index))
  if (posterRect.height <= 0 || spans.some((value) => value < 0)) return null
  // 行高一致（同一套 grid + padding），用表格总高均摊，避免逐行读 rect 的小数误差累加
  const rowHeight = spans[3] / rowCount
  return {
    rowHeights: Array.from({ length: rowCount }, () => rowHeight),
    firstFixed: spans[0] + spans[1] + spans[2],
    repeatFixed: spans[0] + spans[2],
    tailFixed: spans[4] + spans[5],
  }
}

export { default as PlanPosterA } from './PlanPosterA'
export type { PlanPosterAProps } from './PlanPosterA'
export { default as PlanPosterB } from './PlanPosterB'
export type { PlanPosterBProps, PlanPosterBSlice } from './PlanPosterB'
export * from './model'
