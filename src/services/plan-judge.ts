import {
  loadBasketballResults,
  loadFootballResults,
  loadTraditionalDraws,
  recentDateKeys,
  toDateKey,
  type SportMatchResult,
  type TraditionalDraw,
} from '@/api/lottery/results'
import type { SportKey } from '@/components/PlanCalculator/model'
import { extractMatchResults, judgeLegs, judgePlan, type MatchResults } from './plan-result'
import { findDay, listDays, listPlans, saveDay, type StoredPlanDay } from './plan-store'

/**
 * 赛果回填触发判中（AC-17）：把 plan-result 的纯判定接到真实赛果上，
 * 结果写回 plan-store 的 StoredPlanDay.judged，记录页 / 海报只读消费。
 *
 * 口径：
 * - 'hit' / 'miss' 是终态，已落终态的天不再取数、不再写盘
 * - 'pending' 可以落盘也可以不落：这里选择不写，避免每次进页面都改一次 storage
 * - 取数失败、赛果缺失、盘口不符一律 pending，绝不判成 miss（用户会拿真票对）
 */

/** 判定窗口：近 7 天，与记录页可记录窗口一致 */
export const JUDGE_WINDOW_DAYS = 7

export type JudgeValue = 'hit' | 'miss' | 'pending'

export interface DayJudgement {
  date: string
  judged: JudgeValue
}

/** 取数口子：默认走 results.ts 的缓存取数，测试注入固定 fixture */
export interface JudgeSources {
  football: (date: string) => Promise<readonly SportMatchResult[] | null>
  basketball: (date: string) => Promise<readonly SportMatchResult[] | null>
  /** 传足按期次给，不按天：内部再按开奖日挑当期 */
  traditional: () => Promise<readonly TraditionalDraw[] | null>
}

export const defaultJudgeSources: JudgeSources = {
  football: async (date) => (await loadFootballResults(date))?.data ?? null,
  basketball: async (date) => (await loadBasketballResults(date))?.data ?? null,
  traditional: async () => (await loadTraditionalDraws())?.data ?? null,
}

/**
 * '让球(-1)' / '让分(+4.5)' / '大小分(220.5)' → 括号里的盘口值；没有括号时为空串。
 * results.ts 的 formatLine 会给正数补 '+'，上游本身就带 '+' 时会拼成 '++3.5'，
 * 这里归一成数字字符串，与 plan-result 对腿 goalLine 的归一化保持同一口径。
 */
function lineOfPlay(match: SportMatchResult, labelPrefix: string): string {
  const play = match.plays.find((item) => item.label.startsWith(labelPrefix))
  const matched = play ? play.label.match(/\(([^)]*)\)/) : null
  const raw = matched ? matched[1].trim() : ''
  const parsed = Number.parseFloat(raw.replace(/^\++/, ''))
  return raw && Number.isFinite(parsed) ? String(parsed) : raw
}

/**
 * 适配层：results.ts 只导出映射后的 SportMatchResult（比分 + 展示用 plays），
 * 上游原始 payload 拿不到，所以这里把结构化比分与盘口还原成 plan-result 认的字段形状，
 * 判定语义仍全部由 plan-result 承担。
 * 还原不到的字段（半场比分缺失、盘口文本没带括号等）只会让对应玩法缺盘口 → pending，不会误判 miss。
 */
function toRawRecords(
  list: readonly SportMatchResult[],
  sport: SportKey,
  date: string,
): Record<string, unknown>[] {
  return list.map((match) =>
    sport === 'basketball'
      ? {
          matchId: match.id,
          matchDate: date,
          finalScore: match.score,
          // 篮球展示标签：'让分(+4.5)' / '大小分(220.5)'
          hdc: { poolCode: 'hdc', goalLine: lineOfPlay(match, '让分') },
          hilo: { poolCode: 'hilo', goalLine: lineOfPlay(match, '大小分') },
        }
      : {
          matchId: match.id,
          matchDate: date,
          sectionsNo999: match.score,
          sectionsNo1: match.halfScore,
          // 足球展示标签：'让球(-1)'
          goalLine: lineOfPlay(match, '让球'),
        },
  )
}

