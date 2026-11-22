/**
 * H5 预览用的演示开关与示例开奖数据。
 * 首页卡片与分享海报都从这里取，避免两处各存一份示例号码。
 */
import type { LotteryGameCode } from '@/models/lottery.model'

const IS_H5 = process.env.TARO_ENV === 'h5'
const SEARCH = IS_H5 && typeof window !== 'undefined' ? window.location.search : ''

export const HAS_DEMO_FLAG = SEARCH.includes('demo=1')

/** 仅 H5 预览使用设计稿示例号码：开发模式默认开启，或访问地址带 ?demo=1 */
export const IS_DEMO_MODE = (IS_H5 && process.env.NODE_ENV === 'development') || HAS_DEMO_FLAG

/** 仅预览用：?demo=1&share=1 时首页直接打开分享弹层，方便看海报与截图 */
export const OPEN_SHARE_ON_LOAD = IS_DEMO_MODE && SEARCH.includes('share=1')

export interface DemoDraw {
  code: LotteryGameCode
  issue: string
  drawDate: string
  redNumbers: string[]
  blueNumbers: string[]
}

export const DEMO_DRAWS: DemoDraw[] = [
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
