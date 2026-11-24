/**
 * 分享页的纯数据逻辑：彩种清单、勾选状态、下载文件名。
 * 不引用任何图片资源，便于在 node 环境直接单测。
 */
import type { ResultPosterInput } from '@/components/ResultPoster/types'
import { LATEST_LOTTERIES, type LotteryGameCode } from '@/models/lottery.model'

export interface ShareGameOption {
  code: LotteryGameCode
  name: string
}

/** 7 个数字彩：顺序与开奖页、设计稿 11-share-flow.html 一致 */
export const DIGITAL_GAMES: readonly ShareGameOption[] = LATEST_LOTTERIES.map(({ code, name }) => ({ code, name }))

/** 选择态默认全选 */
export const DEFAULT_SELECTION: LotteryGameCode[] = DIGITAL_GAMES.map(({ code }) => code)

export interface SelectionToggle {
  /** 处理后的勾选结果；blocked 时与原值一致 */
  selected: LotteryGameCode[]
  /** 取消掉最后一个彩种时为 true，由调用方 toast 拦截 */
  blocked: boolean
}

/**
 * 勾选/取消一个彩种，并始终按设计稿彩种顺序保存结果。
 * 至少保留 1 个：取消掉最后一个时不改变选择，只回报 blocked。
 */
export function toggleGameSelection(selected: readonly LotteryGameCode[], code: LotteryGameCode): SelectionToggle {
  if (selected.includes(code)) {
    if (selected.length <= 1) {
      return { selected: [...selected], blocked: true }
    }
    return { selected: selected.filter((item) => item !== code), blocked: false }
  }
  return { selected: DEFAULT_SELECTION.filter((item) => item === code || selected.includes(item)), blocked: false }
}

/** 全选 7 个数字彩 */
export function selectAllGames(): LotteryGameCode[] {
  return [...DEFAULT_SELECTION]
}

export interface ShareDrawEntry {
  code: LotteryGameCode
  input: ResultPosterInput
}

/** 按彩种顺序取出要进海报的开奖结果；没有数据的彩种自动跳过 */
export function pickDrawEntries(
  selected: readonly LotteryGameCode[],
  entries: readonly ShareDrawEntry[]
): ShareDrawEntry[] {
  return DIGITAL_GAMES.filter(({ code }) => selected.includes(code)).flatMap(({ code }) => {
    const found = entries.find((entry) => entry.code === code)
    return found ? [found] : []
  })
}

/** 下载文件名：单个彩种用彩种名，多个彩种标出数量 */
export function sharePosterFileName(entries: readonly ShareDrawEntry[]): string {
  if (entries.length === 0) {
    return '数字彩海报.png'
  }
  if (entries.length === 1) {
    return `${entries[0].input.gameName}-开奖海报.png`
  }
  return `数字彩合集-${entries.length}个彩种-开奖海报.png`
}
