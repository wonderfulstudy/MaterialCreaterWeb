import Taro from '@tarojs/taro'
import type { PlanLeg, SelectionSummary, SportKey } from '@/components/PlanCalculator'

/** 预设方案的固定存储 key：设置 + 今日算好的组合（结构升级时换版本号） */
export const PRESET_STORE_KEY = 'mc.presets.v1'

/** 两个预设系列固定 id */
export type PresetId = 'max' | 'min'

export interface StoredPreset {
  id: string
  name: string
  sport: SportKey
  /** 串法展开的场次数：单关 [1]、3串1 [3]、3串4 [2, 3] */
  passSizes: number[]
  passLabel: string
  multiple: number
  /** 已选中候选的腿，赔率为该次计算时冻结值 */
  legs: PlanLeg[]
  summary: SelectionSummary
  /** 已用第几条候选（1 起） */
  candidateIndex: number
  candidateCount: number
  /** 计算日期 YYYY-MM-DD */
  date: string
  updatedAt: number
}

export interface PresetStoreSnapshot {
  version: 1
  presets: Record<string, StoredPreset>
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function emptyStore(): PresetStoreSnapshot {
  return { version: 1, presets: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positiveInt(value: unknown, max: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 1 && value <= max
}

function parsePreset(value: unknown): StoredPreset | null {
  if (!isRecord(value)) {
    return null
  }

  const { id, name, sport, passSizes, passLabel, multiple, legs, summary, candidateIndex, candidateCount, date } = value

  if (typeof id !== 'string' || !id) {
    return null
  }
  if (typeof name !== 'string' || !name) {
    return null
  }
  if (sport !== 'football' && sport !== 'basketball') {
    return null
  }
  if (!Array.isArray(passSizes) || !passSizes.length || !passSizes.every((size) => positiveInt(size, 8))) {
    return null
  }
  if (typeof passLabel !== 'string' || !passLabel) {
    return null
  }
  if (!positiveInt(multiple, 9999)) {
    return null
  }
  if (!Array.isArray(legs) || !isRecord(summary)) {
    return null
  }
  if (!positiveInt(candidateIndex, 100000) || !positiveInt(candidateCount, 100000)) {
    return null
  }
  if (candidateIndex > candidateCount) {
    return null
  }
  if (typeof date !== 'string' || !ISO_DATE.test(date)) {
    return null
  }

  return {
    id,
    name,
    sport,
    passSizes: [...(passSizes as number[])],
    passLabel,
    multiple,
    legs: legs as PlanLeg[],
    summary: summary as unknown as SelectionSummary,
    candidateIndex,
    candidateCount,
    date,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : 0,
  }
}

/** 坏 JSON / 结构不符 / 版本不符一律回落空快照 */
export function parseStore(value: unknown): PresetStoreSnapshot {
  if (typeof value === 'string') {
    if (!value) {
      return emptyStore()
    }
    try {
      return parseStore(JSON.parse(value) as unknown)
    } catch (error) {
      return emptyStore()
    }
  }

  if (!isRecord(value) || value.version !== 1 || !isRecord(value.presets)) {
    return emptyStore()
  }

  const raw = value.presets as Record<string, unknown>
  const presets: Record<string, StoredPreset> = {}
  Object.keys(raw).forEach((key) => {
    const preset = parsePreset(raw[key])
    if (preset) {
      presets[preset.id] = preset
    }
  })

  return { version: 1, presets }
}

export function loadStore(): PresetStoreSnapshot {
  try {
    return parseStore(Taro.getStorageSync(PRESET_STORE_KEY) as unknown)
  } catch (error) {
    return emptyStore()
  }
}

function persist(snapshot: PresetStoreSnapshot): PresetStoreSnapshot {
  try {
    Taro.setStorageSync(PRESET_STORE_KEY, snapshot)
  } catch (error) {
    // 存储不可用（隐私模式 / 配额）时保持内存里的结果，不阻塞页面
  }
  return snapshot
}

export function listPresets(): StoredPreset[] {
  const { presets } = loadStore()
  return Object.keys(presets)
    .map((key) => presets[key])
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function findPreset(id: string): StoredPreset | null {
  return loadStore().presets[id] ?? null
}

export function savePreset(preset: StoredPreset): PresetStoreSnapshot {
  const snapshot = loadStore()
  return persist({ version: 1, presets: { ...snapshot.presets, [preset.id]: preset } })
}

export function removePreset(id: string): PresetStoreSnapshot {
  const snapshot = loadStore()
  const presets = { ...snapshot.presets }
  delete presets[id]
  return persist({ version: 1, presets })
}
