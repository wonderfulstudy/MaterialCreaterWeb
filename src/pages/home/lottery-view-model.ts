import {
  LATEST_LOTTERIES,
  type LatestLotteryGame,
} from '../../models/lottery.model'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import { readCachedLatestGames } from '@/api/latest-lottery'
import type { LotteryCardItem } from '@/components/LotteryCardView/types'

/** 按既定顺序生成七张加载态卡片，页面初始渲染用 */
export function createLoadingCards(): LotteryCardItem[] {
  return LATEST_LOTTERIES.map((definition) => ({
    id: definition.code,
    name: definition.name,
    status: 'loading',
  }))
}

/**
 * 首屏缓存卡片：有缓存的彩种直接定格，其余保持加载态。
 * 全无缓存时返回 null，由页面走纯加载态。
 */
export function createCachedCards(): LotteryCardItem[] | null {
  const games = readCachedLatestGames()

  if (!games) {
    return null
  }

  return createLoadingCards().map((card) => {
    const game = games.find((item) => item.gameCode === card.id)
    return game ? toCardView(game) : card
  })
}

/** 单个彩种的聚合结果 → 卡片视图 */
export function toCardView(game: LatestLotteryGame): LotteryCardItem {
  const definition = LATEST_LOTTERIES.find(({ code }) => code === game.gameCode)

  if (!definition) {
    throw new Error(`未知彩种: ${game.gameCode}`)
  }

  const card = {
    id: definition.code,
    name: definition.name,
  }

  if (game.status === 'unavailable') {
    return { ...card, status: 'unavailable' }
  }

  return {
    ...card,
    status: 'drawn',
    issue: formatIssue(game.result.issue),
    drawDate: formatDrawDate(game.result.drawDate),
    redNumbers: game.result.redNumbers,
    blueNumbers: game.result.blueNumbers,
  }
}
