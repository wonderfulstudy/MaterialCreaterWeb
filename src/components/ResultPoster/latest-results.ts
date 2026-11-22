/**
 * 海报自己取开奖数据，调用方只需要控制弹层显隐。
 * 与首页卡片走同一个接口层，但各自请求：弹层打开时拿到的就是当期最新结果。
 */
import { loadLatestGame } from '@/api/latest-lottery'
import { LATEST_LOTTERIES } from '@/models/lottery.model'
import { DEMO_DRAWS, IS_DEMO_MODE } from '@/config/demo'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import { DEFAULT_BRAND_NAME, DEFAULT_QR_CAPTION, DEFAULT_QR_IMAGE, DEFAULT_SLOGAN } from './config'
import { toPosterInputs, type DrawSource, type PosterDefaults } from './poster-inputs'
import type { ResultPosterInput } from './types'

const DEFAULTS: PosterDefaults = {
  qrImage: DEFAULT_QR_IMAGE,
  qrCaption: DEFAULT_QR_CAPTION,
  brandName: DEFAULT_BRAND_NAME,
  slogan: DEFAULT_SLOGAN,
}

function demoDraws(): DrawSource[] {
  return DEMO_DRAWS.flatMap((draw) => {
    const definition = LATEST_LOTTERIES.find(({ code }) => code === draw.code)
    return definition
      ? [
          {
            gameName: definition.name,
            issue: draw.issue,
            drawDate: draw.drawDate,
            redNumbers: draw.redNumbers,
            blueNumbers: draw.blueNumbers,
          },
        ]
      : []
  })
}

/** 拉取全部彩种最新一期，只保留已开奖的；单个彩种失败不影响其它彩种 */
export async function loadShareResults(): Promise<ResultPosterInput[]> {
  if (IS_DEMO_MODE) {
    return toPosterInputs(demoDraws(), DEFAULTS)
  }

  const games = await Promise.all(LATEST_LOTTERIES.map(({ code }) => loadLatestGame(code)))
  const draws = games.flatMap((game) =>
    game.status === 'drawn'
      ? [
          {
            gameName: game.result.name,
            issue: formatIssue(game.result.issue),
            drawDate: formatDrawDate(game.result.drawDate),
            redNumbers: game.result.redNumbers,
            blueNumbers: game.result.blueNumbers,
          },
        ]
      : []
  )

  return toPosterInputs(draws, DEFAULTS)
}
