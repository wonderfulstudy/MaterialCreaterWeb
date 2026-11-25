/**
 * 三类终端报表的「销售金额」解析（REQUIREMENTS.r6 FR-15 / §3.5，版式见 research/RECEIPT-OCR.md）。
 *
 * 纯函数：不引入 Taro、不发网络请求，结果只由入参文本决定，便于单测。
 * 只取金额：票数 / 兑奖 / 取消 / 应退 一律忽略（m00209 / m02026-6）。
 */
import { JC_SUBGAME_DEFINITIONS, type Granularity, type JcSubgameKey, type SalesGameKey } from '@/api/business/games'

export interface ReceiptItem {
  gameKey: SalesGameKey
  /** 销售金额，单位分 */
  salesCents: number
  granularity: Granularity
}

export type ReceiptKind = 'game' | 'jingcai' | 'subgame' | 'unknown'

export interface ReceiptResult {
  kind: ReceiptKind
  items: ReceiptItem[]
}

/** 金额只认数字 + 小写点，容忍千分位逗号；元 → 分四舍五入到整分 */
const MONEY_PATTERN = /[0-9][0-9,]*(?:\.[0-9]+)?/

/** 「销售(已减取消)」与「销售(已减取消应退)」两种模板写法，容忍空格与全角括号 */
const SALES_LABEL = /销售\s*[（(]?\s*已减取消\s*(?:应退)?\s*[）)]?/

/** 合计块不属于任何单个游戏 */
const TOTAL_LABEL = /合计/

/** 去掉空白与报表里的连接符，便于游戏名 / 玩法名比对（「竞彩足球-比分」→「竞彩足球比分」） */
function compact(text: string): string {
  return text.replace(/[\s\-－—·•]/g, '')
}

/** 「1,099.00」→ 109900；非法输入返回 null（留空由调用方按 0 处理） */
export function yuanTextToCents(token: string): number | null {
  const plain = token.replace(/,/g, '').trim()
  const match = /^(\d+)(?:\.(\d+))?$/.exec(plain)
  if (!match) return null
  const yuan = Number(match[1])
  if (!Number.isFinite(yuan)) return null
  const fraction = match[2] ?? ''
  let cents = yuan * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'))
  // 终端最多给两位小数；多余位按四舍五入丢弃，避免出现半个「分」
  if (fraction.length > 2 && Number(fraction[2]) >= 5) cents += 1
  return cents
}

/** 取一行文本里的第一个金额（元 → 分），没有金额返回 null */
export function parseAmountToCents(text: string): number | null {
  const match = MONEY_PATTERN.exec(text)
  if (!match) return null
  return yuanTextToCents(match[0])
}

/** 只匹配销售行，卖出金额取标签之后的第一段数字（票数在金额后面，自然被忽略） */
function salesCentsOf(line: string): number | null {
  const label = SALES_LABEL.exec(line)
  if (!label) return null
  return parseAmountToCents(line.slice(label.index + label[0].length))
}

/** 游戏时段报表里的游戏名 → 10 个大类键；长名优先，避免「6场半全场胜平负」被「胜平负」抢先 */
const GAME_NAMES = ([
  { key: 'qxc', name: '7星彩' },
  { key: 'qxc', name: '七星彩' },
  { key: 'pl3', name: '排列3' },
  { key: 'pl3', name: '排列三' },
  { key: 'pl5', name: '排列5' },
  { key: 'pl5', name: '排列五' },
  { key: 'dlt', name: '超级大乐透' },
  { key: 'dlt', name: '大乐透' },
  { key: 'sfc', name: '足球胜平负' },
  { key: 'sfc', name: '足球胜负彩' },
  { key: 'sfc9', name: '胜平负任选9场' },
  { key: 'sfc9', name: '任选9场' },
  { key: 'sfc9', name: '任选9' },
  { key: 'sfc4', name: '足球4场进球' },
  { key: 'sfc4', name: '4场进球' },
  { key: 'sfc6', name: '足球6场半全场胜平负' },
  { key: 'sfc6', name: '6场半全场胜平负' },
  { key: 'sfc6', name: '6场半全场' },
] as Array<{ key: SalesGameKey; name: string }>).sort((left, right) => right.name.length - left.name.length)

