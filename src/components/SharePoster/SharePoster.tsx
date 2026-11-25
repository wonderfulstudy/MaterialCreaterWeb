import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import PosterStage, {
  PlanPosterA,
  PlanPosterB,
  PosterSegments,
  POSTER_EXPORT_SCALE,
  buildRecordRows,
  clockText,
  dateKey,
  dayStats,
  historyRows,
  measureRecordPaging,
  planRecordPages,
  readJudged,
  readPosterBackground,
  todayLabel,
  type PosterCardKey,
  type PosterPage,
  type PosterRecordPage,
} from '@/components/PlanPoster'
import { clearPosterBackground, pickPosterBackground, savePosterBackground } from '@/components/PlanPoster/poster-bg'
import { listDays, planStats, primaryPlanId } from '@/services/plan-store'
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
  /** 海报图片生成成功后回调，参数为图片临时路径 / dataURL（分张时是第一张） */
  onGenerated?: (filePath: string) => void
  /** 方案作用域（AC-11 / AC-21）：不传则用 plan.planId，再退到 primaryPlanId() */
  planId?: string
}

type PosterStatus = 'idle' | 'drawing' | 'ready' | 'error'

const IS_H5 = process.env.TARO_ENV === 'h5'

/** H5 端「所见即所得」的截图源节点：1:1 海报副本的外框（A/B 卡共用同一个 id，分张时再加序号） */
const PREVIEW_NODE_ID = 'share-poster-preview'

/** 导出底色：卡片圆角外的缝隙与海报背景同色 */
const POSTER_EXPORT_BACKGROUND = '#8B0C14'

/** 分张时每张的截图节点 id；单张沿用 PREVIEW_NODE_ID，导出与分张上线前完全一致 */
function sheetNodeIds(count: number): string[] {
  if (count <= 1) return [PREVIEW_NODE_ID]
  return Array.from({ length: count }, (_, index) => PREVIEW_NODE_ID + '-' + (index + 1))
}

/** 下载文件名：单张保持「方案名-战绩长图.png」，分张才加序号 */
function posterFileName(name: string, card: PosterCardKey, index: number, total: number): string {
  const label = card === 'today' ? '今日推荐' : '战绩长图'
  return total > 1 ? name + '-' + label + '-' + (index + 1) + '.png' : name + '-' + label + '.png'
}

/** 离屏画布的最小抽象：weapp 用 OffscreenCanvas，H5 用 detached canvas */
interface OffscreenLike {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
}

/**
 * 弹层入场动画（poster-grow 0.28s，scale 0.86 → 1）会缩放截图的父节点，
 * 动画没结束就截，成品尺寸会小于 750 宽且每次都不一样。
 * 判据是「可视宽度 = 布局宽度」：有祖先 transform 时两者不等。
 */
async function waitForStableWidth(node: HTMLElement, timeoutMs = 1200): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const visible = node.getBoundingClientRect().width
    if (node.offsetWidth > 0 && Math.abs(visible - node.offsetWidth) < 0.5) {
      return
    }
    await new Promise((resolve) => window.setTimeout(resolve, 60))
  }
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
  if (IS_H5) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return Taro.createOffscreenCanvas({ type: '2d', width, height }) as unknown as OffscreenLike
}

