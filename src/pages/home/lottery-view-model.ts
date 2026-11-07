import {
  LATEST_LOTTERIES,
  type LatestLotteryGame,
  type LotteryGameCode,
} from '../../models/lottery.model'

/** 单张彩种卡片的展示状态：加载中 / 已开奖 / 暂无数据 */
export type LotteryCardView =
  | {
      code: LotteryGameCode
      name: string
      numberType: 'red-blue' | 'single'
      status: 'loading'
    }
  | {
      code: LotteryGameCode
      name: string
      numberType: 'red-blue' | 'single'
      status: 'drawn'
      drawDate: string
      issue: string
      redNumbers: readonly string[]
      blueNumbers: readonly string[]
    }
  | {
      code: LotteryGameCode
      name: string
      numberType: 'red-blue' | 'single'
      status: 'unavailable'
    }

/** 按既定顺序生成八张加载态卡片，页面初始渲染用 */
export function createLoadingCards(): LotteryCardView[] {
  return LATEST_LOTTERIES.map((definition) => ({
    code: definition.code,
    name: definition.name,
    numberType: definition.numberType,
    status: 'loading',
  }))
}

/** 单个彩种的聚合结果 → 卡片视图 */
export function toCardView(game: LatestLotteryGame): LotteryCardView {
  const definition = LATEST_LOTTERIES.find(({ code }) => code === game.gameCode)

  if (!definition) {
    throw new Error(`未知彩种: ${game.gameCode}`)
  }

  const row = {
    code: definition.code,
    name: definition.name,
    numberType: definition.numberType,
  }

  if (game.status === 'unavailable') {
    return { ...row, status: 'unavailable' }
  }

  return {
    ...row,
    status: 'drawn',
    drawDate: game.result.drawDate,
    issue: game.result.issue,
    redNumbers: game.result.redNumbers,
    blueNumbers: game.result.blueNumbers,
  }
}
