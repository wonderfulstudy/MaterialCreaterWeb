import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import PlanCardView from '@/components/PlanCardView'
import { captureNodeToDataUrl } from '@/utils/posters/capture'
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

/** H5 端「所见即所得」的截图源节点：预览里那张方案卡片的外框 */
const PREVIEW_NODE_ID = 'share-poster-preview'

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
 * 方案分享海报：预览就是推荐页那张方案卡片（同一个 PlanCardView），
 * 因此 H5 保存下来的图与预览完全一致（所见即所得）。
 *
 * - H5：截取预览节点（captureNodeToDataUrl）得到图片；
 * - 小程序：预览同样是方案卡片，导出仍走离屏画布（Snapshot 需要 Skyline，后续迁移）。
 *
 * 用法：
 * ```tsx
 * <SharePoster visible={open} plan={sharePlan} onClose={() => setOpen(false)} />
 * ```
 */
export default function SharePoster({ visible, plan, onClose, onGenerated }: SharePosterProps) {
  const [status, setStatus] = useState<PosterStatus>('idle')
  const [imagePath, setImagePath] = useState('')
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)
  const planRef = useRef<SharePlan | null>(plan)
  planRef.current = plan
  const onGeneratedRef = useRef(onGenerated)
  onGeneratedRef.current = onGenerated

  // 以内容签名为依赖：调用方每次渲染传入新对象引用时，只要内容不变就不重复生成
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
        let filePath: string
        if (process.env.TARO_ENV === 'h5') {
          const node = document.getElementById(PREVIEW_NODE_ID)
          if (!node) {
            throw new Error('海报预览尚未渲染')
          }
          filePath = await captureNodeToDataUrl(node)
        } else {
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

          filePath = await exportImage(canvas, width, height)
        }

        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        setImagePath(filePath)
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

    // 等弹层动画与卡片排版落定后再截图，避免首帧卡顿 / 截到半透明状态
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

        <View className={styles.previewWrap}>
          {/* 预览＝页面同款卡片；容器截断超长内容，H5 直接截这一块导出 */}
          <View id={PREVIEW_NODE_ID} className={styles.previewClip}>
            <PlanCardView name={plan.name} legs={plan.legs} summary={plan.summary} expanded />
          </View>
          {status === 'drawing' ? <Text className={styles.statusText}>正在生成图片…</Text> : null}
          {status === 'error' ? <Text className={styles.statusError}>图片生成失败，请关闭后重试</Text> : null}
        </View>

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
          {isWeapp ? '预览为方案卡片，保存的图片仍为票据海报' : '下载的图片就是上方这张方案卡片'}
        </Text>
      </View>
    </View>
  )
}
