/**
 * 解析规则单测：fixture 取 REQUIREMENTS.r6 的真实数字
 * （AC-14 打印小票 8 行、AC-23 竞彩 4480.00、AC-28 玩法明细 634.00、AC-22 两张报表合并）。
 */
import {
  parseAmountToCents,
  parseGameReport,
  parseJingcaiReport,
  parseReceiptLines,
  parseSubgameReport,
  yuanTextToCents,
} from './parse'

/** 打印小票：游戏名与销售行分两行，块内还有兑奖/取消行，尾部带合计块 */
const PRINTED_RECEIPT = [
  '游戏时段报表',
  '开始日期: 2026-11-22   截至日期: 2026-11-22',
  '数据截止时间: 2026-11-22 21:35:36',
  '门店编号: 01-008308',
  '游戏名称: 7星彩',
  '              金额        票数',
  '销售(已减取消):  86.00元    15张',
  '兑奖:            0.00元     0张',
  '取消:            0.00元     0张',
  '游戏名称: 排列3',
  '              金额        票数',
  '销售(已减取消):  20.00元     7张',
  '兑奖:            0.00元     0张',
  '取消:            0.00元     0张',
  '游戏名称: 排列5',
  '              金额        票数',
  '销售(已减取消):  160.00元    23张',
  '兑奖:            0.00元     0张',
  '取消:            0.00元     0张',
  '游戏名称: 超级大乐透',
  '              金额        票数',
  '销售(已减取消):  385.00元    41张',
  '兑奖:            540.00元    39张',
  '取消:            0.00元     0张',
  '游戏名称: 足球胜平负',
  '              金额        票数',
  '销售(已减取消):  32.00元     1张',
  '兑奖:            0.00元     0张',
  '取消:            0.00元     0张',
  '游戏名称: 胜平负任选9场',
  '              金额        票数',
  '销售(已减取消):  416.00元     6张',
  '兑奖:            902.00元     1张',
  '取消:            0.00元     0张',
  '游戏名称: 足球4场进球',
  '              金额        票数',
  '销售(已减取消):  0.00元     0张',
  '兑奖:            0.00元     0张',
  '取消:            0.00元     0张',
  '游戏名称: 足球6场半全场胜平负',
  '              金额        票数',
  '销售(已减取消):  0.00元     0张',
  '兑奖:            0.00元     0张',
  '取消:            0.00元     0张',
  '合计            金额        票数',
  '销售(已减取消): 1099.00元    93张',
  '兑奖:           1442.00元    40张',
  '取消:            0.00元     0张',
  '报表查询时间:2026-11-22 21:35:36',
]

/** 竞彩时段报表：单条销售行 + 重复的「销售员：合计」块 */
const JINGCAI_RECEIPT = [
  '竞彩时段报表',
  '开始日期：2026-11-22',
  '截止日期：2026-11-22',
  '终端编号：01-008308-101',
  '销售员：002',
  '              金额        票数',
  '------------------------------------',
  '销售(已减取消)： 4480.00 元   178张',
  '取消：              0.00 元     0张',
  '兑奖：           4199.61 元      --',
  '实退：              0.00 元      --',
  '兑退合计：       4199.61 元    10张',
  '------------------------------------',
  '销售员：合计',
  '销售(已减取消)： 4480.00 元   178张',
  '已结销量数据',
  '(不提供当日竞彩已结销量、中奖金额和应退金额数据)',
]

/** 其他游戏时段报表：一次只出一个玩法（AC-28） */
const SUBGAME_RECEIPT = [
  '其他游戏时段报表',
  '玩法名称：竞彩足球-比分',
  '开始日期：2026-11-22',
  '终端编号：01-008308-101',
  '              金额        票数',
  '销售(已减取消应退) 634.00元/44张',
  '兑奖 188.20元/3张',
  '取消 0.00元/0张',
  '应退 0.00元/0张',
]

function centsOfGame(lines: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  parseGameReport(lines).forEach((item) => {
    map[item.gameKey] = item.salesCents
  })
  return map
}

describe('parseGameReport（游戏时段报表）', () => {
  it('AC-14：8 行销售金额按元→分落位，两个 0.00 也保留', () => {
    const items = parseGameReport(PRINTED_RECEIPT)
    expect(items).toHaveLength(8)
    expect(items.map((item) => [item.gameKey, item.salesCents])).toEqual([
      ['qxc', 8600],
      ['pl3', 2000],
      ['pl5', 16000],
      ['dlt', 38500],
      ['sfc', 3200],
      ['sfc9', 41600],
      ['sfc4', 0],
      ['sfc6', 0],
    ])
    expect(items.every((item) => item.granularity === 'total')).toBe(true)
  })

  it('合计块不挂到最后一个游戏上，兑奖/取消金额不入库', () => {
    const cents = centsOfGame(PRINTED_RECEIPT)
    expect(Object.keys(cents)).toHaveLength(8)
    expect(Object.values(cents)).not.toContain(109900)
    expect(Object.values(cents)).not.toContain(144200)
    expect(Object.values(cents)).not.toContain(54000)
    expect(Object.values(cents)).not.toContain(90200)
  })

  it('兼容「销售(已减取消应退)」、全角括号、空格与千分位', () => {
    const lines = [
      '游戏名称: 7星彩',
      '销售 （已减取消）: 1,099.00元   93张',
      '游戏名称: 超级大乐透',
      '销售(已减取消应退)：385.00元/41张',
      '游戏名称: 足球6场半全场胜平负',
      '销售(已减取消): 12.34元 2张',
    ]
    expect(centsOfGame(lines)).toEqual({ qxc: 109900, dlt: 38500, sfc6: 1234 })
  })

  it('无报表标题也能解析，未知游戏名不落库', () => {
    const items = parseGameReport(['游戏名称: 双色球', '销售(已减取消): 100.00元 5张'])
    expect(items).toEqual([])
  })
})

