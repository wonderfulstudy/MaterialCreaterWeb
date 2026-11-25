import { useMemo, useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import PlanCalculator, {
  MULTI_PASS_OPTIONS,
  formatDateLabel,
  passSizesOf,
  useSportSchedule,
  type PlanLeg,
  type SelectionSummary,
  type SportKey,
} from '@/components/PlanCalculator'
import { findDay, findPlan, primaryPlanId, saveDay, savePlan } from '@/services/plan-store'
import { toStoredDay, type RecommendPlan } from '@/pages/recommend/plan'

const MULTI_PASS_IDS = MULTI_PASS_OPTIONS.map((option) => option.id)

/** 今天 2026-11-24 */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 记录日期：缺省今天，非法参数回落今天 */
function resolveDate(raw?: string): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey()
}

/**
 * 过关档位反查：单档 s{size}，多档按 sizes 精确比对。
 * 反查不到（脏数据）回落 s{sizes.length}，不抛错。
 */
function passIdOf(sizes: number[]): string {
  if (!sizes.length) {
    return 's1'
  }
  if (sizes.length === 1) {
    return `s${sizes[0]}`
  }
  const hit = MULTI_PASS_IDS.find((id) => {
    const candidate = passSizesOf(id)
    return candidate.length === sizes.length && candidate.every((size, index) => size === sizes[index])
  })
  return hit || `s${sizes.length}`
}

/** 路由 planId → 缺省回落 primaryPlanId()（v1 单方案语义）；store 为空时 null，只渲染不落盘 */
function resolvePlanId(raw?: string): string | null {
  const fromRoute = raw && raw.trim() ? raw.trim() : null
  return fromRoute ?? primaryPlanId()
}

/** 选择器页：整页铺开计算器，选完把结果写进 mc.plans.v1 中该方案的那一天 */
export default function SelectorPage() {
  const router = useRouter()
  const planId = useMemo(() => resolvePlanId(router.params?.planId), [router.params?.planId])
  const date = useMemo(() => resolveDate(router.params?.date), [router.params?.date])
  // 回填只认本方案当天的记录（AC-11）
  const record = useMemo(() => (planId ? findDay(date, planId) : null), [date, planId])

  const [sport, setSport] = useState<SportKey>(record?.sport ?? 'football')
  const { states, load } = useSportSchedule(sport)
  const current = states[sport]

  // AC-34 / AC-38：已有记录的当日直接回填腿、过关方式、倍数
  const initialLegs = useMemo(() => record?.legs ?? [], [record])
  const initialPassId = record?.passIds.length ? record.passIds[0] : undefined
  const initialMultiple = record?.multiple

  const handleConfirm = (legs: PlanLeg[], summary: SelectionSummary, passSizes: number[]) => {
    const plan: RecommendPlan = {
      id: `record-${date}`,
      sport,
      name: `${date} 记录`,
      imagePath: '',
      recognizedText: '',
      note: '',
      legs,
      summary,
    }
    const head = planId ? findPlan(planId) : null
    // store 为空（一个方案都没有）时没有归属可写：按空态处理，不造孤儿记录
    if (!planId || !head) {
      Taro.navigateBack()
      return
    }
    const passIds = [passIdOf(passSizes)]
    saveDay({ ...toStoredDay(plan, date, passIds, summary.multiple), planId })
    // 方案头与当日记录同源：方案列表卡上的腿/过关/倍数/投入必须跟着一起改
    savePlan({
      ...head,
      legs,
      passIds,
      multiple: summary.multiple,
      summary,
      updatedAt: Date.now(),
    })
    Taro.navigateBack()
  }

  return (
    <PlanCalculator
      title={`${formatDateLabel(date)} · 场次选择`}
      sport={sport}
      schedule={current.schedule}
      status={current.status}
      error={current.error}
      initialLegs={initialLegs}
      initialPassId={initialPassId}
      initialMultiple={initialMultiple}
      confirmText="保存记录"
      onSportChange={setSport}
      onRetry={() => void load(sport)}
      onCancel={() => Taro.navigateBack()}
      onConfirm={handleConfirm}
    />
  )
}
