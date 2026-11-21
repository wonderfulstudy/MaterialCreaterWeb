/**
 * 「红金票据」方案：红金渐变底 + 米色票券卡 + 票根撕口。
 * 高度与全部坐标都由 redTicketLayout 一次算清，draw 只照着这份数据画；
 * 两处各算一套的话，成图就会与 measure 的高度错位（被裁切或底部留白）。
 */
import type { PosterScheme, ResultPosterInput } from '../types'
import {
  POSTER_WIDTH,
  drawBallRow,
  drawCircle,
  drawDashedLine,
  drawQrCard,
  drawText,
  fillLinearGradient,
  fillRoundRect,
} from '../canvas-kit'

const COLORS = {
  redTop: '#A81118',
  redBottom: '#6E0709',
  paper: '#FFF7EC',
  gold: '#E0B96A',
  cardPrimary: '#8C1D18',
  cardSecondary: '#A5886F',
  redBall: '#C0181F',
  blueBall: '#2C5FB8',
  white: '#FFFFFF',
  notch: '#94100F',
  tear: '#D9C9B4',
  brand: '#3A1A16',
  slogan: 'rgba(255,255,255,0.55)',
} as const

/** 设计稿固定标题：文案没有走 input 的入口，属于版式的一部分 */
const SECTION_TITLE = '本期开奖号码'
/** 左栏引导语，同上由版式固定 */
const QR_KICKER = '微信扫码'

const CARD_MARGIN = 48
const CARD_RADIUS = 32
const CARD_PADDING_X = 56
const CARD_PADDING_TOP = 60
const CARD_PADDING_BOTTOM = 48
const CARD_MIN_HEIGHT = 580

const ISSUE_SIZE = 26
const ISSUE_GAP = 18
const GAME_SIZE = 52
const GAME_GAP = 26
const DIVIDER_WIDTH = 56
const DIVIDER_HEIGHT = 3
const DIVIDER_GAP = 26
const TITLE_SIZE = 24
const TITLE_GAP = 32
const BALLS_GAP = 34
const DATE_SIZE = 24

const BALL_MAX = 76
const BALL_MIN = 46
const BALL_GAP_MAX = 14
const BALL_GAP_MIN = 8
/** 常规球径下一行放得下 6 个；快乐8 的 20 个才需要压成两行缩小球 */
const BALL_PER_ROW = 6
const BALL_ROWS_MAX = 2
const BALL_ROW_GAP = 18
const BLUE_GAP = 26
const BLUE_PER_ROW = 2

const TEAR_GAP_TOP = 44
const TEAR_GAP_BOTTOM = 52
const QR_SIZE = 200
const QR_COLUMN_GAP = 24
const KICKER_SIZE = 36
const KICKER_GAP = 12
const CAPTION_SIZE = 22
const CAPTION_GAP = 10
const BRAND_SIZE = 24

const NOTCH_RADIUS = 22
const RING_LINE_WIDTH = 2
const RING_ALPHA = 0.18

const OUTER_TOP = 72
const SLOGAN_SIZE = 22
const SLOGAN_GAP = 40
const OUTER_BOTTOM = 56

export interface TicketTextLine {
  x: number
  y: number
  size: number
  maxWidth: number
}

export interface TicketBallRow {
  /** 该行首球左边缘，行内按 count 与 gap 递增 */
  startX: number
  /** 该行球心纵坐标 */
  cy: number
  count: number
}

export interface TicketBallArea {
  diameter: number
  gap: number
  rows: readonly TicketBallRow[]
  top: number
  bottom: number
}

export interface TicketRing {
  cx: number
  cy: number
  radius: number
}

export interface redTicketLayoutData {
  height: number
  width: number
  card: { x: number; y: number; width: number; height: number; radius: number }
  rings: readonly TicketRing[]
  issue: TicketTextLine
  gameName: TicketTextLine
  divider: { x: number; y: number; width: number; height: number; radius: number }
  sectionTitle: TicketTextLine
  redBalls: TicketBallArea
  /** 无蓝号时为 null，draw 据此整段跳过，不留空行 */
  blueBalls: TicketBallArea | null
  drawDate: TicketTextLine
  tearY: number
  notches: readonly TicketRing[]
  qr: { x: number; y: number; size: number }
  qrKicker: TicketTextLine
  qrCaption: TicketTextLine
  brandName: TicketTextLine
  slogan: TicketTextLine
}

