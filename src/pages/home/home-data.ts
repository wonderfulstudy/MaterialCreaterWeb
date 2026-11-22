import { LATEST_LOTTERIES } from '@/models/lottery.model'
import { DEMO_DRAWS } from '@/config/demo'
import type { LotteryCardView } from './lottery-view-model'

export type StatTone = 'muted' | 'red' | 'plain' | 'green'

export interface SportStat {
  label: string
  value: string
  tone: StatTone
}

export interface SportReport {
  key: 'football' | 'basketball'
  title: string
  date: string
  stats: SportStat[]
}

/** 顶部战报暂用示例数据，接口接入后替换为真实统计 */
export const SPORT_REPORTS: SportReport[] = [
  {
    key: 'football',
    title: '竞足',
    date: '2026-11-17',
    stats: [
      { label: '完赛', value: '10', tone: 'muted' },
      { label: '胜', value: '2', tone: 'red' },
      { label: '平', value: '4', tone: 'plain' },
      { label: '负', value: '1', tone: 'green' },
    ],
  },
  {
    key: 'basketball',
    title: '竞篮',
    date: '2026-11-17',
    stats: [
      { label: '完赛', value: '10', tone: 'muted' },
      { label: '胜', value: '2', tone: 'red' },
      { label: '平', value: '4', tone: 'plain' },
      { label: '负', value: '1', tone: 'green' },
    ],
  },
]

export const TRADITIONAL_REPORT = {
  title: '传统',
  issue: '26115',
  date: '2026-11-18',
  results: Array.from({ length: 14 }, () => '1'),
}

/** 示例开奖数据来自 @/config/demo，与分享海报预览共用同一份 */
export function createDemoCards(): LotteryCardView[] {
  return DEMO_DRAWS.map((draw) => {
    const definition = LATEST_LOTTERIES.find(({ code }) => code === draw.code)
    if (!definition) {
      throw new Error(`未知彩种: ${draw.code}`)
    }

    return {
      code: draw.code,
      name: definition.name,
      numberType: definition.numberType,
      status: 'drawn',
      issue: draw.issue,
      drawDate: draw.drawDate,
      redNumbers: draw.redNumbers,
      blueNumbers: draw.blueNumbers,
    }
  })
}
