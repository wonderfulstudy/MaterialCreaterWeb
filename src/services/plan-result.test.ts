import { POOL_DEFS, type PlanLeg, type PoolCode } from '@/components/PlanCalculator/model'
import { extractMatchResults, judgeLegs, judgePlan, type MatchResults } from './plan-result'

/** 竞彩足球赛果：字段与 src/api/lottery/results.ts 的 FootballResultDto 一致 */
const FOOTBALL_PAYLOAD = {
  success: true,
  value: {
    matchResult: [
      // 2:1，半场 1:0，让球 -1 → 让平
      {
        matchId: 1001,
        matchDate: '2026-11-23 20:00',
        sectionsNo1: '1:0',
        sectionsNo999: '2:1',
        goalLine: '-1',
        winFlag: 'H',
        matchResultStatus: '2',
      },
      // 0:0，让球 +1 → 让胜
      {
        matchId: 1002,
        matchDate: '2026-11-23 20:00',
        sectionsNo1: '0:0',
        sectionsNo999: '0:0',
        goalLine: '1',
        winFlag: 'D',
        matchResultStatus: '2',
      },
      // 未开奖：没有比分
      { matchId: 1003, matchDate: '2026-11-24 20:00', matchResultStatus: '1' },
      // 4:4：比分枚举表里没有，归「平其他」；总进球 8 → 7+
      { matchId: 1004, matchDate: '2026-11-23 20:00', sectionsNo1: '2:2', sectionsNo999: '4:4' },
    ],
  },
}

/** 竞彩篮球赛果：字段与 BasketballResultDto 一致（盘口可能在 matchResultList 里） */
const BASKETBALL_PAYLOAD = {
  success: true,
  value: {
    matchResult: [
      {
        matchId: 2001,
        matchDate: '2026-11-23 09:00',
        finalScore: '125-103',
        hdc: { poolCode: 'hdc', goalLine: '-5.5' },
        hilo: { poolCode: 'hilo', goalLine: '220.5' },
      },
      {
        matchId: 2002,
        matchDate: '2026-11-23 09:00',
        finalScore: '100-110',
        matchResultList: [
          { poolCode: 'hdc', goalLine: '+3.5' },
          { poolCode: 'hilo', goalLine: '210.5' },
        ],
      },
    ],
  },
}

/** 传足 14 场：场序 1..14 依次为 3/1/0 循环 */
const TRADITIONAL_CODES = ['3', '1', '0', '3', '1', '0', '3', '1', '0', '3', '1', '0', '3', '1']

const TRADITIONAL_PAYLOAD = { issue: '26167', drawDate: '2026-11-22', results: TRADITIONAL_CODES }

/** 代理信封里的传足原始开奖串 */
const TRADITIONAL_DTO = {
  value: {
    list: [
      { lotteryDrawNum: '26167', lotteryDrawTime: '2026-11-22 20:00', lotteryDrawResult: TRADITIONAL_CODES.join(' ') },
    ],
  },
}

const FOOTBALL_DATE = '2026-11-23 20:00'

function makeLeg(overrides: Partial<PlanLeg>): PlanLeg {
  return {
    sport: 'football',
    matchId: 1001,
    matchNumStr: '周一001',
    league: '英超',
    matchDate: FOOTBALL_DATE,
    homeTeam: '主队',
    awayTeam: '客队',
    poolCode: 'HAD',
    poolName: '胜平负',
    goalLine: '',
    optionKey: 'h',
    optionLabel: '胜',
    odds: 2.1,
    ...overrides,
  } as PlanLeg
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child))
    Object.freeze(value)
  }
  return value
}

const footballResults = (): MatchResults => extractMatchResults(FOOTBALL_PAYLOAD, 'football')
const basketballResults = (): MatchResults => extractMatchResults(BASKETBALL_PAYLOAD, 'basketball')

