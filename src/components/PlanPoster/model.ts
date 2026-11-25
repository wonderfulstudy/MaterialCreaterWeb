/**
 * 方案海报（A 今日推荐 / B 战绩长图）的数据装配层。
 * 只读消费 plan-store 的按天记录；「判中」由 plan-store 侧写入，本批只做消费与兜底。
 */
import type { PlanLeg, SelectionSummary, SportKey } from '@/components/PlanCalculator'
import type { StoredPlanDay } from '@/services/plan-store'
import { summarizeResults } from '../SharePoster/model'
import type { PlanHistoryEntry, SharePlan, WinStats } from '../SharePoster/model'

/** B 卡战绩表行数上限：超出只保留最新的 N 行 */
export const MAX_RECORD_ROWS = 50
/** A 卡历史行上限 */
export const MAX_HISTORY_ROWS = 5
/* B 卡背景图（storage key / 读写 / 压缩）都在 poster-bg.ts，本文件末尾转出以保持既有导入 */
/** 休息日理由兜底：记录上带 note 时优先用 note（如「国庆休息 4 天」） */
export const REST_REASON = '休息'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 单日判中结果：由 plan-store 写入，缺省按待开奖处理 */
export type DayJudged = 'hit' | 'miss' | 'pending'

/** plan-store 后续会在 StoredPlanDay 上补 judged，这里按可选字段读取 */
type DayWithJudged = StoredPlanDay & { judged?: unknown }

export function readJudged(day: StoredPlanDay): DayJudged {
  const judged = (day as DayWithJudged).judged
  return judged === 'hit' || judged === 'miss' ? judged : 'pending'
}

