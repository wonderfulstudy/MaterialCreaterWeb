/**
 * 综合大数据长图海报的纯逻辑（需求 §6.2.3 C）：快照 → 表格行模型、3000px 分张、日期文案。
 * 尺寸一律按成品 px 计（画布 750 宽、导出 scale=1），不引用 Taro API 与图片资源，node 里可直接单测。
 */
import { formatOdds } from '@/components/PlanCalculator/calc'
import type { PoolCode } from '@/components/PlanCalculator/model'
import {
  MATRIX_POOLS,
  matrixPoolName,
  type MatrixSnapshot,
  type MatrixSnapshotCell,
} from '@/pages/matrix/matrix-data'

/** 画布设计宽度：一场次 + 最多 5 个玩法列，375 放不下（需求要求 750 宽） */
export const MATRIX_POSTER_WIDTH = 750
/** 画布本身就是成品尺寸，导出不再放大 */
export const MATRIX_POSTER_EXPORT_SCALE = 1
/** 单张高度上限：超过就按场次行分张 */
export const MATRIX_POSTER_MAX_HEIGHT = 3000
/** 首张顶部：标题 + 日期 + 运动名 */
export const MATRIX_POSTER_HEADER_HEIGHT = 132
/** 表头行：场次列 + 各玩法列 */
export const MATRIX_POSTER_TABLE_HEAD_HEIGHT = 56
/** 第 2 张起重复的高度：只重复表头 */
export const MATRIX_POSTER_REPEAT_HEIGHT = MATRIX_POSTER_TABLE_HEAD_HEIGHT
/** 场次行行高定死，跨端一致，分张才能算准 */
export const MATRIX_POSTER_ROW_HEIGHT = 96
/** 末张尾部预留：页脚 + 两行合规声明（放大 2 倍后的保守高度） */
export const MATRIX_POSTER_TAIL_HEIGHT = 360
/** 页脚按 375 逻辑宽写成，在 750 画布里放大 2 倍才赶得上 red-ticket 的 750 口径字号 */
export const MATRIX_POSTER_FOOTER_SCALE = 2
/** 缩放后页脚的兜底高度（weapp 量不到 offsetHeight 时用它撑开占位） */
export const MATRIX_POSTER_FOOTER_FALLBACK_HEIGHT = 280
/** 未填格子的占位文案 */
export const MATRIX_EMPTY_TEXT = '—'
/** 海报标题（需求固定文案） */
export const MATRIX_POSTER_TITLE = '综合大数据'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/** '2026-11-25' → '11-25 周三'；解析不了就原样返回 */
export function matrixDateLabel(date: string): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!matched) {
    return date
  }
  const [, year, month, day] = matched
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(parsed.getTime())) {
    return date
  }
  return `${month}-${day} ${WEEKDAYS[parsed.getDay()]}`
}

export interface MatrixPosterCell {
  /** 选中的结果，复式按快照 options 顺序用 ' / ' 连写，如 '胜 / 平' */
  label: string
  /** 赔率，与 label 一一对应，如 '1.20 / 5.60' */
  odds: string
  /** true 表示该场该玩法没填（渲染 '—'） */
  empty: boolean
}

export interface MatrixPosterColumn {
  poolCode: PoolCode
  /** 中文玩法名，如 '胜平负' */
  name: string
}

export interface MatrixPosterRow {
  key: string
  matchNo: string
  time: string
  league: string
  /** '主队 VS 客队' */
  teams: string
  /** 与 columns 顺序一一对应 */
  cells: MatrixPosterCell[]
}

export interface MatrixPosterModel {
  title: string
  /** '11-25 周三' */
  dateLabel: string
  /** '足球' / '篮球' */
  sportLabel: string
  columns: MatrixPosterColumn[]
  rows: MatrixPosterRow[]
}

function toPosterCell(cell: MatrixSnapshotCell | undefined): MatrixPosterCell {
  const options = cell?.options ?? []
  if (options.length === 0) {
    return { label: MATRIX_EMPTY_TEXT, odds: '', empty: true }
  }
  return {
    label: options.map((option) => option.label).join(' / '),
    odds: options.map((option) => formatOdds(option.odds)).join(' / '),
    empty: false,
  }
}

/**
 * 快照 → 海报行模型。
 * 只渲染快照里出现过的玩法列，列顺序沿用 MATRIX_POOLS；该场该玩法没有 cell 或 cell 没填都算 '—'。
 */
