import type { SelectionSummary, SportMatch } from '@/components/PlanCalculator/model'
import {
  PRESET_DEFS,
  PRESET_PASS_OPTIONS,
  PRESET_MATCH_POOL,
  buildPresetCandidates,
  buildStoredPreset,
  findPresetPass,
  findPresetPassByLabel,
  isMultiPass,
  presetBonusText,
  presetLegText,
  resolveCandidateIndex,
  samePreset,
  presetAvailableMatches,
  todayKey,
  type PresetMatrixInput,
  type PresetMatrixRow,
} from './preset-plan'

const TODAY = '2026-11-25'

function match(
  id: number,
  had: { key: string; label: string; odds: number },
  hhad: { key: string; label: string; odds: number },
  businessDate = TODAY,
): SportMatch {
  return {
    matchId: id,
    matchNum: id,
    matchNumStr: `周一00${id}`,
    matchWeek: '周一',
    businessDate,
    matchDate: businessDate,
    matchTime: '20:00',
    league: '测试联赛',
    homeTeam: `主队${id}`,
    awayTeam: `客队${id}`,
    homeRank: '',
    awayRank: '',
    backColor: '',
    bettingSingle: 0,
    rows: [
      { poolCode: 'HAD', title: '胜平负', line: '', options: [had] },
      { poolCode: 'HHAD', title: '让球胜平负', line: '-1', options: [hhad] },
    ],
  }
}

/** 每场两种玩法各一个选项：001 胜@3.15 / 让胜@2.10，002 平@3.30 / 让平@5.30，003 负@4.50 / 让负@6.00 */
const MATCHES: SportMatch[] = [
  match(1, { key: 'h', label: '胜', odds: 3.15 }, { key: 'h', label: '让胜', odds: 2.1 }),
  match(2, { key: 'd', label: '平', odds: 3.3 }, { key: 'd', label: '让平', odds: 5.3 }),
  match(3, { key: 'a', label: '负', odds: 4.5 }, { key: 'a', label: '让负', odds: 6 }),
]

/** 矩阵快照行：与 services/matrix-store 的落盘结构同形 */
function rowsOf(matches: SportMatch[]): PresetMatrixRow[] {
  return matches.map((match) => ({
    matchId: match.matchId,
    matchNo: match.matchNumStr,
    league: match.league,
    home: match.homeTeam,
    away: match.awayTeam,
    cells: match.rows.map((row) => ({
      poolCode: row.poolCode,
      line: row.line,
      options: row.options.map((option) => ({ optionKey: option.key, label: option.label, odds: option.odds })),
    })),
  }))
}

function matrixOf(matches: SportMatch[]): PresetMatrixInput {
  return { rows: rowsOf(matches), date: TODAY, sport: 'football' }
}

const PASS_2X1 = findPresetPass('p2x1')
const PASS_3X1 = findPresetPass('p3x1')

