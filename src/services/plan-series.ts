import { formatAmount } from '@/components/PlanCalculator/calc'
import type { SelectionSummary } from '@/components/PlanCalculator/model'
import type { PlanSeriesChip, PlanSeriesStatus } from '@/components/PlanSeriesCard'
import type { PlanStats, StoredPlan, StoredPlanDay } from './plan-store'

/** 方案系列卡要展示的内容：卡面文案全部在这里算好，组件只管排版（D60） */
export interface PlanSeriesView {
  name: string
  status: PlanSeriesStatus
  meta: string
  chips: PlanSeriesChip[]
}

/** 2026-11-22 → 11-22 */
export function seriesDate(date: string): string {
  return date.length >= 10 ? date.slice(5, 10) : date
}

/** 金额统一 ¥ + 两位小数（去尾 0），与计算器同一口径 */
function amountText(amount: number): string {
  return `¥${formatAmount(amount)}`
}

/** 「理论 ¥2.4」或「理论 ¥12.21~30.15」；没有汇总时给占位 */
export function seriesBonusText(summary?: SelectionSummary | null): string {
  if (!summary) {
    return '理论 ¥--'
  }
  const min = formatAmount(Math.min(summary.minBonus, summary.maxBonus))
  const max = formatAmount(Math.max(summary.minBonus, summary.maxBonus))
  return min === max ? `理论 ¥${max}` : `理论 ¥${min}~${max}`
}

/** 当日记录 → 状态徽标；没记录和休息日都算待开奖 */
export function seriesStatus(day: StoredPlanDay | null): PlanSeriesStatus {
  if (!day) {
    return { text: '待开奖', tone: 'pend' }
  }
  if (day.rest) {
    return { text: '今日休息', tone: 'pend' }
  }
  if (day.judged === 'hit') {
    return { text: '中 ✓', tone: 'win' }
  }
  if (day.judged === 'miss') {
    return { text: '未 ✗', tone: 'lose' }
  }
  return { text: '待开奖', tone: 'pend' }
}

/** 第二行元信息：日期 · 注数 · 倍数 · 投入；休息日走备注，无记录给空态提示 */
export function seriesMeta(day: StoredPlanDay | null): string {
  if (!day) {
    return '还没有记录'
  }
  const date = seriesDate(day.date)
  if (day.rest) {
    const note = (day.note ?? '').trim()
    return `${date} · ${note ? `${note}（不参与连中）` : '休息（不参与连中）'}`
  }
  const betCount = day.summary?.betCount ?? 0
  const multiple = day.summary?.multiple || day.multiple || 1
  const amount = day.summary?.amount ?? 0
  return `${date} · ${betCount} 注 · ${multiple} 倍 · 投入 ${amountText(amount)}`
}

/** 第三行 chips：正常给理论奖金区间 + 连中，休息日给投入 ¥0 + 连中 */
export function seriesChips(day: StoredPlanDay | null, stats: PlanStats): PlanSeriesChip[] {
  if (!day) {
    return [{ text: '去录入' }]
  }
  const streak: PlanSeriesChip = { text: `连中 ${stats.streak}`, on: stats.streak > 0 }
  if (day.rest) {
    return [{ text: '投入 ¥0' }, streak]
  }
  return [{ text: seriesBonusText(day.summary) }, streak]
}

/** 手动方案：方案本身 + 连中统计 + 最近一条每日记录 → 卡面数据 */
export function buildManualSeries(plan: StoredPlan, stats: PlanStats, day: StoredPlanDay | null): PlanSeriesView {
  return {
    name: plan.name,
    status: seriesStatus(day),
    meta: seriesMeta(day),
    chips: seriesChips(day, stats),
  }
}

export interface PresetSeriesInput {
  name: string
  /** 预设计算日期 YYYY-MM-DD */
  date: string
  /** 过关方式，如「3串1」 */
  passLabel: string
  multiple: number
  summary?: SelectionSummary | null
  /** 腿摘要，如「003负 004负 002平」 */
  legsText: string
}

/** 预设方案：卡面结构与手动卡完全一致（D60），内容取今天矩阵算出的预设 */
export function buildPresetSeries(input: PresetSeriesInput): PlanSeriesView {
  const multiple = input.multiple > 0 ? input.multiple : 1
  const chips: PlanSeriesChip[] = []
  if (input.legsText) {
    chips.push({ text: input.legsText })
  }
  chips.push({ text: seriesBonusText(input.summary) })
  const amount = input.summary?.amount ?? 0
  return {
    name: input.name,
    status: { text: '待开奖', tone: 'pend' },
    meta: `${seriesDate(input.date)} · ${input.passLabel} · ${multiple} 倍 · 投入 ${amountText(amount)}`,
    chips,
  }
}