describe('extractMatchResults - 官方赛果归一化成每场每玩法的选项 key', () => {
  test('足球五玩法：胜平负/让球/比分/总进球/半全场都按选项 key 落表', () => {
    const { pools } = footballResults()['1001']

    expect(pools.HAD).toEqual({ '': ['h'] })
    expect(pools.HHAD).toEqual({ '-1': ['d'] })
    expect(pools.CRS).toEqual({ '': ['s02s01'] })
    expect(pools.TTG).toEqual({ '': ['s3'] })
    expect(pools.HAFU).toEqual({ '': ['hh'] })
  })

  test('比分与总进球的边界：4:4 归平其他，8 球归 7+', () => {
    const { pools } = footballResults()['1004']

    expect(pools.CRS).toEqual({ '': ['s1sd'] })
    expect(pools.TTG).toEqual({ '': ['s7'] })
    expect(pools.HAD).toEqual({ '': ['d'] })
    expect(pools.HHAD).toBeUndefined()
    expect(pools.HAFU).toEqual({ '': ['dd'] })
  })

  test('篮球四玩法：盘口可以平铺，也可以只在 matchResultList 里', () => {
    const flat = basketballResults()['2001'].pools
    expect(flat.MNL).toEqual({ '': ['h'] })
    expect(flat.WNM).toEqual({ '': ['w5'] })
    expect(flat.HDC).toEqual({ '-5.5': ['h'] })
    expect(flat.HILO).toEqual({ '220.5': ['h'] })

    const nested = basketballResults()['2002'].pools
    expect(nested.MNL).toEqual({ '': ['a'] })
    expect(nested.WNM).toEqual({ '': ['l2'] })
    expect(nested.HDC).toEqual({ '3.5': ['a'] })
    expect(nested.HILO).toEqual({ '210.5': ['l'] })
  })

  test('未开奖的场次只有日期、没有玩法结果', () => {
    const entry = footballResults()['1003']

    expect(entry.date).toBe('2026-11-24')
    expect(entry.pools).toEqual({})
  })

  test('传足 14 场 3/1/0：按场序对齐 matchId，选项 key 原样保留', () => {
    const results = extractMatchResults(TRADITIONAL_PAYLOAD, 'football')

    expect(Object.keys(results)).toHaveLength(14)
    expect(results['1']).toEqual({ date: '2026-11-22', pools: { HAD: { '': ['3'] } }, order: 1 })
    expect(results['2'].pools.HAD).toEqual({ '': ['1'] })
    expect(results['3'].pools.HAD).toEqual({ '': ['0'] })
  })

  test('传足也认代理信封里的 lotteryDrawResult 串', () => {
    const results = extractMatchResults(TRADITIONAL_DTO, 'football')

    expect(results['1'].pools.HAD).toEqual({ '': ['3'] })
    expect(results['14'].pools.HAD).toEqual({ '': ['1'] })
    expect(results['14'].date).toBe('2026-11-22')
  })

  test('空 payload / 非对象 / 没有 matchId 的 payload 都返回空表，不抛错', () => {
    expect(extractMatchResults(null, 'football')).toEqual({})
    expect(extractMatchResults(undefined, 'basketball')).toEqual({})
    expect(extractMatchResults({ success: true }, 'football')).toEqual({})
    expect(extractMatchResults({ value: { matchResult: [{ foo: 1 }] } }, 'football')).toEqual({})
  })

  test('足球 payload 用篮球解析不会凭空造出玩法结果', () => {
    expect(extractMatchResults(FOOTBALL_PAYLOAD, 'basketball')['1001'].pools).toEqual({})
  })
})

