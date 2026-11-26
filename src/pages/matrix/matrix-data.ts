/** 综合大数据矩阵的行构建、复式选中、完整性校验、快照构建（不读写 storage、不取真实时间） */
import { MATRIX_POOLS } from '@mc/core/models/matrix'
import type { MatrixSnapshot, MatrixSnapshotCell } from '@mc/core/models/matrix'
import type { OddsOption, PoolCode, SportKey, SportMatch } from '@/components/PlanCalculator/model'

/** 列定义、玩法开关解析、storage 键与快照类型都在 @mc/core，这里只做再导出（实现只此一份） */
export {
  MATRIX_POOLS,
  defaultMatrixSettings,
  matrixEntryKey,
  matrixPoolName,
  parseMatrixSettings,
} from '@mc/core/models/matrix'
export type {
  MatrixSettings,
  MatrixSnapshot,
  MatrixSnapshotCell,
  MatrixSnapshotOption,
  MatrixSnapshotRow,
} from '@mc/core/models/matrix'

/** 矩阵一行：当日在售的一场 + 启用玩法的赔率单元格 */
export interface MatrixCell {
  poolCode: PoolCode
  /** 让球 / 让分 / 大小的盘口线，原样保留接口字符串 */
  line: string
  options: OddsOption[]
}

export interface MatrixTableRow {
  matchId: number
  matchNo: string
  league: string
  home: string
  away: string
  time: string
  date: string
  cells: Partial<Record<PoolCode, MatrixCell>>
}

/** 一格里的一个已选结果：复式时同格放多个，快照里落这一层 */
export interface MatrixPick {
  poolCode: PoolCode
  optionKey: string
  label: string
  odds: number
  line: string
}

/** 选择表：键 = `matchId:poolCode`，值为该格已选的一组结果（顺序 = 点选顺序） */
export type MatrixSelectionMap = Record<string, MatrixPick[]>

export function matrixCellKey(matchId: number, poolCode: PoolCode): string {
  return `${matchId}:${poolCode}`
}

/** 「周一001」/「第2001场」→ 001 / 2001；取不到数字就用 matchNum */
export function matrixMatchNo(match: Pick<SportMatch, 'matchNumStr' | 'matchNum'>): string {
  const digits = String(match.matchNumStr || '').match(/\d+/)
  if (digits) return digits[0]
  return match.matchNum > 0 ? String(match.matchNum) : ''
}

/** 赛事色 / 队伍名等展示字段与赛程页同口径，这里只取矩阵需要的列 */
export function buildMatrixRows(
  matches: readonly SportMatch[],
  sport: SportKey,
  pools: readonly PoolCode[],
  date: string,
): MatrixTableRow[] {
  const allowed = new Set<PoolCode>(MATRIX_POOLS[sport])
  const enabled = new Set(pools.filter((pool) => allowed.has(pool)))
  const rows: MatrixTableRow[] = []

  matches.forEach((match) => {
    if (date && match.businessDate !== date) return
    const cells: Partial<Record<PoolCode, MatrixCell>> = {}
    let hasCell = false
    match.rows.forEach((row) => {
      if (!enabled.has(row.poolCode) || !row.options.length) return
      cells[row.poolCode] = { poolCode: row.poolCode, line: row.line, options: row.options }
      hasCell = true
    })
    if (!hasCell) return

    rows.push({
      matchId: match.matchId,
      matchNo: matrixMatchNo(match),
      league: match.league,
      home: match.homeTeam,
      away: match.awayTeam,
      time: match.matchTime,
      date: match.businessDate || date,
      cells,
    })
  })

  return rows
}

/**
 * 点选一格里的某个结果：没选过就加入（同格可多选 = 复式），
 * 已选过就把它从该格移除，移除到空时该格直接回到未填。
 */
export function toggleMatrixSelection(
  selections: MatrixSelectionMap,
  target: { matchId: number; poolCode: PoolCode; line: string },
  option: OddsOption,
): MatrixSelectionMap {
  const key = matrixCellKey(target.matchId, target.poolCode)
  const current = selections[key] ?? []
  const exists = current.some((pick) => pick.optionKey === option.key)
  const nextPicks = exists
    ? current.filter((pick) => pick.optionKey !== option.key)
    : [
        ...current,
        {
          poolCode: target.poolCode,
          optionKey: option.key,
          label: option.label,
          odds: option.odds,
          line: target.line,
        },
      ]

  const next: MatrixSelectionMap = { ...selections }
  if (nextPicks.length) {
    next[key] = nextPicks
  } else {
    delete next[key]
  }
  return next
}

