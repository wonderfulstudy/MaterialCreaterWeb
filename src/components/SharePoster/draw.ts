import { formatAmount, formatOdds } from '../PlanCalculator/calc'
import { sportLabel, type PlanLeg, type SelectionSummary } from '../PlanCalculator/model'
import {
  overallStats,
  summarizeResults,
  winRateText,
  type LegResultStatus,
  type PlanHistoryEntry,
  type PlanLegResult,
  type SharePlan,
} from './model'

/**
 * 海报绘制：红金「彩票票据」风格。
 * 使用 Canvas 2D 标准上下文（type="2d"），weapp / H5 通用。
 * 所有坐标基于 750 设计宽度，组件按设备像素比放大画布。
 */

export const POSTER_WIDTH = 750
/** 海报上最多展示的历史方案条数 */
export const MAX_HISTORY_ENTRIES = 4

const C = {
  bgTop: '#B3121B',
  bgBottom: '#7E0C13',
  paper: '#FFFDF7',
  paperEdge: '#F3E3C3',
  ink: '#2B1B12',
  inkSoft: '#8A7361',
  gold: '#C9973B',
  goldDeep: '#A87A22',
  goldLight: '#F5D98B',
  red: '#D8342C',
  win: '#1E9E50',
  lose: '#9AA0A6',
  pending: '#E8930C',
  white: '#FFFFFF',
}

const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif'

type Ctx = CanvasRenderingContext2D

function font(size: number, weight: 400 | 500 | 600 | 700 = 400): string {
  return `${weight} ${size}px ${FONT}`
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

function fillRoundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  roundRectPath(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

/** 按宽度截断文本，超出加省略号 */
function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text
  }
  let clipped = text
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  options: { size: number; weight?: 400 | 500 | 600 | 700; color: string; align?: CanvasTextAlign; maxWidth?: number }
) {
  ctx.font = font(options.size, options.weight ?? 400)
  ctx.fillStyle = options.color
  ctx.textAlign = options.align ?? 'left'
  ctx.textBaseline = 'middle'
  const value = options.maxWidth ? ellipsize(ctx, text, options.maxWidth) : text
  ctx.fillText(value, x, y)
}

/** 状态徽标：中 / 未 / 待 */
const STATUS_META: Record<LegResultStatus, { label: string; color: string; bg: string }> = {
  win: { label: '中', color: C.white, bg: C.win },
  lose: { label: '未', color: C.white, bg: C.lose },
  pending: { label: '待', color: C.white, bg: C.pending },
}

function drawStatusBadge(ctx: Ctx, status: LegResultStatus, cx: number, cy: number, size: number) {
  const meta = STATUS_META[status]
  fillRoundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.28, meta.bg)
  drawText(ctx, meta.label, cx, cy + 1, { size: size * 0.62, weight: 600, color: meta.color, align: 'center' })
}

/** 虚线分隔（票据撕线） */
function drawDashedLine(ctx: Ctx, x1: number, x2: number, y: number) {
  ctx.save()
  ctx.strokeStyle = C.paperEdge
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.restore()
}

/** 票据两侧的撕票缺口：用与背景一致的渐变填充，视觉上如同打穿的孔 */
function drawTicketNotches(ctx: Ctx, y: number, paperX: number, paperW: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, C.bgTop)
  gradient.addColorStop(1, C.bgBottom)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(paperX, y, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(paperX + paperW, y, 14, 0, Math.PI * 2)
  ctx.fill()
}

interface LegGroup {
  matchId: number
  matchNumStr: string
  league: string
  homeTeam: string
  awayTeam: string
  picks: PlanLeg[]
}

function groupLegs(legs: PlanLeg[]): LegGroup[] {
  const map = new Map<number, LegGroup>()
  legs.forEach((leg) => {
    const group = map.get(leg.matchId)
    if (group) {
      group.picks.push(leg)
    } else {
      map.set(leg.matchId, {
        matchId: leg.matchId,
        matchNumStr: leg.matchNumStr,
        league: leg.league,
        homeTeam: leg.homeTeam,
        awayTeam: leg.awayTeam,
        picks: [leg],
      })
    }
  })
  return Array.from(map.values())
}

