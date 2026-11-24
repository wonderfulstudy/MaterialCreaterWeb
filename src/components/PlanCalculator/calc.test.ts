import { MULTI_PASS_OPTIONS, PASS_OPTIONS, UNIT_PRICE, passSizesOf, type PlanLeg } from './model'
import { selectionStats, summarizeLegs, summarizeMatchStats } from './calc'

function leg(matchId: number, odds: number, overrides: Partial<PlanLeg> = {}): PlanLeg {
  return {
    sport: 'football',
    matchId,
    matchNumStr: `20${matchId}`,
    league: '英超',
    matchDate: '2026-11-25',
    homeTeam: `主队${matchId}`,
    awayTeam: `客队${matchId}`,
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'h',
    optionLabel: '胜',
    odds,
    ...overrides,
  }
}

describe('M 串 N 过关方式', () => {
  it('MULTI_PASS_OPTIONS 只新增三档，串法数与名称一致', () => {
    expect(MULTI_PASS_OPTIONS.map((option) => option.label)).toEqual(['3串4', '4串11', '5串26'])
    expect(MULTI_PASS_OPTIONS.map((option) => option.id)).toEqual(['p3x4', 'p4x11', 'p5x26'])
    expect(passSizesOf('p3x4')).toEqual([2, 3])
    expect(passSizesOf('p4x11')).toEqual([2, 3, 4])
    expect(passSizesOf('p5x26')).toEqual([2, 3, 4, 5])
  })

  it('passSizesOf 对未知 id 返回空数组，且不污染常量', () => {
    expect(passSizesOf('p9x99')).toEqual([])

    const sizes = passSizesOf('p3x4')
    sizes.push(7)
    expect(passSizesOf('p3x4')).toEqual([2, 3])
  })

  it('批量过关的旧出口保持原样：单关 + 2串1..8串1', () => {
    expect(PASS_OPTIONS.map((option) => option.size)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(PASS_OPTIONS[0].label).toBe('单关')
    expect(PASS_OPTIONS[7].label).toBe('8串1')
  })

  it('AC-10：3 场单选 3串1，注数 1、金额 = 2 × 倍数', () => {
    const legs = [leg(1, 2), leg(2, 3), leg(3, 4)]
    const multiple = 5
    const summary = summarizeLegs(legs, [3], multiple)

    expect(summary.matchCount).toBe(3)
    expect(summary.optionCount).toBe(3)
    expect(summary.parlayCount).toBe(1)
    expect(summary.betCount).toBe(1)
    expect(summary.amount).toBe(2 * multiple)
    expect(summary.amount).toBe(summary.betCount * UNIT_PRICE * multiple)
    expect(summary.maxBonus).toBe(2 * 3 * 4 * UNIT_PRICE * multiple)

    // 与 summarizeMatchStats 直接口径一致
    expect(summary).toEqual(summarizeMatchStats(selectionStats(legs), [3], multiple))
  })

  it('AC-16：3串4 = 4 注、8 元，全对奖金等于 3 个 2串1 + 1 个 3串1 之和', () => {
    const legs = [leg(1, 1.5), leg(2, 2), leg(3, 3)]
    const summary = summarizeLegs(legs, passSizesOf('p3x4'), 1)

    expect(summary.matchCount).toBe(3)
    expect(summary.parlayCount).toBe(4)
    expect(summary.betCount).toBe(4)
    expect(summary.amount).toBe(8)

    const pairBonus = (a: number, b: number) => summarizeLegs([legs[a], legs[b]], [2], 1).maxBonus
    const tripleBonus = summarizeLegs(legs, [3], 1).maxBonus

    // 子串奖金：1.5×2、1.5×3、2×3 各 ×2 元；3串1：1.5×2×3 ×2 元
    expect(pairBonus(0, 1)).toBe(6)
    expect(pairBonus(0, 2)).toBe(9)
    expect(pairBonus(1, 2)).toBe(12)
    expect(tripleBonus).toBe(18)

    expect(summary.maxBonus).toBe(45)
    expect(pairBonus(0, 1) + pairBonus(0, 2) + pairBonus(1, 2) + tripleBonus).toBe(summary.maxBonus)
  })

  it('AC-16：只中 2 场时最低奖金 = 这两场的 2串1 奖金', () => {
    const legs = [leg(1, 1.5), leg(2, 2), leg(3, 3)]
    const hit = summarizeLegs(legs.slice(0, 2), passSizesOf('p3x4'), 1)

    // 3串1 缺一场无法成立，只剩这一个 2串1：1.5 × 2 × 2 元
    expect(hit.betCount).toBe(1)
    expect(hit.minBonus).toBe(6)
    expect(hit.maxBonus).toBe(6)
  })

  it('AC-37：同一场比赛的两个选项都保留，按复式计注', () => {
    const legs = [
      leg(1, 1.8),
      leg(1, 9, { poolCode: 'CRS', poolName: '比分', optionKey: 's02s01', optionLabel: '2:1' }),
      leg(2, 2),
    ]
    const stats = selectionStats(legs)

    expect(legs.filter((item) => item.matchId === 1)).toHaveLength(2)
    expect(stats.find((stat) => stat.optionCount === 2)).toEqual({ optionCount: 2, maxOdds: 9, minOdds: 1.8 })

    const summary = summarizeLegs(legs, [2], 1)
    expect(summary.matchCount).toBe(2)
    expect(summary.optionCount).toBe(3)
    // 复式：场次 1 的两个选项各与场次 2 组合，共 2 注
    expect(summary.betCount).toBe(2)
    expect(summary.amount).toBe(4)
    expect(summary.maxBonus).toBe(9 * 2 * UNIT_PRICE)
  })
})