interface RowFit {
  rows: number
  perRow: number
  diameter: number
  gap: number
}

/**
 * 把号码压进内容宽：先试标准间距，放不下再收到最小间距；
 * 球径只缩到 BALL_MIN 为止（再小号码就不可读），行数上限 2。
 */
function fitRows(count: number, contentWidth: number): RowFit {
  const rows = count <= BALL_PER_ROW ? 1 : Math.min(BALL_ROWS_MAX, Math.ceil(count / BALL_PER_ROW))
  const perRow = Math.ceil(count / rows)
  const diameterFor = (gap: number): number =>
    Math.min(BALL_MAX, Math.floor((contentWidth - (perRow - 1) * gap) / perRow))

  const roomy = diameterFor(BALL_GAP_MAX)
  if (roomy >= BALL_MIN) {
    return { rows, perRow, diameter: roomy, gap: BALL_GAP_MAX }
  }
  return { rows, perRow, diameter: diameterFor(BALL_GAP_MIN), gap: BALL_GAP_MIN }
}

/** 一行号码球居中摆放；行宽由球径与间距推出，draw 复用同一 startX */
function centeredRow(count: number, contentX: number, contentWidth: number, diameter: number, gap: number, cy: number): TicketBallRow {
  const rowWidth = count * diameter + (count - 1) * gap
  return { startX: contentX + (contentWidth - rowWidth) / 2, cy, count }
}