function resultOf(results: PlanLegResult[] | undefined, matchId: number): PlanLegResult | undefined {
  return results?.find((item) => item.matchId === matchId)
}

/** 单场投注行高：队名行 + 联赛/选项行 */
const LEG_ROW_HEIGHT = 100
const HISTORY_ROW_HEIGHT = 118

interface LayoutMetrics {
  headerHeight: number
  paperTop: number
  currentSectionHeight: number
  historySectionHeight: number
  statsBarHeight: number
  footerHeight: number
  totalHeight: number
}

function computeLayout(plan: SharePlan): LayoutMetrics {
  const groups = groupLegs(plan.legs)
  const history = (plan.history ?? []).slice(0, MAX_HISTORY_ENTRIES)
  const historyOverflow = Math.max(0, (plan.history ?? []).length - history.length)

  const headerHeight = 210
  const paperTop = headerHeight - 20

  // 当前方案：上边距 40 + 标题 40 + 汇总 96 + 每场一行（空方案占位 60）+ 备注 52 + 下边距 12
  const legsHeight = groups.length ? groups.length * LEG_ROW_HEIGHT : 60
  const currentSectionHeight = 40 + 40 + 96 + legsHeight + (plan.note ? 52 : 0) + 12

  // 历史方案：上边距 36 + 标题 36 + 每条一行 + 溢出提示 28 + 下边距 8
  const historySectionHeight = history.length
    ? 36 + 36 + history.length * HISTORY_ROW_HEIGHT + (historyOverflow > 0 ? 28 : 0) + 8
    : 0

  const statsBarHeight = 148
  const footerHeight = 132

  return {
    headerHeight,
    paperTop,
    currentSectionHeight,
    historySectionHeight,
    statsBarHeight,
    footerHeight,
    totalHeight:
      paperTop + currentSectionHeight + historySectionHeight + 24 + 28 + statsBarHeight + footerHeight,
  }
}

export function measurePosterHeight(plan: SharePlan): number {
  return computeLayout(plan).totalHeight
}

function drawBackground(ctx: Ctx, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, C.bgTop)
  gradient.addColorStop(1, C.bgBottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, POSTER_WIDTH, height)

  // 顶部光晕与底部暗纹，营造票据舞台感
  const glow = ctx.createRadialGradient(POSTER_WIDTH / 2, 40, 20, POSTER_WIDTH / 2, 40, 420)
  glow.addColorStop(0, 'rgba(255, 214, 130, 0.28)')
  glow.addColorStop(1, 'rgba(255, 214, 130, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, POSTER_WIDTH, 320)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
  ctx.fillRect(0, height - 60, POSTER_WIDTH, 60)
}

function drawHeader(ctx: Ctx, plan: SharePlan) {
  const centerX = POSTER_WIDTH / 2

  // 顶部缎带标签
  const ribbonText = `${sportLabel(plan.sport)} · 方案分享`
  ctx.font = font(24, 600)
  const ribbonW = ctx.measureText(ribbonText).width + 64
  fillRoundRect(ctx, centerX - ribbonW / 2, 34, ribbonW, 48, 24, 'rgba(0, 0, 0, 0.22)')
  ctx.strokeStyle = 'rgba(245, 217, 139, 0.55)'
  ctx.lineWidth = 1.5
  roundRectPath(ctx, centerX - ribbonW / 2, 34, ribbonW, 48, 24)
  ctx.stroke()
  drawText(ctx, ribbonText, centerX, 59, { size: 24, weight: 600, color: C.goldLight, align: 'center' })

  drawText(ctx, plan.name, centerX, 122, {
    size: 46,
    weight: 700,
    color: C.white,
    align: 'center',
    maxWidth: POSTER_WIDTH - 120,
  })

  const dateText = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  drawText(ctx, `分享于 ${dateText}`, centerX, 168, {
    size: 22,
    color: 'rgba(255, 255, 255, 0.75)',
    align: 'center',
  })
}

