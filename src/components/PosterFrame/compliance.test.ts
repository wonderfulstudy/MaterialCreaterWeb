/**
 * 小程序端画布分支的合规声明：海报页脚两行文案必须真的进版式并被绘制。
 * 版式高度与文案都来自 red-ticket 的同一份数据，这里直接对 layout 断言。
 */
import type { ResultPosterInput } from '@/components/ResultPoster/types'
import { COMPLIANCE_LINES, redTicketLayout } from '@/components/ResultPoster/schemes/red-ticket'

function input(): ResultPosterInput {
  return {
    gameName: '双色球',
    issue: '2026132期',
    drawDate: '11-17 周二',
    redNumbers: ['05', '09', '13', '17', '18', '21'],
    blueNumbers: ['11'],
    qrImage: '',
    qrCaption: '微信扫码 · 每日开奖提醒',
    brandName: '彩店管理助手',
    slogan: '开奖号码 · 第一时间送达',
  }
}

describe('画布分支的两行合规声明', () => {
  it('文案与设计稿 42-poster-draw.html 逐字一致', () => {
    expect(COMPLIANCE_LINES).toHaveLength(2)
    expect(COMPLIANCE_LINES[0]).toBe('理性购彩 · 量力而行，未满 18 周岁禁止购彩')
    expect(COMPLIANCE_LINES[1]).toBe('开奖结果仅供参考，请以彩票机构官方公告为准')
  })

  it('两行都排在口号下方、整张画布以内且居中', () => {
    const layout = redTicketLayout([input()])
    expect(layout.lawLines).toHaveLength(COMPLIANCE_LINES.length)

    layout.lawLines.forEach((line, index) => {
      expect(line.y).toBeGreaterThan(layout.slogan.y)
      expect(line.y + line.size / 2).toBeLessThan(layout.height)
      expect(line.x).toBeCloseTo(layout.width / 2, 5)
      expect(line.maxWidth).toBeGreaterThan(0)
      expect(line.align).toBe('center')
      if (index > 0) {
        expect(line.y).toBeGreaterThan(layout.lawLines[index - 1].y)
      }
    })
  })

  it('声明之间不重叠，且底部仍留白', () => {
    const layout = redTicketLayout([input()])
    const first = layout.lawLines[0]
    const second = layout.lawLines[1]
    expect(second.y - first.y).toBeGreaterThanOrEqual(first.size)
    expect(layout.height - (second.y + second.size / 2)).toBeGreaterThan(0)
  })

  it('多彩种合集的画布同样带上声明且高度仍在上限内', () => {
    const items: ResultPosterInput[] = [
      input(),
      { ...input(), gameName: '大乐透', redNumbers: ['01', '06', '08', '15', '35'], blueNumbers: ['02', '05'] },
      {
        ...input(),
        gameName: '快乐8',
        blueNumbers: [],
        redNumbers: [
          '02', '05', '12', '19', '23', '28', '31', '36', '40', '44',
          '47', '52', '56', '60', '63', '67', '71', '75', '78', '80',
        ],
      },
    ]
    const layout = redTicketLayout(items)
    expect(layout.lawLines).toHaveLength(2)
    expect(layout.height).toBeLessThanOrEqual(1500)
    expect(Number.isInteger(layout.height)).toBe(true)
  })
})
