import { LATEST_LOTTERIES, type LotteryGameCode } from '@/models/lottery.model'
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

const HAS_DEMO_FLAG =
  process.env.TARO_ENV === 'h5' &&
  typeof window !== 'undefined' &&
  window.location.search.includes('demo=1')

/**
 * 仅 H5 预览使用设计稿示例号码：
 * 开发模式默认开启，或访问地址带 ?demo=1。小程序端始终走真实接口。
 */
export const IS_DEMO_MODE =
  (process.env.TARO_ENV === 'h5' && process.env.NODE_ENV === 'development') || HAS_DEMO_FLAG

interface DemoDraw {
  code: LotteryGameCode
  issue: string
  drawDate: string
  redNumbers: string[]
  blueNumbers: string[]
}

const DEMO_DRAWS: DemoDraw[] = [
  {
    code: 'ssq',
    issue: '2026132',
    drawDate: '2026-11-17',
    redNumbers: ['05', '09', '13', '17', '18', '21'],
    blueNumbers: ['11'],
  },
  {
    code: 'dlt',
    issue: '26132',
    drawDate: '2026-11-18',
    redNumbers: ['01', '06', '08', '15', '35'],
    blueNumbers: ['02', '05'],
  },
  {
    code: 'kl8',
    issue: '2026308',
    drawDate: '2026-11-18',
    redNumbers: [
      '02', '05', '12', '19', '23', '28', '31', '36', '40', '44',
      '47', '52', '56', '60', '63', '67', '71', '75', '78', '80',
    ],
    blueNumbers: [],
  },
  {
    code: 'fc3d',
    issue: '2026308',
    drawDate: '2026-11-18',
    redNumbers: ['4', '5', '7'],
    blueNumbers: [],
  },
  {
    code: 'qxc',
    issue: '26132',
    drawDate: '2026-11-17',
    redNumbers: ['0', '2', '3', '5', '7', '0'],
    blueNumbers: ['0'],
  },
  {
    code: 'pl3',
    issue: '263008',
    drawDate: '2026-11-18',
    redNumbers: ['9', '4', '5'],
    blueNumbers: [],
  },
  {
    code: 'pl5',
    issue: '26308',
    drawDate: '2026-11-18',
    redNumbers: ['9', '4', '5', '1', '2'],
    blueNumbers: [],
  },
  {
    code: 'qlc',
    issue: '2026133',
    drawDate: '2026-11-18',
    redNumbers: ['01', '04', '07', '08', '11', '13', '22'],
    blueNumbers: ['05'],
  },
]

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