function drawSectionTitle(ctx: Ctx, title: string, x: number, y: number, extra?: string) {
  // 金色竖条 + 标题
  fillRoundRect(ctx, x, y - 16, 8, 32, 4, C.gold)
  drawText(ctx, title, x + 24, y, { size: 30, weight: 700, color: C.ink })
  if (extra) {
    drawText(ctx, extra, POSTER_WIDTH - 72, y, { size: 22, color: C.inkSoft, align: 'right' })
  }
}

function drawSummaryChips(ctx: Ctx, summary: SelectionSummary | undefined, x: number, y: number, w: number) {
  if (!summary) {
    return
  }
  const chips = [
    { label: '投注金额', value: `¥${formatAmount(summary.amount)}`, color: C.red },
    { label: '最高可中', value: `¥${formatAmount(summary.maxBonus)}`, color: C.goldDeep },
    { label: '倍数', value: `${summary.multiple}倍`, color: C.ink },
  ]
  const gap = 16
  const chipW = (w - gap * (chips.length - 1)) / chips.length
  chips.forEach((chip, index) => {
    const chipX = x + index * (chipW + gap)
    fillRoundRect(ctx, chipX, y, chipW, 76, 12, '#FBF3E2')
    drawText(ctx, chip.label, chipX + chipW / 2, y + 22, { size: 20, color: C.inkSoft, align: 'center' })
    drawText(ctx, chip.value, chipX + chipW / 2, y + 52, {
      size: 26,
      weight: 700,
      color: chip.color,
      align: 'center',
      maxWidth: chipW - 16,
    })
  })
}

function drawLegRow(ctx: Ctx, group: LegGroup, result: PlanLegResult | undefined, x: number, y: number, w: number) {
  const status: LegResultStatus = result?.status ?? 'pending'

  // 场次编号块
  fillRoundRect(ctx, x, y + 14, 92, 44, 8, status === 'win' ? '#E4F5EA' : '#F6EFE1')
  drawText(ctx, group.matchNumStr.replace(/\D/g, '') || group.matchNumStr, x + 46, y + 37, {
    size: 24,
    weight: 700,
    color: status === 'win' ? C.win : C.goldDeep,
    align: 'center',
    maxWidth: 84,
  })

  const textX = x + 108
  const badgeX = x + w - 26
  const textW = w - 108 - 64

  // 第一行：队名；右侧赛果（如有）
  const teamText = `${group.homeTeam} vs ${group.awayTeam}`
  const resultText = result?.resultText ? `赛果 ${result.resultText}` : ''
  const teamMaxW = resultText ? textW - 150 : textW
  drawText(ctx, teamText, textX, y + 28, { size: 26, weight: 600, color: C.ink, maxWidth: teamMaxW })
  if (resultText) {
    drawText(ctx, resultText, badgeX - 36, y + 28, {
      size: 20,
      color: status === 'win' ? C.win : C.inkSoft,
      align: 'right',
    })
  }

  // 第二行：联赛 + 选项与赔率
  drawText(ctx, group.league, textX, y + 66, { size: 20, color: C.inkSoft, maxWidth: 130 })
  const picksText = group.picks
    .map((leg) => `${leg.poolName !== '胜平负' && leg.poolName !== '胜负' ? `${leg.poolName}·` : ''}${leg.optionLabel} ${formatOdds(leg.odds)}`)
    .join('  ')
  drawText(ctx, picksText, textX + 142, y + 66, { size: 20, weight: 500, color: C.red, maxWidth: textW - 142 })

  drawStatusBadge(ctx, status, badgeX, y + 50, 44)
}

