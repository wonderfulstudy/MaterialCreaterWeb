import Taro from '@tarojs/taro'
import {
  MATRIX_POOLS,
  defaultMatrixSettings,
  matrixEntryKey,
  parseMatrixSettings,
  type MatrixSettings,
  type MatrixSnapshot,
  type MatrixSnapshotCell,
  type MatrixSnapshotOption,
  type MatrixSnapshotRow,
} from '@/pages/matrix/matrix-data'
import type { PoolCode, SportKey } from '@/components/PlanCalculator/model'

/** 玩法开关：改动即落盘，跨页面共用一份 */
export const MATRIX_SETTINGS_KEY = 'mc.matrix.settings.v1'
/** 每日矩阵快照：足球、篮球各一份，按 sport + date 分条 */
export const MATRIX_STORE_KEY = 'mc.matrix.v1'

export interface MatrixStoreSnapshot {
  version: 1
  entries: Record<string, MatrixSnapshot>
}

function emptyStore(): MatrixStoreSnapshot {
  return { version: 1, entries: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPoolCode(value: unknown, sport: SportKey): value is PoolCode {
  return typeof value === 'string' && (MATRIX_POOLS[sport] as readonly string[]).includes(value)
}

function parseSnapshotOption(value: unknown): MatrixSnapshotOption | null {
  if (!isRecord(value)) return null
  const optionKey = typeof value.optionKey === 'string' ? value.optionKey : ''
  const label = typeof value.label === 'string' ? value.label : ''
  const odds = Number(value.odds)
  if (!optionKey || !label) return null
  if (!Number.isFinite(odds) || odds <= 0) return null
  return { optionKey, label, odds }
}

function parseSnapshotCell(value: unknown, sport: SportKey): MatrixSnapshotCell | null {
  if (!isRecord(value) || !isPoolCode(value.poolCode, sport)) return null
  if (!Array.isArray(value.options)) return null
  const options: MatrixSnapshotOption[] = []
  value.options.forEach((item) => {
    const option = parseSnapshotOption(item)
    if (option) options.push(option)
  })
  if (!options.length) return null
  return {
    poolCode: value.poolCode,
    line: typeof value.line === 'string' ? value.line : '',
    options,
  }
}

/** 旧版单选拔平：picks 里一格一个 optionKey，按 poolCode 归并成 options */
function legacyCells(value: Record<string, unknown>, sport: SportKey): MatrixSnapshotCell[] {
  if (!Array.isArray(value.picks)) return []
  const order: PoolCode[] = []
  const byPool = new Map<PoolCode, MatrixSnapshotCell>()
  value.picks.forEach((item) => {
    if (!isRecord(item) || !isPoolCode(item.poolCode, sport)) return
    const option = parseSnapshotOption(item)
    if (!option) return
    const pool = item.poolCode
    let cell = byPool.get(pool)
    if (!cell) {
      cell = { poolCode: pool, line: typeof item.line === 'string' ? item.line : '', options: [] }
      byPool.set(pool, cell)
      order.push(pool)
    }
    cell.options.push(option)
  })
  return order.map((pool) => byPool.get(pool)).filter((cell): cell is MatrixSnapshotCell => Boolean(cell))
}

function parseRow(value: unknown, sport: SportKey): MatrixSnapshotRow | null {
  if (!isRecord(value)) return null
  const matchId = Number(value.matchId)
  if (!Number.isFinite(matchId) || matchId <= 0) return null
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : '')

  const cells: MatrixSnapshotCell[] = []
  if (Array.isArray(value.cells)) {
    value.cells.forEach((item) => {
      const cell = parseSnapshotCell(item, sport)
      if (cell) cells.push(cell)
    })
  }
  const resolved = cells.length ? cells : legacyCells(value, sport)

  return {
    matchId,
    matchNo: text('matchNo'),
    league: text('league'),
    home: text('home'),
    away: text('away'),
    time: text('time'),
    cells: resolved,
  }
}

function parseSnapshot(value: unknown): MatrixSnapshot | null {
  if (!isRecord(value)) return null
  const sport = value.sport === 'football' || value.sport === 'basketball' ? value.sport : null
  const date = typeof value.date === 'string' && value.date ? value.date : ''
  if (!sport || !date || !Array.isArray(value.rows)) return null

  const rows: MatrixSnapshotRow[] = []
  value.rows.forEach((item) => {
    const row = parseRow(item, sport)
    if (row) rows.push(row)
  })

  return {
    version: 1,
    date,
    sport,
    rows,
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  }
}

/** 兼容宿主把对象序列化成 JSON 字符串；坏数据一律回落空快照 */
export function parseMatrixStore(value: unknown): MatrixStoreSnapshot {
  let raw = value
  if (typeof raw === 'string') {
    if (!raw) return emptyStore()
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return emptyStore()
    }
  }
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.entries)) return emptyStore()

  const entries: Record<string, MatrixSnapshot> = {}
  Object.keys(raw.entries as Record<string, unknown>).forEach((key) => {
    const snapshot = parseSnapshot((raw.entries as Record<string, unknown>)[key])
    // 用内容里的 sport + date 归一化键，历史脏数据里键与内容可能对不上
    if (snapshot) entries[matrixEntryKey(snapshot.sport, snapshot.date)] = snapshot
  })
  return { version: 1, entries }
}

export function loadMatrixStore(): MatrixStoreSnapshot {
  try {
    return parseMatrixStore(Taro.getStorageSync(MATRIX_STORE_KEY))
  } catch {
    return emptyStore()
  }
}

function persist(snapshot: MatrixStoreSnapshot): MatrixStoreSnapshot {
  try {
    Taro.setStorageSync(MATRIX_STORE_KEY, snapshot)
  } catch {
    // 写失败不抛出：调用方仍拿到内存里的最新快照
  }
  return snapshot
}

/** 覆盖同一 sport + date，其它日期/运动原样保留 */
export function saveMatrix(snapshot: MatrixSnapshot): MatrixStoreSnapshot {
  const store = loadMatrixStore()
  return persist({
    version: 1,
    entries: { ...store.entries, [matrixEntryKey(snapshot.sport, snapshot.date)]: snapshot },
  })
}

export function findMatrix(sport: SportKey, date: string): MatrixSnapshot | null {
  return loadMatrixStore().entries[matrixEntryKey(sport, date)] ?? null
}

export function loadMatrixSettings(): MatrixSettings {
  try {
    return parseMatrixSettings(Taro.getStorageSync(MATRIX_SETTINGS_KEY))
  } catch {
    return defaultMatrixSettings()
  }
}

export function saveMatrixSettings(settings: MatrixSettings): MatrixSettings {
  try {
    Taro.setStorageSync(MATRIX_SETTINGS_KEY, settings)
  } catch {
    // 同上：写失败不影响本次页面内的开关状态
  }
  return settings
}
