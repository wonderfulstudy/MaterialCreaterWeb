import type { SelectionSummary } from '@/components/PlanCalculator/model'
import type { PlanStats, StoredPlan, StoredPlanDay } from './plan-store'
import {
  buildManualSeries,
  buildPresetSeries,
  seriesBonusText,
  seriesChips,
  seriesDate,
  seriesMeta,
  seriesStatus,
} from './plan-series'

const summary: SelectionSummary = {
  matchCount: 2,
  optionCount: 2,
  parlayCount: 2,
  betCount: 2,
  multiple: 2,
  amount: 8,
  minBonus: 3.7,
  maxBonus: 12.21,
}

const stats: PlanStats = { total: 3, hit: 1, miss: 1, pending: 1, streak: 2, last: null }

function makeDay(over: Partial<StoredPlanDay> = {}): StoredPlanDay {
  return {
    planId: 'plan-1',
    date: '2026-11-22',
    sport: 'football',
    multiple: 2,
    passIds: ['s1'],
    legs: [],
    summary,
    rest: false,
    updatedAt: 0,
    ...over,
  }
}

const plan: StoredPlan = {
  id: 'plan-1',
  name: '方案 1',
  sport: 'football',
  legs: [],
  passIds: [],
  multiple: 1,
  createdAt: 0,
  updatedAt: 0,
}

describe('plan-series', () => {
  it('seriesDate 取 MM-DD', () => {
    expect(seriesDate('2026-11-22')).toBe('11-22')
  })

  it('seriesBonusText 区间与单值', () => {
    expect(seriesBonusText(summary)).toBe('理论 ¥3.7~12.21')
    expect(seriesBonusText({ ...summary, minBonus: 5, maxBonus: 5 })).toBe('理论 ¥5')
    expect(seriesBonusText(undefined)).toBe('理论 ¥--')
  })

  it('seriesStatus 四种判定', () => {
    expect(seriesStatus(makeDay({ judged: 'hit' }))).toEqual({ text: '中 ✓', tone: 'win' })
    expect(seriesStatus(makeDay({ judged: 'miss' }))).toEqual({ text: '未 ✗', tone: 'lose' })
    expect(seriesStatus(makeDay({ judged: 'pending' }))).toEqual({ text: '待开奖', tone: 'pend' })
    expect(seriesStatus(makeDay({ judged: undefined }))).toEqual({ text: '待开奖', tone: 'pend' })
    expect(seriesStatus(makeDay({ rest: true }))).toEqual({ text: '今日休息', tone: 'pend' })
    expect(seriesStatus(null)).toEqual({ text: '待开奖', tone: 'pend' })
  })

  it('seriesMeta 正常行 / 休息行 / 无记录', () => {
    expect(seriesMeta(makeDay())).toBe('11-22 · 2 注 · 2 倍 · 投入 ¥8')
    expect(seriesMeta(makeDay({ rest: true, note: '比赛少休息 2 天' }))).toBe(
      '11-22 · 比赛少休息 2 天（不参与连中）'
    )
    expect(seriesMeta(makeDay({ rest: true }))).toBe('11-22 · 休息（不参与连中）')
    expect(seriesMeta(null)).toBe('还没有记录')
  })

  it('seriesChips 正常 / 休息 / 无记录', () => {
    expect(seriesChips(makeDay(), stats)).toEqual([
      { text: '理论 ¥3.7~12.21' },
      { text: '连中 2', on: true },
    ])
    expect(seriesChips(makeDay({ rest: true }), { ...stats, streak: 0 })).toEqual([
      { text: '投入 ¥0' },
      { text: '连中 0', on: false },
    ])
    expect(seriesChips(null, stats)).toEqual([{ text: '去录入' }])
  })

  it('buildManualSeries 组装卡面', () => {
    const view = buildManualSeries(plan, stats, makeDay({ judged: 'hit' }))
    expect(view.name).toBe('方案 1')
    expect(view.status.text).toBe('中 ✓')
    expect(view.meta).toBe('11-22 · 2 注 · 2 倍 · 投入 ¥8')
    expect(view.chips).toEqual([{ text: '理论 ¥3.7~12.21' }, { text: '连中 2', on: true }])
  })

  it('buildPresetSeries 与手动卡同结构', () => {
    const view = buildPresetSeries({
      name: '最高赔率预设',
      date: '2026-11-22',
      passLabel: '3串1',
      multiple: 2,
      summary,
      legsText: '003负 004负 002平',
    })
    expect(view.name).toBe('最高赔率预设')
    expect(view.status).toEqual({ text: '待开奖', tone: 'pend' })
    expect(view.meta).toBe('11-22 · 3串1 · 2 倍 · 投入 ¥8')
    expect(view.chips).toEqual([{ text: '003负 004负 002平' }, { text: '理论 ¥3.7~12.21' }])
  })
})
