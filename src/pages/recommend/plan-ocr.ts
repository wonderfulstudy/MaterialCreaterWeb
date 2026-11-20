import {
  POOL_DEFS,
  type OddsOption,
  type PlanLeg,
  type PoolCode,
  type PoolRow,
  type SportKey,
  type SportMatch,
} from '@/components/PlanCalculator/model'
import { extractDate, formatDateKey } from './summary'

export interface RecognizedPick {
  matchNumStr?: string
  poolCode: PoolCode
  optionKeys: string[]
}

export interface ParsedRecommendation {
  text: string
  date?: string
  picks: RecognizedPick[]
}

export interface MatchedRecommendation {
  legs: PlanLeg[]
  note: string
}

const FOOTBALL_POOL_RULES: { code: PoolCode; pattern: RegExp }[] = [
  { code: 'HHAD', pattern: /让球|让分|让胜|让平|让负/ },
  { code: 'HAFU', pattern: /半全场|半场全场/ },
  { code: 'TTG', pattern: /总进球|进球数|总入球/ },
  { code: 'CRS', pattern: /比分|比数|波胆/ },
]

const BASKETBALL_POOL_RULES: { code: PoolCode; pattern: RegExp }[] = [
  { code: 'HDC', pattern: /让分|让分胜负/ },
  { code: 'HILO', pattern: /大小分|大小球|总分大小/ },
  { code: 'WNM', pattern: /胜分差|分差/ },
]

const FOOTBALL_POOL_WORDS = /胜平负|让球胜平负|半全场|总进球|进球数|总入球|比分|比数|波胆|让球|让分/g
const BASKETBALL_POOL_WORDS = /让分胜负|胜负|大小分|大小球|胜分差|让分/g

const POOL_SIGNAL = /胜平负|让球|半全场|进球|比分|让分|胜负|大小分|大小球|分差/
const MATCH_NUM_PATTERN = /(?:周|星期)([一二三四五六日天])(\d{1,3})/

function normalizeLine(line: string): string {
  return line
    .replace(/\s+/g, '')
    .replace(/：/g, ':')
    .replace(/／/g, '/')
}

function detectPool(line: string, sport: SportKey): PoolCode {
  const rules = sport === 'basketball' ? BASKETBALL_POOL_RULES : FOOTBALL_POOL_RULES
  const rule = rules.find((item) => item.pattern.test(line))
  if (rule) {
    return rule.code
  }
  return sport === 'basketball' ? 'MNL' : 'HAD'
}

function detectMatchNum(line: string): string | undefined {
  const matched = line.match(MATCH_NUM_PATTERN)
  if (!matched) {
    return undefined
  }
  return `周${matched[1]}${matched[2].padStart(3, '0')}`
}

function detectFootballOptions(line: string, poolCode: PoolCode): string[] {
  const cleaned = line.replace(FOOTBALL_POOL_WORDS, '')

  if (poolCode === 'TTG') {
    const matched = cleaned.match(/([0-7])\s*\+?\s*球/)
    if (matched) {
      return [`s${matched[1]}`]
    }
    return /7\+/.test(cleaned) ? ['s7'] : []
  }

  if (poolCode === 'CRS') {
    const labelMap = new Map(POOL_DEFS.CRS.options.map((def) => [def.label, def.key]))
    const keys: string[] = []
    const score = cleaned.match(/(\d{1,2})\s*[:比-]\s*(\d{1,2})/)
    if (score) {
      const key = labelMap.get(`${Number(score[1])}:${Number(score[2])}`)
      if (key) {
        keys.push(key)
      }
    }
    ;['胜其他', '平其他', '负其他'].forEach((label) => {
      const key = labelMap.get(label)
      if (key && cleaned.includes(label)) {
        keys.push(key)
      }
    })
    return keys
  }

  if (poolCode === 'HAFU') {
    return POOL_DEFS.HAFU.options
      .filter((def) => cleaned.includes(def.label))
      .map((def) => def.key)
  }

  const keys: string[] = []
  if (/(主胜|让胜|胜)/.test(cleaned)) {
    keys.push('h')
  }
  if (/(平局|让平|平)/.test(cleaned)) {
    keys.push('d')
  }
  if (/(客胜|让负|负)/.test(cleaned)) {
    keys.push('a')
  }
  return Array.from(new Set(keys))
}

function detectBasketballOptions(line: string, poolCode: PoolCode): string[] {
  const cleaned = line.replace(BASKETBALL_POOL_WORDS, '')

  if (poolCode === 'HILO') {
    if (/(大分|大球|大)/.test(cleaned)) {
      return ['h']
    }
    if (/(小分|小球|小)/.test(cleaned)) {
      return ['l']
    }
    return []
  }

  if (poolCode === 'WNM') {
    const keys: string[] = []
    const side = /客胜/.test(line) ? '客胜' : /主胜/.test(line) ? '主胜' : ''
    if (!side) {
      return keys
    }
    POOL_DEFS.WNM.options.forEach((def) => {
      if (!def.label.startsWith(side)) {
        return
      }
      const range = def.label.replace(side, '')
      const start = range.replace('-', '|').replace('+', '|')
      const [from, to] = start.split('|')
      const fromNum = Number(from)
      const toNum = to === undefined ? fromNum : Number(to)
      const hits = cleaned.match(/(\d{1,2})\s*[-~到]\s*(\d{1,2})/)
      if (hits) {
        const low = Number(hits[1])
        if (low >= fromNum && low <= (Number.isFinite(toNum) ? toNum : fromNum)) {
          keys.push(def.key)
        }
      } else if (cleaned.includes(range) || cleaned.includes(String(fromNum))) {
        keys.push(def.key)
      }
    })
    return keys
  }

  const keys: string[] = []
  if (/(主让胜|让分主胜|主胜|主队胜)/.test(cleaned)) {
    keys.push('h')
  }
  if (/(客让胜|让分客胜|客胜|客队胜)/.test(cleaned)) {
    keys.push('a')
  }
  return Array.from(new Set(keys))
}

