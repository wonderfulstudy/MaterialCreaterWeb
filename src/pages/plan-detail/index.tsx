import { useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import PlanCardView from '@/components/PlanCardView'
import SharePoster from '@/components/SharePoster'
import { formatAmount, formatDateLabel, sportLabel } from '@/components/PlanCalculator'
import { findDay, primaryPlanId } from '@/services/plan-store'
import { findPreset } from '@/services/preset-store'
import { PRESET_DEFS } from '@/pages/recommend/preset-plan'
import { toSharePlan, type RecommendPlan } from '@/pages/recommend/plan'
import styles from './index.module.scss'

/** 今天 2026-11-24 */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 记录日期：缺省今天，非法参数回落今天 */
function resolveDate(raw?: string): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey()
}

/** 路由 planId → 缺省回落 primaryPlanId()（v1 单方案语义）；store 为空时 null，页面按空态渲染 */
function resolvePlanId(raw?: string): string | null {
  const fromRoute = raw && raw.trim() ? raw.trim() : null
  return fromRoute ?? primaryPlanId()
}

/** 方案详情：来源可以是某方案某天的记录，也可以是预设方案（?preset=max|min） */
export default function PlanDetailPage() {
  const router = useRouter()
  const planId = useMemo(() => resolvePlanId(router.params?.planId), [router.params?.planId])
  const presetId = router.params?.preset
  const presetMode = presetId === 'max' || presetId === 'min'
  const date = useMemo(() => resolveDate(router.params?.date), [router.params?.date])
  const [day, setDay] = useState(() => (planId ? findDay(date, planId) : null))
  const [preset, setPreset] = useState(() => (presetMode ? findPreset(presetId) : null))
  const [posterVisible, setPosterVisible] = useState(false)

  useDidShow(() => {
    if (presetMode) {
      setPreset(findPreset(presetId))
      return
    }
    setDay(planId ? findDay(date, planId) : null)
  })

  const hasPlan = Boolean(day && day.legs.length)
  const presetName = preset?.name ?? PRESET_DEFS.find((item) => item.id === presetId)?.name ?? '预设方案'

  const sharePlan = useMemo(() => {
    if (presetMode) {
      if (!preset || !preset.legs.length) {
        return null
      }
      const plan: RecommendPlan = {
        id: `preset-${preset.id}`,
        sport: preset.sport,
        name: preset.name,
        imagePath: '',
        recognizedText: '',
        note: '',
        legs: preset.legs,
        summary: preset.summary,
      }
      return toSharePlan(plan)
    }
    if (!day || !day.legs.length) {
      return null
    }
    const plan: RecommendPlan = {
      id: `record-${day.date}`,
      sport: day.sport,
      name: `${day.date} 记录`,
      imagePath: '',
      recognizedText: '',
      note: '',
      legs: day.legs,
      summary: day.summary,
    }
    // 海报按方案取历史行 / 战绩，记录页与海报必须同一个作用域
    return { ...toSharePlan(plan), planId: planId ?? undefined }
  }, [presetMode, preset, day, planId])

  /** 预设方案没有当日记录可改，唯一的可改项是预设设置 */
  const goPresetSettings = () => {
    if (!presetMode) {
      return
    }
    void Taro.navigateTo({ url: `/pages/plan-preset/index?id=${presetId}` })
  }

  const goModify = () => {
    if (presetMode) {
      goPresetSettings()
      return
    }
    const scope = planId ? `&planId=${planId}` : ''
    void Taro.navigateTo({ url: `/pages/selector/index?date=${date}${scope}` })
  }

  const openPoster = () => {
    if (sharePlan) {
      setPosterVisible(true)
    }
  }

  return (
    <View className={styles.page}>
      <View className={styles.head}>
        <Text className={styles.headDate}>
          {presetMode ? presetName : formatDateLabel(date)}
        </Text>
        {presetMode ? (
          <Text className={styles.headSport}>预设方案</Text>
        ) : day ? (
          <Text className={styles.headSport}>{sportLabel(day.sport)}</Text>
        ) : null}
        {!presetMode && day?.rest ? <Text className={styles.headRest}>已休息</Text> : null}
        {presetMode ? (
          <Text className={styles.navAct} onClick={goPresetSettings}>
            预设方案设置
          </Text>
        ) : null}
      </View>

      {presetMode ? (
        <Text className={styles.restNote}>
          预设方案 · 每天按矩阵自动重算
          {preset
            ? ` · ${preset.passLabel} · ${preset.multiple} 倍 · 投入 ¥${formatAmount(preset.summary.amount)}`
            : ''}
        </Text>
      ) : day?.rest ? (
        <Text className={styles.restNote}>{day.note || '休息（未填理由）'}</Text>
      ) : null}

      {presetMode ? (
        preset && preset.legs.length ? (
          <PlanCardView
            name={preset.name}
            legs={preset.legs}
            summary={preset.summary}
            expanded
          />
        ) : (
          <View className={styles.empty}>
            <Text className={styles.emptyTitle}>该预设今天还没生成</Text>
            <Text className={styles.emptyHint}>场次不足或赛程未加载，回方案页看一下</Text>
          </View>
        )
      ) : hasPlan && day ? (
        <PlanCardView
          name={`${day.date} 记录`}
          legs={day.legs}
          summary={day.summary}
          expanded
        />
      ) : (
        <View className={styles.empty}>
          <Text className={styles.emptyTitle}>该日还没有记录</Text>
          <Text className={styles.emptyHint}>点 [修改记录] 去选场次</Text>
        </View>
      )}

      <View className={styles.dock}>
        <View className={styles.dockGhost} onClick={goModify}>
          <Text className={styles.dockGhostText}>修改记录</Text>
        </View>
        <View
          className={classnames(styles.dockPrimary, !sharePlan && styles.dockPrimaryOff)}
          onClick={openPoster}
        >
          <Text className={styles.dockPrimaryText}>分享海报</Text>
        </View>
      </View>

      <SharePoster
        visible={posterVisible}
        plan={sharePlan}
        planId={planId ?? undefined}
        onClose={() => setPosterVisible(false)}
      />
    </View>
  )
}
