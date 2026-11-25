/**
 * 经营三屏共用的纯逻辑：日期/月份游标、日明细行、月报行、22 项占比校验。
 * 不依赖 Taro 与 React，jest 可直接单测（jest 环境是 node）。
 */
import {
  GAME_DEFINITIONS,
  JC_SUBGAME_DEFINITIONS,
  isGameKey,
  isJcSubgameKey,
} from '@/api/business/games'
import { centsToYuan, ratioPercent } from '@/api/business/sales'
import type {
  MonthReport,
  MonthReportColumns,
  MonthReportRatios,
  SalesDay,
  SalesDaySummary,
} from '@/api/business/sales'

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function shiftDay(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta)
}

export function todayKey(now: Date = new Date()): string {
  return dateKey(now)
}

/** 昨日按日历回退一天：1 号回退到上月最后一天，1 月 1 号回退到去年 12-31 */
export function yesterdayKey(now: Date = new Date()): string {
  return dateKey(shiftDay(now, -1))
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function monthKey(now: Date = new Date()): string {
  return monthKeyOf(now)
}

/** YYYY-MM-DD → YYYY-MM */
export function monthOfDate(date: string): string {
  return date.slice(0, 7)
}

/** 路由 ?month= 取值校验：非法或缺失回落到当月 */
export function parseMonth(raw: string | undefined | null, now: Date = new Date()): string {
  const text = (raw || '').trim()
  return MONTH_PATTERN.test(text) ? text : monthKeyOf(now)
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthValue] = month.split('-')
  return monthKeyOf(new Date(Number(year), Number(monthValue) - 1 + delta, 1))
}

/** YYYY-MM 字典序即时间序，用当月做上界 */
export function isFutureMonth(month: string, now: Date = new Date()): boolean {
  return month > monthKeyOf(now)
}

export function monthLabel(month: string): string {
  const [year, monthValue] = month.split('-')
  return `${year}年${Number(monthValue)}月`
}

/** 2026-11-22 → 11-22 周六 */
export function dayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return `${match[2]}-${match[3]} ${WEEKDAY_LABELS[value.getDay()]}`
}

/** 日记录倒序（接口已倒序，这里兜底，避免某天后端排序变化） */
export function sortDaysDesc<T extends { date: string }>(items: T[]): T[] {
  return items.slice().sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0))
}

/** 日期列表里找昨日那条；找不到返回 null（页面显示 0.00 与「未录入」态） */
export function findDay(items: SalesDaySummary[], date: string): SalesDaySummary | null {
  return items.find((item) => item.date === date) ?? null
}

export interface GameAmountRow {
  key: string
  label: string
  cents: number
}

/**
 * 把一天的 items 归并到 10 大类（竞彩子玩法合并进 jczq 大类）。
 * 服务端 games 里已按 §0.2 归并过，仅在 items 缺该大类时用它补缺，避免重复计数。
 */
export function gameAmounts(day: Pick<SalesDay, 'items' | 'games'>): Record<string, number> {
  const amounts: Record<string, number> = {}
  const items = day?.items ?? []
  items.forEach((item) => {
    const key = isJcSubgameKey(item.gameKey) ? 'jczq' : item.gameKey
    amounts[key] = (amounts[key] || 0) + (item.salesCents || 0)
  })
  const games = day?.games ?? {}
  Object.keys(games).forEach((key) => {
    if (!isGameKey(key)) return
    if (amounts[key] === undefined) amounts[key] = games[key] || 0
  })
  return amounts
}

/** 收入历史展开态：按 GAME_DEFINITIONS 顺序列 10 大类，竞彩只出大类合计 */
export function salesDayRows(day: Pick<SalesDay, 'items' | 'games'>): GameAmountRow[] {
  const amounts = gameAmounts(day)
  return GAME_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    cents: amounts[definition.key] || 0,
  }))
}

export function sumCents(rows: { cents: number }[]): number {
  return rows.reduce((total, row) => total + (row.cents || 0), 0)
}

export type ReportRowKind = 'item' | 'subtotal' | 'total' | 'subgame'

export interface ReportRow {
  key: string
  label: string
  cents: number
  /** 占比（万分之一）；null 表示该行不参与占比合计 */
  bp: number | null
  kind: ReportRowKind
  hint?: string
}

type RatioColumn = 'qxc' | 'paihang' | 'dlt' | 'chuanzu' | 'jczq' | 'scratch'

/** FR-27 的六个归并列（顺序即报表行顺序） */
const REPORT_COLUMNS: { key: RatioColumn; label: string }[] = [
  { key: 'qxc', label: '七星彩' },
  { key: 'paihang', label: '排列游戏' },
  { key: 'dlt', label: '大乐透' },
  { key: 'chuanzu', label: '传统足球' },
  { key: 'jczq', label: '竞彩' },
  { key: 'scratch', label: '刮刮乐' },
]

export function hasJczqDetail(report: MonthReport): boolean {
  return Object.keys(report?.ratios?.jczqDetail ?? {}).length > 0
}

/** 月报主表：六项 + 电脑票小计（浅底、不参与相加）+ 总销量 */
export function monthReportRows(report: MonthReport): ReportRow[] {
  const columns: MonthReportColumns = report.columns
  const ratios: MonthReportRatios = report.ratios
  const rows: ReportRow[] = REPORT_COLUMNS.map(({ key, label }) => ({
    key,
    label,
    cents: columns[key] || 0,
    bp: ratios[key] || 0,
    kind: 'item',
  }))
  rows.push({
    key: 'machine',
    label: '电脑票',
    cents: columns.machine || 0,
    bp: null,
    kind: 'subtotal',
    hint: '小计 · 含于总销量，不重复相加',
  })
  rows.push({
    key: 'total',
    label: '总销量',
    cents: columns.total || 0,
    bp: null,
    kind: 'total',
  })
  return rows
}