function detectOptions(line: string, poolCode: PoolCode, sport: SportKey): string[] {
  return sport === 'basketball'
    ? detectBasketballOptions(line, poolCode)
    : detectFootballOptions(line, poolCode)
}

/**
 * 从 OCR 文本中解析场次 / 玩法 / 选项。
 * 识别文本通常是一行场次号 + 一行玩法与选项，解析时会把场次号和玩法向下继承。
 */
export function parseRecommendationText(
  text: string,
  sport: SportKey,
  now: Date = new Date()
): ParsedRecommendation {
  const date = extractDate(text, now)
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  const picks: RecognizedPick[] = []
  let currentNum: string | undefined
  let currentPool: PoolCode | undefined

  lines.forEach((line) => {
    const matchNumStr = detectMatchNum(line)
    if (matchNumStr) {
      currentNum = matchNumStr
    }

    const hasPoolSignal = POOL_SIGNAL.test(line)
    if (hasPoolSignal) {
      currentPool = detectPool(line, sport)
    }

    // 既没有场次号、也没有玩法关键词、赔率或对阵信息的行，通常是干扰文字
    if (
      !matchNumStr &&
      !hasPoolSignal &&
      !/\d+\.\d+/.test(line) &&
      !/(?:vs|VS|对)/.test(line)
    ) {
      return
    }

    const poolCode = hasPoolSignal
      ? detectPool(line, sport)
      : currentPool ?? (sport === 'basketball' ? 'MNL' : 'HAD')
    const optionKeys = detectOptions(line, poolCode, sport)
    if (!optionKeys.length) {
      return
    }

    picks.push({
      matchNumStr: matchNumStr || currentNum,
      poolCode,
      optionKeys,
    })
  })

  return { text, date, picks }
}

function findOption(match: SportMatch, pick: RecognizedPick): { row: PoolRow; option: OddsOption } | undefined {
  const rows = match.rows.filter((row) => row.poolCode === pick.poolCode)
  for (const key of pick.optionKeys) {
    for (const row of rows) {
      const option = row.options.find((item) => item.key === key)
      if (option) {
        return { row, option }
      }
    }
  }
  return undefined
}

/**
 * 把识别结果匹配到赛程赔率上。
 * 优先使用图片中的日期（没有则用今天）对应的赛程；当天没有赛事时回退到最近赛程。
 */
export function matchRecognizedPicks(
  parsed: ParsedRecommendation,
  sport: SportKey,
  matches: SportMatch[],
  now: Date = new Date()
): MatchedRecommendation {
  if (!matches.length) {
    return { legs: [], note: '暂无赛程数据，无法匹配方案' }
  }
  if (!parsed.picks.length) {
    return { legs: [], note: '未识别到可匹配的方案，请手动选择' }
  }

  const dates = Array.from(new Set(matches.map((match) => match.businessDate))).sort()
  const today = formatDateKey(now)
  const preferredDate = parsed.date && dates.includes(parsed.date) ? parsed.date : today
  const dayMatches = matches.filter((match) => match.businessDate === preferredDate)
  const pool = dayMatches.length ? dayMatches : matches
  const compactText = parsed.text.replace(/\s+/g, '')

  const legs: PlanLeg[] = []
  const usedMatchIds = new Set<number>()

  parsed.picks.forEach((pick) => {
    let match: SportMatch | undefined

    if (pick.matchNumStr) {
      match =
        pool.find((item) => item.matchNumStr === pick.matchNumStr) ??
        matches.find((item) => item.matchNumStr === pick.matchNumStr)
    }

    if (!match) {
      match = pool.find(
        (item) => compactText.includes(item.homeTeam) && compactText.includes(item.awayTeam)
      )
    }

    if (!match && !pick.matchNumStr && pool.length === 1) {
      match = pool[0]
    }

    if (!match || usedMatchIds.has(match.matchId)) {
      return
    }

    const found = findOption(match, pick)
    if (!found) {
      return
    }

    legs.push({
      sport,
      matchId: match.matchId,
      matchNumStr: match.matchNumStr,
      league: match.league,
      matchDate: match.businessDate,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      poolCode: pick.poolCode,
      poolName: found.row.title,
      goalLine: found.row.line,
      optionKey: found.option.key,
      optionLabel: found.option.label,
      odds: found.option.odds,
    })
    usedMatchIds.add(match.matchId)
  })

  if (!legs.length) {
    return { legs, note: '未匹配到当前赛程，请手动选择方案' }
  }

  return {
    legs,
    note: dayMatches.length ? `已匹配 ${preferredDate} 赛程` : '当前日期无赛事，已匹配最近赛程',
  }
}
