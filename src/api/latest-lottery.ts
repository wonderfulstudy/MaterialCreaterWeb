import { getDltHistory, getPl3History, getPl5History, getQxcHistory } from './lottery'
import { get3DHistory, getKL8History, getQlcHistory, getSsqHistory } from './cwl'
import {
  mapCwlHistory,
  mapLotteryHistory,
  type LatestLotteryGame,
  type LotteryGameCode,
  type LotteryResult,
} from '../models/lottery.model'
import { loadWithRetryOnEmpty } from '../utils/retry'

/** 每个彩种的数据加载器 */
const GAME_LOADERS: Record<LotteryGameCode, () => Promise<LotteryResult[]>> = {
  dlt: async () => mapLotteryHistory(await getDltHistory(), 'dlt'),
  pl3: async () => mapLotteryHistory(await getPl3History(), 'pl3'),
  pl5: async () => mapLotteryHistory(await getPl5History(), 'pl5'),
  qxc: async () => mapLotteryHistory(await getQxcHistory(), 'qxc'),
  ssq: async () => mapCwlHistory(await getSsqHistory(), 'ssq'),
  qlc: async () => mapCwlHistory(await getQlcHistory(), 'qlc'),
  fc3d: async () => mapCwlHistory(await get3DHistory(), 'fc3d'),
  kl8: async () => mapCwlHistory(await getKL8History(), 'kl8'),
}

/**
 * 拉取单个彩种最新一期，供首页逐卡片独立加载。
 * 接口偶发返回空数据时自动重试；失败或为空返回 unavailable，不抛异常。
 */
export async function loadLatestGame(code: LotteryGameCode): Promise<LatestLotteryGame> {
  try {
    const results = await loadWithRetryOnEmpty(GAME_LOADERS[code])
    const latest = results[0]

    if (!latest) {
      return { gameCode: code, status: 'unavailable' }
    }

    return { gameCode: code, status: 'drawn', result: latest }
  } catch (error) {
    console.error(`获取${code}最新开奖失败:`, error)
    return { gameCode: code, status: 'unavailable' }
  }
}