/** weapp 离屏画布导出为临时文件；H5 直接返回 dataURL */
async function exportImage(canvas: OffscreenLike, width: number, height: number): Promise<string> {
  if (IS_H5) {
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
 * 方案分享海报：A 卡（今日推荐）与 B 卡（战绩长图），页顶分段切换当前那一张。
 *
 * - H5：截取 1:1 副本节点（captureNodeToDataUrl，scale=2）得到图片，预览就是导出；
 *   B 卡成品高 > 3000px 时按行边界自动切成多张，每张都带表头，逐张下载；
 *   B 卡背景图可在弹层工具条里换（只写 storage，不进截图节点）；
 * - 小程序：预览同样是 A/B 卡，导出仍走离屏画布（Snapshot 需要 Skyline，后续迁移）。
 *
 * 用法：
 * ```tsx
 * <SharePoster visible={open} plan={sharePlan} onClose={() => setOpen(false)} />
 * ```
 */
export default function SharePoster({ visible, plan, onClose, onGenerated, planId }: SharePosterProps) {
  const [status, setStatus] = useState<PosterStatus>('idle')
  const [imagePaths, setImagePaths] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [card, setCard] = useState<PosterCardKey>('today')
  const [coverImage, setCoverImage] = useState('')
  /** 分张结果：key 记录它是按哪一份数据量的，数据一变就作废（不拿旧行数算分张） */
  const [pagesState, setPagesState] = useState<{ key: string; ranges: PosterRecordPage[] } | null>(null)
  const requestId = useRef(0)
  const planRef = useRef<SharePlan | null>(plan)
  planRef.current = plan
  const onGeneratedRef = useRef(onGenerated)
  onGeneratedRef.current = onGenerated

  // 以内容签名为依赖：调用方每次渲染传入新对象引用时，只要内容不变就不重复生成
  const signature = useMemo(() => (plan ? planSignature(plan) : ''), [plan])

  // 方案作用域：历史行、战绩统计都只取这一个方案的记录，不合并别方案的日历
  const scopeId = useMemo(() => planId ?? plan?.planId ?? primaryPlanId(), [planId, plan])

  // 每日记录：只读消费本方案；card 作为重读触发器，切卡时拿最新 judged / note
  const dayRecords = useMemo(
    () => (visible && scopeId ? listDays(scopeId) : []),
    [visible, card, scopeId]
  )
  const daysSignature = useMemo(
    () => dayRecords.map((day) => day.date + ':' + readJudged(day) + (day.rest ? ':rest' : '')).join(','),
    [dayRecords]
  )
  // A/B 卡的战绩口径与方案列表卡同源：planStats(planId)；没有方案时才用当页记录兜底
  const stats = useMemo(
    () => (scopeId ? planStats(scopeId) : dayStats(dayRecords)),
    [scopeId, dayRecords]
  )
  const recordRows = useMemo(
    () => buildRecordRows(dayRecords, plan ? { date: dateKey(), legs: plan.legs, amount: plan.summary?.amount ?? 0 } : null),
    [dayRecords, plan]
  )
  const history = useMemo(() => (plan ? historyRows(plan) : []), [plan])
  const dateText = useMemo(() => (visible ? todayLabel() : ''), [visible, card])
  const timeText = useMemo(() => (visible ? clockText() : ''), [visible, card])

  // 背景图读 storage：打开时同步一次，换图/恢复默认后由 setCoverImage 直接更新
  useEffect(() => {
    if (!visible) return
    setCoverImage(readPosterBackground())
  }, [visible])

  const measureKey = signature + '|' + daysSignature + '|' + card

  // 量一次 1:1 副本的真实高度，定下 B 卡分张；量不到就整张导出（与分张上线前一致）
  useEffect(() => {
    if (!visible || card !== 'history' || !IS_H5) return
    if (pagesState && pagesState.key === measureKey) return
    const node = document.getElementById(PREVIEW_NODE_ID)
    const measured = node ? measureRecordPaging(node, recordRows.length) : null
    setPagesState({
      key: measureKey,
      ranges: measured ? planRecordPages(measured) : [{ start: 0, end: recordRows.length }],
    })
  }, [visible, card, measureKey, recordRows.length, pagesState])

  const splitRanges = card === 'history' && pagesState && pagesState.key === measureKey ? pagesState.ranges : null
  const splitKey = splitRanges ? splitRanges.map((range) => range.start + ':' + range.end).join(',') : ''
  /** 分张还没定下来就先别截：截早了会拿上一轮的节点尺寸 */
  const pagingPending = card === 'history' && IS_H5 && splitRanges === null

  useEffect(() => {
    if (!visible || !signature || pagingPending) {
      return
    }

    const currentRequest = ++requestId.current
    let cancelled = false
    setStatus('drawing')
    setImagePaths([])

    const generate = async () => {
      const target = planRef.current
      if (!target) {
        return
      }
      try {
        let paths: string[]
        if (IS_H5) {
          const captured: string[] = []
          for (const id of sheetNodeIds(splitRanges ? splitRanges.length : 1)) {
            const node = document.getElementById(id)
            if (!node) {
              throw new Error('海报预览尚未渲染')
            }
            await waitForStableWidth(node)
            captured.push(
              await captureNodeToDataUrl(node, {
                scale: POSTER_EXPORT_SCALE,
                backgroundColor: POSTER_EXPORT_BACKGROUND,
              })
            )
          }
          paths = captured
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

          paths = [await exportImage(canvas, width, height)]
        }

        if (cancelled || requestId.current !== currentRequest) {
          return
        }
        setImagePaths(paths)
        setStatus('ready')
        onGeneratedRef.current?.(paths[0])
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
  }, [visible, signature, card, daysSignature, coverImage, splitKey, pagingPending])

  useEffect(() => {
    if (!visible || !IS_H5) {
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
    if (!imagePaths.length || saving) {
      return
    }
    setSaving(true)
    try {
      if (IS_H5) {
        for (let index = 0; index < imagePaths.length; index += 1) {
          const link = document.createElement('a')
          link.href = imagePaths[index]
          link.download = posterFileName(plan.name, card, index, imagePaths.length)
          document.body.appendChild(link)
          link.click()
          link.remove()
          // 连点多个下载会被浏览器拦，逐张隔一帧
          if (index < imagePaths.length - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 150))
          }
        }
        Taro.showToast({
          title: imagePaths.length > 1 ? '已开始下载 ' + imagePaths.length + ' 张' : '已开始下载',
          icon: 'success',
        })
      } else {
        await Taro.saveImageToPhotosAlbum({ filePath: imagePaths[0] })
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
    if (!imagePaths.length) {
      return
    }
    if (IS_H5) {
      Taro.showToast({ title: '请保存图片后分享', icon: 'none' })
      return
    }
    try {
      await Taro.showShareImageMenu({ path: imagePaths[0] })
    } catch {
      Taro.showToast({ title: '分享失败，请保存图片后分享', icon: 'none' })
    }
  }

  const handlePickBackground = async () => {
    if (picking) {
      return
    }
    setPicking(true)
    try {
      const dataUrl = await pickPosterBackground()
      if (!dataUrl) {
        return
      }
      setCoverImage(savePosterBackground(dataUrl))
      Taro.showToast({ title: '背景图已更新', icon: 'success' })
    } catch (error) {
      console.error('[SharePoster] pick background failed', error)
      Taro.showToast({ title: '换图失败，请重试', icon: 'none' })
    } finally {
      setPicking(false)
    }
  }

  const handleResetBackground = () => {
    clearPosterBackground()
    setCoverImage('')
    Taro.showToast({ title: '已恢复默认背景', icon: 'none' })
  }

  const isWeapp = !IS_H5

  const sheetRanges: PosterRecordPage[] =
    splitRanges && splitRanges.length ? splitRanges : [{ start: 0, end: recordRows.length }]
  const sheetIds = sheetNodeIds(card === 'today' ? 1 : sheetRanges.length)
  const pages: PosterPage[] =
    card === 'today'
      ? [
          {
            id: sheetIds[0],
            node: <PlanPosterA plan={plan} dateText={dateText} timeText={timeText} stats={stats} history={history} />,
          },
        ]
      : sheetRanges.map((range, index) => ({
          id: sheetIds[index],
          label: sheetRanges.length > 1 ? '第 ' + (index + 1) + ' / ' + sheetRanges.length + ' 张' : undefined,
          node: (
            <PlanPosterB
              planName={plan.name}
              dateText={dateText}
              rows={recordRows.slice(range.start, range.end)}
              coverImage={coverImage}
              stats={stats}
              slice={
                sheetRanges.length > 1
                  ? {
                      index,
                      total: sheetRanges.length,
                      showCover: index === 0,
                      showTail: index === sheetRanges.length - 1,
                    }
                  : undefined
              }
            />
          ),
        }))

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

        {/* 页顶分段：只换当前那张卡，不做横向封面流（D75 按来源单张） */}
        <PosterSegments value={card} onChange={setCard} />

        {/* B 卡背景图工具条：在 PosterStage 之外，任何工具条都不进截图节点 */}
        {IS_H5 && card === 'history' ? (
          <View className={styles.coverBar}>
            <Text className={styles.coverBarHint}>背景图</Text>
            <View
              className={classnames(styles.coverBtn, picking ? styles.coverBtnBusy : null)}
              onClick={() => void handlePickBackground()}
            >
              <Text className={styles.coverBtnText}>{picking ? '处理中…' : '更换背景图'}</Text>
            </View>
            <View className={styles.coverBtn} onClick={handleResetBackground}>
              <Text className={styles.coverBtnText}>恢复默认</Text>
            </View>
          </View>
        ) : null}

        <View className={styles.previewWrap}>
          {/* 预览＝导出：同一份卡片 DOM，H5 直接截这份 1:1 副本（分张时每张一个截图节点） */}
          <PosterStage pages={pages} />
          {status === 'drawing' ? <Text className={styles.statusText}>正在生成图片…</Text> : null}
          {status === 'error' ? <Text className={styles.statusError}>图片生成失败，请关闭后重试</Text> : null}
        </View>

        <View className={styles.actions}>
          <View
            className={classnames(styles.actionBtn, styles.actionGhost, status !== 'ready' && styles.actionDisabled)}
            onClick={() => void handleSave()}
          >
            <Text className={styles.actionText}>{saving ? '保存中…' : isWeapp ? '保存到相册' : '下载图片'}</Text>
          </View>
          {isWeapp ? (
            <View
              className={classnames(styles.actionBtn, styles.actionPrimary, status !== 'ready' && styles.actionDisabled)}
              onClick={() => void handleShare()}
            >
              <Text className={styles.actionText}>分享给好友</Text>
            </View>
          ) : null}
        </View>
        <Text className={styles.tip}>
          {isWeapp
            ? '预览为方案海报，保存的图片仍为票据海报'
            : imagePaths.length > 1
              ? '成品超过 3000px，已按行切成 ' + imagePaths.length + ' 张长图，逐张下载'
              : '下载的图片就是上方这张海报（750 宽）'}
        </Text>
      </View>
    </View>
  )
}
