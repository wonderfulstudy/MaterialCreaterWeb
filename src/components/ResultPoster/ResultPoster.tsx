import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import { DEFAULT_SCHEME_ID, getPosterScheme } from './schemes'
import { POSTER_WIDTH } from './canvas-kit'
import type { PosterImages, ResultPosterInput } from './types'
import styles from './index.module.scss'

/** 当前定稿方案；弹层不再提供切换，换风格只改这里 */
const posterScheme = getPosterScheme(DEFAULT_SCHEME_ID)

export interface ResultPosterProps {
  /** 是否展示弹层 */
  visible: boolean
  /** 可分享的开奖结果，只传已开奖彩种；首项为默认选中 */
  results: ResultPosterInput[]
  onClose: () => void
}

type PosterStatus = 'idle' | 'drawing' | 'ready' | 'error'

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
 * 开奖结果分享海报：把当期开奖号码绘制成图片，附微信二维码引流。
 * 方案（视觉风格）由 schemes/ 提供，这里只管取数据、画布、导出与保存分享。
 *
 * 用法：
 * ```tsx
 * <ResultPoster visible={open} results={posterInputs} onClose={() => setOpen(false)} />
 * ```
 */
export default function ResultPoster({ visible, results, onClose }: ResultPosterProps) {
  const [status, setStatus] = useState<PosterStatus>('idle')
  const [imagePath, setImagePath] = useState('')
  const [posterHeight, setPosterHeight] = useState(0)
  const [saving, setSaving] = useState(false)
  const [gameIndex, setGameIndex] = useState(0)

  const requestId = useRef(0)

  const current = results[gameIndex] ?? results[0] ?? null
  // 用内容签名而非对象引用作为绘制依赖，调用方每次渲染新建对象也不会重复绘制
  const signature = useMemo(() => (current ? JSON.stringify(current) : ''), [current])

  useEffect(() => {
    if (!visible) {
      return
    }
    setStatus('idle')
    setImagePath('')
  }, [visible])

  useEffect(() => {
    if (!visible || !current) {
      return
    }

    const currentRequest = ++requestId.current
    let cancelled = false
    setStatus('drawing')
    setImagePath('')

    const generate = async () => {
      try {
        const logicalHeight = posterScheme.measure(current)
        const ratio = getPixelRatio()
        const width = Math.round(POSTER_WIDTH * ratio)
        const height = Math.round(logicalHeight * ratio)

        const canvas = createOffscreen(width, height)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          throw new Error('当前环境不支持海报绘制')
        }

        const qr = await loadQrImage(canvas, current.qrImage)
        if (cancelled || requestId.current !== currentRequest) {
          return
        }

        ctx.scale(ratio, ratio)
        const images: PosterImages = { qr }
        posterScheme.draw(ctx, current, images)

        const filePath = await exportImage(canvas, width, height)
        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        setImagePath(filePath)
        setPosterHeight(logicalHeight)
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

  const handleSave = async () => {
    if (!imagePath || saving) {
      return
    }
    setSaving(true)
    try {
      if (process.env.TARO_ENV === 'h5') {
        const link = document.createElement('a')
        link.href = imagePath
        link.download = `${current?.gameName ?? '开奖'}-开奖海报.png`
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

        {results.length > 1 ? (
          <ScrollView scrollX className={styles.gameBar}>
            {results.map((item, index) => (
              <View
                key={item.gameName + item.issue}
                className={classnames(styles.chip, index === gameIndex && styles.chipActive)}
                onClick={() => setGameIndex(index)}
              >
                <Text className={styles.chipText}>{item.gameName}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView scrollY className={styles.scrollBody}>
          <View className={styles.posterWrap}>
            {status === 'drawing' && (
              <View className={styles.placeholder}>
                <View className={styles.spinner} />
                <Text className={styles.placeholderText}>海报生成中…</Text>
              </View>
            )}
            {status === 'error' && (
              <View className={styles.placeholder}>
                <Text className={styles.placeholderText}>海报生成失败</Text>
                <Text className={styles.placeholderHint}>请关闭后重试</Text>
              </View>
            )}
            {status === 'ready' && imagePath && (
              <Image
                className={styles.posterImage}
                src={imagePath}
                mode="widthFix"
                style={{ aspectRatio: `${POSTER_WIDTH} / ${posterHeight}` }}
                showMenuByLongpress={isWeapp}
              />
            )}
          </View>
        </ScrollView>

        <View className={styles.actions}>
          <View
            className={classnames(styles.actionBtn, styles.actionGhost, status !== 'ready' && styles.actionDisabled)}
            onClick={handleSave}
          >
            <Text className={styles.actionText}>{saving ? '保存中…' : isWeapp ? '保存到相册' : '下载图片'}</Text>
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
          {isWeapp ? '长按海报可保存或转发，二维码换成门店微信后即可引流' : '下载后可发送给好友或朋友圈'}
        </Text>
      </View>
    </View>
  )
}
