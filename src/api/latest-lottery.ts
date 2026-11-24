import { getDltHistory, getPl3History, getPl5History, getQxcHistory } from './lottery/lottery'
import { getKL8History, getQlcHistory, getSsqHistory } from './cwl/cwl'
import {
  LATEST_LOTTERIES,
  mapCwlHistory,
  mapLotteryHistory,
  type LatestLotteryGame,
  type LotteryGameCode,
  type LotteryResult,
} from '../models/lottery.model'
import { cacheKey, loadWithCache, readCache } from '../services/cache/remote-cache'
import { loadWithRetryOnEmpty } from '../utils/retry'

/** 每个彩种的数据加载器；键集与 LATEST_LOTTERIES 一致 */
const GAME_LOADERS: Record<LotteryGameCode, () => Promise<LotteryResult[]>> = {
  dlt: async () => mapLotteryHistory(await getDltHistory(), 'dlt'),
  ssq: async () => mapCwlHistory(await getSsqHistory(), 'ssq'),
  qxc: async () => mapLotteryHistory(await getQxcHistory(), 'qxc'),
  pl3: async () => mapLotteryHistory(await getPl3History(), 'pl3'),
  pl5: async () => mapLotteryHistory(await getPl5History(), 'pl5'),
  qlc: async () => mapCwlHistory(await getQlcHistory(), 'qlc'),
  kl8: async () => mapCwlHistory(await getKL8History(), 'kl8'),
}

export function latestCacheKey(code: LotteryGameCode): string {
  return cacheKey('latest', code)
}

/**
 * 首屏同步读本地缓存：断网或冷启动时先出上次的开奖内容。
 * 一个彩种有缓存就返回，全无缓存返回 null。
 */
export function readCachedLatestGames(): LatestLotteryGame[] | null {
  const games: LatestLotteryGame[] = []

  LATEST_LOTTERIES.forEach(({ code }) => {
    const cached = readCache<LotteryResult>(latestCacheKey(code))
    if (!cached) {
      return
    }
    games.push({
      gameCode: code,
      status: 'drawn',
      result: cached.data,
      updatedAt: cached.updatedAt,
      fromCache: true,
    })
  })

  return games.length > 0 ? games : null
}

/**
 * 拉取单个彩种最新一期，供开奖页逐卡片独立加载。
 * 接口偶发返回空数据时自动重试；成功后落本地缓存，
 * 重试仍为空或请求失败时回落上次成功的数据并标记 fromCache，
 * 两者都没有才返回 unavailable，全程不抛异常。
 */
export async function loadLatestGame(code: LotteryGameCode): Promise<LatestLotteryGame> {
  const loaded = await loadWithCache(latestCacheKey(code), async () => {
    const results = await loadWithRetryOnEmpty(GAME_LOADERS[code])
    const latest = results[0]

    if (!latest) {
      throw new Error(`${code} 未取到开奖数据`)
    }

    return latest
  })

  if (!loaded) {
    return { gameCode: code, status: 'unavailable', updatedAt: Date.now(), fromCache: false }
  }

  return {
    gameCode: code,
    status: 'drawn',
    result: loaded.data,
    updatedAt: loaded.updatedAt,
    fromCache: loaded.fromCache,
  }
}
