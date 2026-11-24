import type { GameTypeKey } from "@/components/PlanCalculator/model";
import { requestProxy } from "@/api/proxy";

/**
 * 竞彩计算器（赛程 + 赔率）统一走自建代理，前端不再直连上游。
 * 上游原始响应体原样透传，字段见 components/PlanCalculator/schedule.ts 的 RawCalculatorResponse。
 */
const CALCULATOR_PATH: Record<GameTypeKey, string> = {
    football: "/api/jc/football",
    basketball: "/api/jc/basketball",
}

/** 拉取竞彩计算器数据：channel 缺省 c，玩法组合由代理按运动给缺省值 */
export async function getMatchCalculator<T = unknown>(
    channel: string = "c",
    gameType: GameTypeKey = "football",
): Promise<T> {
    const result = await requestProxy<T>(CALCULATOR_PATH[gameType], { channel })
    return result.data
}
