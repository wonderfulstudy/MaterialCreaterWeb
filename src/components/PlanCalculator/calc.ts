import { UNIT_PRICE, type MatchSelectionStat, type PlanLeg, type SelectionSummary } from './model'

type RawValue = string | number | null | undefined

export function parseOdds(value: RawValue): number {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(num) && num > 0 ? num : 0
}

/** 赔率展示：统一保留两位小数 */
export function formatOdds(value: RawValue): string {
  const odds = typeof value === 'number' ? value : parseOdds(value)
  return Number.isFinite(odds) && odds > 0 ? odds.toFixed(2) : '--'
}

/** 让球 / 让分盘口展示：-1 → -1，1 → +1 */
export function formatGoalLine(goalLine: string): string {
  const num = Number.parseFloat(goalLine)
  if (!Number.isFinite(num) || num === 0) {
    return ''
  }
  return num > 0 ? `+${num}` : String(num)
}

/** 金额展示：保留两位小数并去掉多余的 0 */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  return String(Number(value.toFixed(2)))
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-11-10 → 11-10 周二 */
export function formatDateLabel(date: string): string {
  const parts = date.split('-').map(Number)
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) {
    return date
  }

  const [year, month, day] = parts
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 周${WEEKDAYS[parsed.getDay()]}`
}

/** 组合数 C(n, k) */
export function combination(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0
  }
  let result = 1
  for (let i = 0; i < k; i += 1) {
    result = (result * (n - i)) / (i + 1)
  }
  return Math.round(result)
}

// 初等对称多项式 e_size(values)：∏(1 + values[i] * x) 中 x^size 的系数。
// 用于注数（values = 每场选项数）与理论奖金（values = 每场最高/最低赔率）
function elementarySymmetric(values: number[], size: number): number {
  const dp = new Array<number>(size + 1).fill(0)
  dp[0] = 1
  for (const value of values) {
    for (let k = Math.min(size, values.length); k >= 1; k -= 1) {
      dp[k] += dp[k - 1] * value
    }
  }
  return dp[size]
}

/** 汇总已选场次 + 过关方式 + 倍数 -> 注数与金额 */
export function summarizeMatchStats(
  stats: MatchSelectionStat[],
  passSizes: number[],
  multiple: number,
): SelectionSummary {
  const valid = stats.filter((stat) => stat.optionCount > 0 && stat.maxOdds > 0)
  const matchCount = valid.length
  const optionCount = valid.reduce((sum, stat) => sum + stat.optionCount, 0)
  const counts = valid.map((stat) => stat.optionCount)
  const maxOddsList = valid.map((stat) => stat.maxOdds)
  const minOddsList = valid.map((stat) => stat.minOdds)

  let parlayCount = 0
  let betCount = 0
  let maxSum = 0
  let minSum = 0

  for (const size of new Set(passSizes)) {
    if (size < 1 || size > matchCount) {
      continue
    }
    parlayCount += combination(matchCount, size)
    // 注数：每场选项中各取一个的所有 size 场组合
    betCount += elementarySymmetric(counts, size)
    // 理论最高/最低奖金：每场命中所选最高/最低赔率时，所有中奖注的赔率积之和
    maxSum += elementarySymmetric(maxOddsList, size)
    minSum += elementarySymmetric(minOddsList, size)
  }

  return {
    matchCount,
    optionCount,
    parlayCount,
    betCount,
    multiple,
    amount: betCount * UNIT_PRICE * multiple,
    maxBonus: maxSum * UNIT_PRICE * multiple,
    minBonus: minSum * UNIT_PRICE * multiple,
  }
}

/** 已选方案 -> 每场比赛的选项统计（同一场比赛可命中多个选项） */
export function selectionStats(legs: PlanLeg[]): MatchSelectionStat[] {
  const oddsByMatch = new Map<number, number[]>()
  legs.forEach((leg) => {
    const list = oddsByMatch.get(leg.matchId)
    if (list) {
      list.push(leg.odds)
    } else {
      oddsByMatch.set(leg.matchId, [leg.odds])
    }
  })

  return Array.from(oddsByMatch.values()).map((oddsList) => ({
    optionCount: oddsList.length,
    maxOdds: Math.max(...oddsList),
    minOdds: Math.min(...oddsList),
  }))
}

/** 已选方案 + 过关方式 + 倍数 -> 注数与金额 */
export function summarizeLegs(legs: PlanLeg[], passSizes: number[], multiple = 1): SelectionSummary {
  return summarizeMatchStats(selectionStats(legs), passSizes, multiple)
}

/** 理论赔率 = 各场赔率相乘（单关即该场赔率） */
export function planOdds(legs: PlanLeg[]): number | null {
  if (!legs.length) {
    return null
  }
  const product = legs.reduce((total, leg) => total * leg.odds, 1)
  return Math.round(product * 100) / 100
}
