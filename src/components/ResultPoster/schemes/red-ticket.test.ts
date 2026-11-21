import type { ResultPosterInput } from '../types'
import { redTicketLayout, redTicketScheme } from './red-ticket'
import type { TicketBallArea, TicketBallRow } from './red-ticket'

const SHARED = {
  qrImage: '',
  qrCaption: '微信扫码 · 每日开奖提醒',
  brandName: '彩店管理助手',
  slogan: '开奖号码 · 第一时间送达',
}

const SSQ: ResultPosterInput = {
  gameName: '双色球',
  issue: '2026132 期',
  drawDate: '11-18 周二',
  redNumbers: ['01', '07', '12', '19', '24', '31'],
  blueNumbers: ['09'],
  ...SHARED,
}

const DLT: ResultPosterInput = {
  gameName: '大乐透',
  issue: '26132 期',
  drawDate: '11-18 周三',
  redNumbers: ['03', '11', '19', '27', '33'],
  blueNumbers: ['04', '09'],
  ...SHARED,
}

const FC3D: ResultPosterInput = {
  gameName: '福彩3D',
  issue: '2026308 期',
  drawDate: '11-18 周二',
  redNumbers: ['5', '7', '2'],
  blueNumbers: [],
  ...SHARED,
}

const KL8: ResultPosterInput = {
  gameName: '快乐8',
  issue: '2026308 期',
  drawDate: '11-18 周二',
  redNumbers: ['02', '05', '08', '11', '14', '17', '20', '23', '26', '29', '32', '35', '38', '41', '44', '47', '50', '53', '56', '59'],
  blueNumbers: [],
  ...SHARED,
}

const CASES: readonly ResultPosterInput[] = [SSQ, DLT, FC3D, KL8]

function rowWidth(row: TicketBallRow, area: TicketBallArea): number {
  return row.count * area.diameter + (row.count - 1) * area.gap
}

describe('redTicketScheme 契约', () => {
  it('id 固定为 red-ticket', () => {
    expect(redTicketScheme.id).toBe('red-ticket')
  })

  CASES.forEach((input) => {
    it(`${input.gameName}：measure 等于 layout.height，且落在 900–1400`, () => {
      const layout = redTicketLayout(input)
      expect(redTicketScheme.measure(input)).toBe(layout.height)
      expect(Number.isInteger(layout.height)).toBe(true)
      expect(layout.height).toBeGreaterThanOrEqual(900)
      expect(layout.height).toBeLessThanOrEqual(1400)
    })
  })
})

describe('号码排版', () => {
  CASES.forEach((input) => {
    it(`${input.gameName}：每个球都落在卡片内且红号数量完整`, () => {
      const layout = redTicketLayout(input)
      const areas: TicketBallArea[] = layout.blueBalls ? [layout.redBalls, layout.blueBalls] : [layout.redBalls]
      areas.forEach((area) => {
        area.rows.forEach((row) => {
          expect(row.count).toBeGreaterThan(0)
          expect(row.startX).toBeGreaterThanOrEqual(layout.card.x)
          expect(row.startX + rowWidth(row, area)).toBeLessThanOrEqual(layout.card.x + layout.card.width)
        })
      })
      const drawn = layout.redBalls.rows.reduce((sum, row) => sum + row.count, 0)
      expect(drawn).toBe(input.redNumbers.length)
    })
  })

  it('快乐8 的 20 个红球压成两行、每行 10 个，球径不小于 46、间距不小于 8', () => {
    const layout = redTicketLayout(KL8)
    expect(layout.redBalls.rows.map((row) => row.count)).toEqual([10, 10])
    expect(layout.redBalls.diameter).toBeGreaterThanOrEqual(46)
    expect(layout.redBalls.gap).toBeGreaterThanOrEqual(8)
    expect(layout.blueBalls).toBeNull()
  })

  it('有蓝号时蓝号行整体排在红球区下方', () => {
    const ssq = redTicketLayout(SSQ)
    expect(ssq.blueBalls).not.toBeNull()
    const ssqBlue = ssq.blueBalls as TicketBallArea
    expect(ssqBlue.rows).toHaveLength(1)
    expect(ssqBlue.rows[0].cy - ssqBlue.diameter / 2).toBeGreaterThanOrEqual(ssq.redBalls.bottom)

    const dlt = redTicketLayout(DLT)
    const dltBlue = dlt.blueBalls as TicketBallArea
    expect(dltBlue.rows[0].count).toBe(2)
    expect(dltBlue.rows[0].cy - dltBlue.diameter / 2).toBeGreaterThanOrEqual(dlt.redBalls.bottom)
  })

  it('无蓝号时不产生空行：日期到号码区的间距与带蓝号方案一致', () => {
    const fc3d = redTicketLayout(FC3D)
    const kl8 = redTicketLayout(KL8)
    const ssq = redTicketLayout(SSQ)
    expect(fc3d.blueBalls).toBeNull()
    expect(kl8.blueBalls).toBeNull()
    const gapWithoutBlue = fc3d.drawDate.y - fc3d.redBalls.bottom
    expect(kl8.drawDate.y - kl8.redBalls.bottom).toBe(gapWithoutBlue)
    expect(ssq.drawDate.y - (ssq.blueBalls as TicketBallArea).bottom).toBe(gapWithoutBlue)
  })
})

describe('版面约束', () => {
  it('卡片贴住左右边距、二维码在卡内、撕线位于日期与二维码之间', () => {
    const layout = redTicketLayout(SSQ)
    expect(layout.card.x).toBe(48)
    expect(layout.card.x + layout.card.width).toBe(layout.width - 48)
    expect(layout.card.height).toBeGreaterThanOrEqual(580)
    expect(layout.qr.size).toBe(200)
    expect(layout.qr.x + layout.qr.size).toBeLessThanOrEqual(layout.card.x + layout.card.width)
    expect(layout.tearY).toBeGreaterThan(layout.drawDate.y)
    expect(layout.qr.y).toBeGreaterThan(layout.tearY)
    expect(layout.notches).toHaveLength(2)
  })
})