describe('preset-plan 候选生成', () => {
  it('最高赔率预设 2串1：按组合赔率降序，首条即默认', () => {
    const candidates = buildPresetCandidates(matrixOf(MATCHES), PASS_2X1, 2, 'max')

    expect(candidates.map((item) => item.odds)).toEqual([31.8, 18.9, 16.7])
    expect(presetLegText(candidates[0].legs)).toBe('003让负 002让平')
    expect(candidates[0].summary.betCount).toBe(1)
    expect(candidates[0].summary.amount).toBe(4)

    const preset = buildStoredPreset({
      def: PRESET_DEFS[0],
      sport: 'football',
      pass: PASS_2X1,
      multiple: 2,
      candidates,
      candidateIndex: 0,
      date: TODAY,
    })
    expect(preset?.candidateIndex).toBe(1)
    expect(preset?.legs.map((leg) => leg.matchId)).toEqual([3, 2])
    expect(preset?.passLabel).toBe('2串1')
    expect(preset?.summary.maxBonus).toBeCloseTo(127.2, 6)
    expect(preset?.summary.minBonus).toBeCloseTo(127.2, 6)
  })

  it('比分/总进球/半全场不进候选：只认胜平负与让球胜平负，冷门高赔率不参与', () => {
    const withLongshot: SportMatch[] = [
      {
        ...MATCHES[0],
        rows: [
          ...MATCHES[0].rows,
          { poolCode: 'CRS', title: '比分', line: '', options: [{ key: 's00s05', label: '0:5', odds: 1000 }] },
          { poolCode: 'TTG', title: '总进球', line: '', options: [{ key: 's7', label: '7+球', odds: 900 }] },
        ],
      },
      ...MATCHES.slice(1),
    ]

    const candidates = buildPresetCandidates(matrixOf(withLongshot), PASS_2X1, 1, 'max')
    expect(candidates[0].legs.map((leg) => leg.poolCode)).toEqual(['HHAD', 'HHAD'])
    expect(candidates[0].legs.map((leg) => leg.odds)).toEqual([6, 5.3])
  })

  it('最低赔率预设 2串1：按组合赔率升序，首条即默认', () => {
    const candidates = buildPresetCandidates(matrixOf(MATCHES), PASS_2X1, 1, 'min')

    expect(candidates.map((item) => item.odds)).toEqual([6.93, 9.45, 14.85])
    expect(presetLegText(candidates[0].legs)).toBe('001让胜 002平')

    const preset = buildStoredPreset({
      def: PRESET_DEFS[1],
      sport: 'football',
      pass: PASS_2X1,
      multiple: 1,
      candidates,
      candidateIndex: 0,
      date: TODAY,
    })
    expect(preset?.candidateIndex).toBe(1)
    expect(preset?.legs.map((leg) => leg.optionLabel)).toEqual(['让胜', '平'])
    expect(preset?.summary.amount).toBe(2)
  })

  it('切到 3串1 只留一条候选，点第二条即换成第二条的内容', () => {
    const candidates = buildPresetCandidates(matrixOf(MATCHES), PASS_3X1, 1, 'max')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].odds).toBe(100.17)

    const two = buildPresetCandidates(matrixOf(MATCHES), PASS_2X1, 1, 'max')
    const picked = buildStoredPreset({
      def: PRESET_DEFS[0],
      sport: 'football',
      pass: PASS_2X1,
      multiple: 1,
      candidates: two,
      candidateIndex: 2,
      date: TODAY,
    })
    expect(picked?.candidateIndex).toBe(2)
    expect(picked?.legs).toEqual(two[1].legs)
    expect(presetLegText(two[1].legs)).toBe('003让负 001胜')
  })

  it('倍数改动即时进入摘要与金额', () => {
    const one = buildPresetCandidates(matrixOf(MATCHES), PASS_2X1, 1, 'max')[0]
    const five = buildPresetCandidates(matrixOf(MATCHES), PASS_2X1, 5, 'max')[0]

    expect(one.summary.amount).toBe(2)
    expect(five.summary.amount).toBe(10)
    expect(five.summary.maxBonus).toBe(one.summary.maxBonus * 5)
  })

  it('M串N（3串4）按 [2,3] 复式算 4 注', () => {
    const multi = findPresetPass('p3x4')
    expect(isMultiPass(multi)).toBe(true)

    const candidates = buildPresetCandidates(matrixOf(MATCHES), multi, 1, 'max')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].summary.betCount).toBe(4)
    expect(candidates[0].summary.amount).toBe(8)
    // 一条候选每场只有一个结果，最高与最低奖金相同
    expect(candidates[0].summary.minBonus).toBe(candidates[0].summary.maxBonus)
  })

  it('场次不足时没有候选，预设不生成', () => {
    const few = MATCHES.slice(0, 2)
    expect(buildPresetCandidates(matrixOf(few), PASS_3X1, 1, 'max')).toEqual([])
    expect(
      buildStoredPreset({
        def: PRESET_DEFS[0],
        sport: 'football',
        pass: PASS_3X1,
        multiple: 1,
        candidates: [],
        candidateIndex: 1,
        date: TODAY,
      }),
    ).toBeNull()
  })

  it('比赛池按赔率排序后最多 8 场', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      match(index + 1, { key: 'h', label: '胜', odds: 1.5 + index * 0.1 }, { key: 'hh', label: '胜胜', odds: 2 + index * 0.1 }),
    )
    const candidates = buildPresetCandidates(matrixOf(many), findPresetPass('single'), 1, 'max')
    expect(candidates).toHaveLength(PRESET_MATCH_POOL)
  })
})

