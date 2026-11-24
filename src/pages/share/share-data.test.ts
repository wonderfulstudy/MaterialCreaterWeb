import { LATEST_LOTTERIES } from '@/models/lottery.model'
import type { ResultPosterInput } from '@/components/ResultPoster/types'
import {
  DEFAULT_SELECTION,
  DIGITAL_GAMES,
  pickDrawEntries,
  selectAllGames,
  sharePosterFileName,
  toggleGameSelection,
  type ShareDrawEntry,
} from './share-data'

function input(gameName: string): ResultPosterInput {
  return {
    gameName,
    issue: '2026132期',
    drawDate: '11-18 周二',
    redNumbers: ['01', '02'],
    blueNumbers: [],
    qrImage: '',
    qrCaption: '微信扫码 · 每日开奖提醒',
    brandName: '彩店管理助手',
    slogan: '开奖号码 · 第一时间送达',
  }
}

function entry(code: ShareDrawEntry['code'], gameName: string): ShareDrawEntry {
  return { code, input: input(gameName) }
}

describe('分享页彩种清单', () => {
  it('7 个数字彩，顺序与开奖页一致', () => {
    expect(DIGITAL_GAMES).toHaveLength(7)
    expect(DIGITAL_GAMES.map(({ code }) => code)).toEqual(LATEST_LOTTERIES.map(({ code }) => code))
    expect(DIGITAL_GAMES.map(({ name }) => name)).toEqual(LATEST_LOTTERIES.map(({ name }) => name))
  })

  it('默认全选 7 个', () => {
    expect(DEFAULT_SELECTION).toHaveLength(7)
    expect(selectAllGames()).toEqual(DEFAULT_SELECTION)
  })
})

describe('勾选状态', () => {
  it('取消一个彩种不拦截', () => {
    const result = toggleGameSelection(DEFAULT_SELECTION, 'kl8')
    expect(result.blocked).toBe(false)
    expect(result.selected).toHaveLength(6)
    expect(result.selected).not.toContain('kl8')
  })

  it('取消掉最后一个彩种时拦截，选择保持不变', () => {
    const only: ShareDrawEntry['code'][] = ['dlt']
    const result = toggleGameSelection(only, 'dlt')
    expect(result.blocked).toBe(true)
    expect(result.selected).toEqual(['dlt'])
  })

  it('重新勾选按设计稿顺序落位', () => {
    const withoutKl8 = toggleGameSelection(DEFAULT_SELECTION, 'kl8').selected
    const result = toggleGameSelection(withoutKl8, 'kl8')
    expect(result.blocked).toBe(false)
    expect(result.selected).toEqual(DEFAULT_SELECTION)
  })
})

describe('海报内容', () => {
  it('按彩种顺序取内容，缺数据的彩种跳过', () => {
    const entries = [entry('kl8', '快乐8'), entry('dlt', '大乐透'), entry('ssq', '双色球')]
    const picked = pickDrawEntries(['kl8', 'ssq', 'pl3'], entries)
    expect(picked.map(({ code }) => code)).toEqual(['ssq', 'kl8'])
  })

  it('未勾选的彩种不进海报', () => {
    const entries = [entry('dlt', '大乐透'), entry('ssq', '双色球')]
    expect(pickDrawEntries(['dlt'], entries).map(({ input }) => input.gameName)).toEqual(['大乐透'])
  })

  it('文件名按彩种数量区分', () => {
    expect(sharePosterFileName([])).toBe('数字彩海报.png')
    expect(sharePosterFileName([entry('dlt', '大乐透')])).toBe('大乐透-开奖海报.png')
    expect(sharePosterFileName([entry('dlt', '大乐透'), entry('ssq', '双色球'), entry('kl8', '快乐8')])).toBe(
      '数字彩合集-3个彩种-开奖海报.png'
    )
  })
})