/** 一格已选的选项 key 集合，渲染与快照都按它筛 */
export function selectedOptionKeys(picks: readonly MatrixPick[] | undefined): Set<string> {
  return new Set((picks ?? []).map((pick) => pick.optionKey))
}

export interface MatrixCompleteness {
  /** 表里可选的格子总数（无赔率的格子不计） */
  cellCount: number
  filledCount: number
  missingCount: number
  /** 还差几场：至少缺 1 格的场次数 */
  missingRowCount: number
  complete: boolean
}

/** 逐场逐启用玩法检查每格是否至少选了一个结果（多选仍只算一格） */
export function checkMatrixCompleteness(
  rows: readonly MatrixTableRow[],
  pools: readonly PoolCode[],
  selections: MatrixSelectionMap,
): MatrixCompleteness {
  let cellCount = 0
  let filledCount = 0
  let missingRowCount = 0

  rows.forEach((row) => {
    let rowMissing = 0
    pools.forEach((pool) => {
      if (!row.cells[pool]) return
      cellCount += 1
      if (selections[matrixCellKey(row.matchId, pool)]?.length) {
        filledCount += 1
      } else {
        rowMissing += 1
      }
    })
    if (rowMissing > 0) missingRowCount += 1
  })

  const missingCount = cellCount - filledCount
  return {
    cellCount,
    filledCount,
    missingCount,
    missingRowCount,
    complete: cellCount > 0 && missingCount === 0,
  }
}

/** 关闭某个玩法时清掉该列所有场次的已选（含复式整格） */
export function clearPoolSelections(selections: MatrixSelectionMap, poolCode: PoolCode): MatrixSelectionMap {
  const next: MatrixSelectionMap = {}
  Object.keys(selections).forEach((key) => {
    const picks = selections[key]
    if (picks.some((pick) => pick.poolCode !== poolCode)) next[key] = picks
  })
  return next
}

/** 列头可展示的盘口线：全表一致才展示，逐场不同时由单元格自己带线 */
export function uniformPoolLine(rows: readonly MatrixTableRow[], poolCode: PoolCode): string {
  const lines = rows.map((row) => row.cells[poolCode]?.line ?? '').filter(Boolean)
  if (!lines.length) return ''
  return lines.every((line) => line === lines[0]) ? lines[0] : ''
}

/**
 * 保存快照：按表头列顺序补齐每场每启用玩法，每格落一组选项（复式），
 * 选项顺序取表格里的原始顺序、赔率与盘口线取保存当刻的实时值（不是点选时的旧值），
 * 未选的格子直接不产出 cell。
 */
export function buildMatrixSnapshot(params: {
  date: string
  sport: SportKey
  rows: readonly MatrixTableRow[]
  pools: readonly PoolCode[]
  selections: MatrixSelectionMap
  updatedAt: number
}): MatrixSnapshot {
  const { date, sport, rows, pools, selections, updatedAt } = params
  return {
    version: 1,
    date,
    sport,
    updatedAt,
    rows: rows.map((row) => {
      const cells: MatrixSnapshotCell[] = []
      pools.forEach((pool) => {
        const cell = row.cells[pool]
        if (!cell) return
        const keys = selectedOptionKeys(selections[matrixCellKey(row.matchId, pool)])
        if (!keys.size) return
        const options = cell.options
          .filter((option) => keys.has(option.key))
          .map((option) => ({ optionKey: option.key, label: option.label, odds: option.odds }))
        if (!options.length) return
        cells.push({ poolCode: pool, line: cell.line, options })
      })
      return {
        matchId: row.matchId,
        matchNo: row.matchNo,
        league: row.league,
        home: row.home,
        away: row.away,
        time: row.time,
        cells,
      }
    }),
  }
}

/** Date → 2026-11-25，纯函数便于测试注入固定时间 */
export function todayKey(now = new Date()): string {
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value))
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