export function redTicketLayout(input: ResultPosterInput): redTicketLayoutData {
  const width = POSTER_WIDTH
  const cardWidth = width - CARD_MARGIN * 2
  const contentX = CARD_MARGIN + CARD_PADDING_X
  const contentWidth = cardWidth - CARD_PADDING_X * 2
  const centerX = width / 2
  const cardY = OUTER_TOP

  let cursor = cardY + CARD_PADDING_TOP
  const issue: TicketTextLine = { x: centerX, y: cursor + ISSUE_SIZE / 2, size: ISSUE_SIZE, maxWidth: contentWidth }
  cursor += ISSUE_SIZE + ISSUE_GAP
  const gameName: TicketTextLine = { x: centerX, y: cursor + GAME_SIZE / 2, size: GAME_SIZE, maxWidth: contentWidth }
  cursor += GAME_SIZE + GAME_GAP
  const divider = {
    x: centerX - DIVIDER_WIDTH / 2,
    y: cursor,
    width: DIVIDER_WIDTH,
    height: DIVIDER_HEIGHT,
    radius: DIVIDER_HEIGHT / 2,
  }
  cursor += DIVIDER_HEIGHT + DIVIDER_GAP
  const sectionTitle: TicketTextLine = { x: centerX, y: cursor + TITLE_SIZE / 2, size: TITLE_SIZE, maxWidth: contentWidth }
  cursor += TITLE_SIZE + TITLE_GAP

  const redCount = input.redNumbers.length
  const redFit = redCount > 0 ? fitRows(redCount, contentWidth) : null
  const redRows: TicketBallRow[] = []
  if (redFit) {
    for (let row = 0; row < redFit.rows; row += 1) {
      const count = Math.min(redFit.perRow, redCount - row * redFit.perRow)
      const cy = cursor + redFit.diameter / 2 + row * (redFit.diameter + BALL_ROW_GAP)
      redRows.push(centeredRow(count, contentX, contentWidth, redFit.diameter, redFit.gap, cy))
    }
  }
  const redBottom = redFit ? cursor + redFit.rows * redFit.diameter + (redFit.rows - 1) * BALL_ROW_GAP : cursor
  const redBalls: TicketBallArea = {
    diameter: redFit ? redFit.diameter : BALL_MAX,
    gap: redFit ? redFit.gap : BALL_GAP_MAX,
    rows: redRows,
    top: cursor,
    bottom: redBottom,
  }

  let blueBalls: TicketBallArea | null = null
  let ballsBottom = redBottom
  const blueCount = input.blueNumbers.length
  if (blueCount > 0) {
    // 蓝球与红球是两种号码体系，间距固定 26；红球为空时不额外留白
    const blueTop = redCount > 0 ? redBottom + BLUE_GAP : redBottom
    const blueRowCount = Math.ceil(blueCount / BLUE_PER_ROW)
    const blueRows: TicketBallRow[] = []
    for (let row = 0; row < blueRowCount; row += 1) {
      const count = Math.min(BLUE_PER_ROW, blueCount - row * BLUE_PER_ROW)
      const cy = blueTop + BALL_MAX / 2 + row * (BALL_MAX + BALL_ROW_GAP)
      blueRows.push(centeredRow(count, contentX, contentWidth, BALL_MAX, BALL_GAP_MAX, cy))
    }
    blueBalls = {
      diameter: BALL_MAX,
      gap: BALL_GAP_MAX,
      rows: blueRows,
      top: blueTop,
      bottom: blueTop + blueRowCount * BALL_MAX + (blueRowCount - 1) * BALL_ROW_GAP,
    }
    ballsBottom = blueBalls.bottom
  }

  cursor = ballsBottom + BALLS_GAP
  const drawDate: TicketTextLine = { x: centerX, y: cursor + DATE_SIZE / 2, size: DATE_SIZE, maxWidth: contentWidth }
  const tearY = cursor + DATE_SIZE + CARD_PADDING_BOTTOM

  const qr = { x: contentX + contentWidth - QR_SIZE, y: tearY + TEAR_GAP_TOP, size: QR_SIZE }
  const leftColumnWidth = qr.x - QR_COLUMN_GAP - contentX
  const leftColumnHeight = KICKER_SIZE + KICKER_GAP + CAPTION_SIZE + CAPTION_GAP + BRAND_SIZE
  let leftCursor = qr.y + (QR_SIZE - leftColumnHeight) / 2
  const qrKicker: TicketTextLine = {
    x: contentX,
    y: leftCursor + KICKER_SIZE / 2,
    size: KICKER_SIZE,
    maxWidth: leftColumnWidth,
  }
  leftCursor += KICKER_SIZE + KICKER_GAP
  const qrCaption: TicketTextLine = {
    x: contentX,
    y: leftCursor + CAPTION_SIZE / 2,
    size: CAPTION_SIZE,
    maxWidth: leftColumnWidth,
  }
  leftCursor += CAPTION_SIZE + CAPTION_GAP
  const brandName: TicketTextLine = {
    x: contentX,
    y: leftCursor + BRAND_SIZE / 2,
    size: BRAND_SIZE,
    maxWidth: leftColumnWidth,
  }

  const cardHeight = Math.max(
    CARD_MIN_HEIGHT,
    qr.y + QR_SIZE + TEAR_GAP_BOTTOM - cardY
  )
  const cardBottom = cardY + cardHeight
  const slogan: TicketTextLine = {
    x: centerX,
    y: cardBottom + SLOGAN_GAP + SLOGAN_SIZE / 2,
    size: SLOGAN_SIZE,
    maxWidth: contentWidth,
  }

  return {
    height: cardBottom + SLOGAN_GAP + SLOGAN_SIZE + OUTER_BOTTOM,
    width,
    card: { x: CARD_MARGIN, y: cardY, width: cardWidth, height: cardHeight, radius: CARD_RADIUS },
    // 两个圆环的圆心都落在画布右上外侧，只露出弧形装饰
    rings: [
      { cx: width + 24, cy: 132, radius: 150 },
      { cx: width - 28, cy: -48, radius: 96 },
    ],
    issue,
    gameName,
    divider,
    sectionTitle,
    redBalls,
    blueBalls,
    drawDate,
    tearY,
    notches: [
      { cx: CARD_MARGIN, cy: tearY, radius: NOTCH_RADIUS },
      { cx: CARD_MARGIN + cardWidth, cy: tearY, radius: NOTCH_RADIUS },
    ],
    qr,
    qrKicker,
    qrCaption,
    brandName,
    slogan,
  }
}

