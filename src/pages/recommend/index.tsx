import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useShareAppMessage } from '@tarojs/taro'
import classnames from 'classnames'
import { isOcrSupported, recognizeImage } from '@/services/ocr'
import PlanCalculator, {
  SPORTS,
  formatAmount,
  sportLabel,
  useSportSchedule,
  type PlanLeg,
  type SelectionSummary,
  type SportKey,
} from '@/components/PlanCalculator'
import PlanCardView from '@/components/PlanCardView'
import SharePoster from '@/components/SharePoster'
import RenameDialog from '@/components/RenameDialog'
import TabBar from '@/components/TabBar'
import { findMatrix } from '@/services/matrix-store'
import { findPreset, listPresets, savePreset, type StoredPreset } from '@/services/preset-store'
import { matchRecognizedPicks, parseRecommendationText } from './plan-ocr'
import {
  createPlan,
  pushHistory,
  summarizePlan,
  toSharePlan,
  type RecommendPlan,
} from './plan'
import {
  PRESET_DEFS,
  buildPresetCandidates,
  buildStoredPreset,
  findPresetPassByLabel,
  presetBonusText,
  presetLegText,
  samePreset,
  todayKey,
  type PresetMatrixRow,
} from './preset-plan'
import styles from './index.module.scss'

interface PlanCard extends RecommendPlan {
  error: string
}

interface PanelState {
  open: boolean
  mode: 'create' | 'pick'
  targetId: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: string }).errMsg || '')
  }
  return '识别失败'
}

