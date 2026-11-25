/**
 * 销量接口（API.r6 §1-§5）。日期一律 YYYY-MM-DD，月份 YYYY-MM，金额单位分。
 */
import { getJson, postJson, putJson } from './base'
import type { Granularity, SalesGameKey } from './games'

export interface SalesDayItem {
  gameKey: SalesGameKey
  salesCents: number
  granularity?: Granularity
}

export interface DerivedTotals {
  paihang: number
  chuanzu: number
  shuzicai: number
  jipiao: number
  total: number
}

export interface SalesDay {
  date: string
  operator: string
  submittedAt?: string
  note?: string
  items: SalesDayItem[]
  /** 服务端按 §0.2 判定后的每键金额（竞彩已按子玩法合计覆盖） */
  games?: Record<string, number>
  derived: DerivedTotals
}

export interface SalesDayPayload {
  date: string
  operator?: string
  note?: string
  submittedAt?: string
  items: SalesDayItem[]
}

export interface SalesDaySummary {
  date: string
  totalCents: number
  profitCents: number
  operator: string
  note: string
}

export interface SalesDaysResult {
  month: string
  items: SalesDaySummary[]
}

export interface MonthReportColumns {
  qxc: number
  paihang: number
  dlt: number
  chuanzu: number
  jczq: number
  scratch: number
  /** 电脑票小计（含于 total，不重复相加） */
  machine: number
  total: number
}

export interface MonthReportProfit {
  machineCents: number
  totalCents: number
}

export interface MonthReportRatios {
  qxc: number
  paihang: number
  dlt: number
  chuanzu: number
  jczq: number
  scratch: number
  /** 竞彩子玩法占比（key 为 jczq_* / jcbk_*），当月无明细时为空对象 */
  jczqDetail: Record<string, number>
}

export interface MonthReport {
  month: string
  columns: MonthReportColumns
  profit: MonthReportProfit
  ratios: MonthReportRatios
  subgames: Record<string, number>
  /** 10 大类金额（分）；排列游戏与传足四款在 columns 里归并，这里保留拆分后的原值 */
  games?: Record<string, number>
  days: number
}

export interface MonthReportYear {
  year: string
  items: MonthReport[]
}

export async function fetchSalesDay(date: string): Promise<SalesDay> {
  return getJson<SalesDay>('/api/sales/day', { date })
}

export async function saveSalesDay(payload: SalesDayPayload): Promise<SalesDay> {
  return putJson<SalesDay>('/api/sales/day', payload)
}

export async function importSalesDays(payload: SalesDayPayload[]): Promise<unknown> {
  return postJson<unknown>('/api/sales/import', payload)
}

export async function fetchSalesDays(month: string): Promise<SalesDaysResult> {
  return getJson<SalesDaysResult>('/api/sales/days', { month })
}

export async function fetchMonthReport(month: string): Promise<MonthReport> {
  return getJson<MonthReport>('/api/report/month', { month })
}

export async function fetchYearReport(year: string): Promise<MonthReportYear> {
  return getJson<MonthReportYear>('/api/report/month', { year })
}

/** 分 → 元字符串，保留两位（报表统一两位小数） */
export function centsToYuan(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const yuan = Math.floor(abs / 100)
  const fen = String(abs % 100).padStart(2, '0')
  return `${sign}${yuan}.${fen}`
}

/** 分 → 元（数值，用于输入框回填与识别结果比对） */
export function centsToYuanNumber(cents: number): number {
  return Math.round(cents) / 100
}

/** 元字符串 → 分；非法输入返回 null（留空即 0，非法不落库） */
export function yuanToCents(input: string): number | null {
  const text = input.trim()
  if (text === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [yuanPart, fenPart = ''] = text.split('.')
  return Number(yuanPart) * 100 + Number(fenPart.padEnd(2, '0'))
}

export function ratioPercent(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`
}