describe('judgeLegs - 每腿中 / 未 / 待开奖', () => {
  test('单场单腿命中', () => {
    const judged = judgeLegs([makeLeg({ optionKey: 'h' })], footballResults())

    expect(judged).toHaveLength(1)
    expect(judged[0].result).toBe('hit')
    expect(judged[0].leg.optionKey).toBe('h')
  })

  test('单场单腿未中', () => {
    const judged = judgeLegs([makeLeg({ optionKey: 'a' })], footballResults())

    expect(judged[0].result).toBe('miss')
  })

  test('让球按结果盘口判定：让球 -1 的 2:1 判让平', () => {
    const judged = judgeLegs(
      [
        makeLeg({ poolCode: 'HHAD', goalLine: '-1', optionKey: 'd' }),
        makeLeg({ poolCode: 'HHAD', goalLine: '-1', optionKey: 'h' }),
      ],
      footballResults(),
    )

    expect(judged.map((item) => item.result)).toEqual(['hit', 'miss'])
  })

  test('赛果缺失（未开奖、比分字段为空）→ pending，不当 miss', () => {
    const judged = judgeLegs([makeLeg({ matchId: 1003, matchDate: '2026-11-24 20:00' })], footballResults())
    const missingMatch = judgeLegs([makeLeg({ matchId: 9999 })], footballResults())

    expect(judged[0].result).toBe('pending')
    expect(missingMatch[0].result).toBe('pending')
  })

  test('未知玩法 poolCode → pending，不抛错', () => {
    const judged = judgeLegs([makeLeg({ poolCode: 'NOPE' as unknown as PoolCode })], footballResults())

    expect(judged[0].result).toBe('pending')
  })

  test('日期不匹配 → pending（不把隔天赛果套到这条腿上）', () => {
    const judged = judgeLegs([makeLeg({ matchDate: '2026-11-22 20:00', optionKey: 'h' })], footballResults())

    expect(judged[0].result).toBe('pending')
  })

  test('盘口对不上（赛果里没有该盘口）→ pending', () => {
    const judged = judgeLegs(
      [makeLeg({ poolCode: 'HHAD', goalLine: '-2', optionKey: 'h' })],
      footballResults(),
    )

    expect(judged[0].result).toBe('pending')
  })

  test('空 legs → 空结果数组', () => {
    expect(judgeLegs([], footballResults())).toEqual([])
  })
})

describe('judgePlan - 整单状态与复式口径', () => {
  test('全部命中 → hit', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ matchId: 1002, optionKey: 'd' })]
    const judged = judgeLegs(legs, footballResults())

    expect(judged.map((item) => item.result)).toEqual(['hit', 'hit'])
    expect(judgePlan(judged)).toBe('hit')
  })

  test('任一 miss → miss', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ matchId: 1002, optionKey: 'a' })]

    expect(judgePlan(judgeLegs(legs, footballResults()))).toBe('miss')
  })

  test('跨场两腿一 pending → pending（不提前判死整单）', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ matchId: 1003, matchDate: '2026-11-24 20:00' })]
    const judged = judgeLegs(legs, footballResults())

    expect(judged.map((item) => item.result)).toEqual(['hit', 'pending'])
    expect(judgePlan(judged)).toBe('pending')
  })

  test('复式一场两腿一中一未 → 该场算命中，整单 hit', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ poolCode: 'CRS', optionKey: 's02s01' })]
    const judged = judgeLegs(legs, footballResults())

    expect(judged.map((item) => item.result)).toEqual(['hit', 'hit'])
    expect(judgePlan(judged)).toBe('hit')
  })

  test('复式一场两腿一未一中 → 该场仍算命中（AC-37 复式语义）', () => {
    const legs = [makeLeg({ optionKey: 'a' }), makeLeg({ poolCode: 'CRS', optionKey: 's02s01' })]
    const judged = judgeLegs(legs, footballResults())

    expect(judged.map((item) => item.result)).toEqual(['miss', 'hit'])
    expect(judgePlan(judged)).toBe('hit')
  })

  test('复式同场全未中 → miss', () => {
    const legs = [makeLeg({ optionKey: 'a' }), makeLeg({ poolCode: 'CRS', optionKey: 's00s00' })]

    expect(judgePlan(judgeLegs(legs, footballResults()))).toBe('miss')
  })

  test('复式同场一未中一待开奖 → 该场 pending，整单 pending', () => {
    const judged = judgeLegs([makeLeg({ optionKey: 'a' }), makeLeg({ poolCode: 'NOPE' as unknown as PoolCode })], footballResults())

    expect(judged.map((item) => item.result)).toEqual(['miss', 'pending'])
    expect(judgePlan(judged)).toBe('pending')
  })

  test('空 legs → pending', () => {
    expect(judgePlan([])).toBe('pending')
    expect(judgePlan(judgeLegs([], footballResults()))).toBe('pending')
  })
})

