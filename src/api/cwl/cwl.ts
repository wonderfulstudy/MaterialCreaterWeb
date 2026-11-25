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

export function getQlcHistory(): Promise<CwlHistory> {
    return getCwlHistory<CwlHistory>('qlc')
}
