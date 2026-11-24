import { posterKey, toCardItems } from './card-items'
import type { ResultPosterInput } from './types'

const SSQ: ResultPosterInput = {
  gameName: '双色球',
  issue: '2026132期',
  drawDate: '11-17 周二',
  redNumbers: ['05', '09', '13', '17', '18', '21'],
  blueNumbers: ['11'],
  qrImage: 'qr.png',
  qrCaption: '微信扫码 · 每日开奖提醒',
  brandName: '彩店管理助手',
  slogan: '开奖号码 · 第一时间送达',
}

describe('toCardItems', () => {
  it('每项映射成一张已开奖卡片，展示文案原样透传', () => {
    const items = toCardItems([SSQ])

    expect(items).toEqual([
      {
        id: '双色球|2026132期',
        name: '双色球',
        status: 'drawn',
        issue: '2026132期',
        drawDate: '11-17 周二',
        redNumbers: ['05', '09', '13', '17', '18', '21'],
        blueNumbers: ['11'],
      },
    ])
  })

  it('按传入顺序排列，key 与彩种标识一致', () => {
    const dlt = { ...SSQ, gameName: '大乐透', blueNumbers: ['03', '07'] }
    const items = toCardItems([SSQ, dlt])

    expect(items.map((item) => item.name)).toEqual(['双色球', '大乐透'])
    expect(items.map((item) => item.id)).toEqual([posterKey(SSQ), posterKey(dlt)])
  })

  it('空列表返回空数组', () => {
    expect(toCardItems([])).toEqual([])
  })
})
