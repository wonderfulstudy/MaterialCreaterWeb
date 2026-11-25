jest.mock('@tarojs/taro', () => ({
  request: jest.fn(),
  default: { request: jest.fn() },
}))

import type { MonthReport } from '@/api/business/sales'
import {
  dayLabel,
  findDay,
  gameAmounts,
  isFutureMonth,
  jczqSubgameRows,
  monthKeyOf,
  monthLabel,
  monthOfDate,
  monthReportRows,
  parseMonth,
  ratioCheck,
  salesDayRows,
  shiftMonth,
  sortDaysDesc,
  allocateBp,
  todayKey,
  yesterdayKey,
} from './sales-model'

const NOW = new Date(2026, 10, 25)

function makeReport(overrides: Partial<MonthReport> = {}): MonthReport {
  return {
    month: '2026-11',
    columns: {
      qxc: 10000,
      paihang: 20000,
      dlt: 30000,
      chuanzu: 40000,
      jczq: 50000,
      scratch: 60000,
      machine: 150000,
      total: 210000,
    },
    profit: { machineCents: 12000, totalCents: 16800 },
    ratios: {
      qxc: 476,
      paihang: 952,
      dlt: 1429,
      chuanzu: 1905,
      jczq: 2381,
      scratch: 2857,
      jczqDetail: {},
    },
    subgames: {},
    days: 12,
    ...overrides,
  }
}

const JC_DETAIL_FULL = {
  jczq_bf: 183,
  jczq_zjq: 183,
  jczq_rqspf: 183,
  jczq_bqc: 183,
  jczq_spf: 183,
  jcbk_sf: 183,
  jcbk_sfc: 183,
  jcbk_dxf: 183,
  jcbk_rqsf: 183,
  jczq_mc: 183,
  jcbk_mc: 183,
  jczq_hh: 183,
  jcbk_hh: 185,
}

describe('经营页日期与月份游标', () => {
  it('今天/昨日按本地日历回退，跨月跨年都不出错', () => {
    expect(todayKey(NOW)).toBe('2026-11-25')
    expect(yesterdayKey(NOW)).toBe('2026-11-24')
    expect(yesterdayKey(new Date(2026, 0, 1))).toBe('2025-12-31')
    expect(yesterdayKey(new Date(2026, 2, 1))).toBe('2026-02-28')
    expect(monthOfDate('2026-11-24')).toBe('2026-11')
    expect(monthKeyOf(NOW)).toBe('2026-11')
  })

  it('月份步进与未来月判定', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(isFutureMonth('2026-11', NOW)).toBe(false)
    expect(isFutureMonth('2026-12', NOW)).toBe(true)
    expect(monthLabel('2026-03')).toBe('2026年3月')
  })

  it('路由月份参数非法时回落到当月', () => {
    expect(parseMonth('2026-03', NOW)).toBe('2026-03')
    expect(parseMonth(undefined, NOW)).toBe('2026-11')
    expect(parseMonth('2026-13', NOW)).toBe('2026-11')
    expect(parseMonth('2026-3', NOW)).toBe('2026-11')
  })

  it('日卡片日期带星期，列表按日期倒序', () => {
    expect(dayLabel('2026-11-22')).toBe('11-22 周日')
    expect(dayLabel('bad')).toBe('bad')
    const sorted = sortDaysDesc([
      { date: '2026-11-03' },
      { date: '2026-11-22' },
      { date: '2026-11-10' },
    ])
    expect(sorted.map((item) => item.date)).toEqual(['2026-11-22', '2026-11-10', '2026-11-03'])
  })

  it('昨日记录缺失时返回 null，页面走「未录入」态', () => {
    const items = [
      { date: '2026-11-24', totalCents: 100, profitCents: 8, operator: '店主', note: '' },
      { date: '2026-11-20', totalCents: 200, profitCents: 16, operator: '店主', note: '' },
    ]
    expect(findDay(items, '2026-11-24')).toEqual(items[0])
    expect(findDay(items, '2026-11-25')).toBeNull()
  })
})

describe('日明细行（10 大类，竞彩只出大类合计）', () => {
  const day = {
    items: [
      { gameKey: 'jczq_bf' as const, salesCents: 100 },
      { gameKey: 'jcbk_sf' as const, salesCents: 200 },
      { gameKey: 'qxc' as const, salesCents: 300 },
    ],
    games: { jczq: 300, qxc: 300, dlt: 5 },
  }

  it('子玩法并入竞彩大类，服务端归并值只补缺不重复相加', () => {
    const amounts = gameAmounts(day)
    expect(amounts.jczq).toBe(300)
    expect(amounts.qxc).toBe(300)
    expect(amounts.dlt).toBe(5)
    expect(amounts.jczq_bf).toBeUndefined()
  })

  it('明细按 GAME_DEFINITIONS 顺序铺 10 行', () => {
    const rows = salesDayRows(day)
    expect(rows).toHaveLength(10)
    expect(rows[0].key).toBe('qxc')
    expect(rows[8].key).toBe('jczq')
    expect(rows[8].label).toBe('竞彩')
    expect(rows[8].cents).toBe(300)
    expect(rows[9].key).toBe('scratch')
  })

  it('空记录也铺满 10 行，金额为 0', () => {
    const rows = salesDayRows({ items: [] })
    expect(rows).toHaveLength(10)
    expect(rows.every((row) => row.cents === 0)).toBe(true)
  })
})