describe('parseJingcaiReport（竞彩时段报表）', () => {
  it('AC-23：只认 4480.00，178 张票数、兑奖 4199.61 与「--」全部忽略', () => {
    const items = parseJingcaiReport(JINGCAI_RECEIPT)
    expect(items).toEqual([{ gameKey: 'jczq', salesCents: 448000, granularity: 'total' }])
  })

  it('重复块只取第一块销售行', () => {
    const items = parseJingcaiReport([
      '竞彩时段报表',
      '销售(已减取消)： 4480.00 元   178张',
      '销售员：合计',
      '销售(已减取消)： 4480.00 元   178张',
    ])
    expect(items).toHaveLength(1)
    expect(items[0].salesCents).toBe(448000)
  })
})

describe('parseSubgameReport（其他游戏时段报表）', () => {
  it('AC-28：玩法名称映射到 jczq_bf，634.00 元 = 63400 分，granularity=detail', () => {
    const items = parseSubgameReport(SUBGAME_RECEIPT)
    expect(items).toEqual([{ gameKey: 'jczq_bf', salesCents: 63400, granularity: 'detail' }])
  })

  it('13 个玩法名都能映射（含让球胜平负与胜平负的区分）', () => {
    const cases: Array<[string, string]> = [
      ['竞彩足球-比分', 'jczq_bf'],
      ['竞彩足球-总进球数', 'jczq_zjq'],
      ['竞彩足球-让球胜平负', 'jczq_rqspf'],
      ['竞彩足球-半全场胜平负', 'jczq_bqc'],
      ['竞彩足球-胜平负', 'jczq_spf'],
      ['竞彩篮球-胜负', 'jcbk_sf'],
      ['竞彩篮球-胜分差', 'jcbk_sfc'],
      ['竞彩篮球-大小分', 'jcbk_dxf'],
      ['竞彩篮球-让分胜负', 'jcbk_rqsf'],
      ['足球竞彩-名次', 'jczq_mc'],
      ['篮球竞彩-名次', 'jcbk_mc'],
      ['竞彩足球-混合过关', 'jczq_hh'],
      ['竞彩篮球-混合过关', 'jcbk_hh'],
    ]
    cases.forEach(([title, key]) => {
      const items = parseSubgameReport(['玩法名称：' + title, '销售(已减取消应退) 1.00元/1张'])
      expect([title, items[0].gameKey]).toEqual([title, key])
    })
  })

  it('认不出玩法名时留空，不把金额挂到错的玩法上', () => {
    expect(parseSubgameReport(['销售(已减取消应退) 634.00元/44张'])).toEqual([])
  })
})

describe('parseReceiptLines（按报表标题分流）', () => {
  it('三类报表各自分流', () => {
    expect(parseReceiptLines(PRINTED_RECEIPT).kind).toBe('game')
    expect(parseReceiptLines(JINGCAI_RECEIPT).kind).toBe('jingcai')
    expect(parseReceiptLines(SUBGAME_RECEIPT).kind).toBe('subgame')
    expect(parseReceiptLines(['随便一张照片', '看不清'])).toEqual({ kind: 'unknown', items: [] })
  })

  it('AC-22：游戏时段报表 + 竞彩时段报表合并为同一天 = 1099.00 + 4480.00', () => {
    const game = parseReceiptLines(PRINTED_RECEIPT).items
    const jingcai = parseReceiptLines(JINGCAI_RECEIPT).items
    const merged: Record<string, number> = {}
    game.concat(jingcai).forEach((item) => {
      merged[item.gameKey] = item.salesCents
    })
    const gameTotal = game.reduce((sum, item) => sum + item.salesCents, 0)
    const jingcaiTotal = jingcai.reduce((sum, item) => sum + item.salesCents, 0)
    expect(gameTotal).toBe(109900)
    expect(jingcaiTotal).toBe(448000)
    expect(gameTotal + jingcaiTotal).toBe(557900)
    expect(merged.jczq).toBe(448000)
    expect(merged.qxc).toBe(8600)
  })

  it('AC-28 + AC-23 同日合并：子玩法明细与大类各自落位', () => {
    const subgame = parseReceiptLines(SUBGAME_RECEIPT).items
    expect(subgame[0].granularity).toBe('detail')
    expect(parseReceiptLines(JINGCAI_RECEIPT).items[0].granularity).toBe('total')
  })
})

describe('金额解析', () => {
  it('只认数字与小写点，容忍千分位逗号', () => {
    expect(yuanTextToCents('86.00')).toBe(8600)
    expect(yuanTextToCents('0.00')).toBe(0)
    expect(yuanTextToCents('86')).toBe(8600)
    expect(yuanTextToCents('1,234.56')).toBe(123456)
    expect(yuanTextToCents('86.005')).toBe(8601)
    expect(yuanTextToCents('--')).toBeNull()
    expect(yuanTextToCents('86,00')).toBe(860000)
    expect(yuanTextToCents('1,234')).toBe(123400)
    expect(yuanTextToCents('86.0.0')).toBeNull()
  })

  it('取一行里的第一个金额，票数在后自然被忽略', () => {
    expect(parseAmountToCents('销售(已减取消): 4480.00 元   178张')).toBe(448000)
    expect(parseAmountToCents('兑奖: 4199.61 元 --')).toBe(419961)
    expect(parseAmountToCents('无金额')).toBeNull()
  })
})