export default function RecommendPage() {
  const supported = useMemo(() => isOcrSupported(), [])
  const router = useRouter()
  const initialSport: SportKey =
    router.params?.sport === 'basketball' ? 'basketball' : 'football'

  const [sport, setSport] = useState<SportKey>(initialSport)
  const [sportOpen, setSportOpen] = useState(false)
  const { states, load } = useSportSchedule(sport)
  const [cards, setCards] = useState<Record<SportKey, PlanCard[]>>({
    football: [{ ...createPlan('football', '方案 1'), error: '' }],
    basketball: [{ ...createPlan('basketball', '方案 1'), error: '' }],
  })

  const [panel, setPanel] = useState<PanelState>({ open: false, mode: 'create', targetId: '' })
  const [recognizingId, setRecognizingId] = useState('')
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState('')
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [renameId, setRenameId] = useState('')
  const [posterPlanId, setPosterPlanId] = useState('')
  /** 已展开的方案 id：默认全部收起 */
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 长按触发时刻：用于吞掉长按松手后补发的幽灵 click */
  const longPressFiredAt = useRef(0)

  const current = states[sport]
  const currentCards = cards[sport]

  /** 预设方案：设置来自 preset-store，内容只由当日矩阵已选选项算出（AC-22/D39） */
  const [storedPresets, setStoredPresets] = useState<StoredPreset[]>(() => listPresets())
  const [matrixRows, setMatrixRows] = useState<PresetMatrixRow[]>(
    () => findMatrix(sport, todayKey())?.rows ?? [],
  )
  // 从矩阵/预设设置页返回时，两者都可能是新的
  useDidShow(() => {
    setStoredPresets(listPresets())
    setMatrixRows(findMatrix(sport, todayKey())?.rows ?? [])
  })
  useEffect(() => {
    setMatrixRows(findMatrix(sport, todayKey())?.rows ?? [])
  }, [sport])
  const presetSettingsSignature = storedPresets
    .map((item) => `${item.id}:${item.passLabel}:${item.multiple}:${item.candidateIndex}`)
    .join('|')

  const presetRows = useMemo(() => {
    const matrixDate = todayKey()
    return PRESET_DEFS.map((def) => {
      const stored = storedPresets.find((item) => item.id === def.id)
      const pass = findPresetPassByLabel(stored?.passLabel)
      const multiple = stored?.multiple ?? 1
      const candidates = buildPresetCandidates(
        { rows: matrixRows, date: matrixDate, sport },
        pass,
        multiple,
        def.pick,
      )
      return {
        def,
        preset: buildStoredPreset({
          def,
          sport,
          pass,
          multiple,
          candidates,
          candidateIndex: stored?.candidateIndex ?? 1,
          date: todayKey(),
        }),
      }
    })
  }, [matrixRows, sport, presetSettingsSignature])

  /** 算出来的内容与存储不一致就落盘（含换天重算），刷新后仍是最后一次看到的内容 */
  useEffect(() => {
    if (!presetRows) {
      return
    }
    let changed = false
    presetRows.forEach((row) => {
      if (row.preset && !samePreset(findPreset(row.preset.id), row.preset)) {
        savePreset(row.preset)
        changed = true
      }
    })
    if (changed) {
      setStoredPresets(listPresets())
    }
  }, [presetRows])

  const displayRows = presetRows

  const matrixMissing = matrixRows.length === 0

  const updateCard = (key: SportKey, id: string, patch: Partial<PlanCard>) => {
    setCards((prev) => ({
      ...prev,
      [key]: prev[key].map((card) => (card.id === id ? { ...card, ...patch } : card)),
    }))
  }

  const handleSportChange = (next: SportKey) => {
    setSportOpen(false)
    if (next === sport) {
      return
    }
    setSport(next)
    setDeleteMode(false)
    setSelectedIds([])
    setStatusText('')
    setErrorText('')
  }

  const openCreate = () => {
    if (states[sport].status !== 'ready') {
      void load(sport)
    }
    setPanel({ open: true, mode: 'create', targetId: '' })
  }

  const openPicker = (id: string) => {
    if (states[sport].status !== 'ready') {
      void load(sport)
    }
    setPanel({ open: true, mode: 'pick', targetId: id })
  }

  const closePanel = () => {
    setPanel({ open: false, mode: 'create', targetId: '' })
  }

  const handlePanelConfirm = (legs: PlanLeg[], summary: SelectionSummary) => {
    if (panel.mode === 'create') {
      const name = `方案 ${cards[sport].length + 1}`
      const card: PlanCard = { ...createPlan(sport, name, legs), summary, error: '' }
      setCards((prev) => ({ ...prev, [sport]: [...prev[sport], card] }))
      setStatusText(`已新增方案「${name}」`)
    } else if (panel.targetId) {
      const target = cards[sport].find((card) => card.id === panel.targetId)
      updateCard(sport, panel.targetId, {
        legs,
        summary,
        note: '手动选择方案',
        error: '',
        history: target ? pushHistory(target, legs) : undefined,
        results: undefined,
      })
      setStatusText('方案已更新')
    }
    closePanel()
  }

  /** 底部「新增方案」：直接追加一张名为「新增方案」的空卡片 */
  const handleAddPlan = () => {
    const card: PlanCard = { ...createPlan(sport, '新增方案'), error: '' }
    setCards((prev) => ({ ...prev, [sport]: [...prev[sport], card] }))
    setStatusText('已新增方案「新增方案」')
  }

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const startLongPress = (id: string) => {
    clearLongPressTimer()
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressFiredAt.current = Date.now()
      setRenameId(id)
      try {
        Taro.vibrateShort?.({ type: 'light' })?.catch?.(() => undefined)
      } catch {
        // 部分平台不支持震动反馈，忽略
      }
    }, 500)
  }

  const confirmRename = (name: string) => {
    if (renameId && name) {
      updateCard(sport, renameId, { name })
    }
    setRenameId('')
  }

  /** 长按触发后 touchend 之后可能补发 click，这里吞掉它避免误开抽屉 */
  const swallowGhostClick = () => Date.now() - longPressFiredAt.current < 400

  const openPoster = (card: PlanCard) => {
    if (!card.legs.length) {
      Taro.showToast({ title: '请先为方案选择比赛', icon: 'none' })
      return
    }
    setPosterPlanId(card.id)
  }

  /** 顶部只有一个入口：综合大数据矩阵页 */
  const openMatrix = () => {
    void Taro.navigateTo({ url: '/pages/matrix/index' })
  }

  const goPresetDetail = (id: string) => {
    void Taro.navigateTo({ url: `/pages/plan-detail/index?preset=${id}` })
  }

  useShareAppMessage(() => {
    const card = currentCards[0]
    if (!card) {
      return { title: '竞彩推荐方案', path: '/pages/recommend/index' }
    }
    const summary = card.summary ?? summarizePlan(card.legs)
    return {
      title: `${card.name}｜投注金额 ${formatAmount(summary.amount)}，最高可中 ${formatAmount(summary.maxBonus)}`,
      path: '/pages/recommend/index',
    }
  })

  const handleUpload = async (card: PlanCard) => {
    if (recognizingId) {
      Taro.showToast({ title: '正在识别中，请稍候', icon: 'none' })
      return
    }
    if (!supported) {
      setErrorText('当前环境不支持本地识别，请使用微信小程序打开')
      return
    }

    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
      })
      const path = result.tempFilePaths?.[0]
      if (!path) {
        return
      }

      setErrorText('')
      setRecognizingId(card.id)
      setStatusText('正在识别推荐单…')

      const ocr = await recognizeImage(path, {
        onProgress: (progress) => {
          if (progress.stage === 'downloading') {
            setStatusText(`正在下载识别模型 ${progress.percent ?? 0}%（仅首次）…`)
          } else if (progress.stage === 'recognizing') {
            setStatusText(`正在识别文字 ${progress.current}/${progress.total}…`)
          }
        },
      })

      const key = card.sport
      const schedule =
        states[key].status === 'ready' ? states[key].schedule : (await load(key)) ?? states[key].schedule

      const now = new Date()
      const parsed = parseRecommendationText(ocr.text, key, now)
      const matched = matchRecognizedPicks(parsed, key, schedule.matches, now)

      updateCard(key, card.id, {
        imagePath: path,
        recognizedText: ocr.text,
        legs: matched.legs,
        summary: matched.legs.length ? summarizePlan(matched.legs) : undefined,
        note: matched.note,
        error: '',
        history: pushHistory(card, matched.legs),
        results: undefined,
      })

      if (matched.legs.length) {
        setStatusText(`识别完成，已匹配 ${matched.legs.length} 场比赛`)
      } else {
        setStatusText('识别完成，但未匹配到赛程，请手动选择方案')
        Taro.showToast({ title: '未匹配到赛程，请手动选择', icon: 'none' })
      }
    } catch (error) {
      const message = getErrorMessage(error)
      if (message.includes('cancel')) {
        return
      }
      updateCard(card.sport, card.id, { error: message })
      setErrorText(message)
      setStatusText('识别失败，可重新上传')
    } finally {
      setRecognizingId('')
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const allSelected = currentCards.length > 0 && selectedIds.length === currentCards.length

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : currentCards.map((card) => card.id))
  }

  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelectedIds([])
  }

  const enterDeleteMode = () => {
    setDeleteMode(true)
    setSelectedIds([])
  }

  const handleDeleteSelected = () => {
    if (!selectedIds.length) {
      return
    }
    const count = selectedIds.length
    setCards((prev) => ({
      ...prev,
      [sport]: prev[sport].filter((card) => !selectedIds.includes(card.id)),
    }))
    setSelectedIds([])
    setDeleteMode(false)
    setStatusText(`已删除 ${count} 个方案`)
  }

  const panelCard = currentCards.find((card) => card.id === panel.targetId)
  const posterCard = currentCards.find((card) => card.id === posterPlanId)
  const renameCard = currentCards.find((card) => card.id === renameId)

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  /**
   * 卡片外观与内容统一由 PlanCardView 渲染（与分享海报共用同一组件），
   * 这里只保留交互外壳：长按改名、点击去选比赛、删除勾选与操作行。
   */
  const renderCard = (card: PlanCard) => {
    const busy = recognizingId === card.id
    const selected = selectedIds.includes(card.id)
    const expanded = expandedIds.includes(card.id)

    return (
      <View
        key={card.id}
        onTouchStart={() => startLongPress(card.id)}
        onTouchMove={clearLongPressTimer}
        onTouchEnd={clearLongPressTimer}
        onTouchCancel={clearLongPressTimer}
        onClick={() => {
          if (deleteMode || swallowGhostClick()) {
            return
          }
          openPicker(card.id)
        }}
      >
        <PlanCardView
          className={deleteMode && selected ? styles.cardSelected : undefined}
          name={card.name}
          legs={card.legs}
          summary={card.summary}
          expanded={expanded}
          error={card.error}
          onToggleExpand={() => toggleExpanded(card.id)}
          headExtra={
            deleteMode ? (
              <View
                className={classnames(styles.checkbox, selected && styles.checkboxChecked)}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleSelected(card.id)
                }}
              >
                <Text className={styles.checkboxMark}>{selected ? '✓' : ''}</Text>
              </View>
            ) : undefined
          }
        >
          {!deleteMode && (
            <View
              className={styles.cardActions}
              onTouchStart={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                className={classnames(styles.actionBtn, busy && styles.btnDisabled)}
                disabled={busy}
                onClick={() => handleUpload(card)}
              >
                <Text className={classnames(styles.actionBtnText, styles.actionTextPrimary)}>
                  {busy ? '识别中' : '上传图片'}
                </Text>
              </Button>
              <Button className={classnames(styles.actionBtn, styles.actionBtnDivider)} onClick={() => openPoster(card)}>
                <Text className={classnames(styles.actionBtnText, styles.actionTextShare)}>分享方案</Text>
              </Button>
            </View>
          )}
        </PlanCardView>
      </View>
    )
  }

  return (
    <View className={styles.page}>
      {/* 顶部只有「综合大数据」一个入口 */}
      <View className={styles.heroRow}>
        <View className={styles.hero} onClick={openMatrix}>
          <View className={styles.heroMain}>
            <Text className={styles.heroTitle}>综合大数据</Text>
            <Text className={styles.heroHint}>今日矩阵 · 预设方案从这里算</Text>
          </View>
          <Text className={styles.heroArrow}>›</Text>
        </View>
      </View>

      {!supported && (
        <View className={styles.notice}>
          <Text className={styles.noticeText}>
            当前环境不支持本地识别，请使用微信小程序（基础库 2.30.0 及以上）打开。
          </Text>
        </View>
      )}

      {deleteMode && (
        <View className={styles.deleteTip}>
          <Text className={styles.deleteTipText}>勾选要删除的方案</Text>
          <Text className={styles.deleteTipAction} onClick={toggleSelectAll}>
            {allSelected ? '取消全选' : '全选'}
          </Text>
        </View>
      )}

      {/* 中部：手动方案卡片 */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>手动方案</Text>
        <Text className={styles.sectionCount}>{currentCards.length} 个系列</Text>
        <View className={styles.sectionTools}>
          <View className={styles.sportDd}>
            <View className={styles.ddTrigger} onClick={() => setSportOpen((prev) => !prev)}>
              <Text className={styles.ddValue}>{sportLabel(sport)}</Text>
              <Text className={classnames(styles.ddArrow, sportOpen && styles.ddArrowOpen)}>▾</Text>
            </View>
            {sportOpen ? (
              <>
                <View className={styles.ddMask} onClick={() => setSportOpen(false)} />
                <View className={styles.ddMenu}>
                  {SPORTS.map((option) => (
                    <View
                      key={option.key}
                      className={classnames(
                        styles.ddItem,
                        option.key === sport && styles.ddItemActive
                      )}
                      onClick={() => handleSportChange(option.key)}
                    >
                      <Text className={styles.ddItemText}>{option.label}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>
          <Text
            className={styles.secAction}
            onClick={() => void Taro.navigateTo({ url: '/pages/plan-record/index' })}
          >
            记录
          </Text>
        </View>
      </View>

      <View className={styles.manualBar}>
        <Text
          className={classnames(
            styles.scheduleText,
            current.status === 'error' && styles.scheduleError
          )}
        >
          {current.status === 'loading' && '赛程加载中…'}
          {current.status === 'ready' &&
            `${current.schedule.matches.length} 场赛程${
              current.schedule.updateTime ? ` · ${current.schedule.updateTime}` : ''
            }`}
          {current.status === 'error' && (current.error || '赛程加载失败')}
        </Text>
        {current.status === 'error' && (
          <Text className={styles.scheduleRetry} onClick={() => void load(sport)}>
            重试
          </Text>
        )}
        <Text className={styles.captionHint}>长按卡片可改名</Text>
      </View>

      {deleteMode && (
        <View className={styles.warn}>
          <Text className={styles.warnIcon}>⚠</Text>
          <Text className={styles.warnText}>
            删除后该方案的全部每日记录、理论奖金与 A/B 海报数据一并删除，无法恢复。
          </Text>
        </View>
      )}

      <View className={styles.cardList}>
        {currentCards.length === 0 ? (
          <View className={styles.emptyCard} onClick={openCreate}>
            <Text className={styles.emptyIcon}>＋</Text>
            <Text className={styles.emptyTitle}>还没有推荐单</Text>
            <Text className={styles.emptyHint}>点击下方「新增方案」添加</Text>
          </View>
        ) : (
          currentCards.map(renderCard)
        )}
      </View>

      {/* 下方：预设方案卡片分组 */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>预设方案</Text>
        <Text className={styles.sectionHint}>按矩阵自动算出</Text>
      </View>

      {deleteMode ? (
        <View className={styles.presetLocked}>
          <Text className={styles.presetLockedHint}>删除模式只作用于手动方案，预设方案不参与删除</Text>
          {displayRows.map((row) => (
            <View className={styles.presetLockedRow} key={row.def.id}>
              <Text className={styles.presetLockedName}>{row.def.name}</Text>
              <Text className={styles.presetLockedMeta}>
                {row.preset ? `${row.preset.passLabel} · ${row.preset.multiple} 倍` : '待算'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        displayRows.map((row) => (
          <View
            key={row.def.id}
            className={styles.presetCard}
            onClick={() => (row.preset ? goPresetDetail(row.def.id) : undefined)}
          >
            <View className={styles.presetTop}>
              <Text className={styles.presetName}>{row.def.name}</Text>
              <Text className={classnames(styles.presetPass, !row.preset && styles.presetPassMute)}>
                {row.preset ? row.preset.passLabel : '待算'}
              </Text>
            </View>
            {row.preset ? (
              <>
                <Text className={styles.presetLegs}>{presetLegText(row.preset.legs)}</Text>
                <View className={styles.presetBottom}>
                  <Text className={styles.presetMeta}>
                    {`${row.preset.multiple} 倍 · 投入 ¥${formatAmount(row.preset.summary.amount)}`}
                  </Text>
                  <Text className={styles.presetBonus}>
                    {`理论 ${presetBonusText(row.preset.summary)}`}
                  </Text>
                </View>
              </>
            ) : (
              <Text className={styles.presetEmpty}>
                {matrixMissing ? '综合大数据里还没选场次' : '场次不足，今天不生成该预设'}
              </Text>
            )}
          </View>
        ))
      )}

      {(statusText || errorText) && (
        <View className={styles.statusWrap}>
          {statusText ? <Text className={styles.statusText}>{statusText}</Text> : null}
          {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}
        </View>
      )}

      <View className={styles.bottomBar}>
        {deleteMode ? (
          <>
            <View
              className={classnames(styles.bottomBtn, styles.bottomBtnGhost)}
              onClick={exitDeleteMode}
            >
              <Text className={styles.bottomBtnText}>取消</Text>
            </View>
            <View
              className={classnames(
                styles.bottomBtn,
                styles.bottomBtnDanger,
                !selectedIds.length && styles.btnDisabled
              )}
              onClick={handleDeleteSelected}
            >
              <Text className={styles.bottomBtnText}>
                {`删除 ${selectedIds.length} 个方案`}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View
              className={classnames(styles.bottomBtn, styles.bottomBtnPrimary)}
              onClick={handleAddPlan}
            >
              <Text className={styles.bottomBtnText}>新增方案</Text>
            </View>
            <View
              className={classnames(
                styles.bottomBtn,
                styles.bottomBtnGhost,
                !currentCards.length && styles.btnDisabled
              )}
              onClick={currentCards.length ? enterDeleteMode : undefined}
            >
              <Text className={styles.bottomBtnText}>删除方案</Text>
            </View>
          </>
        )}
      </View>

      <TabBar active='material' />

      <RenameDialog
        visible={Boolean(renameId)}
        name={renameCard?.name ?? ''}
        onCancel={() => setRenameId('')}
        onConfirm={confirmRename}
      />

      <PlanCalculator
        visible={panel.open}
        variant="sheet"
        title={panel.mode === 'create' ? '新增方案' : '选择方案'}
        sport={sport}
        schedule={current.schedule}
        status={current.status}
        error={current.error}
        initialLegs={panel.mode === 'pick' ? panelCard?.legs ?? [] : []}
        confirmText="保存"
        onRetry={() => void load(sport)}
        onCancel={closePanel}
        onConfirm={handlePanelConfirm}
      />

      <SharePoster
        visible={Boolean(posterPlanId)}
        plan={posterCard ? toSharePlan(posterCard) : null}
        onClose={() => setPosterPlanId('')}
      />
    </View>
  )
}