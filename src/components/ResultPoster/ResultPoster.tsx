import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import LotteryCardView from '@/components/LotteryCardView'
import { captureNodeToDataUrl } from '@/utils/posters/capture'
import { POSTER_WIDTH } from './canvas-kit'
import { DEFAULT_SCHEME_ID, getPosterScheme } from './schemes'
import { useShareResults } from './use-share-results'
import { posterKey, toCardItems } from './card-items'
import type { PosterImages, ResultPosterInput } from './types'
import styles from './index.module.scss'

/** 当前定稿方案；弹层不再提供切换，换风格只改这里 */
const posterScheme = getPosterScheme(DEFAULT_SCHEME_ID)

/** H5 导出 = 截取预览节点；小程序仍走本文下面的画布绘制 */
const IS_H5 = process.env.TARO_ENV === 'h5'

export interface ResultPosterProps {
  /** 是否展示弹层 */
  visible: boolean
  /**
   * 可选的现成数据：传入时以它为准（预览/测试），不传则由组件自己拉取当期开奖结果。
   * 只放已开奖彩种，默认全部展示在同一张海报里。
   */
  results?: readonly ResultPosterInput[]
  onClose: () => void
}

type PaintStatus = 'idle' | 'drawing' | 'ready' | 'error'

/** H5 下载时的文件名：单个彩种用彩种名，多个彩种标出数量 */
function posterFileName(items: readonly ResultPosterInput[]): string {
  if (items.length === 0) {
    return '开奖海报.png'
  }
  if (items.length === 1) {
    return `${items[0].gameName}-开奖海报.png`
  }
  return `${items[0].gameName}等${items.length}个彩种-开奖海报.png`
}

/** 离屏画布的最小抽象：weapp 用 OffscreenCanvas，H5 用 detached canvas */
interface OffscreenLike {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  createImage?: () => CanvasImageElement
}

/** 小程序 canvas.createImage 返回的图片对象，H5 复用 HTMLImageElement 的同名事件 */
interface CanvasImageElement {
  src: string
  onload: (() => void) | null
  onerror: (() => void) | null
}

/** 按设备像素比放大，封顶 2 倍，避免超大画布占用过多内存 */
function getPixelRatio(): number {
  try {
    const ratio = Taro.getSystemInfoSync().pixelRatio || 2
    return Math.min(Math.max(ratio, 1), 2)
  } catch {
    return 2
  }
}

function createOffscreen(width: number, height: number): OffscreenLike {
  if (process.env.TARO_ENV === 'h5') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas as unknown as OffscreenLike
  }
  return Taro.createOffscreenCanvas({ type: '2d', width, height }) as unknown as OffscreenLike
}

/** weapp 离屏画布导出为临时文件；H5 直接返回 dataURL */
async function exportImage(canvas: OffscreenLike, width: number, height: number): Promise<string> {
  if (process.env.TARO_ENV === 'h5') {
    return (canvas as unknown as HTMLCanvasElement).toDataURL('image/png')
  }
  const result = await Taro.canvasToTempFilePath({
    canvas: canvas as unknown as Taro.Canvas,
    x: 0,
    y: 0,
    width,
    height,
    destWidth: width,
    destHeight: height,
    fileType: 'png',
  })
  return result.tempFilePath
}

/**
 * 加载二维码图片供画布使用。
 * 失败时返回 null，由方案的 drawQrCard 画降级占位，海报不会因此整张失败。
 */
function loadQrImage(canvas: OffscreenLike, src: string): Promise<CanvasImageSource | null> {
  return new Promise((resolve) => {
    const element: CanvasImageElement | null =
      process.env.TARO_ENV === 'h5'
        ? (document.createElement('img') as unknown as CanvasImageElement)
        : canvas.createImage?.() ?? null
    if (!element || !src) {
      resolve(null)
      return
    }
    element.onload = () => resolve(element as unknown as CanvasImageSource)
    element.onerror = () => resolve(null)
    element.src = src
  })
}

/**
 * 开奖结果分享海报。
 *
 * 预览渲染的就是首页那张开奖号码卡片（LotteryCardView），因此「看到什么就保存什么」：
 * - H5：保存/下载的图由 captureNodeToDataUrl 直接截取预览节点，与预览逐像素一致；
 * - 小程序：预览同样是卡片，导出暂留 schemes/ 的画布绘制（保存到相册 + 分享给好友）。
 *
 * 用法：数据自己取，调用方只管显隐
 * ```tsx
 * <ResultPoster visible={open} onClose={() => setOpen(false)} />
 * ```
 */
