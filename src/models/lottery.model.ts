import type { CwlHistory } from '../api/cwl/cwl.dto'
import type { LotteryHistory } from '../api/lottery/lottery.dto'

/**
 * 开奖页展示的数字彩彩种及顺序，顺序即页面纵向顺序。
 * numberType 决定号码展示形态；3D（fc3d）已按需求下线，不再登记。
 */
export const LATEST_LOTTERIES = [
  { code: 'dlt', name: '大乐透', numberType: 'red-blue' },
  { code: 'ssq', name: '双色球', numberType: 'red-blue' },
  { code: 'qxc', name: '七星彩', numberType: 'red-blue' },
  { code: 'pl3', name: '排列3', numberType: 'single' },
  { code: 'pl5', name: '排列5', numberType: 'single' },
  { code: 'qlc', name: '七乐彩', numberType: 'red-blue' },
  { code: 'kl8', name: '快乐8', numberType: 'single' },
] as const

export type LotteryGameCode = (typeof LATEST_LOTTERIES)[number]['code']

/**
 * 应用内部统一的开奖结果模型。
 * 各数据源的 DTO 由对应 mapper 转换为此结构，页面只消费该模型。
 */
export interface LotteryResult {
  /** 应用内彩种标识，如 'ssq'、'dlt' */
  gameCode: LotteryGameCode
  /** 彩种名称，来自接口返回 */
  name: string
  /** 期号，保留字符串避免丢失前导零 */
  issue: string
  /** 开奖日期，如 '2026-11-02' */
  drawDate: string
  /** 红球/主号码，保留字符串 */
  redNumbers: string[]
  /** 蓝球/附加号码；无蓝球的彩种为空数组 */
  blueNumbers: string[]
}

/** 每张卡片都带数据时间，断网时用它标注「更新于 …」 */
interface LatestGameMeta {
  /** 本次数据的落库时间（毫秒）；来自缓存时为上次成功的时间 */
  updatedAt: number
  /** true 表示本次请求失败，数据来自本地缓存 */
  fromCache: boolean
}

/** 开奖页聚合后的单彩种结果：已开奖或暂无数据 */
export type LatestLotteryGame =
  | ({ gameCode: LotteryGameCode; status: 'drawn'; result: LotteryResult } & LatestGameMeta)
  | ({ gameCode: LotteryGameCode; status: 'unavailable' } & LatestGameMeta)

/** 将逗号分隔的号码串拆为字符串数组，空串返回空数组 */
function splitNumbers(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }
  return trimmed.split(',').map((n) => n.trim())
}

/** 福彩 date 形如 '2026-11-03(二)'，去掉星期后缀只留日期 */
function normalizeCwlDate(value: string): string {
  return value.trim().split('(')[0]
}

/**
 * 福彩（CWL）历史开奖 DTO → 内部模型。
 * dto.result 按期号倒序返回，这里保持接口顺序，由调用方决定取最新一期。
 * cwl.gov.cn 偶发返回 null 响应体（反爬/限流），此时返回空数组，
 * 由调用方（fetchLatestGame）标记该彩种为 unavailable。
 */
export function mapCwlHistory(dto: CwlHistory, gameCode: string): LotteryResult[] {
  if (!dto || !Array.isArray(dto.result)) {
    return []
  }

  return dto.result.map((item) => ({
    gameCode: gameCode as LotteryGameCode,
    name: item.name,
    issue: item.code,
    drawDate: normalizeCwlDate(item.date),
    redNumbers: splitNumbers(item.red),
    blueNumbers: splitNumbers(item.blue),
  }))
}

/** 体彩各彩种的红球数量；未列出的彩种全部号码归入红球 */
const LOTTERY_RED_COUNT: Partial<Record<LotteryGameCode, number>> = {
  dlt: 5,
  qxc: 6,
}

/**
 * 体彩（sporttery）历史开奖 DTO → 内部模型。
 * 奖期列表位于 dto.value.list；lotteryDrawResult 为空格分隔的号码串，
 * 按彩种拆分红蓝区；lotteryDrawTime 取日期部分。
 * 接口异常返回 null 或缺少 value.list 时返回空数组。
 */
export function mapLotteryHistory(dto: LotteryHistory, gameCode: string): LotteryResult[] {
  if (!dto || !dto.value || !Array.isArray(dto.value.list)) {
    return []
  }

  const redCount = LOTTERY_RED_COUNT[gameCode as LotteryGameCode]

  return dto.value.list.map((item) => {
    const numbers = item.lotteryDrawResult.trim().split(/\s+/)
    const redNumbers = redCount === undefined ? numbers : numbers.slice(0, redCount)
    const blueNumbers = redCount === undefined ? [] : numbers.slice(redCount)

    return {
      gameCode: gameCode as LotteryGameCode,
      name: item.lotteryGameName,
      issue: item.lotteryDrawNum,
      drawDate: item.lotteryDrawTime.split(' ')[0],
      redNumbers,
      blueNumbers,
    }
  })
}
