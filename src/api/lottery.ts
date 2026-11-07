import Taro from "@tarojs/taro";
import AppConfig from "@/config/app";
import { LotteryHistory } from "./lottery.dto";

async function getLotteryHistory<T>(
    gameNo: string,
    provinceId: number = 0,
    isVerify: number = 1,
    pageSize: number = 30,
    pageNo: number = 1,
): Promise<T> {
    const resp = await Taro.request<T>({
        url: AppConfig.app.lottery_base_url,
        method: 'GET',
        data: { gameNo, provinceId, isVerify, pageSize, pageNo}
    })

    if (resp.statusCode !== 200) {
        throw new Error(`请求失败：HTTP ${resp.statusCode}`)
    }

    return resp.data
}

export function getDltHistory(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>(AppConfig.games.DLT.gameFlag)
}

export function getQxcHistory(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>(AppConfig.games.QXC.gameFlag)
}

export function getPl3History(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>(AppConfig.games.PL3.gameFlag)
}

export function getPl5History(): Promise<LotteryHistory> {
  return getLotteryHistory<LotteryHistory>(AppConfig.games.PL5.gameFlag)
}