describe('judgeLegs / judgePlan - 传足 3/1/0', () => {
  const traditionalLeg = (matchId: number, optionKey: string): PlanLeg =>
    makeLeg({ matchId, poolCode: 'HAD', goalLine: '', optionKey, matchDate: '2026-11-22 20:00' })

  test('传足命中：场序 1 的 3、场序 2 的 1、场序 3 的 0 都算中', () => {
    const results = extractMatchResults(TRADITIONAL_PAYLOAD, 'football')
    const judged = judgeLegs([traditionalLeg(1, '3'), traditionalLeg(2, '1'), traditionalLeg(3, '0')], results)

    expect(judged.map((item) => item.result)).toEqual(['hit', 'hit', 'hit'])
    expect(judgePlan(judged)).toBe('hit')
  })

  test('传足未中：场序 1 开 3，选 1 或 0 都是 miss', () => {
    const results = extractMatchResults(TRADITIONAL_PAYLOAD, 'football')
    const judged = judgeLegs([traditionalLeg(1, '1'), traditionalLeg(1, '0')], results)

    expect(judged.map((item) => item.result)).toEqual(['miss', 'miss'])
    expect(judgePlan(judged)).toBe('miss')
  })

  test('传足只认 3/1/0：胜平负的 h 在传足结果里判 miss 而不是 hit', () => {
    const results = extractMatchResults(TRADITIONAL_PAYLOAD, 'football')

    expect(judgeLegs([traditionalLeg(1, 'h')], results)[0].result).toBe('miss')
  })
})

describe('输入不可变', () => {
  test('deep-freeze 的 payload 与 legs 判定后不抛错、内容逐字不变', () => {
    const payload = deepFreeze(FOOTBALL_PAYLOAD)
    const legs = deepFreeze([
      makeLeg({ optionKey: 'h' }),
      makeLeg({ matchId: 1002, optionKey: 'a' }),
      makeLeg({ matchId: 1003, matchDate: '2026-11-24 20:00' }),
    ])
    const payloadBefore = JSON.stringify(payload)
    const legsBefore = JSON.stringify(legs)

    const results = extractMatchResults(payload, 'football')
    const judged = judgeLegs(legs, results)
    const planResult = judgePlan(judged)

    expect(judged.map((item) => item.result)).toEqual(['hit', 'miss', 'pending'])
    expect(planResult).toBe('miss')
    expect(JSON.stringify(payload)).toBe(payloadBefore)
    expect(JSON.stringify(legs)).toBe(legsBefore)
    expect(judged.map((item) => item.leg)).toEqual(legs)
  })

  test('重复调用结果稳定（内部没有跨调用状态）', () => {
    const legs = [makeLeg({ optionKey: 'h' }), makeLeg({ matchId: 1002, optionKey: 'd' })]

    expect(judgeLegs(legs, footballResults())).toEqual(judgeLegs(legs, footballResults()))
    expect(extractMatchResults(FOOTBALL_PAYLOAD, 'football')).toEqual(footballResults())
  })
})

describe('POOL_DEFS 覆盖', () => {
  test('足球五玩法与篮球四玩法都在池表里（未知玩法只会 pending）', () => {
    expect(Object.keys(footballResults()['1001'].pools).sort()).toEqual(['CRS', 'HAD', 'HAFU', 'HHAD', 'TTG'])
    expect(Object.keys(basketballResults()['2001'].pools).sort()).toEqual(['HDC', 'HILO', 'MNL', 'WNM'])
    expect(POOL_DEFS.CRS.options.some((option) => option.key === 's02s01')).toBe(true)
  })
})