export function buildMatrixPosterModel(snapshot: MatrixSnapshot): MatrixPosterModel {
  const poolOrder = MATRIX_POOLS[snapshot.sport] ?? []
  const enabled = poolOrder.filter((pool) =>
    snapshot.rows.some((row) => row.cells.some((cell) => cell.poolCode === pool))
  )
  const columns: MatrixPosterColumn[] = enabled.map((pool) => ({ poolCode: pool, name: matrixPoolName(pool) }))
  const rows: MatrixPosterRow[] = snapshot.rows.map((row, index) => ({
    key: row.matchId ? `${row.matchId}` : `${index}-${row.matchNo}-${row.time}`,
    matchNo: row.matchNo,
    time: row.time,
    league: row.league,
    teams: `${row.home} VS ${row.away}`,
    cells: enabled.map((pool) => toPosterCell(row.cells.find((cell) => cell.poolCode === pool))),
  }))

  return {
    title: MATRIX_POSTER_TITLE,
    dateLabel: matrixDateLabel(snapshot.date),
    sportLabel: snapshot.sport === 'basketball' ? '篮球' : '足球',
    columns,
    rows,
  }
}

export interface MatrixPosterPage {
  /** 起始行下标（含） */
  start: number
  /** 结束行下标（不含） */
  end: number
  /** 第 2 张起只重复表头 */
  repeatHeader: boolean
  /** 店名 / 二维码 / 两行合规声明只跟最后一张 */
  withFooter: boolean
}

/** 第 index 张的固定高度（页头 + 表头） */
function fixedHeight(index: number): number {
  return index === 0
    ? MATRIX_POSTER_HEADER_HEIGHT + MATRIX_POSTER_TABLE_HEAD_HEIGHT
    : MATRIX_POSTER_REPEAT_HEIGHT
}

/** 单张实际高度：分张判据，单测直接拿它验收 ≤ MATRIX_POSTER_MAX_HEIGHT */
export function matrixPosterPageHeight(page: MatrixPosterPage): number {
  return (
    fixedHeight(page.repeatHeader ? 1 : 0) +
    (page.end - page.start) * MATRIX_POSTER_ROW_HEIGHT +
    (page.withFooter ? MATRIX_POSTER_TAIL_HEIGHT : 0)
  )
}

/** 与 PlanPoster 同一套分张口径：先按总高估张数，再把内容均摊成每张的容量 */
function pageTargets(contentHeight: number): number[] {
  const repeat = MATRIX_POSTER_REPEAT_HEIGHT
  const count = Math.max(1, Math.ceil((contentHeight - repeat) / (MATRIX_POSTER_MAX_HEIGHT - repeat)))
  const body = contentHeight / count
  return Array.from({ length: count }, (_, index) => (index === 0 ? body : body + repeat))
}

/**
 * 场次行 → 分张方案：切点只落在场次行之间，第 2 张起重复表头，页脚只在最后一张。
 * 每张高度都 ≤ MATRIX_POSTER_MAX_HEIGHT（末张靠把尾部行挪到新的一张来腾位置）。
 */
export function matrixPosterPages(rowCount: number): MatrixPosterPage[] {
  const total = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0
  const content =
    MATRIX_POSTER_HEADER_HEIGHT +
    MATRIX_POSTER_TABLE_HEAD_HEIGHT +
    total * MATRIX_POSTER_ROW_HEIGHT +
    MATRIX_POSTER_TAIL_HEIGHT
  if (total === 0 || content <= MATRIX_POSTER_MAX_HEIGHT) {
    return [{ start: 0, end: total, repeatHeader: false, withFooter: true }]
  }

  const targets = pageTargets(content)
  const pages: MatrixPosterPage[] = []
  while (pages.length === 0 || pages[pages.length - 1].end < total) {
    const index = pages.length
    const start = index === 0 ? 0 : pages[index - 1].end
    const capacity = Math.min(MATRIX_POSTER_MAX_HEIGHT, targets[Math.min(index, targets.length - 1)])
    let used = fixedHeight(index)
    let end = start
    while (end < total && used + MATRIX_POSTER_ROW_HEIGHT <= capacity) {
      used += MATRIX_POSTER_ROW_HEIGHT
      end += 1
    }
    if (end === start) {
      // 容量异常小时至少推进一行，避免死循环
      end = start + 1
    }
    pages.push({ start, end, repeatHeader: index > 0, withFooter: false })
  }

  // 页脚只能落在最后一张：装不下就把末行挪到新的一张
  for (;;) {
    const last = pages[pages.length - 1]
    const height = fixedHeight(pages.length - 1) + (last.end - last.start) * MATRIX_POSTER_ROW_HEIGHT + MATRIX_POSTER_TAIL_HEIGHT
    if (height <= MATRIX_POSTER_MAX_HEIGHT || last.end - last.start <= 1) {
      break
    }
    last.end -= 1
    pages.push({ start: last.end, end: total, repeatHeader: true, withFooter: false })
  }

  pages[pages.length - 1].withFooter = true
  return pages
}
