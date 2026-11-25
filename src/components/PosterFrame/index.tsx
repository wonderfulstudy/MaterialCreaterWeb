/**
 * 海报预览壳：内层是设计画布（默认 375px 宽），外层等比缩放到容器宽度。
 * H5 导出截取的是同一份画布的 1:1 副本，默认 scale=2 即 750 宽成品图，
 * 因此预览看到什么、保存出去就是什么，也不会被容器高度裁掉。
 * 画布宽度与导出倍数可按海报类型覆盖（综合大数据长图是 750 宽 / scale=1）。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View } from '@tarojs/components'
import type { ReactNode } from 'react'
import classnames from 'classnames'
import { captureNodeToDataUrl } from '@/utils/posters/capture'
import styles from './index.module.scss'

/** 画布设计宽度：设计稿画板就是 375px */
export const POSTER_CANVAS_WIDTH = 375
/** 导出倍数：375 × 2 = 750，正好是海报成品宽度 */
export const POSTER_EXPORT_SCALE = 2

const IS_H5 = process.env.TARO_ENV === 'h5'

export interface PosterFrameHandle {
  /** 截取 1:1 画布并返回 PNG dataURL（750 宽）；画布未渲染时抛错 */
  capture: () => Promise<string>
}

export interface PosterFrameProps {
  /** 海报正文，分享页传的是 LotteryCardView */
  children: ReactNode
  /** 海报页脚（店名 / 二维码 / 合规声明），与正文一起进图 */
  footer?: ReactNode
  /** 追加到外层容器的类名 */
  className?: string
  /** 画布设计宽度（px）：默认 375；综合大数据长图传 750 */
  canvasWidth?: number
  /** 导出倍数：默认 2（375 × 2 = 750 成品宽）；画布本身就是成品宽度时传 1 */
  exportScale?: number
}

interface FrameMetrics {
  /** 等比缩放系数；1 表示按设计宽度原样展示 */
  scale: number
  /** 画布自然高度（未缩放），由它推出缩略后的占位高度 */
  height: number
}

/** weapp 下 ref 是 Taro 自定义元素，只有 H5 才有真实 DOM 度量 */
function asHtmlElement(node: unknown): HTMLElement | null {
  if (node && typeof node === 'object' && 'offsetHeight' in node && 'clientWidth' in node) {
    return node as HTMLElement
  }
  return null
}

const PosterFrame = forwardRef<PosterFrameHandle, PosterFrameProps>(function PosterFrame(
  { children, footer, className, canvasWidth = POSTER_CANVAS_WIDTH, exportScale = POSTER_EXPORT_SCALE },
  ref
) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  // 1:1 副本：导出只截它，祖先上没有 transform，html2canvas 不会截偏
  const captureRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState<FrameMetrics>({ scale: 1, height: 0 })
  // 画布宽度按海报类型可覆盖，这里夹一次，避免 0 宽度算出除零
  const canvasWidthPx = Math.max(1, Math.round(canvasWidth))

  const measure = useCallback(() => {
    const frame = asHtmlElement(frameRef.current)
    const canvas = asHtmlElement(canvasRef.current)
    if (!frame || !canvas) {
      return
    }
    const available = frame.clientWidth
    const height = canvas.offsetHeight
    if (!available || !height) {
      return
    }
    const scale = Math.min(1, available / canvasWidthPx)
    setMetrics((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }))
  }, [canvasWidthPx])

  useEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => measure())
    const frame = asHtmlElement(frameRef.current)
    const canvas = asHtmlElement(canvasRef.current)
    if (frame) {
      observer.observe(frame)
    }
    if (canvas) {
      observer.observe(canvas)
    }
    return () => observer.disconnect()
  }, [measure])

  useImperativeHandle(
    ref,
    () => ({
      capture: () => {
        const node = asHtmlElement(captureRef.current) ?? asHtmlElement(canvasRef.current)
        if (!node) {
          return Promise.reject(new Error('海报画布尚未渲染'))
        }
        // 底色给红金渐变的中间色兜底：即使渐变解析失败也不会出现透明底
        return captureNodeToDataUrl(node, { scale: exportScale, backgroundColor: '#8B0C14' })
      },
    }),
    [exportScale]
  )

  const scaled = metrics.scale < 1
  // 外层按缩放后的尺寸占位，避免用 max-height + overflow 裁剪整张海报
  const sizerStyle = scaled
    ? { width: `${canvasWidthPx * metrics.scale}px`, height: `${metrics.height * metrics.scale}px` }
    : undefined
  // 画布宽度必须锁死（默认 375px = 海报成品宽 / 2）：rpx 会随 html font-size 变，这里用 px 定死
  const canvasStyle = IS_H5
    ? { width: `${canvasWidthPx}px`, transform: scaled ? `scale(${metrics.scale})` : undefined }
    : undefined
  const captureStyle = { width: `${canvasWidthPx}px`, left: '-20000px' }
  const captureCanvasStyle = { width: `${canvasWidthPx}px` }

  const poster = (
    <>
      {/* 卡片左右留出红金边，和设计稿 42-poster-draw 的留白一致 */}
      <View className={styles.posterBody}>{children}</View>
      {footer}
    </>
  )

  return (
    <View className={classnames(styles.frame, className)} ref={frameRef}>
      <View className={styles.sizer} style={sizerStyle}>
        <View className={styles.canvas} ref={canvasRef} style={canvasStyle}>
          {poster}
        </View>
      </View>
      {IS_H5 ? (
        <View className={styles.captureStage} style={captureStyle}>
          <View
            className={classnames(styles.canvas, styles.captureCanvas)}
            ref={captureRef}
            style={captureCanvasStyle}
          >
            {poster}
          </View>
        </View>
      ) : null}
    </View>
  )
})

export default PosterFrame