function drawCurrentSection(ctx: Ctx, plan: SharePlan, x: number, y: number, w: number): number {
  let cursor = y + 40
  const stats = summarizeResults(plan.legs, plan.results)
  drawSectionTitle(ctx, '当前方案', x, cursor, `${stats.total} 场 · ${winRateText(stats)}`)
  cursor += 40

  drawSummaryChips(ctx, plan.summary, x, cursor, w)
  cursor += 96

  const groups = groupLegs(plan.legs)
  const results = plan.results
  groups.forEach((group, index) => {
    if (index > 0) {
      ctx.strokeStyle = '#F1E6D0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, cursor)
      ctx.lineTo(x + w, cursor)
      ctx.stroke()
    }
    drawLegRow(ctx, group, resultOf(results, group.matchId), x, cursor, w)
    cursor += LEG_ROW_HEIGHT
  })

  if (!groups.length) {
    drawText(ctx, '方案暂未选择比赛', x + w / 2, cursor + 30, { size: 24, color: C.inkSoft, align: 'center' })
    cursor += 60
  }

  if (plan.note) {
    fillRoundRect(ctx, x, cursor + 4, w, 44, 8, '#FBF3E2')
    drawText(ctx, `备注：${plan.note}`, x + 16, cursor + 27, { size: 20, color: C.inkSoft, maxWidth: w - 32 })
    cursor += 52
  }

  return cursor + 12
}

function drawHistoryEntry(ctx: Ctx, entry: PlanHistoryEntry, x: number, y: number, w: number) {
  const stats = summarizeResults(entry.legs, entry.results)
  const settled = stats.win + stats.lose

  // 版本 + 日期
  drawText(ctx, entry.label, x, y + 22, { size: 26, weight: 600, color: C.ink, maxWidth: w - 220 })
  drawText(ctx, entry.date, x + w, y + 22, { size: 22, color: C.inkSoft, align: 'right' })

  // 选项摘要
  const picksText = entry.legs
    .map((leg) => `${leg.matchNumStr.replace(/\D/g, '')} ${leg.optionLabel}`)
    .join(' · ')
  drawText(ctx, picksText || '无投注内容', x, y + 56, { size: 22, color: C.inkSoft, maxWidth: w - 160 })

  // 金额
  if (entry.summary) {
    drawText(ctx, `¥${formatAmount(entry.summary.amount)}`, x + w, y + 56, {
      size: 22,
      weight: 600,
      color: C.goldDeep,
      align: 'right',
    })
  }

  // 战绩条：中 x / 未 x / 待 x + 命中率
  const badgeY = y + 92
  const items: { status: LegResultStatus; count: number }[] = [
    { status: 'win', count: stats.win },
    { status: 'lose', count: stats.lose },
    { status: 'pending', count: stats.pending },
  ]
  let badgeX = x + 14
  items.forEach((item) => {
    drawStatusBadge(ctx, item.status, badgeX, badgeY, 28)
    drawText(ctx, `${item.count}`, badgeX + 26, badgeY + 1, { size: 22, weight: 600, color: C.ink })
    badgeX += 76
  })

  const rateText = settled ? `命中率 ${winRateText(stats)}` : '待开奖'
  drawText(ctx, rateText, x + w, badgeY + 1, {
    size: 22,
    weight: 600,
    color: settled && stats.win > 0 ? C.win : C.inkSoft,
    align: 'right',
  })
}

function drawHistorySection(ctx: Ctx, plan: SharePlan, x: number, y: number, w: number): number {
  const history = (plan.history ?? []).slice(0, MAX_HISTORY_ENTRIES)
  if (!history.length) {
    return y
  }

  let cursor = y + 36
  drawSectionTitle(ctx, '历史方案', x, cursor, `共 ${(plan.history ?? []).length} 版`)
  cursor += 36

  history.forEach((entry, index) => {
    if (index > 0) {
      ctx.strokeStyle = '#F1E6D0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, cursor - 8)
      ctx.lineTo(x + w, cursor - 8)
      ctx.stroke()
    }
    drawHistoryEntry(ctx, entry, x, cursor, w)
    cursor += HISTORY_ROW_HEIGHT
  })

  const overflow = (plan.history ?? []).length - history.length
  if (overflow > 0) {
    drawText(ctx, `还有 ${overflow} 版历史方案未展示`, x + w / 2, cursor + 4, {
      size: 20,
      color: C.inkSoft,
      align: 'center',
    })
    cursor += 28
  }

  return cursor + 8
}

