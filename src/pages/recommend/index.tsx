import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useShareAppMessage } from '@tarojs/taro'
import classnames from 'classnames'
import { isOcrSupported, recognizeImage } from '@/services/ocr'
import PlanCalculator, {
  MULTI_PASS_OPTIONS,
  SPORTS,
  formatAmount,
  sportLabel,
  useSportSchedule,
  type PlanLeg,
  type SelectionSummary,
  type SportKey,
} from '@/components/PlanCalculator'
import PlanSeriesCard from '@/components/PlanSeriesCard'
import RenameDialog from '@/components/RenameDialog'
import SharePoster from '@/components/SharePoster'
import TabBar from '@/components/TabBar'
import { findMatrix } from '@/services/matrix-store'
import {
  listDays,
  listPlans,
  planStats,
  removePlans,
  saveDay,
  savePlan,
  type StoredPlan,
} from '@/services/plan-store'
import { findPreset, listPresets, savePreset, type StoredPreset } from '@/services/preset-store'
import { buildManualSeries, buildPresetSeries } from '@/services/plan-series'
import { matchRecognizedPicks, parseRecommendationText } from './plan-ocr'
import {
  createPlanId,
  storedPlanToRecommend,
  storedPlanToSharePlan,
  summarizePlan,
  toStoredDay,
} from './plan'
import {
  PRESET_DEFS,
  buildPresetCandidates,
  buildStoredPreset,
  findPresetPassByLabel,
  presetLegText,
  samePreset,
  todayKey,
  type PresetMatrixRow,
} from './preset-plan'
import styles from './index.module.scss'

interface ManualRow {
  plan: StoredPlan
  stats: ReturnType<typeof planStats>
  day: ReturnType<typeof listDays>[number] | null
}

interface PresetRow {
  def: (typeof PRESET_DEFS)[number]
  preset: StoredPreset | null
}

/** 识别 / 拍照失败的错误文案 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: string }).errMsg || '')
  }
  return '识别失败'
}

/** 过关档位反查：单档 s{size}，多档按 sizes 精确比对（与 selector 同口径） */
function passIdOf(sizes: number[]): string {
  if (!sizes.length) {
    return 's1'
  }
  if (sizes.length === 1) {
    return `s${sizes[0]}`
  }
  const hit = MULTI_PASS_OPTIONS.find(
    (option) => option.sizes.length === sizes.length && option.sizes.every((size, index) => size === sizes[index])
  )
  return hit ? hit.id : `s${sizes.length}`
}

/** 新方案名：按当前项目的方案数递增，撞名就继续往后找 */
function nextPlanName(existing: StoredPlan[]): string {
  const used = new Set(existing.map((plan) => plan.name))
  let index = existing.length + 1
  while (used.has(`方案 ${index}`)) {
    index += 1
  }
  return `方案 ${index}`
}