function matchGameName(line: string): SalesGameKey | null {
  const text = compact(line)
  for (const entry of GAME_NAMES) {
    if (text.indexOf(entry.name) >= 0) return entry.key
  }
  return null
}

/** §3.5 的 13 个玩法名（终端标题「玩法名称：竞彩足球-比分」去掉连接符后即命中） */
const SUBGAME_NAMES: Array<{ key: JcSubgameKey; name: string }> = JC_SUBGAME_DEFINITIONS.map((item) => ({
  key: item.key,
  name: item.label,
})).sort((left, right) => right.name.length - left.name.length)

function matchSubgameName(line: string): JcSubgameKey | null {
  const text = compact(line)
  for (const entry of SUBGAME_NAMES) {
    if (text.indexOf(entry.name) >= 0) return entry.key
  }
  return null
}

/**
 * 游戏时段报表（8 个游戏 + 合计）→ 10 个大类明细。
 *
 * 块内结构是「游戏名称: X」在前、「销售(已减取消): 金额元 票数张」在后（两条 OCR 行），
 * 所以先记住当前游戏，再取紧随其后的销售行；合计块重置当前游戏，不会被挂到最后一个游戏上。
 */
export function parseGameReport(lines: string[]): ReceiptItem[] {
  const items: ReceiptItem[] = []
  const seen: SalesGameKey[] = []
  let current: SalesGameKey | null = null

  for (const raw of lines) {
    if (!raw) continue
    if (TOTAL_LABEL.test(raw)) {
      current = null
      continue
    }

    const named = matchGameName(raw)
    if (named) current = named

    const cents = salesCentsOf(raw)
    if (cents === null || !current) continue
    if (seen.indexOf(current) >= 0) continue
    seen.push(current)
    items.push({ gameKey: current, salesCents: cents, granularity: 'total' })
  }

  return items
}

/** 竞彩时段报表 → 只产出 { gameKey: 'jczq', salesCents }；只取第一块销售行（「销售员：合计」是重复块） */
export function parseJingcaiReport(lines: string[]): ReceiptItem[] {
  for (const raw of lines) {
    if (!raw) continue
    const cents = salesCentsOf(raw)
    if (cents === null) continue
    return [{ gameKey: 'jczq', salesCents: cents, granularity: 'total' }]
  }
  return []
}

/** 其他游戏时段报表（玩法明细，一次只出一个玩法）→ 13 个子玩法之一，granularity=detail */
export function parseSubgameReport(lines: string[]): ReceiptItem[] {
  let key: JcSubgameKey | null = null

  for (const raw of lines) {
    if (!raw) continue
    if (!key) key = matchSubgameName(raw)
    const cents = salesCentsOf(raw)
    if (cents === null) continue
    // 没认出玩法名就不落库：宁可留空，也不把金额挂到错误的玩法上
    if (!key) return []
    return [{ gameKey: key, salesCents: cents, granularity: 'detail' }]
  }

  return []
}

/** 按报表标题分流：玩法明细 → 竞彩总额 → 游戏时段报表 */
export function parseReceiptLines(lines: string[]): ReceiptResult {
  const text = compact(lines.join(''))
  if (!text) return { kind: 'unknown', items: [] }

  if (text.indexOf('玩法名称') >= 0) return { kind: 'subgame', items: parseSubgameReport(lines) }
  if (text.indexOf('竞彩时段报表') >= 0) return { kind: 'jingcai', items: parseJingcaiReport(lines) }
  if (text.indexOf('游戏时段报表') >= 0 || text.indexOf('游戏名称') >= 0) {
    return { kind: 'game', items: parseGameReport(lines) }
  }
  return { kind: 'unknown', items: [] }
}