describe('preset-plan 口径与文案', () => {
  it('矩阵里没选场次就不生成候选（AC-22）', () => {
    expect(buildPresetCandidates({ rows: [], date: TODAY, sport: 'football' }, PASS_2X1, 1, 'max')).toEqual([])
    expect(presetAvailableMatches([])).toBe(0)
  })

  it('只数有胜平负/让球胜平负选项的场次', () => {
    const rows: PresetMatrixRow[] = [
      { matchId: 1, cells: [] },
      { matchId: 2, cells: [{ poolCode: 'CRS', options: [{ optionKey: 's00s05', label: '0:5', odds: 500 }] }] },
      { matchId: 3, cells: [{ poolCode: 'HAD', options: [{ optionKey: 'h', label: '胜', odds: 2.4 }] }] },
    ]
    expect(presetAvailableMatches(rows)).toBe(1)
    expect(buildPresetCandidates({ rows, date: TODAY, sport: 'football' }, findPresetPass('single'), 1, 'max')).toHaveLength(1)
  })
  it('选中序号非法时回落到第一条', () => {
    expect(resolveCandidateIndex(9, 3)).toBe(1)
    expect(resolveCandidateIndex(2, 3)).toBe(2)
    expect(resolveCandidateIndex(0, 0)).toBe(1)
  })

  it('串法 id / label 双向回落', () => {
    expect(findPresetPass().label).toBe('3串1')
    expect(findPresetPassByLabel('最高赔率').label).toBe('3串1')
    expect(findPresetPassByLabel('3串4').sizes).toEqual([2, 3])
    expect(PRESET_PASS_OPTIONS.map((item) => item.label)).toContain('单关')
    expect(isMultiPass(findPresetPass('single'))).toBe(false)
  })

  it('奖金文案：单值不带区间，复式带区间', () => {
    const flat: SelectionSummary = {
      matchCount: 2,
      optionCount: 2,
      parlayCount: 1,
      betCount: 1,
      multiple: 1,
      amount: 2,
      maxBonus: 63.6,
      minBonus: 63.6,
    }
    const ranged: SelectionSummary = { ...flat, betCount: 6, amount: 12, minBonus: 12.21, maxBonus: 30.15 }

    expect(presetBonusText(flat)).toBe('¥63.6')
    expect(presetBonusText(ranged)).toBe('¥12.21~30.15')
  })

  it('samePreset 忽略 updatedAt，但内容变了要算变化', () => {
    const candidates = buildPresetCandidates(matrixOf(MATCHES), PASS_2X1, 1, 'max')
    const base = buildStoredPreset({
      def: PRESET_DEFS[0],
      sport: 'football',
      pass: PASS_2X1,
      multiple: 1,
      candidates,
      candidateIndex: 1,
      date: TODAY,
    })
    const later = base ? { ...base, updatedAt: base.updatedAt + 1000 } : null

    expect(samePreset(base, later)).toBe(true)
    expect(samePreset(base, base ? { ...base, multiple: 2 } : null)).toBe(false)
    expect(samePreset(base, null)).toBe(false)
  })

  it('todayKey 按本地时区补零', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
