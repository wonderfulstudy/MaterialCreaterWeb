import { toPosterInputs, type DrawSource, type PosterDefaults } from './poster-inputs'

const DEFAULTS: PosterDefaults = {
  qrImage: 'qr.png',
  qrCaption: '微信扫码 · 每日开奖提醒',
  brandName: '彩店管理助手',
  slogan: '开奖号码 · 第一时间送达',
}

const SSQ: DrawSource = {
  gameName: '双色球',
  issue: '2026132期',
  drawDate: '11-17 周二',
  redNumbers: ['05', '09', '13', '17', '18', '21'],
  blueNumbers: ['11'],
}

describe('toPosterInputs', () => {
  it('按顺序把开奖数据补齐成海报入参', () => {
    const inputs = toPosterInputs([SSQ], DEFAULTS)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toEqual({ ...SSQ, ...DEFAULTS })
  })

  it('每项都带上二维码与落款，多彩种共享同一套默认值', () => {
    const inputs = toPosterInputs([SSQ, { ...SSQ, gameName: '大乐透' }], DEFAULTS)
    expect(inputs.map((item) => item.gameName)).toEqual(['双色球', '大乐透'])
    inputs.forEach((item) => {
      expect(item.qrImage).toBe(DEFAULTS.qrImage)
      expect(item.brandName).toBe(DEFAULTS.brandName)
    })
  })

  it('号码数组是副本，不是数据源里那个引用', () => {
    const inputs = toPosterInputs([SSQ], DEFAULTS)
    expect(inputs[0].redNumbers).not.toBe(SSQ.redNumbers)
    expect(inputs[0].blueNumbers).not.toBe(SSQ.blueNumbers)
    expect(inputs[0].redNumbers).toEqual(SSQ.redNumbers)
  })

  it('空列表返回空数组', () => {
    expect(toPosterInputs([], DEFAULTS)).toEqual([])
  })
})
