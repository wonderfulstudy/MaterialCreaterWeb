import {
  MAX_MATCH,
  MULTI_PASS_OPTIONS,
  type PlanLeg,
  type SelectionSummary,
  type SportKey,
  type SportMatch,
} from '@/components/PlanCalculator/model'
import { formatAmount, planOdds, summarizeLegs } from '@/components/PlanCalculator/calc'
import type { PresetId, StoredPreset } from '@/services/preset-store'

/** 每场取赔率最高还是最低的选项 */
export type PresetPick = 'max' | 'min'

export interface PresetDef {
  id: PresetId
  name: string
  pick: PresetPick
}

/** 方案页签固定两个预设系列 */
export const PRESET_DEFS: PresetDef[] = [
  { id: 'max', name: '最高赔率预设', pick: 'max' },
  { id: 'min', name: '最低赔率预设', pick: 'min' },
]

export interface PresetPassOption {
  id: string
  label: string
  /** 过关方式展开的场次数，与 plan-store 的 passSizes 同口径 */
  sizes: number[]
}

const DEFAULT_PASS: PresetPassOption = { id: 'p3x1', label: '3串1', sizes: [3] }

/** 预设只在胜平负/让球胜平负里挑：半全场与比分能到上百倍，串起来奖金百万级、方案看不明白（D88） */
const PRESET_POOL_CODES: PlanLeg['poolCode'][] = ['HAD', 'HHAD']

/** 配置页串法按钮组：单关 / 2串1 / 3串1 / M串N（M串N 展开到多串档位） */
export const PRESET_PASS_OPTIONS: PresetPassOption[] = [
  { id: 'single', label: '单关', sizes: [1] },
  { id: 'p2x1', label: '2串1', sizes: [2] },
  DEFAULT_PASS,
  ...MULTI_PASS_OPTIONS.map((option) => ({ id: option.id, label: option.label, sizes: [...option.sizes] })),
]

/** 主按钮「M串N」落到第一档多串 */
export const MULTI_PASS_FALLBACK_ID = MULTI_PASS_OPTIONS[0].id

/** 候选组合的比赛池上限：C(8, 5) 已经是 56 条，再多就是爆炸 */
export const PRESET_MATCH_POOL = Math.min(8, MAX_MATCH)

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Date → 2026-11-25 */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function findPresetPass(id?: string): PresetPassOption {
  return PRESET_PASS_OPTIONS.find((option) => option.id === id) ?? DEFAULT_PASS
}

export function findPresetPassByLabel(label?: string): PresetPassOption {
  return PRESET_PASS_OPTIONS.find((option) => option.label === label) ?? DEFAULT_PASS
}

export function isMultiPass(option: PresetPassOption): boolean {
  return option.sizes.length > 1
}

/** 取今天的场次；当天没场次就用最近一天，避免预设整天空着 */
export function pickDayMatches(matches: SportMatch[], today = todayKey()): SportMatch[] {
  const dated = matches.filter((match) => Boolean(match.businessDate))
  if (!dated.length) {
    return matches
  }
  const todays = dated.filter((match) => match.businessDate === today)
  if (todays.length) {
    return todays
  }
  const nearest = dated.map((match) => match.businessDate).sort()[0]
  return dated.filter((match) => match.businessDate === nearest)
}

interface PickedLeg {
  match: SportMatch
  leg: PlanLeg
}

/** 该场所有玩法里赔率最高 / 最低的那个选项 */
function pickLeg(match: SportMatch, pick: PresetPick, sport: SportKey): PlanLeg | null {
  let picked: { poolCode: PlanLeg['poolCode']; poolName: string; line: string; key: string; label: string; odds: number } | null =
    null

  match.rows.forEach((row) => {
    if (!PRESET_POOL_CODES.includes(row.poolCode)) {
      return
    }
    row.options.forEach((option) => {
      if (!picked) {
        picked = { poolCode: row.poolCode, poolName: row.title, line: row.line, key: option.key, label: option.label, odds: option.odds }
        return
      }
      const better = pick === 'max' ? option.odds > picked.odds : option.odds < picked.odds
      if (better) {
        picked = { poolCode: row.poolCode, poolName: row.title, line: row.line, key: option.key, label: option.label, odds: option.odds }
      }
    })
  })

  const chosen = picked as { poolCode: PlanLeg['poolCode']; poolName: string; line: string; key: string; label: string; odds: number } | null
  if (!chosen) {
    return null
  }

  return {
    sport,
    matchId: match.matchId,
    matchNumStr: match.matchNumStr,
    league: match.league,
    matchDate: match.matchDate,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    poolCode: chosen.poolCode,
    poolName: chosen.poolName,
    goalLine: chosen.line,
    optionKey: chosen.key,
    optionLabel: chosen.label,
    odds: chosen.odds,
  }
}

