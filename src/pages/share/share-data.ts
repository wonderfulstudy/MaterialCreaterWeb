/**
 * 分享页的纯数据逻辑：彩种清单、勾选状态、下载文件名。
 * 不引用任何图片资源，便于在 node 环境直接单测。
 */
import type { ResultPosterInput } from '@/components/ResultPoster/types'
import { LATEST_LOTTERIES, type LotteryGameCode } from '@/models/lottery.model'

export interface ShareGameOption {
  code: LotteryGameCode
  name: string
}

/** 7 个数字彩：顺序与开奖页、设计稿 11-share-flow.html 一致 */
export const DIGITAL_GAMES: readonly ShareGameOption[] = LATEST_LOTTERIES.map(({ code, name }) => ({ code, name }))

/** 选择态默认全选 */
export const DEFAULT_SELECTION: LotteryGameCode[] = DIGITAL_GAMES.map(({ code }) => code)

export interface SelectionToggle {
  /** 处理后的勾选结果；blocked 时与原值一致 */
  selected: LotteryGameCode[]
  /** 取消掉最后一个彩种时为 true，由调用方 toast 拦截 */
  blocked: boolean
}

/**
 * 勾选/取消一个彩种，并始终按设计稿彩种顺序保存结果。
 * 至少保留 1 个：取消掉最后一个时不改变选择，只回报 blocked。
 */
export function toggleGameSelection(selected: readonly LotteryGameCode[], code: LotteryGameCode): SelectionToggle {
  if (selected.includes(code)) {
    if (selected.length <= 1) {
      return { selected: [...selected], blocked: true }
    }
    return { selected: selected.filter((item) => item !== code), blocked: false }
  }
  return { selected: DEFAULT_SELECTION.filter((item) => item === code || selected.includes(item)), blocked: false }
}

/** 全选 7 个数字彩 */
export function selectAllGames(): LotteryGameCode[] {
  return [...DEFAULT_SELECTION]
}

export interface ShareDrawEntry {
  code: LotteryGameCode
  input: ResultPosterInput
}

/** 按彩种顺序取出要进海报的开奖结果；没有数据的彩种自动跳过 */
export function pickDrawEntries(
  selected: readonly LotteryGameCode[],
  entries: readonly ShareDrawEntry[]
): ShareDrawEntry[] {
  return DIGITAL_GAMES.filter(({ code }) => selected.includes(code)).flatMap(({ code }) => {
    const found = entries.find((entry) => entry.code === code)
    return found ? [found] : []
  })
}

/** 下载文件名：单个彩种用彩种名，多个彩种标出数量 */
export function sharePosterFileName(entries: readonly ShareDrawEntry[]): string {
  if (entries.length === 0) {
    return '数字彩海报.png'
  }
  if (entries.length === 1) {
    return `${entries[0].input.gameName}-开奖海报.png`
  }
  return `数字彩合集-${entries.length}个彩种-开奖海报.png`
}

/** 分享页来源种类：数字彩合集 + 三种竞彩赛果 + 不支持的来源 */
export type ShareSourceKind = 'draw' | 'jc-football' | 'jc-basketball' | 'jc-traditional' | 'unsupported'

export interface ShareSourceParams {
  /** 竞彩赛果日期 'YYYY-MM-DD' */
  date?: string
  /** 传统足彩期次 */
  issue?: string
}

export interface ResolvedShareSource {
  /** router 里的原始 source 值，缺省回落到 draw */
  source: string
  kind: ShareSourceKind
  /** 标题里的来源名，如 '竞彩足球' */
  title: string
  /** true 表示没有勾选步骤，进页面直接展示海报预览 */
  directPreview: boolean
  /** 竞彩赛果日期；非竞彩来源为空串 */
  date: string
  /** 传足期次；非传足来源为空串 */
  issue: string
}

const SOURCE_TITLES: Record<Exclude<ShareSourceKind, 'unsupported'>, string> = {
  draw: '数字彩合集',
  'jc-football': '竞彩足球',
  'jc-basketball': '竞彩篮球',
  'jc-traditional': '传统足彩',
}

const SOURCE_KINDS: readonly ShareSourceKind[] = ['draw', 'jc-football', 'jc-basketball', 'jc-traditional']

function isKnownSource(source: string): source is Exclude<ShareSourceKind, 'unsupported'> {
  return (SOURCE_KINDS as readonly string[]).includes(source)
}

/**
 * router 的 source/date/issue → 页面要用的来源种类与标题。
 * 竞彩三种来源没有勾选步骤（直接进预览态），参数只各取所需：
 * 足球/篮球用 date，传足用 issue。
 */
export function resolveShareSource(
  source: string | undefined,
  params: ShareSourceParams = {}
): ResolvedShareSource {
  const normalized = source || 'draw'
  const kind: ShareSourceKind = isKnownSource(normalized) ? normalized : 'unsupported'
  const isSport = kind === 'jc-football' || kind === 'jc-basketball'

  return {
    source: normalized,
    kind,
    title: kind === 'unsupported' ? '分享海报' : SOURCE_TITLES[kind],
    directPreview: kind !== 'draw' && kind !== 'unsupported',
    date: isSport ? (params.date ?? '') : '',
    issue: kind === 'jc-traditional' ? (params.issue ?? '') : '',
  }
}

/** 三种竞彩来源的下载文件名：日期/期次能区分同期多张海报 */
export function shareSportPosterFileName(resolved: ResolvedShareSource): string {
  const suffix = resolved.issue ? `-${resolved.issue}期` : resolved.date ? `-${resolved.date}` : ''
  return `${resolved.title}${suffix}-赛果海报.png`
}
