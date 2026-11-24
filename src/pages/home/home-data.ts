import { LATEST_LOTTERIES } from '@/models/lottery.model'
import { DEMO_DRAWS } from '@/config/demo'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import type { LotteryCardItem } from '@/components/LotteryCardView/types'

/** 竞彩三行入口：点进各自的赛果详情页 */
export interface SportEntry {
  key: 'football' | 'basketball' | 'traditional'
  title: string
  /** 入口左侧的方形图标字 */
  glyph: string
  /** 入口副文案，真实期号/场次由页面补齐 */
  hint: string
  url: string
}

export const SPORT_ENTRIES: SportEntry[] = [
  { key: 'football', title: '足球', glyph: '足', hint: '按日期查看赛果', url: '/pages/draw/football/index' },
  { key: 'basketball', title: '篮球', glyph: '篮', hint: '按日期查看赛果', url: '/pages/draw/basketball/index' },
  { key: 'traditional', title: '传统足彩', glyph: '彩', hint: '胜负彩 14 场', url: '/pages/draw/traditional/index' },
]

/** 示例开奖数据来自 @/config/demo，与分享海报预览共用同一份 */
export function createDemoCards(): LotteryCardItem[] {
  return DEMO_DRAWS.map((draw) => {
    const definition = LATEST_LOTTERIES.find(({ code }) => code === draw.code)
    if (!definition) {
      throw new Error(`未知彩种: ${draw.code}`)
    }

    return {
      id: draw.code,
      name: definition.name,
      status: 'drawn',
      issue: formatIssue(draw.issue),
      drawDate: formatDrawDate(draw.drawDate),
      redNumbers: draw.redNumbers,
      blueNumbers: draw.blueNumbers,
    }
  })
}
