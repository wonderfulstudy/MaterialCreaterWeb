import { LATEST_LOTTERIES } from '@/models/lottery.model'
import type { ResultPosterInput } from '@/components/ResultPoster/types'
import {
  DEFAULT_SELECTION,
  DIGITAL_GAMES,
  pickDrawEntries,
  resolveShareSource,
  selectAllGames,
  sharePosterFileName,
  shareSportPosterFileName,
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
describe('分享来源分流', () => {
  it('缺省来源走数字彩勾选流程', () => {
    const resolved = resolveShareSource(undefined)
    expect(resolved.kind).toBe('draw')
    expect(resolved.title).toBe('数字彩合集')
    expect(resolved.directPreview).toBe(false)
    expect(resolved.date).toBe('')
    expect(resolved.issue).toBe('')
  })

  it('竞彩足球直接进预览态并带上日期', () => {
    const resolved = resolveShareSource('jc-football', { date: '2026-11-23' })
    expect(resolved.kind).toBe('jc-football')
    expect(resolved.title).toBe('竞彩足球')
    expect(resolved.directPreview).toBe(true)
    expect(resolved.date).toBe('2026-11-23')
  })

  it('竞彩篮球直接进预览态并带上日期', () => {
    const resolved = resolveShareSource('jc-basketball', { date: '2026-11-23' })
    expect(resolved.kind).toBe('jc-basketball')
    expect(resolved.title).toBe('竞彩篮球')
    expect(resolved.directPreview).toBe(true)
    expect(resolved.date).toBe('2026-11-23')
  })

  it('传统足彩直接进预览态并带上期次', () => {
    const resolved = resolveShareSource('jc-traditional', { issue: '26167' })
    expect(resolved.kind).toBe('jc-traditional')
    expect(resolved.title).toBe('传统足彩')
    expect(resolved.directPreview).toBe(true)
    expect(resolved.issue).toBe('26167')
  })

  it('日期与期次只落在各自来源上', () => {
    expect(resolveShareSource('jc-football', { date: '2026-11-23', issue: '26167' }).issue).toBe('')
    expect(resolveShareSource('jc-traditional', { date: '2026-11-23' }).date).toBe('')
    expect(resolveShareSource('draw', { date: '2026-11-23' }).date).toBe('')
  })

  it('未知来源保持占位，不直接进预览态', () => {
    const resolved = resolveShareSource('lottery-xyz')
    expect(resolved.kind).toBe('unsupported')
    expect(resolved.directPreview).toBe(false)
    expect(resolved.title).toBe('分享海报')
  })
})

describe('竞彩海报文件名', () => {
  it('按日期命名竞彩海报', () => {
    expect(shareSportPosterFileName(resolveShareSource('jc-football', { date: '2026-11-23' }))).toBe(
      '竞彩足球-2026-11-23-赛果海报.png'
    )
  })

  it('按期次命名传足海报', () => {
    expect(shareSportPosterFileName(resolveShareSource('jc-traditional', { issue: '26167' }))).toBe(
      '传统足彩-26167期-赛果海报.png'
    )
  })
})