describe('月报行与占比校验', () => {
  it('主表是六项 + 电脑票小计 + 总销量，小计不参与占比', () => {
    const rows = monthReportRows(makeReport())
    expect(rows.map((row) => row.label)).toEqual([
      '七星彩',
      '排列游戏',
      '大乐透',
      '传统足球',
      '竞彩',
      '刮刮乐',
      '电脑票',
      '总销量',
    ])
    const machine = rows[6]
    expect(machine.kind).toBe('subtotal')
    expect(machine.cents).toBe(150000)
    expect(machine.bp).toBeNull()
    expect(machine.hint).toContain('不重复相加')
    expect(rows[7].kind).toBe('total')
    expect(rows[7].cents).toBe(210000)
  })

  it('当月无子玩法明细时，竞彩只占一项', () => {
    expect(jczqSubgameRows(makeReport())).toEqual([])
    const check = ratioCheck(makeReport())
    expect(check.items).toHaveLength(6)
    expect(check.items.some((item) => item.key === 'jczq')).toBe(true)
    expect(check.totalBp).toBe(10000)
    expect(check.totalText).toBe('100.00%')
    expect(check.ok).toBe(true)
  })

  it('当月有 13 项子玩法时展开 13 行并按顺序列出', () => {
    const report = makeReport({
      ratios: {
        qxc: 476,
        paihang: 952,
        dlt: 1429,
        chuanzu: 1905,
        jczq: 2381,
        scratch: 2857,
        jczqDetail: JC_DETAIL_FULL,
      },
      subgames: { jczq_bf: 3000, jcbk_sf: 2000 },
    })
    const subgames = jczqSubgameRows(report)
    expect(subgames).toHaveLength(13)
    expect(subgames[0].key).toBe('jczq_bf')
    expect(subgames[12].key).toBe('jcbk_hh')
    expect(subgames[0].cents).toBe(3000)
    expect(subgames[0].bp).toBe(183)

    const check = ratioCheck(report)
    expect(check.items).toHaveLength(18)
    expect(check.items.some((item) => item.key === 'jczq')).toBe(false)
    expect(check.totalBp).toBe(10000)
    expect(check.ok).toBe(true)
  })

  it('有 games 拆分字段时按 22 项列占比（8 大类 + 13 子玩法 + 刮刮乐）', () => {
    const subgames: Record<string, number> = { jczq_bf: 20000 }
    Object.keys(JC_DETAIL_FULL)
      .filter((key) => key !== 'jczq_bf')
      .forEach((key) => {
        subgames[key] = 2500
      })
    const report = makeReport({
      games: {
        qxc: 10000,
        pl3: 12000,
        pl5: 8000,
        dlt: 30000,
        sfc: 20000,
        sfc9: 15000,
        sfc4: 3000,
        sfc6: 2000,
        jczq: 50000,
        scratch: 60000,
      },
      ratios: {
        qxc: 476,
        paihang: 952,
        dlt: 1429,
        chuanzu: 1905,
        jczq: 2381,
        scratch: 2857,
        jczqDetail: JC_DETAIL_FULL,
      },
      subgames,
    })
    const check = ratioCheck(report)
    expect(check.items).toHaveLength(22)
    expect(check.items.slice(0, 8).map((item) => item.key)).toEqual([
      'qxc',
      'pl3',
      'pl5',
      'dlt',
      'sfc',
      'sfc9',
      'sfc4',
      'sfc6',
    ])
    expect(check.items[8].key).toBe('jczq_bf')
    expect(check.items[21]).toEqual({ key: 'scratch', label: '刮刮乐', bp: 2857 })
    expect(check.totalBp).toBe(10000)
    expect(check.ok).toBe(true)
  })

  it('最大余额法分配占比，合计恒为 10000 且按余数排序', () => {
    expect(allocateBp([1, 1, 1], 3)).toEqual([3334, 3333, 3333])
    expect(allocateBp([0, 0], 0)).toEqual([0, 0])
    expect(allocateBp([1], 3)).toEqual([3334])
    expect(allocateBp([60000, 150000], 210000)).toEqual([2857, 7143])
  })

  it('有 games 但无子玩法明细时竞彩只占 1 项（共 10 项）', () => {
    const report = makeReport({
      games: { qxc: 10000, pl3: 20000, dlt: 30000, sfc: 40000, jczq: 50000, scratch: 60000 },
    })
    const check = ratioCheck(report)
    expect(check.items).toHaveLength(10)
    expect(check.items.some((item) => item.key === 'jczq')).toBe(true)
    expect(check.totalBp).toBe(10000)
  })

  it('分母为 0 的历史月占比全 0，校验判不通过', () => {
    const report = makeReport({
      columns: { qxc: 0, paihang: 0, dlt: 0, chuanzu: 0, jczq: 0, scratch: 0, machine: 0, total: 0 },
      ratios: { qxc: 0, paihang: 0, dlt: 0, chuanzu: 0, jczq: 0, scratch: 0, jczqDetail: {} },
      profit: { machineCents: 0, totalCents: 0 },
      days: 0,
    })
    const check = ratioCheck(report)
    expect(check.totalBp).toBe(0)
    expect(check.totalText).toBe('0.00%')
    expect(check.ok).toBe(false)
  })
})