/** 比赛池：按该场最高（或最低）赔率排序取前 8 场 */
function presetPool(matches: SportMatch[], pick: PresetPick, sport: SportKey): PickedLeg[] {
  const picked = matches
    .map((match) => ({ match, leg: pickLeg(match, pick, sport) }))
    .filter((item): item is { match: SportMatch; leg: PlanLeg } => Boolean(item.leg))

  const sorted = picked.slice().sort((left, right) => (pick === 'max' ? right.leg.odds - left.leg.odds : left.leg.odds - right.leg.odds))
  return sorted.slice(0, PRESET_MATCH_POOL)
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size < 1 || size > items.length) {
    return []
  }
  const result: T[][] = []
  const walk = (start: number, acc: T[]) => {
    if (acc.length === size) {
      result.push([...acc])
      return
    }
    for (let index = start; index < items.length; index += 1) {
      acc.push(items[index])
      walk(index + 1, acc)
      acc.pop()
    }
  }
  walk(0, [])
  return result
}

export interface PresetCandidate {
  /** 1 起的序号，对应「已用第 N 条」 */
  index: number
  legs: PlanLeg[]
  /** 组合赔率（各腿相乘） */
  odds: number
  summary: SelectionSummary
}

/** 候选组合：每场一个结果；最高策略按组合赔率从高到低，最低策略从低到高（第一条即默认值） */
export function buildPresetCandidates(
  matches: SportMatch[],
  pass: PresetPassOption,
  multiple: number,
  pick: PresetPick,
  sport: SportKey,
): PresetCandidate[] {
  const pool = presetPool(matches, pick, sport)
  const size = Math.max(...pass.sizes)
  const candidates = combinations(pool, size).map((combo) => {
    const legs = combo.map((item) => item.leg)
    return { index: 0, legs, odds: planOdds(legs) ?? 0, summary: summarizeLegs(legs, pass.sizes, multiple) }
  })

  candidates.sort((left, right) => {
    const delta = pick === 'max' ? right.odds - left.odds : left.odds - right.odds
    return delta || left.legs[0].matchId - right.legs[0].matchId
  })
  return candidates.map((candidate, index) => ({ ...candidate, index: index + 1 }))
}

export function isCandidateIndex(index: number, count: number): boolean {
  return Number.isInteger(index) && index >= 1 && index <= count
}

/** 选中的候选序号；列表方向已跟随策略，所以第一条就是默认值 */
export function resolveCandidateIndex(index: number, count: number): number {
  return count > 0 && isCandidateIndex(index, count) ? index : 1
}

export interface PresetBuildInput {
  def: PresetDef
  sport: SportKey
  pass: PresetPassOption
  multiple: number
  candidates: PresetCandidate[]
  candidateIndex: number
  date: string
}

/** 候选 + 选中项 → 可落盘的预设快照；没有候选（场次不足）返回 null */
export function buildStoredPreset(input: PresetBuildInput): StoredPreset | null {
  const { def, sport, pass, multiple, candidates, candidateIndex, date } = input
  if (!candidates.length) {
    return null
  }

  const index = resolveCandidateIndex(candidateIndex, candidates.length)
  const chosen = candidates[index - 1]

  return {
    id: def.id,
    name: def.name,
    sport,
    passSizes: [...pass.sizes],
    passLabel: pass.label,
    multiple,
    legs: chosen.legs,
    summary: summarizeLegs(chosen.legs, pass.sizes, multiple),
    candidateIndex: index,
    candidateCount: candidates.length,
    date,
    updatedAt: Date.now(),
  }
}

function legsSignature(preset: StoredPreset): string {
  return preset.legs.map((leg) => `${leg.matchId}:${leg.poolCode}:${leg.optionKey}:${leg.odds}`).join('|')
}

/** 内容是否一致（不看 updatedAt，否则每次同步都算变化） */
export function samePreset(left?: StoredPreset | null, right?: StoredPreset | null): boolean {
  if (!left || !right) {
    return false
  }
  return (
    left.id === right.id &&
    left.date === right.date &&
    left.passLabel === right.passLabel &&
    left.multiple === right.multiple &&
    left.candidateIndex === right.candidateIndex &&
    left.candidateCount === right.candidateCount &&
    left.summary.betCount === right.summary.betCount &&
    left.summary.amount === right.summary.amount &&
    left.summary.minBonus === right.summary.minBonus &&
    left.summary.maxBonus === right.summary.maxBonus &&
    legsSignature(left) === legsSignature(right)
  )
}

/** 周一003 → 003；取不到数字就用原串 */
export function presetMatchNo(leg: PlanLeg): string {
  const digits = leg.matchNumStr.replace(/\D/g, '')
  return digits || leg.matchNumStr
}

/** 「003负 004负 002平」 */
export function presetLegText(legs: PlanLeg[]): string {
  return legs.map((leg) => `${presetMatchNo(leg)}${leg.optionLabel}`).join(' ')
}

/** 「¥3.7」或「¥12.21~30.15」 */
export function presetBonusText(summary: SelectionSummary): string {
  const min = formatAmount(summary.minBonus)
  const max = formatAmount(summary.maxBonus)
  return min === max ? `¥${max}` : `¥${min}~${max}`
}

/** 「3串1 · 2 倍 · 投入 ¥4」 */
export function presetMetaText(preset: Pick<StoredPreset, 'passLabel' | 'multiple' | 'summary'>): string {
  return `${preset.passLabel} · ${preset.multiple} 倍 · 投入 ¥${formatAmount(preset.summary.amount)}`
}