function drawRing(ctx: CanvasRenderingContext2D, ring: TicketRing): void {
  ctx.save()
  ctx.globalAlpha = RING_ALPHA
  ctx.strokeStyle = COLORS.gold
  ctx.lineWidth = RING_LINE_WIDTH
  ctx.beginPath()
  ctx.arc(ring.cx, ring.cy, ring.radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export const redTicketScheme: PosterScheme = {
  id: 'red-ticket',
  name: '红金票据',
  tagline: '红金底 + 米色票券，撕线票根的开奖仪式感',
  measure(input) {
    return redTicketLayout(input).height
  },
  draw(ctx, input, images) {
    const layout = redTicketLayout(input)
    const { card } = layout

    fillLinearGradient(ctx, 0, 0, layout.width, layout.height, COLORS.redTop, COLORS.redBottom, 'vertical')
    layout.rings.forEach((ring) => drawRing(ctx, ring))
    fillRoundRect(ctx, card.x, card.y, card.width, card.height, card.radius, COLORS.paper)

    drawText(ctx, input.issue, layout.issue.x, layout.issue.y, {
      size: layout.issue.size,
      weight: 500,
      color: COLORS.cardSecondary,
      align: 'center',
      maxWidth: layout.issue.maxWidth,
    })
    drawText(ctx, input.gameName, layout.gameName.x, layout.gameName.y, {
      size: layout.gameName.size,
      weight: 700,
      color: COLORS.cardPrimary,
      align: 'center',
      maxWidth: layout.gameName.maxWidth,
    })
    fillRoundRect(ctx, layout.divider.x, layout.divider.y, layout.divider.width, layout.divider.height, layout.divider.radius, COLORS.gold)
    drawText(ctx, SECTION_TITLE, layout.sectionTitle.x, layout.sectionTitle.y, {
      size: layout.sectionTitle.size,
      weight: 500,
      color: COLORS.cardSecondary,
      align: 'center',
      maxWidth: layout.sectionTitle.maxWidth,
    })

    let redOffset = 0
    layout.redBalls.rows.forEach((row) => {
      drawBallRow(ctx, input.redNumbers.slice(redOffset, redOffset + row.count), row.startX, row.cy, layout.redBalls.diameter, layout.redBalls.gap, COLORS.redBall, COLORS.white)
      redOffset += row.count
    })
    const blueArea = layout.blueBalls
    if (blueArea) {
      let blueOffset = 0
      blueArea.rows.forEach((row) => {
        drawBallRow(ctx, input.blueNumbers.slice(blueOffset, blueOffset + row.count), row.startX, row.cy, blueArea.diameter, blueArea.gap, COLORS.blueBall, COLORS.white)
        blueOffset += row.count
      })
    }

    drawText(ctx, input.drawDate, layout.drawDate.x, layout.drawDate.y, {
      size: layout.drawDate.size,
      color: COLORS.cardSecondary,
      align: 'center',
      maxWidth: layout.drawDate.maxWidth,
    })

    // 撕线两端让出缺口半径，虚线不越过卡片圆角
    drawDashedLine(ctx, card.x + NOTCH_RADIUS, card.x + card.width - NOTCH_RADIUS, layout.tearY, COLORS.tear, 2, [12, 10])
    layout.notches.forEach((notch) => drawCircle(ctx, notch.cx, notch.cy, notch.radius, COLORS.notch))

    drawText(ctx, QR_KICKER, layout.qrKicker.x, layout.qrKicker.y, {
      size: layout.qrKicker.size,
      weight: 600,
      color: COLORS.cardPrimary,
      maxWidth: layout.qrKicker.maxWidth,
    })
    drawText(ctx, input.qrCaption, layout.qrCaption.x, layout.qrCaption.y, {
      size: layout.qrCaption.size,
      color: COLORS.cardSecondary,
      maxWidth: layout.qrCaption.maxWidth,
    })
    drawText(ctx, input.brandName, layout.brandName.x, layout.brandName.y, {
      size: layout.brandName.size,
      weight: 600,
      color: COLORS.brand,
      maxWidth: layout.brandName.maxWidth,
    })
    drawQrCard(ctx, images.qr, layout.qr.x, layout.qr.y, layout.qr.size)

    drawText(ctx, input.slogan, layout.slogan.x, layout.slogan.y, {
      size: layout.slogan.size,
      weight: 600,
      color: COLORS.slogan,
      align: 'center',
      maxWidth: layout.slogan.maxWidth,
    })
  },
}
