import Taro from "@tarojs/taro";
import { CwlHistory } from "./cwl.dto";
import AppConfig from "@/config/app";

async function getCwlHistory<T>(
    name: string,
    issueCount = 30
): Promise<T> {
    const resp = await Taro.request<T>({
        url: AppConfig.app.cwl_base_url,
        method: 'GET',
        data: { name, issueCount}
    })

    if (resp.statusCode !== 200) {
        throw new Error(`请求失败：HTTP ${resp.statusCode}`)
    }

    return resp.data
}

export function getSsqHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>(AppConfig.games.SSQ.gameFlag)
}

export function getKL8History(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>(AppConfig.games.KL8.gameFlag)
}

export function get3DHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>(AppConfig.games.ThreeD.gameFlag)
}

export function getQlcHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>(AppConfig.games.QLC.gameFlag)
}