/** 竞彩 13 子玩法行；当月没有子玩法明细时返回空数组（竞彩只占一项） */
export function jczqSubgameRows(report: MonthReport): ReportRow[] {
  const detail: Record<string, number> = report?.ratios?.jczqDetail ?? {}
  const subgames: Record<string, number> = report?.subgames ?? {}
  if (Object.keys(detail).length === 0) return []
  return JC_SUBGAME_DEFINITIONS.filter((definition) => detail[definition.key] !== undefined).map(
    (definition) => ({
      key: definition.key,
      label: definition.label,
      cents: subgames[definition.key] || 0,
      bp: detail[definition.key] || 0,
      kind: 'subgame' as ReportRowKind,
    }),
  )
}

export interface RatioCheckItem {
  key: string
  label: string
  bp: number
}

export interface RatioCheck {
  items: RatioCheckItem[]
  /** 各项占比之和（万分之一），正常为 10000 */
  totalBp: number
  totalText: string
  ok: boolean
  title: string
}

/** FR-25 的 8 个单款大类（排列游戏、传足四款在这里不归并） */
const SPLIT_MAJORS: { key: string; label: string }[] = [
  { key: 'qxc', label: '七星彩' },
  { key: 'pl3', label: '排列3' },
  { key: 'pl5', label: '排列5' },
  { key: 'dlt', label: '大乐透' },
  { key: 'sfc', label: '胜负彩' },
  { key: 'sfc9', label: '任选9场' },
  { key: 'sfc4', label: '4场进球' },
  { key: 'sfc6', label: '6场半全场' },
]

/**
 * 按金额占比分配到万分之一，最大余额法保证合计精确等于 10000。
 * 总金额为 0 时全部返回 0。
 */
export function allocateBp(centsList: number[], totalCents: number): number[] {
  if (totalCents <= 0) return centsList.map(() => 0)
  const exact = centsList.map((cents) => (Math.max(cents, 0) * 10000) / totalCents)
  const floors = exact.map((value) => Math.floor(value))
  let remain = 10000 - floors.reduce((sum, value) => sum + value, 0)
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
  const result = floors.slice()
  for (let i = 0; i < order.length && remain > 0; i += 1) {
    result[order[i].index] += 1
    remain -= 1
  }
  return result
}

/**
 * 22 项占比校验（FR-25 / AC-27）：分母=总销量。
 * 口径 = 8 个单款大类 + 竞彩 13 子玩法（无明细时竞彩占 1 项）+ 刮刮乐。
 * 依赖月报的 games 字段；老数据没有该字段时回落到 6 个归并列（行为与 r6 接口早期一致）。
 */
export function ratioCheck(report: MonthReport): RatioCheck {
  const games: Record<string, number> = report?.games ?? {}
  const subgames: Record<string, number> = report?.subgames ?? {}
  const totalCents = report?.columns?.total || 0
  if (Object.keys(games).length > 0) {
    const cells = SPLIT_MAJORS.map(({ key, label }) => ({ key, label, cents: games[key] || 0 }))
    if (hasJczqDetail(report)) {
      JC_SUBGAME_DEFINITIONS.forEach((definition) => {
        if (report.ratios.jczqDetail[definition.key] === undefined) return
        cells.push({
          key: definition.key,
          label: definition.label,
          cents: subgames[definition.key] || 0,
        })
      })
    } else {
      cells.push({ key: 'jczq', label: '竞彩', cents: games.jczq || 0 })
    }
    cells.push({ key: 'scratch', label: '刮刮乐', cents: games.scratch || 0 })
    const bpList = allocateBp(
      cells.map((cell) => cell.cents),
      totalCents,
    )
    const items: RatioCheckItem[] = cells.map((cell, index) => ({
      key: cell.key,
      label: cell.label,
      bp: bpList[index],
    }))
    const totalBp = items.reduce((total, item) => total + (item.bp || 0), 0)
    return {
      items,
      totalBp,
      totalText: ratioPercent(totalBp),
      ok: totalBp === 10000,
      title: `分母=总销量 · 共 ${items.length} 项`,
    }
  }

  const ratios = report?.ratios
  const items: RatioCheckItem[] = []
  REPORT_COLUMNS.forEach(({ key, label }) => {
    if (key === 'jczq' && hasJczqDetail(report)) {
      JC_SUBGAME_DEFINITIONS.forEach((definition) => {
        const bp = report.ratios.jczqDetail[definition.key]
        if (bp === undefined) return
        items.push({ key: definition.key, label: definition.label, bp })
      })
      return
    }
    items.push({ key, label, bp: ratios ? ratios[key] || 0 : 0 })
  })
  const totalBp = items.reduce((total, item) => total + (item.bp || 0), 0)
  return {
    items,
    totalBp,
    totalText: ratioPercent(totalBp),
    ok: totalBp === 10000,
    title: `分母=总销量 · 接口归并共 ${items.length} 项`,
  }
}

/** 金额展示统一走适配器口径，避免各处自己拼小数 */
export function moneyText(cents: number): string {
  return `¥${centsToYuan(cents || 0)}`
}

export function percentText(bp: number | null): string {
  return bp === null ? '—' : ratioPercent(bp)
}