/** 休息理由：plan-store 会在 StoredPlanDay 上补 note（可选） */
export function readDayNote(day: StoredPlanDay): string {
  const note = (day as DayWithJudged).note
  return typeof note === 'string' && note.trim() ? note.trim() : REST_REASON
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 本地日期 key：YYYY-MM-DD */
export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 2026-11-24 → 11-24 */
export function shortDate(date: string): string {
  return date.length >= 10 ? date.slice(5) : date
}

/** 页顶日期：2026-11-24 周一 */
export function todayLabel(date: Date = new Date()): string {
  return `${dateKey(date)} ${WEEKDAYS[date.getDay()]}`
}

/** 分享时刻：09:37 */
export function clockText(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 金额：整数省掉小数（¥160 / ¥16.5） */
export function money(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `¥${Number(value.toFixed(2))}`
}

/** 奖金：固定两位，档位对齐 */
export function moneyExact(value: number): string {
  return Number.isFinite(value) ? `¥${value.toFixed(2)}` : '—'
}

export function sportLabel(sport: SportKey): string {
  return sport === 'basketball' ? '竞彩篮球' : '竞彩足球'
}

export interface PosterChip {
  label: string
  value: string
}

/** 玩法 chips：玩法 / 投注金额 / 注数 / 倍数 */
export function playChips(plan: SharePlan): PosterChip[] {
  const chips: PosterChip[] = [{ label: '玩法', value: sportLabel(plan.sport) }]
  const summary = plan.summary
  if (summary) {
    chips.push({ label: '投注金额', value: money(summary.amount) })
    chips.push({ label: '注数', value: `${summary.betCount} 注` })
    chips.push({ label: '倍数', value: `${summary.multiple} 倍` })
  }
  return chips
}

/** 理论奖金：区间用 ~ 连接，单值只显示一个数 */
export function bonusRange(summary?: SelectionSummary): string {
  if (!summary) return '待试算'
  const min = moneyExact(summary.minBonus)
  const max = moneyExact(summary.maxBonus)
  return min === max ? min : `${min} ~ ${max}`
}

/** 卡内副标题：竞彩足球 · 4 场 · 4 注 */
export function subLine(plan: SharePlan): string {
  const parts = [sportLabel(plan.sport)]
  if (plan.summary) {
    parts.push(`${plan.summary.matchCount} 场`, `${plan.summary.betCount} 注`)
  }
  return parts.join(' · ')
}

/** 场次号：只保留数字（001 / 周一001 → 001），兜底原值 */
export function matchNo(leg: PlanLeg): string {
  const digits = leg.matchNumStr.replace(/\D/g, '')
  return digits || leg.matchNumStr
}

/** 赔率：两位小数 */
export function oddsText(odds: number): string {
  return Number.isFinite(odds) ? odds.toFixed(2) : '—'
}

/** 战绩表「方案内容」：取前 3 场，如 `001胜 008双平 …` */
export function legContent(legs: PlanLeg[], max = 3): string {
  if (!legs.length) return '—'
  const items = legs.slice(0, max).map((leg) => `${matchNo(leg)}${leg.optionLabel}`)
  return legs.length > max ? `${items.join(' ')} …` : items.join(' ')
}

export interface DayStats {
  /** 出过方案的期数（休息日不计） */
  total: number
  /** 判中期数 */
  hit: number
  /** 从最新一期往前连续判中的天数，休息日跳过不打断 */
  streak: number
}

export function sortDaysDesc(days: StoredPlanDay[]): StoredPlanDay[] {
  return [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** 累计战绩 + 连中：rest 跳过不打断，miss / pending 打断 */
export function dayStats(days: StoredPlanDay[]): DayStats {
  const stats: DayStats = { total: 0, hit: 0, streak: 0 }
  let counting = true
  sortDaysDesc(days).forEach((day) => {
    if (day.rest) return
    stats.total += 1
    const judged = readJudged(day)
    if (judged === 'hit') {
      stats.hit += 1
      if (counting) stats.streak += 1
      return
    }
    counting = false
  })
  return stats
}

export interface CurrentPlanEntry {
  /** 当前方案所属日期 YYYY-MM-DD */
  date: string
  legs: PlanLeg[]
  amount: number
}

export interface PosterRecordRow {
  key: string
  /** 11-24 */
  date: string
  content: string
  stake: string
  payout: string
  /** 连中列：连中数字 / — / 待 */
  streak: string
  rest: boolean
  /** 当前方案那一行 */
  current: boolean
}

/**
 * B 卡战绩表：旧 → 新，连中列数字累积（命中 +1、未中归 0、待开奖写「待」）；
 * 当前方案固定最后一行且连中列写「待」；休息日整行展示理由（day.note），连中列写「—」且不打不断计数；
 * 超过 MAX_RECORD_ROWS 只保留最新 N 行（超长分张见 planRecordPages）。
 */
export function buildRecordRows(days: StoredPlanDay[], current?: CurrentPlanEntry | null): PosterRecordRow[] {
  const rows: PosterRecordRow[] = []
  let run = 0
  sortDaysDesc(days)
    .reverse()
    .forEach((day) => {
      if (current && day.date === current.date) return
      if (day.rest) {
        rows.push({
          key: `rest-${day.date}`,
          date: shortDate(day.date),
          content: readDayNote(day),
          stake: '—',
          payout: '—',
          streak: '—',
          rest: true,
          current: false,
        })
        return
      }
      const judged = readJudged(day)
      run = judged === 'hit' ? run + 1 : 0
      rows.push({
        key: `day-${day.date}`,
        date: shortDate(day.date),
        content: legContent(day.legs),
        stake: money(day.summary?.amount ?? 0),
        payout: judged === 'hit' ? moneyExact(day.summary?.maxBonus ?? 0) : '—',
        streak: judged === 'hit' ? String(run) : judged === 'miss' ? '0' : '待',
        rest: false,
        current: false,
      })
    })
  if (current) {
    rows.push({
      key: `current-${current.date}`,
      date: shortDate(current.date),
      content: legContent(current.legs),
      stake: money(current.amount),
      payout: '—',
      streak: '待',
      rest: false,
      current: true,
    })
  }
  return rows.length > MAX_RECORD_ROWS ? rows.slice(rows.length - MAX_RECORD_ROWS) : rows
}

/**
 * A 卡历史行：过滤键是 plan.id —— pushHistory 生成的条目 id 以 `${plan.id}-h` 开头
 * （pages/recommend/plan.ts:91），按前缀过滤保证两个方案的记录互不串行。
 */
export function historyRows(plan: SharePlan): PlanHistoryEntry[] {
  return (plan.history ?? []).filter((entry) => entry.id.startsWith(plan.id)).slice(0, MAX_HISTORY_ROWS)
}

/** 历史行结论：任一失手即未中，全部命中才算中，其余待开奖 */
export function historyOutcome(entry: PlanHistoryEntry): { text: string; tone: 'win' | 'lose' | 'pending' } {
  const stats: WinStats = summarizeResults(entry.legs, entry.results)
  if (stats.lose > 0) return { text: '未', tone: 'lose' }
  if (stats.total > 0 && stats.win === stats.total) return { text: '中', tone: 'win' }
  return { text: '待', tone: 'pending' }
}

/* B 卡背景图：storage 读写与压缩在 poster-bg.ts，这里转出以保持既有导入路径不变 */
export { POSTER_BG_STORAGE_KEY, readPosterBackground } from './poster-bg'

/* ---------- 超长 B 卡自动分张 ---------- */

/** 分张阈值：单张成品图（750 宽口径）的最高像素 */
export const POSTER_PAGE_MAX_HEIGHT = 3000
/**
 * 第 2 张起要重复「页顶条 + 表头」的高度预估（成品 px）。
 * 运行时由 DOM 实测值传入，这个默认值只服务纯函数的默认调用（测试 / 兜底）。
 */
export const POSTER_PAGE_REPEAT_HEIGHT = 96

/** 一张里放哪几行：左闭右开的行下标区间 */
export interface PosterRecordPage {
  start: number
  end: number
}

/**
 * 内容总高 → 每张的目标高度（成品 px，数组长度即张数）。
 *
 * 第 2 张起多一条重复的页顶 + 表头，所以张数 N 要满足
 * content ≤ N × max - (N - 1) × repeat；定下 N 后把 content 均分：
 * 均分后每张 ≤ max - repeat，再加回 repeat 也不顶破 max。
 */
export function posterPageHeights(
  contentHeight: number,
  repeatHeight: number = POSTER_PAGE_REPEAT_HEIGHT,
  maxHeight: number = POSTER_PAGE_MAX_HEIGHT,
): number[] {
  const limit = maxHeight > 0 ? maxHeight : POSTER_PAGE_MAX_HEIGHT
  const content = Number.isFinite(contentHeight) ? Math.max(0, contentHeight) : 0
  if (content <= limit) return [content]
  const repeat = Number.isFinite(repeatHeight) ? Math.min(Math.max(repeatHeight, 0), limit - 1) : 0
  const count = Math.ceil((content - repeat) / (limit - repeat))
  const body = content / count
  return Array.from({ length: count }, (_, index) => (index === 0 ? body : body + repeat))
}

/** 分张计算的输入：全部是成品 px（CSS 高 × POSTER_EXPORT_SCALE） */
export interface PosterPagingInput {
  /** 每行高度，按渲染顺序 */
  rowHeights: number[]
  /** 第 1 张除表格外的固定高度：页顶 + 封面 + 表头 */
  firstFixed: number
  /** 第 2 张起除表格外的固定高度：页顶 + 重复表头 */
  repeatFixed: number
  /** 说明 + 引流区高度，只加在最后一张 */
  tailFixed: number
  /** 单张上限，默认 POSTER_PAGE_MAX_HEIGHT */
  maxHeight?: number
}

/**
 * 按行边界把战绩行分到若干张：放满目标高度就换下一张，切点永远落在行边界上。
 * 说明与引流只跟最后一张，装不下就把最后一张末尾的行挪到新的一张。
 */
export function planRecordPages(input: PosterPagingInput): PosterRecordPage[] {
  const heights = input.rowHeights
  const total = heights.length
  const limit = input.maxHeight && input.maxHeight > 0 ? input.maxHeight : POSTER_PAGE_MAX_HEIGHT
  const sum = (start: number, end: number): number => {
    let value = 0
    for (let index = start; index < end; index += 1) value += heights[index]
    return value
  }
  const fixedOf = (index: number): number => (index === 0 ? input.firstFixed : input.repeatFixed)
  const heightOf = (index: number, page: PosterRecordPage, withTail: boolean): number =>
    fixedOf(index) + sum(page.start, page.end) + (withTail ? input.tailFixed : 0)

  const content = sum(0, total) + input.firstFixed + input.tailFixed
  if (total === 0 || content <= limit) return [{ start: 0, end: total }]

  const targets = posterPageHeights(content, input.repeatFixed, limit)
  const pages: PosterRecordPage[] = []
  let cursor = 0
  while (cursor < total) {
    const capacity = targets[pages.length] ?? limit
    let used = fixedOf(pages.length)
    let end = cursor
    while (end < total && used + heights[end] <= capacity) {
      used += heights[end]
      end += 1
    }
    // 单行就顶破目标高度也要落一行，行不能丢
    if (end === cursor) end = cursor + 1
    pages.push({ start: cursor, end })
    cursor = end
  }

  // 说明 + 引流只跟最后一张：装不下就把末尾的行挪到新的一张，直到装得下或只剩一行
  for (;;) {
    const lastIndex = pages.length - 1
    const last = pages[lastIndex]
    if (heightOf(lastIndex, last, true) <= limit) break
    if (last.end - last.start <= 1) break
    last.end -= 1
    pages.push({ start: last.end, end: total })
  }
  return pages
}
