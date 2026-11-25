jest.mock('@tarojs/taro', () => ({
  request: jest.fn(),
  default: { request: jest.fn() },
}))

import { buildQuery } from './base'
import { granularityOf, isJcSubgameKey, isGameKey, gameLabel } from './games'
import { centsToYuan, yuanToCents, ratioPercent } from './sales'
import { parseTicketBookNo, bookStatusLabel } from './stock'

describe('api/business 口径', () => {
  it('buildQuery 跳过空值并编码', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x%20y')
    expect(buildQuery({})).toBe('')
  })

  it('彩种与子玩法键互斥', () => {
    expect(isGameKey('jczq')).toBe(true)
    expect(isGameKey('jczq_bf')).toBe(false)
    expect(isJcSubgameKey('jczq_bf')).toBe(true)
    expect(isJcSubgameKey('qxc')).toBe(false)
    expect(granularityOf('jcbk_hh')).toBe('detail')
    expect(granularityOf('scratch')).toBe('total')
    expect(gameLabel('sfc9')).toBe('任选9场')
    expect(gameLabel('jczq_bf')).toBe('竞彩足球比分')
  })

  it('金额与占比格式', () => {
    expect(centsToYuan(0)).toBe('0.00')
    expect(centsToYuan(63400)).toBe('634.00')
    expect(centsToYuan(5)).toBe('0.05')
    expect(yuanToCents('')).toBe(0)
    expect(yuanToCents('634')).toBe(63400)
    expect(yuanToCents('634.5')).toBe(63450)
    expect(yuanToCents('6.345')).toBeNull()
    expect(yuanToCents('abc')).toBeNull()
    expect(ratioPercent(1724)).toBe('17.24%')
  })

  it('票号解析取前 15 位本号', () => {
    expect(parseTicketBookNo('36105200015320004358')).toBe('361052000153200')
    expect(parseTicketBookNo('36-1052-000153200-043')).toBe('361052000153200')
    expect(parseTicketBookNo('361052000153200')).toBe('361052000153200')
    expect(parseTicketBookNo('12345')).toBeNull()
    expect(parseTicketBookNo('36105200015320099')).toBeNull()
    expect(bookStatusLabel('in_stock')).toBe('在库')
  })
})