function drawStatsBar(ctx: Ctx, plan: SharePlan, x: number, y: number, w: number, h: number) {
  const stats = overallStats(plan)
  fillRoundRect(ctx, x, y, w, h, 16, '#8F0E15')
  ctx.strokeStyle = 'rgba(245, 217, 139, 0.4)'
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x, y, w, h, 16)
  ctx.stroke()

  drawText(ctx, '累计战绩（含历史方案）', x + w / 2, y + 30, {
    size: 22,
    color: 'rgba(255, 255, 255, 0.72)',
    align: 'center',
  })

  const columns = [
    { label: '总场次', value: String(stats.total), color: C.white },
    { label: '命中', value: String(stats.win), color: '#7BE3A5' },
    { label: '未中', value: String(stats.lose), color: 'rgba(255, 255, 255, 0.6)' },
    { label: '命中率', value: winRateText(stats), color: C.goldLight },
  ]
  const colW = w / columns.length
  columns.forEach((col, index) => {
    const cx = x + colW * index + colW / 2
    drawText(ctx, col.value, cx, y + 76, { size: 40, weight: 700, color: col.color, align: 'center' })
    drawText(ctx, col.label, cx, y + 116, { size: 20, color: 'rgba(255, 255, 255, 0.66)', align: 'center' })
    if (index > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + colW * index, y + 52)
      ctx.lineTo(x + colW * index, y + h - 24)
      ctx.stroke()
    }
  })
}

function drawFooter(ctx: Ctx, y: number) {
  drawText(ctx, '理性购彩 · 量力而行', POSTER_WIDTH / 2, y + 30, {
    size: 24,
    weight: 600,
    color: C.goldLight,
    align: 'center',
  })
  drawText(ctx, '方案仅供参考，不构成任何投注建议，请到线下彩票站购彩', POSTER_WIDTH / 2, y + 68, {
    size: 20,
    color: 'rgba(255, 255, 255, 0.6)',
    align: 'center',
  })
}

/**
 * 绘制完整海报。调用前画布尺寸应已设为
 * POSTER_WIDTH × measurePosterHeight(plan)（可整体乘以像素比）。
 */
export function drawSharePoster(ctx: Ctx, plan: SharePlan) {
  const layout = computeLayout(plan)
  const height = layout.totalHeight

  drawBackground(ctx, height)
  drawHeader(ctx, plan)

  // 票据主体
  const paperX = 36
  const paperW = POSTER_WIDTH - paperX * 2
  const paperH = layout.currentSectionHeight + layout.historySectionHeight + 24
  ctx.save()
  ctx.shadowColor = 'rgba(60, 4, 8, 0.45)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 10
  fillRoundRect(ctx, paperX, layout.paperTop, paperW, paperH, 20, C.paper)
  ctx.restore()

  const innerX = paperX + 36
  const innerW = paperW - 72

  let cursor = drawCurrentSection(ctx, plan, innerX, layout.paperTop, innerW)

  if (layout.historySectionHeight > 0) {
    drawDashedLine(ctx, paperX + 24, paperX + paperW - 24, cursor + 6)
    drawTicketNotches(ctx, cursor + 6, paperX, paperW, height)
    cursor = drawHistorySection(ctx, plan, innerX, cursor + 12, innerW)
  }

  // 战绩条 + 页脚
  const statsY = layout.paperTop + paperH + 28
  drawStatsBar(ctx, plan, paperX, statsY, paperW, layout.statsBarHeight)
  drawFooter(ctx, statsY + layout.statsBarHeight + 12)
}