export default function RecommendPage() {
  const router = useRouter()
  const [sport, setSport] = useState<SportKey>(router.params?.sport === 'basketball' ? 'basketball' : 'football')
  const [sportOpen, setSportOpen] = useState(false)
  const { states, load } = useSportSchedule(sport)
  const [plans, setPlans] = useState<StoredPlan[]>([])
  const [matrixRows, setMatrixRows] = useState<PresetMatrixRow[]>([])
  const [presets, setPresets] = useState<StoredPreset[]>([])
  const [panelPlanId, setPanelPlanId] = useState('')
  const [recognizingId, setRecognizingId] = useState('')
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState('')
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [renamePlanId, setRenamePlanId] = useState('')
  const [posterPlanId, setPosterPlanId] = useState('')
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredAt = useRef(0)

  const supported = useMemo(() => isOcrSupported(), [])
  const current = states[sport]

  const reloadPlans = useCallback(() => {
    setPlans(listPlans())
  }, [])

  const reloadPresets = useCallback(() => {
    setPresets(listPresets())
  }, [])

  const reloadMatrix = useCallback(() => {
    const snapshot = findMatrix(sport, todayKey())
    setMatrixRows((snapshot?.rows as unknown as PresetMatrixRow[]) ?? [])
  }, [sport])

  useDidShow(() => {
    reloadPlans()
    reloadPresets()
    reloadMatrix()
  })

  useEffect(() => {
    reloadPlans()
    reloadPresets()
  }, [reloadPlans, reloadPresets])

  useEffect(() => {
    reloadMatrix()
  }, [reloadMatrix])

  const manualPlans = useMemo(() => plans.filter((plan) => plan.sport === sport), [plans, sport])

  /** 手动方案 → 卡面数据：方案本身 + 连中统计 + 最近一条每日记录 */
  const manualRows = useMemo<ManualRow[]>(
    () =>
      manualPlans.map((plan) => {
        const stats = planStats(plan.id)
        const day = listDays(plan.id)[0] ?? null
        return { plan, stats, day }
      }),
    [manualPlans]
  )

  const presetRows = useMemo<PresetRow[]>(
    () =>
      PRESET_DEFS.map((def) => {
        const stored = presets.find((item) => item.id === def.id) ?? null
        const pass = findPresetPassByLabel(stored?.passLabel)
        const multiple = stored && stored.multiple > 0 ? stored.multiple : 1
        const date = todayKey()
        const candidates = buildPresetCandidates({ rows: matrixRows, date, sport }, pass, multiple, def.pick)
        const preset = buildStoredPreset({
          def,
          sport,
          pass,
          multiple,
          candidates,
          candidateIndex: stored?.candidateIndex ?? 1,
          date,
        })
        return { def, preset }
      }),
    [matrixRows, presets, sport]
  )

  /** 矩阵变化后把预设同步落盘，其它页面读到的就是同一份（D60） */
  useEffect(() => {
    let changed = false
    presetRows.forEach((row) => {
      if (row.preset && !samePreset(row.preset, findPreset(row.def.id))) {
        savePreset(row.preset)
        changed = true
      }
    })
    if (changed) {
      reloadPresets()
    }
  }, [presetRows, reloadPresets])

  const matrixMissing = matrixRows.length === 0
  const panelPlan = useMemo(() => plans.find((plan) => plan.id === panelPlanId) ?? null, [panelPlanId, plans])
  const panelSport = panelPlan?.sport ?? sport
  const renamePlan = useMemo(() => plans.find((plan) => plan.id === renamePlanId) ?? null, [plans, renamePlanId])
  const posterPlan = useMemo(() => plans.find((plan) => plan.id === posterPlanId) ?? null, [plans, posterPlanId])
  const allSelected = manualPlans.length > 0 && manualPlans.every((plan) => selectedIds.includes(plan.id))

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  /** 长按触发后 touchend 之后可能补发 click，这里吞掉它避免误开抽屉 */
  const swallowGhostClick = () => Date.now() - longPressFiredAt.current < 400

  const startLongPress = (id: string) => {
    if (deleteMode) {
      return
    }
    clearLongPressTimer()
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressFiredAt.current = Date.now()
      setRenamePlanId(id)
      try {
        Taro.vibrateShort?.({ type: 'light' })?.catch?.(() => undefined)
      } catch {
        // 部分平台不支持震动反馈，忽略
      }
    }, 500)
  }

  const confirmRename = (name: string) => {
    const value = name.trim()
    if (renamePlan && value && value !== renamePlan.name) {
      savePlan({ ...renamePlan, name: value, updatedAt: Date.now() })
      reloadPlans()
      setStatusText(`方案已改名为「${value}」`)
    }
    setRenamePlanId('')
  }

  /** 方案内容（计算器 / OCR）落盘：方案头 + 今天的每日记录 */
  const persistPlanContent = useCallback(
    (plan: StoredPlan, legs: PlanLeg[], summary?: SelectionSummary | null, passSizes?: number[]) => {
      const nextSummary = summary ?? (legs.length ? summarizePlan(legs, plan.multiple) : undefined)
      const next: StoredPlan = {
        ...plan,
        legs,
        summary: nextSummary,
        multiple: nextSummary?.multiple && nextSummary.multiple > 0 ? nextSummary.multiple : plan.multiple,
        passIds: passSizes?.length ? [passIdOf(passSizes)] : plan.passIds,
        updatedAt: Date.now(),
      }
      savePlan(next)
      if (legs.length && nextSummary) {
        saveDay(toStoredDay(storedPlanToRecommend(next), todayKey(), next.passIds, next.multiple))
      }
      reloadPlans()
    },
    [reloadPlans]
  )

  const openPicker = (plan: StoredPlan) => {
    setPanelPlanId(plan.id)
    if (states[plan.sport].status !== 'ready') {
      void load(plan.sport)
    }
  }

  const closePanel = () => setPanelPlanId('')

  const handlePanelConfirm = (legs: PlanLeg[], summary: SelectionSummary, passSizes: number[]) => {
    if (panelPlan) {
      persistPlanContent(panelPlan, legs, summary, passSizes)
      setStatusText(legs.length ? '方案已保存' : '方案已清空')
    }
    closePanel()
  }

  /** 底部「新增方案」：建空方案 → 直接进选号页挑比赛 */
  const handleAddPlan = () => {
    const now = Date.now()
    const plan: StoredPlan = {
      id: createPlanId(),
      name: nextPlanName(manualPlans),
      sport,
      legs: [],
      passIds: [],
      multiple: 1,
      createdAt: now,
      updatedAt: now,
    }
    savePlan(plan)
    reloadPlans()
    setStatusText(`已新增方案「${plan.name}」`)
    void Taro.navigateTo({ url: `/pages/selector/index?planId=${plan.id}&date=${todayKey()}` })
  }

  const handleSportChange = (next: SportKey) => {
    setSportOpen(false)
    setSport(next)
    setDeleteMode(false)
    setSelectedIds([])
    setStatusText('')
    setErrorText('')
  }

  const openPoster = (plan: StoredPlan) => {
    if (!plan.legs.length) {
      void Taro.showToast({ title: '请先为方案选择比赛', icon: 'none' })
      return
    }
    setPosterPlanId(plan.id)
  }

  /** 顶部只有一个入口：综合大数据矩阵页 */
  const openMatrix = () => {
    void Taro.navigateTo({ url: '/pages/matrix/index' })
  }

  const goPresetDetail = (id: string) => {
    void Taro.navigateTo({ url: `/pages/plan-detail/index?preset=${id}` })
  }

  const handleCardClick = (plan: StoredPlan) => {
    if (deleteMode) {
      setSelectedIds((prev) =>
        prev.includes(plan.id) ? prev.filter((item) => item !== plan.id) : [...prev, plan.id]
      )
      return
    }
    if (swallowGhostClick()) {
      return
    }
    openPicker(plan)
  }

  useShareAppMessage(() => {
    const plan = manualPlans[0]
    if (!plan) {
      return { title: '竞彩推荐方案', path: '/pages/recommend/index' }
    }
    const shared = storedPlanToSharePlan(plan)
    const summary = shared.summary
    return {
      title: summary
        ? `${plan.name}｜投注金额 ¥${formatAmount(summary.amount)}，最高可中 ¥${formatAmount(summary.maxBonus)}`
        : plan.name,
      path: '/pages/recommend/index',
    }
  })

  const handleUpload = async (plan: StoredPlan) => {
    if (recognizingId) {
      void Taro.showToast({ title: '正在识别中，请稍候', icon: 'none' })
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
      setRecognizingId(plan.id)
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

      const key = plan.sport
      const schedule =
        states[key].status === 'ready' ? states[key].schedule : (await load(key)) ?? states[key].schedule

      const now = new Date()
      const parsed = parseRecommendationText(ocr.text, key, now)
      const matched = matchRecognizedPicks(parsed, key, schedule.matches, now)

      persistPlanContent(plan, matched.legs, matched.legs.length ? summarizePlan(matched.legs, plan.multiple) : null)

      if (matched.legs.length) {
        setStatusText(`识别完成，已匹配 ${matched.legs.length} 场比赛`)
      } else {
        setStatusText(matched.note || '识别完成，但未匹配到赛程，请手动选择方案')
        void Taro.showToast({ title: '未匹配到赛程，请手动选择', icon: 'none' })
      }
    } catch (error) {
      const message = getErrorMessage(error)
      if (message.includes('cancel')) {
        return
      }
      setErrorText(message)
      setStatusText('识别失败，可重新上传')
    } finally {
      setRecognizingId('')
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : manualPlans.map((plan) => plan.id))
  }

  const enterDeleteMode = () => {
    setDeleteMode(true)
    setSelectedIds([])
    setStatusText('')
    setErrorText('')
  }

  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelectedIds([])
  }

  /** 一次删掉勾选的方案，连带它们的每日记录（removePlans） */
  const handleDeleteSelected = () => {
    if (selectedIds.length) {
      removePlans(selectedIds)
      reloadPlans()
      setStatusText(`已删除 ${selectedIds.length} 个方案`)
    }
    setSelectedIds([])
    setDeleteMode(false)
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

      {/* 中部：手动方案系列卡 */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>手动方案</Text>
        <Text className={styles.sectionCount}>{manualPlans.length} 个系列</Text>
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
                      className={classnames(styles.ddItem, option.key === sport && styles.ddItemActive)}
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
        <Text className={classnames(styles.scheduleText, current.status === 'error' && styles.scheduleError)}>
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

      <View className={styles.seriesList}>
        {manualRows.length === 0 ? (
          <View className={styles.seriesEmpty} onClick={handleAddPlan}>
            <Text className={styles.seriesEmptyText}>还没有方案，点右下角新增</Text>
          </View>
        ) : (
          manualRows.map(({ plan, stats, day }) => {
            const view = buildManualSeries(plan, stats, day)
            return (
              <View
                key={plan.id}
                className={styles.seriesItem}
                onTouchStart={() => startLongPress(plan.id)}
                onTouchMove={clearLongPressTimer}
                onTouchEnd={clearLongPressTimer}
                onTouchCancel={clearLongPressTimer}
              >
                <PlanSeriesCard
                  name={view.name}
                  status={view.status}
                  meta={view.meta}
                  chips={view.chips}
                  selected={selectedIds.includes(plan.id)}
                  onSelect={deleteMode ? () => toggleSelected(plan.id) : undefined}
                  onClick={() => handleCardClick(plan)}
                />
                {deleteMode ? null : (
                  <View className={styles.seriesActions}>
                    <Text className={styles.seriesAction} onClick={() => void handleUpload(plan)}>
                      {recognizingId === plan.id ? '识别中…' : '上传图片'}
                    </Text>
                    <Text className={styles.seriesAction} onClick={() => openPoster(plan)}>
                      分享方案
                    </Text>
                  </View>
                )}
              </View>
            )
          })
        )}
      </View>

      {/* 下方：预设方案分组（D60：与手动卡同一个组件、同一套卡面） */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>预设方案</Text>
        <Text className={styles.sectionHint}>按矩阵自动算出</Text>
      </View>

      {deleteMode ? (
        <View className={styles.presetLocked}>
          <Text className={styles.presetLockedHint}>删除模式只作用于手动方案，预设方案不参与删除</Text>
          {presetRows.map((row) => (
            <View className={styles.presetLockedRow} key={row.def.id}>
              <Text className={styles.presetLockedName}>{row.def.name}</Text>
              <Text className={styles.presetLockedMeta}>
                {row.preset ? `${row.preset.passLabel} · ${row.preset.multiple} 倍` : '待算'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View className={styles.seriesList}>
          {presetRows.map(({ def, preset }) => {
            if (!preset) {
              return (
                <Text key={def.id} className={styles.presetEmpty}>
                  {matrixMissing ? '综合大数据里还没选场次' : '场次不足，今天不生成该预设'}
                </Text>
              )
            }
            const view = buildPresetSeries({
              name: def.name,
              date: preset.date,
              passLabel: preset.passLabel,
              multiple: preset.multiple,
              summary: preset.summary,
              legsText: presetLegText(preset.legs),
            })
            return (
              <PlanSeriesCard
                key={def.id}
                name={view.name}
                status={view.status}
                meta={view.meta}
                chips={view.chips}
                onClick={() => goPresetDetail(def.id)}
              />
            )
          })}
        </View>
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
            <View className={classnames(styles.bottomBtn, styles.bottomBtnGhost)} onClick={exitDeleteMode}>
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
              <Text className={styles.bottomBtnText}>{`删除 ${selectedIds.length} 个方案`}</Text>
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
                !manualPlans.length && styles.btnDisabled
              )}
              onClick={manualPlans.length ? enterDeleteMode : undefined}
            >
              <Text className={styles.bottomBtnText}>删除方案</Text>
            </View>
          </>
        )}
      </View>

      <TabBar active='material' />

      <RenameDialog
        visible={Boolean(renamePlanId)}
        name={renamePlan?.name ?? ''}
        onCancel={() => setRenamePlanId('')}
        onConfirm={confirmRename}
      />

      <PlanCalculator
        visible={Boolean(panelPlan)}
        variant='sheet'
        title='选择方案'
        sport={panelSport}
        schedule={states[panelSport].schedule}
        status={states[panelSport].status}
        error={states[panelSport].error}
        initialLegs={panelPlan?.legs ?? []}
        initialPassId={panelPlan?.passIds[0]}
        initialMultiple={panelPlan?.multiple}
        confirmText='保存'
        onRetry={() => void load(panelSport)}
        onCancel={closePanel}
        onConfirm={handlePanelConfirm}
      />

      <SharePoster
        visible={Boolean(posterPlan)}
        plan={posterPlan ? storedPlanToSharePlan(posterPlan) : null}
        planId={posterPlan?.id}
        onClose={() => setPosterPlanId('')}
      />
    </View>
  )
}