/** 映射后的竞彩赛果 → plan-result 的 MatchResults */
export function toMatchResults(
  list: readonly SportMatchResult[],
  sport: SportKey,
  date: string,
): MatchResults {
  return extractMatchResults({ value: { matchResult: toRawRecords(list, sport, date) } }, sport)
}

/** 传足只认开奖日等于当天的期次；没有当期就是空表（→ pending），绝不拿别的期次去判 */
export function traditionalResults(
  draws: readonly TraditionalDraw[],
  date: string,
): MatchResults {
  const draw = draws.find((item) => item.drawDate.slice(0, 10) === date)
  if (!draw) return {}
  return extractMatchResults([{ drawDate: draw.drawDate, results: draw.results }], 'football')
}

/** 传足选项是 3/1/0，竞彩足球是 h/d/a，两种票不会混在同一份方案里 */
const TRADITIONAL_OPTION = /^[310]$/

function isTraditionalDay(day: StoredPlanDay): boolean {
  return day.legs.length > 0 && day.legs.every((leg) => TRADITIONAL_OPTION.test(String(leg.optionKey).trim()))
}

/** 单日判定：任何取数异常都退化成 pending，不向上抛 */
async function judgeDay(day: StoredPlanDay, sources: JudgeSources): Promise<JudgeValue> {
  try {
    const results = isTraditionalDay(day)
      ? traditionalResults((await sources.traditional()) ?? [], day.date)
      : toMatchResults(
          (await (day.sport === 'basketball' ? sources.basketball : sources.football)(day.date)) ?? [],
          day.sport,
          day.date,
        )
    return judgePlan(judgeLegs(day.legs, results))
  } catch {
    return 'pending'
  }
}

function isTerminal(judged?: JudgeValue): boolean {
  return judged === 'hit' || judged === 'miss'
}

/**
 * 判定一批记录并落盘 judged（幂等、可重入）：
 * - 已有 hit / miss 的天直接跳过，不再取数
 * - 只在值与已存值不同时写盘；pending 不写
 * - 写盘前重读一次，避免覆盖判定期间用户改过的 note / rest
 */
export async function judgePlans(
  days: readonly StoredPlanDay[],
  sources: JudgeSources = defaultJudgeSources,
): Promise<DayJudgement[]> {
  const targets = days.filter((day) => Array.isArray(day.legs) && day.legs.length > 0)

  const judged = await Promise.all(
    targets.map(async (day): Promise<DayJudgement> => ({
      date: day.date,
      judged: isTerminal(day.judged) ? (day.judged as JudgeValue) : await judgeDay(day, sources),
    })),
  )

  // 写回按「方案 + 日期」定位：同名日期的另一个方案不在这次范围内（AC-11 / AC-15）
  judged.forEach((item, index) => {
    if (item.judged === 'pending') return
    const planId = targets[index].planId
    const current = findDay(item.date, planId)
    if (!current || current.judged === item.judged) return
    saveDay({ ...current, planId, judged: item.judged, updatedAt: Date.now() })
  })

  return judged
}

/**
 * 记录页入口：近 N 天（含今天）、有 legs 的天，判定后落盘。
 * 全程静默：失败只会得到 pending，不抛错、不阻塞页面。
 */
export async function judgeRecentPlans(
  windowDays: number = JUDGE_WINDOW_DAYS,
  today: string = toDateKey(new Date()),
  sources: JudgeSources = defaultJudgeSources,
  /** 只判这个方案；不传则逐个方案各判各的（同一日期在不同方案下互不影响） */
  planId?: string,
): Promise<DayJudgement[]> {
  const window = new Set(recentDateKeys(windowDays, today))
  const scopes = planId ? [planId] : listPlans().map((plan) => plan.id)
  const days = scopes
    .flatMap((id) => listDays(id))
    .filter((day) => window.has(day.date) && Array.isArray(day.legs) && day.legs.length > 0)
  try {
    return await judgePlans(days, sources)
  } catch {
    return []
  }
}