export default function ResultPoster({ visible, results: providedResults, onClose }: ResultPosterProps) {
  const share = useShareResults(visible, providedResults)
  const [status, setStatus] = useState<PaintStatus>('idle')
  const [imagePath, setImagePath] = useState('')
  const [saving, setSaving] = useState(false)
  // 记录被关掉的彩种而不是被选中的，默认即全选，也不会因 results 换引用反复重置
  const [deselected, setDeselected] = useState<string[]>([])

  // H5 的导出源节点：预览容器（已按 max-height 截断），截它即得预览同款图片
  const previewRef = useRef<HTMLDivElement | null>(null)
  const requestId = useRef(0)

  const items = useMemo(() => {
    const all = share.results
    const picked = all.filter((item) => !deselected.includes(posterKey(item)))
    // 全部关掉时兜底画第一个，避免空海报
    return picked.length > 0 ? picked : all.slice(0, 1)
  }, [share.results, deselected])

  // 用内容签名而非对象引用作为绘制依赖，调用方每次渲染新建对象也不会重复绘制
  const signature = JSON.stringify(items)
  const cardItems = useMemo(() => toCardItems(items), [items])

  useEffect(() => {
    if (!visible) {
      return
    }
    setStatus('idle')
    setImagePath('')
  }, [visible])

  // 小程序端：离屏画布绘制，导出路径保持不变
  useEffect(() => {
    if (IS_H5 || !visible || items.length === 0) {
      return
    }

    const currentRequest = ++requestId.current
    let cancelled = false
    setStatus('drawing')
    setImagePath('')

    const generate = async () => {
      try {
        const logicalHeight = posterScheme.measure(items)
        const ratio = getPixelRatio()
        const width = Math.round(POSTER_WIDTH * ratio)
        const height = Math.round(logicalHeight * ratio)

        const canvas = createOffscreen(width, height)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          throw new Error('当前环境不支持海报绘制')
        }

        const qr = await loadQrImage(canvas, items[0].qrImage)
        if (cancelled || requestId.current !== currentRequest) {
          return
        }

        ctx.scale(ratio, ratio)
        const images: PosterImages = { qr }
        posterScheme.draw(ctx, items, images)

        const filePath = await exportImage(canvas, width, height)
        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        setImagePath(filePath)
        setStatus('ready')
      } catch (error) {
        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        console.error('[ResultPoster] generate failed', error)
        setStatus('error')
      }
    }

    // 等弹层动画落定后再绘制，避免首帧卡顿
    const timer = setTimeout(() => void generate(), 60)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [visible, signature])

  // H5 端：截取预览节点，保存出去的图与预览完全一致
  useEffect(() => {
    if (!IS_H5 || !visible || items.length === 0 || share.status !== 'ready') {
      return
    }

    const currentRequest = ++requestId.current
    let cancelled = false
    setStatus('drawing')
    setImagePath('')

    const capture = async () => {
      const node = previewRef.current
      if (!node) {
        throw new Error('预览节点尚未渲染')
      }
      return captureNodeToDataUrl(node)
    }

    // 等卡片渲染完成（字体/布局落定）再截图
    const timer = setTimeout(() => {
      capture().then(
        (filePath) => {
          if (cancelled || requestId.current !== currentRequest) {
            return
          }
          setImagePath(filePath)
          setStatus('ready')
        },
        (error) => {
          if (cancelled || requestId.current !== currentRequest) {
            return
          }
          console.error('[ResultPoster] capture failed', error)
          setStatus('error')
        }
      )
    }, 60)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [visible, signature, share.status])

  useEffect(() => {
    if (!visible || process.env.TARO_ENV !== 'h5') {
      return
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [visible, onClose])

  if (!visible) {
    return null
  }

  const isWeapp = process.env.TARO_ENV !== 'h5'

  const toggleGame = (key: string) => {
    if (deselected.includes(key)) {
      setDeselected(deselected.filter((item) => item !== key))
      return
    }
    if (items.length <= 1) {
      Taro.showToast({ title: '至少保留一个彩种', icon: 'none' })
      return
    }
    setDeselected([...deselected, key])
  }

  const handleSave = async () => {
    if (!imagePath || saving) {
      return
    }
    setSaving(true)
    try {
      if (process.env.TARO_ENV === 'h5') {
        const link = document.createElement('a')
        link.href = imagePath
        link.download = posterFileName(items)
        document.body.appendChild(link)
        link.click()
        link.remove()
        Taro.showToast({ title: '已开始下载', icon: 'success' })
      } else {
        await Taro.saveImageToPhotosAlbum({ filePath: imagePath })
        Taro.showToast({ title: '已保存到相册', icon: 'success' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '')
      if (message.includes('auth') || message.includes('deny') || message.includes('授权')) {
        Taro.showModal({
          title: '需要相册权限',
          content: '保存海报需要访问相册，请在设置中开启权限后重试。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              void Taro.openSetting()
            }
          },
        })
      } else {
        Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleShare = async () => {
    if (!imagePath) {
      return
    }
    if (process.env.TARO_ENV === 'h5') {
      Taro.showToast({ title: '请保存图片后分享', icon: 'none' })
      return
    }
    try {
      await Taro.showShareImageMenu({ path: imagePath })
    } catch {
      Taro.showToast({ title: '分享失败，请保存图片后分享', icon: 'none' })
    }
  }

  return (
    <View className={styles.mask}>
      <View className={styles.backdrop} onClick={onClose} catchMove />
      <View className={styles.panel}>
        <View className={styles.heading}>
          <Text className={styles.title}>分享开奖</Text>
          <View className={styles.closeButton} onClick={onClose}>
            <Text className={styles.closeIcon}>×</Text>
          </View>
        </View>

        {share.results.length > 1 ? (
          <ScrollView scrollX className={styles.gameBar}>
            {share.results.map((item) => {
              const key = posterKey(item)
              const active = !deselected.includes(key)
              return (
                <View
                  key={key}
                  className={classnames(styles.chip, active ? styles.chipActive : styles.chipOff)}
                  onClick={() => toggleGame(key)}
                >
                  <Text className={styles.chipText}>{item.gameName}</Text>
                </View>
              )
            })}
          </ScrollView>
        ) : null}

        <ScrollView scrollY className={styles.scrollBody}>
          {share.status !== 'ready' && (
            <View className={styles.posterWrap}>
              {share.status === 'loading' && (
                <View className={styles.placeholder}>
                  <View className={styles.spinner} />
                  <Text className={styles.placeholderText}>正在获取本期开奖…</Text>
                </View>
              )}
              {share.status === 'empty' && (
                <View className={styles.placeholder}>
                  <Text className={styles.placeholderText}>本期还没有可分享的开奖结果</Text>
                  <Text className={styles.placeholderHint}>开奖后重新打开即可分享</Text>
                </View>
              )}
              {share.status === 'error' && (
                <View className={styles.placeholder}>
                  <Text className={styles.placeholderText}>开奖数据获取失败</Text>
                  <Text className={styles.placeholderHint}>请关闭后重试</Text>
                </View>
              )}
            </View>
          )}
          {share.status === 'ready' && items.length > 0 && (
            <View className={styles.preview}>
              {/* 预览即导出：容器按可见高度截断，H5 保存的图就是这个节点 */}
              <View className={styles.previewViewport} ref={IS_H5 ? previewRef : undefined}>
                <LotteryCardView cards={cardItems} />
              </View>
              {status === 'drawing' && <Text className={styles.previewHint}>图片生成中…</Text>}
              {status === 'error' && <Text className={styles.previewHint}>图片生成失败，可直接截图保存</Text>}
            </View>
          )}
        </ScrollView>

        <View className={styles.actions}>
          <View
            className={classnames(styles.actionBtn, styles.actionGhost, status !== 'ready' && styles.actionDisabled)}
            onClick={handleSave}
          >
            <Text className={styles.actionText}>{saving ? '保存中…' : isWeapp ? '保存到相册' : '保存图片'}</Text>
          </View>
          {isWeapp ? (
            <View
              className={classnames(styles.actionBtn, styles.actionPrimary, status !== 'ready' && styles.actionDisabled)}
              onClick={handleShare}
            >
              <Text className={styles.actionText}>分享给好友</Text>
            </View>
          ) : null}
        </View>
        <Text className={styles.tip}>
          {share.results.length > 1 ? '点击彩种可增减内容，' : ''}
          {isWeapp ? '保存到相册后可转发给好友，二维码换成门店微信后即可引流' : '保存后可发送给好友或朋友圈'}
        </Text>
      </View>
    </View>
  )
}
