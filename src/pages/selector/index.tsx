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
import { findDay, saveDay } from '@/services/plan-store'
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

/** 选择器页：整页铺开计算器，选完把结果写进 mc.plans.v1 的当日记录 */
export default function SelectorPage() {
  const router = useRouter()
  const date = useMemo(() => resolveDate(router.params?.date), [router.params?.date])
  const record = useMemo(() => findDay(date), [date])

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
    saveDay(toStoredDay(plan, date, [passIdOf(passSizes)], summary.multiple))
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
