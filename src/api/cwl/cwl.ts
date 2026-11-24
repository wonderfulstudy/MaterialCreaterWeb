import { requestProxy } from '../proxy'
import { CwlHistory } from "./cwl.dto";

/** 代理路由：game 取 ssq / qlc / kl8，固定 issueCount=30 */
const CWL_HISTORY_PATH = '/api/lottery/cwl'

async function getCwlHistory<T>(game: string): Promise<T> {
    const { data } = await requestProxy<T>(CWL_HISTORY_PATH, { game, issueCount: 30 })

    return data
}

export function getSsqHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>('ssq')
}

export function getKL8History(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>('kl8')
}

/** 上游 findDrawNotice 支持 3d，但代理契约（API.r1）暂未列出该 game，按同路径透传 */
export function get3DHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>('3d')
}

export function getQlcHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>('qlc')
}
