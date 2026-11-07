import { useMemo, useRef, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import { isOcrSupported, recognizeImage } from '@/services/ocr'
import { groupRecentSummaries, summarize, type SummaryRow } from './summary'
import styles from './index.module.scss'

type MaterialStatus = 'pending' | 'recognizing' | 'done' | 'error'

interface Material {
  id: string
  path: string
  status: MaterialStatus
  error: string
  summary?: SummaryRow
}

const STATUS_LABEL: Record<MaterialStatus, string> = {
  pending: '待识别',
  recognizing: '识别中',
  done: '已识别',
  error: '识别失败',
}

export default function SharePage() {
  const supported = useMemo(() => isOcrSupported(), [])
  const [materials, setMaterials] = useState<Material[]>([])
  const [activeId, setActiveId] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState('')
  const seq = useRef(0)

  const activeIndex = Math.max(0, materials.findIndex((item) => item.id === activeId))
  const recognizedCount = materials.filter((item) => item.status === 'done').length
  const pendingCount = materials.filter((item) => item.status === 'pending' || item.status === 'error').length

  const groups = useMemo(() => {
    const rows = materials
      .map((item) => item.summary)
      .filter((row): row is SummaryRow => Boolean(row))
    return groupRecentSummaries(rows, new Date(), 2)
  }, [materials])

  const updateMaterial = (id: string, patch: Partial<Material>) => {
    setMaterials((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const handleChooseImages = async () => {
    if (busy) {
      return
    }

    try {
      const result = await Taro.chooseImage({
        count: 9,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
      })
      const paths = result.tempFilePaths ?? []
      if (!paths.length) {
        return
      }

      const appended: Material[] = paths.map((path) => {
        seq.current += 1
        return { id: `material-${seq.current}`, path, status: 'pending', error: '' }
      })

      setMaterials((prev) => [...prev, ...appended])
      setActiveId((current) => current || appended[0].id)
      setErrorText('')
      setStatusText(`已添加 ${appended.length} 张图片`)
    } catch {
      // 用户取消选择，无需提示
    }
  }

  const handleRecognize = async () => {
    if (busy) {
      return
    }
    if (!supported) {
      setErrorText('当前环境不支持本地识别，请在微信小程序中打开')
      return
    }

    const targets = materials.filter((item) => item.status === 'pending' || item.status === 'error')
    if (!targets.length) {
      setErrorText('没有待识别的图片')
      return
    }

    setBusy(true)
    setErrorText('')

    const recognized: SummaryRow[] = []

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index]
        setStatusText(`正在识别第 ${index + 1}/${targets.length} 张…`)
        updateMaterial(target.id, { status: 'recognizing', error: '' })

        try {
          const result = await recognizeImage(target.path, {
            onProgress: (progress) => {
              if (progress.stage === 'downloading') {
                setStatusText(`正在下载识别模型 ${progress.percent ?? 0}%（仅首次）…`)
              }
            },
          })

          const summary: SummaryRow = {
            id: target.id,
            ...summarize(result.text, `素材 ${index + 1}`),
          }
          updateMaterial(target.id, { status: 'done', summary })
          recognized.push(summary)

          console.log(`[share] 素材汇总（第 ${index + 1}/${targets.length} 张）`, {
            文件: target.path,
            图片标题: summary.title,
            日期: summary.date,
            方案: summary.plan,
            识别全文: result.text,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '识别失败'
          console.warn(`[share] 第 ${index + 1} 张识别失败：${target.path}`, message)
          updateMaterial(target.id, { status: 'error', error: message })
        }
      }

      setStatusText('识别完成，汇总见下方表格')
      console.log('[share] 近两日汇总（本次识别）', groupRecentSummaries(recognized, new Date(), 2))
    } finally {
      setBusy(false)
    }
  }

  const renderDeck = () => {
    if (!materials.length) {
      return (
        <View className={styles.emptyCard} onClick={handleChooseImages}>
          <Text className={styles.emptyIcon}>＋</Text>
          <Text className={styles.emptyText}>上传图片（支持多选）</Text>
        </View>
      )
    }

    return materials.map((item, index) => {
      const offset = index - activeIndex
      const isActive = offset === 0
      const depth = Math.abs(offset)
      const shift = Math.max(-3, Math.min(3, offset))

      const style = isActive
        ? { transform: 'translate3d(0, 0, 0) scale(1)', zIndex: 30, opacity: 1 }
        : {
            transform: `translate3d(${shift * 30}rpx, ${Math.min(depth, 3) * 14}rpx, 0) scale(${Math.max(
              0.48,
              0.7 - depth * 0.06
            )})`,
            zIndex: 30 - depth,
            opacity: depth > 3 ? 0 : 1,
          }

      return (
        <View
          key={item.id}
          className={classnames(styles.card, isActive && styles.cardActive)}
          style={style}
          onClick={() => setActiveId(item.id)}
        >
          <Image className={styles.cardImage} src={item.path} mode='aspectFill' />
          <View
            className={classnames(
              styles.cardBadge,
              item.status === 'error' && styles.cardBadgeError,
              item.status === 'done' && styles.cardBadgeDone
            )}
          >
            <Text className={styles.cardBadgeText}>{STATUS_LABEL[item.status]}</Text>
          </View>
          {isActive && item.summary && (
            <View className={styles.cardCaption}>
              <Text className={styles.cardCaptionTitle}>{item.summary.title}</Text>
              <Text className={styles.cardCaptionText}>{item.summary.date}</Text>
            </View>
          )}
        </View>
      )
    })
  }

  return (
    <View className={styles.page}>
      {!supported && (
        <View className={styles.notice}>
          <Text className={styles.noticeText}>
            当前环境不支持本地识别，请使用微信小程序（基础库 2.30.0 及以上）打开。
          </Text>
        </View>
      )}

      <View className={styles.deck}>{renderDeck()}</View>

      {materials.length > 0 && (
        <Text className={styles.deckHint}>点击图片可放大查看，其余图片会缩到后方</Text>
      )}

      <View className={styles.actions}>
        <View
          className={classnames(styles.secondaryButton, busy && styles.buttonDisabled)}
          onClick={handleChooseImages}
        >
          <Text className={styles.secondaryButtonText}>上传图片</Text>
        </View>
        <View
          className={classnames(
            styles.primaryButton,
            (busy || !pendingCount || !supported) && styles.buttonDisabled
          )}
          onClick={handleRecognize}
        >
          <Text className={styles.primaryButtonText}>
            {busy ? '识别中…' : pendingCount > 1 ? `开始识别（${pendingCount}）` : '开始识别'}
          </Text>
        </View>
      </View>

      {statusText && <Text className={styles.statusText}>{statusText}</Text>}
      {errorText && <Text className={styles.errorText}>{errorText}</Text>}

      <View className={styles.summary}>
        <View className={styles.summaryHeader}>
          <Text className={styles.summaryTitle}>近两日汇总</Text>
          <Text className={styles.summaryMeta}>已识别 {recognizedCount} 张</Text>
        </View>

        {groups.length === 0 ? (
          <Text className={styles.summaryEmpty}>
            识别完成后，这里会按日期展示图片标题、日期和方案
          </Text>
        ) : (
          groups.map((group) => (
            <View className={styles.group} key={group.date}>
              <View className={styles.groupHeader}>
                <Text className={styles.groupDate}>{group.date}</Text>
                <Text className={styles.groupCount}>{group.rows.length} 条</Text>
              </View>

              <View className={styles.table}>
                <View className={classnames(styles.row, styles.rowHead)}>
                  <Text className={classnames(styles.cell, styles.cellTitle)}>图片标题</Text>
                  <Text className={classnames(styles.cell, styles.cellDate)}>日期</Text>
                  <Text className={classnames(styles.cell, styles.cellPlan)}>方案</Text>
                </View>
                {group.rows.map((row) => (
                  <View className={styles.row} key={row.id} onClick={() => setActiveId(row.id)}>
                    <Text className={classnames(styles.cell, styles.cellTitle)}>{row.title}</Text>
                    <Text className={classnames(styles.cell, styles.cellDate)}>{row.date.slice(5)}</Text>
                    <Text className={classnames(styles.cell, styles.cellPlan)}>{row.plan}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
