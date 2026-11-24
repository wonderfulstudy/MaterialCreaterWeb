import { requestProxy } from '../proxy'
import { LotteryHistory } from "./lottery.dto";

/** 代理路由：game 取 dlt / pl3 / pl5 / qxc，固定 provinceId=0&pageSize=30&isVerify=1 */
const LOTTERY_HISTORY_PATH = '/api/lottery/history'

async function getLotteryHistory<T>(game: string): Promise<T> {
    const { data } = await requestProxy<T>(LOTTERY_HISTORY_PATH, { game, pageNo: 1 })

    return data
}

export function getDltHistory(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>('dlt')
}

export function getQxcHistory(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>('qxc')
}

export function getPl3History(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>('pl3')
}

export function getPl5History(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>('pl5')
}
