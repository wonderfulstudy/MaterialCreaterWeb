import type { PlanLeg, SelectionSummary, SportKey } from '../PlanCalculator/model'

/** 单场投注的中奖状态：命中 / 未中 / 待开奖 */
export type LegResultStatus = 'win' | 'lose' | 'pending'

/** 方案中某一场比赛的开奖结果 */
export interface PlanLegResult {
  /** 与 PlanLeg.matchId 对应 */
  matchId: number
  /** 实际赛果文案，如「2:1」「主胜」，可选 */
  resultText?: string
  status: LegResultStatus
}

/** 历史方案：该方案此前发布过的版本及其开奖情况 */
export interface PlanHistoryEntry {
  id: string
  /** 版本名称，如「初版」「11-08 调整」 */
  label: string
  /** 发布日期 YYYY-MM-DD */
  date: string
  legs: PlanLeg[]
  summary?: SelectionSummary
  /** 各场比赛的中奖情况；缺省视为待开奖 */
  results?: PlanLegResult[]
}

/** 海报要分享的方案 */
export interface SharePlan {
  id: string
  sport: SportKey
  name: string
  legs: PlanLeg[]
  summary?: SelectionSummary
  /** 当前方案各场比赛的中奖情况 */
  results?: PlanLegResult[]
  /** 历史方案（含中奖情况），按时间倒序传入 */
  history?: PlanHistoryEntry[]
  /** 备注，如识别来源说明 */
  note?: string
  /** 所属方案 id：海报的历史行与战绩统计按它取数（缺省回落 primaryPlanId()） */
  planId?: string
}

/** 一组投注的中奖统计 */
export interface WinStats {
  total: number
  win: number
  lose: number
  pending: number
}

/** 按 matchId 去重统计中奖情况（同场多选只算一场） */
export function summarizeResults(
  legs: PlanLeg[],
  results: PlanLegResult[] = []
): WinStats {
  const statusByMatch = new Map(results.map((item) => [item.matchId, item.status]))
  const matchIds = Array.from(new Set(legs.map((leg) => leg.matchId)))
  const stats: WinStats = { total: matchIds.length, win: 0, lose: 0, pending: 0 }
  matchIds.forEach((matchId) => {
    const status = statusByMatch.get(matchId) ?? 'pending'
    stats[status] += 1
  })
  return stats
}

/** 中奖率文案：全部待开奖时返回「待开奖」 */
export function winRateText(stats: WinStats): string {
  const settled = stats.win + stats.lose
  if (!settled) {
    return '待开奖'
  }
  return `${Math.round((stats.win / settled) * 100)}%`
}

/** 一组投注的内容指纹，用于判断方案是否变化 */
function legsKey(legs: PlanLeg[]): string {
  return legs
    .map((leg) => `${leg.matchId}|${leg.poolCode}|${leg.optionKey}|${leg.odds}`)
    .join(',')
}

function resultsKey(results: PlanLegResult[] | undefined): string {
  return (results ?? []).map((item) => `${item.matchId}:${item.status}`).join(',')
}

/**
 * 方案内容签名：内容不变时签名不变。
 * 组件用它作为生成海报的依赖，避免调用方每次渲染传入新对象引用导致重复绘制。
 */
export function planSignature(plan: SharePlan): string {
  const history = (plan.history ?? [])
    .map((entry) => `${entry.id}~${legsKey(entry.legs)}~${resultsKey(entry.results)}`)
    .join(';')
  const summary = plan.summary
    ? `${plan.summary.amount}|${plan.summary.maxBonus}|${plan.summary.multiple}`
    : ''
  return [
    plan.id,
    plan.name,
    plan.sport,
    legsKey(plan.legs),
    resultsKey(plan.results),
    summary,
    plan.note ?? '',
    history,
  ].join('#')
}

/** 汇总当前方案 + 历史方案的整体战绩 */
export function overallStats(plan: SharePlan): WinStats {
  const entries: { legs: PlanLeg[]; results?: PlanLegResult[] }[] = [
    { legs: plan.legs, results: plan.results },
    ...(plan.history ?? []),
  ]
  return entries.reduce<WinStats>(
    (acc, entry) => {
      const stats = summarizeResults(entry.legs, entry.results)
      return {
        total: acc.total + stats.total,
        win: acc.win + stats.win,
        lose: acc.lose + stats.lose,
        pending: acc.pending + stats.pending,
      }
    },
    { total: 0, win: 0, lose: 0, pending: 0 }
  )
}
