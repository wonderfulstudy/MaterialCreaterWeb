import Taro from "@tarojs/taro";
import AppConfig from "@/config/app";
import type { GameTypeKey } from "@/components/PlanCalculator/model";

// 竞足 / 竞篮 计算器接口地址
const CALCULATOR_URL: Record<GameTypeKey, string> = {
    football: AppConfig.app.football_base_url,
    basketball: AppConfig.app.basketball_base_url,
}

export async function getMatchCalculator<matchCalculator>(
    channel: string = "c",
    gameType: GameTypeKey = "football",
): Promise<matchCalculator> {
    const resp = await Taro.request<matchCalculator>({
        url: CALCULATOR_URL[gameType],
        method: 'GET',
        data: { channel }
    })

    if ( resp.statusCode !== 200 ) {
        throw new Error(`请求失败：HTTP ${resp.statusCode}`)
    }

    return resp.data
}