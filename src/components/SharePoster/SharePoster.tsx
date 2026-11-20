import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import { drawSharePoster, measurePosterHeight, POSTER_WIDTH } from './draw'
import { planSignature, type SharePlan } from './model'
import styles from './index.module.scss'

export interface SharePosterProps {
  /** 是否展示海报弹层 */
  visible: boolean
  /** 要分享的方案（含历史方案与中奖情况） */
  plan: SharePlan | null
  onClose: () => void
  /** 海报图片生成成功后回调，参数为图片临时路径 / dataURL */
  onGenerated?: (filePath: string) => void
}

type PosterStatus = 'idle' | 'drawing' | 'ready' | 'error'

/** 离屏画布的最小抽象：weapp 用 OffscreenCanvas，H5 用 detached canvas */
interface OffscreenLike {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
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
    return canvas
  }
  return Taro.createOffscreenCanvas({ type: '2d', width, height }) as unknown as OffscreenLike
}

/** weapp 离屏画布导出为临时文件；H5 直接返回 dataURL */
async function exportImage(canvas: OffscreenLike, width: number, height: number): Promise<string> {
  if (process.env.TARO_ENV === 'h5') {
    return (canvas as HTMLCanvasElement).toDataURL('image/png')
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
 * 方案分享海报：把当前方案、历史方案与中奖情况绘制成一张红金票据风格长图，
 * 弹层内预览，支持保存到相册 / 微信分享（H5 为下载图片）。
 *
 * 用法：
 * ```tsx
 * <SharePoster visible={open} plan={sharePlan} onClose={() => setOpen(false)} />
 * ```
 */
export default function SharePoster({ visible, plan, onClose, onGenerated }: SharePosterProps) {
  const [status, setStatus] = useState<PosterStatus>('idle')
  const [imagePath, setImagePath] = useState('')
  const [posterHeight, setPosterHeight] = useState(0)
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)
  const planRef = useRef<SharePlan | null>(plan)
  planRef.current = plan
  const onGeneratedRef = useRef(onGenerated)
  onGeneratedRef.current = onGenerated

  // 以内容签名为依赖：调用方每次渲染传入新对象引用时，只要内容不变就不重复绘制
  const signature = useMemo(() => (plan ? planSignature(plan) : ''), [plan])

  useEffect(() => {
    if (!visible || !signature) {
      return
    }

    const currentRequest = ++requestId.current
    let cancelled = false
    setStatus('drawing')
    setImagePath('')

    const generate = async () => {
      const target = planRef.current
      if (!target) {
        return
      }
      try {
        const logicalHeight = measurePosterHeight(target)
        const ratio = getPixelRatio()
        const width = Math.round(POSTER_WIDTH * ratio)
        const height = Math.round(logicalHeight * ratio)

        const canvas = createOffscreen(width, height)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          throw new Error('当前环境不支持海报绘制')
        }
        ctx.scale(ratio, ratio)
        drawSharePoster(ctx, target)

        const filePath = await exportImage(canvas, width, height)
        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        setImagePath(filePath)
        setPosterHeight(logicalHeight)
        setStatus('ready')
        onGeneratedRef.current?.(filePath)
      } catch (error) {
        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        console.error('[SharePoster] generate failed', error)
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

  if (!visible || !plan) {
    return null
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
        link.download = `${plan.name}-分享海报.png`
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

  const isWeapp = process.env.TARO_ENV !== 'h5'

  return (
    <View className={styles.mask}>
      <View className={styles.backdrop} onClick={onClose} catchMove />
      <View className={styles.panel}>
        <View className={styles.heading}>
          <Text className={styles.title}>分享海报</Text>
          <View className={styles.closeButton} onClick={onClose}>
            <Text className={styles.closeIcon}>×</Text>
          </View>
        </View>

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
                <Text className={styles.placeholderHint}>请关闭后重试，或检查方案内容是否完整</Text>
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
          {isWeapp ? '也可以长按海报图片保存或转发' : '下载后可发送给好友或分享到朋友圈'}
        </Text>
      </View>
    </View>
  )
}
