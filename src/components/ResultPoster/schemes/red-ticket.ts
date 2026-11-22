/**
 * 「红金票据」方案：红金渐变底 + 米色票券卡 + 票根撕口。
 * 一张卡里可以纵向排多个彩种（每个彩种一段），号码少的彩种相邻时自动并成两列。
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
const CARD_TITLE = '本期开奖号码'
/** 左栏引导语，同上由版式固定 */
const QR_KICKER = '微信扫码'

const CARD_MARGIN = 48
const CARD_RADIUS = 32
const CARD_PADDING_X = 56
const CARD_PADDING_TOP = 60
const CARD_PADDING_BOTTOM = 48
const CARD_MIN_HEIGHT = 580

const TITLE_SIZE = 44
const TITLE_DIVIDER_GAP = 22
const TITLE_BLOCK_GAP = 40
const DIVIDER_WIDTH = 56
const DIVIDER_HEIGHT = 3

const NAME_SIZE = 34
const META_SIZE = 22
const NAME_BALLS_GAP = 26
const BALLS_META_GAP = 20
/** 彩种之间的间距：发丝线画在正中间 */
const BLOCK_GAP = 44
/** 两个短号码彩种并排时的列间距 */
const COLUMN_GAP = 32
/** 号码数不超过这个值才允许并排（3D、排列三这类） */
const SHORT_GAME_BALLS = 3
const NAME_COLUMN_SHARE = 0.5
const META_COLUMN_SHARE = 0.45

const BALL_MAX = 76
const BALL_MIN = 46
const BALL_GAP_MAX = 14
const BALL_GAP_MIN = 8
/** 常规球径下一行放得下 6 个；快乐8 的 20 个才需要压成两行缩小球 */
const BALL_PER_ROW = 6
const BALL_ROWS_MAX = 2
const BALL_ROW_GAP = 18
const BLUE_GAP = 22
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
  align?: 'left' | 'center' | 'right'
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

/** 一个彩种在卡内占的那一段：名称期号同一行，号码在下方，日期收尾 */
export interface TicketGameBlock {
  x: number
  width: number
  /** 与前一段并排时为 2 */
  columns: number
  gameName: TicketTextLine
  issue: TicketTextLine
  redBalls: TicketBallArea
  /** 无蓝号时为 null，draw 据此整段跳过，不留空行 */
  blueBalls: TicketBallArea | null
  drawDate: TicketTextLine
  top: number
  bottom: number
}

export interface redTicketLayoutData {
  height: number
  width: number
  card: { x: number; y: number; width: number; height: number; radius: number }
  rings: readonly TicketRing[]
  title: TicketTextLine
  titleDivider: { x: number; y: number; width: number; height: number; radius: number }
  games: readonly TicketGameBlock[]
  /** 段与段之间的发丝线 */
  separators: readonly { y: number; x1: number; x2: number }[]
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

/** 一个彩种段的纵向排版：给定左上角与可用宽度，算出全部行的坐标 */
function layoutBlock(item: ResultPosterInput, x: number, width: number, top: number, columns: number): TicketGameBlock {
  const nameY = top + NAME_SIZE / 2
  const gameName: TicketTextLine = { x, y: nameY, size: NAME_SIZE, maxWidth: width * NAME_COLUMN_SHARE, align: 'left' }
  const issue: TicketTextLine = {
    x: x + width,
    y: nameY,
    size: META_SIZE,
    maxWidth: width * META_COLUMN_SHARE,
    align: 'right',
  }

  let cursor = top + NAME_SIZE + NAME_BALLS_GAP
  const redCount = item.redNumbers.length
  const redFit = redCount > 0 ? fitRows(redCount, width) : null
  const redRows: TicketBallRow[] = []
  if (redFit) {
    for (let row = 0; row < redFit.rows; row += 1) {
      const count = Math.min(redFit.perRow, redCount - row * redFit.perRow)
      const cy = cursor + redFit.diameter / 2 + row * (redFit.diameter + BALL_ROW_GAP)
      redRows.push(centeredRow(count, x, width, redFit.diameter, redFit.gap, cy))
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
  const blueCount = item.blueNumbers.length
  if (blueCount > 0) {
    // 蓝球与红球是两种号码体系，间距固定；红球为空时不额外留白
    const blueTop = redCount > 0 ? redBottom + BLUE_GAP : redBottom
    const blueRowCount = Math.ceil(blueCount / BLUE_PER_ROW)
    const blueRows: TicketBallRow[] = []
    for (let row = 0; row < blueRowCount; row += 1) {
      const count = Math.min(BLUE_PER_ROW, blueCount - row * BLUE_PER_ROW)
      const cy = blueTop + BALL_MAX / 2 + row * (BALL_MAX + BALL_ROW_GAP)
      blueRows.push(centeredRow(count, x, width, BALL_MAX, BALL_GAP_MAX, cy))
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

  cursor = ballsBottom + BALLS_META_GAP
  const drawDate: TicketTextLine = { x, y: cursor + META_SIZE / 2, size: META_SIZE, maxWidth: width, align: 'left' }

  return {
    x,
    width,
    columns,
    gameName,
    issue,
    redBalls,
    blueBalls,
    drawDate,
    top,
    bottom: cursor + META_SIZE,
  }
}

function isShortGame(item: ResultPosterInput): boolean {
  return item.redNumbers.length + item.blueNumbers.length <= SHORT_GAME_BALLS
}

/**
 * 多彩种排版：一段一个彩种；相邻两个都是 3 个号以内的彩种时并成两列，
 * 其余情况独占整行。段与段之间画发丝线，最后接固定的二维码票根。
 */
export function redTicketLayout(items: readonly ResultPosterInput[]): redTicketLayoutData {
  const width = POSTER_WIDTH
  const cardWidth = width - CARD_MARGIN * 2
  const contentX = CARD_MARGIN + CARD_PADDING_X
  const contentWidth = cardWidth - CARD_PADDING_X * 2
  const centerX = width / 2
  const cardY = OUTER_TOP

  const title: TicketTextLine = {
    x: centerX,
    y: cardY + CARD_PADDING_TOP + TITLE_SIZE / 2,
    size: TITLE_SIZE,
    maxWidth: contentWidth,
    align: 'center',
  }
  const titleDivider = {
    x: centerX - DIVIDER_WIDTH / 2,
    y: cardY + CARD_PADDING_TOP + TITLE_SIZE + TITLE_DIVIDER_GAP,
    width: DIVIDER_WIDTH,
    height: DIVIDER_HEIGHT,
    radius: DIVIDER_HEIGHT / 2,
  }

  const games: TicketGameBlock[] = []
  const separators: { y: number; x1: number; x2: number }[] = []
  let cursor = titleDivider.y + DIVIDER_HEIGHT + TITLE_BLOCK_GAP
  let index = 0

  while (index < items.length) {
    const first = items[index]
    const second = items[index + 1]
    const pair = Boolean(second) && isShortGame(first) && isShortGame(second)

    if (pair) {
      const columnWidth = (contentWidth - COLUMN_GAP) / 2
      const left = layoutBlock(first, contentX, columnWidth, cursor, 2)
      const right = layoutBlock(second, contentX + columnWidth + COLUMN_GAP, columnWidth, cursor, 2)
      games.push(left, right)
      cursor = Math.max(left.bottom, right.bottom)
      index += 2
    } else {
      const block = layoutBlock(first, contentX, contentWidth, cursor, 1)
      games.push(block)
      cursor = block.bottom
      index += 1
    }

    if (index < items.length) {
      separators.push({ y: cursor + BLOCK_GAP / 2, x1: contentX, x2: contentX + contentWidth })
      cursor += BLOCK_GAP
    }
  }

  const blocksBottom = cursor
  const tearY = blocksBottom + CARD_PADDING_BOTTOM

  const qr = { x: contentX + contentWidth - QR_SIZE, y: tearY + TEAR_GAP_TOP, size: QR_SIZE }
  const leftColumnWidth = qr.x - QR_COLUMN_GAP - contentX
  const leftColumnHeight = KICKER_SIZE + KICKER_GAP + CAPTION_SIZE + CAPTION_GAP + BRAND_SIZE
  let leftCursor = qr.y + (QR_SIZE - leftColumnHeight) / 2
  const qrKicker: TicketTextLine = {
    x: contentX,
    y: leftCursor + KICKER_SIZE / 2,
    size: KICKER_SIZE,
    maxWidth: leftColumnWidth,
    align: 'left',
  }
  leftCursor += KICKER_SIZE + KICKER_GAP
  const qrCaption: TicketTextLine = {
    x: contentX,
    y: leftCursor + CAPTION_SIZE / 2,
    size: CAPTION_SIZE,
    maxWidth: leftColumnWidth,
    align: 'left',
  }
  leftCursor += CAPTION_SIZE + CAPTION_GAP
  const brandName: TicketTextLine = {
    x: contentX,
    y: leftCursor + BRAND_SIZE / 2,
    size: BRAND_SIZE,
    maxWidth: leftColumnWidth,
    align: 'left',
  }

  const cardHeight = Math.max(CARD_MIN_HEIGHT, qr.y + QR_SIZE + TEAR_GAP_BOTTOM - cardY)
  const cardBottom = cardY + cardHeight
  const slogan: TicketTextLine = {
    x: centerX,
    y: cardBottom + SLOGAN_GAP + SLOGAN_SIZE / 2,
    size: SLOGAN_SIZE,
    maxWidth: contentWidth,
    align: 'center',
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
    title,
    titleDivider,
    games,
    separators,
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

function drawBalls(ctx: CanvasRenderingContext2D, numbers: readonly string[], area: TicketBallArea, background: string): void {
  let offset = 0
  area.rows.forEach((row) => {
    drawBallRow(ctx, numbers.slice(offset, offset + row.count), row.startX, row.cy, area.diameter, area.gap, background, COLORS.white)
    offset += row.count
  })
}

function drawBlock(ctx: CanvasRenderingContext2D, item: ResultPosterInput, block: TicketGameBlock): void {
  drawText(ctx, item.gameName, block.gameName.x, block.gameName.y, {
    size: block.gameName.size,
    weight: 700,
    color: COLORS.cardPrimary,
    align: 'left',
    maxWidth: block.gameName.maxWidth,
  })
  drawText(ctx, item.issue, block.issue.x, block.issue.y, {
    size: block.issue.size,
    weight: 500,
    color: COLORS.cardSecondary,
    align: 'right',
    maxWidth: block.issue.maxWidth,
  })

  drawBalls(ctx, item.redNumbers, block.redBalls, COLORS.redBall)
  if (block.blueBalls) {
    drawBalls(ctx, item.blueNumbers, block.blueBalls, COLORS.blueBall)
  }

  drawText(ctx, item.drawDate, block.drawDate.x, block.drawDate.y, {
    size: block.drawDate.size,
    color: COLORS.cardSecondary,
    align: 'left',
    maxWidth: block.drawDate.maxWidth,
  })
}

export const redTicketScheme: PosterScheme = {
  id: 'red-ticket',
  name: '红金票据',
  tagline: '红金底 + 米色票券，撕线票根的开奖仪式感',
  measure(items) {
    return redTicketLayout(items).height
  },
  draw(ctx, items, images) {
    const layout = redTicketLayout(items)
    const { card } = layout
    const first = items[0]

    fillLinearGradient(ctx, 0, 0, layout.width, layout.height, COLORS.redTop, COLORS.redBottom, 'vertical')
    layout.rings.forEach((ring) => drawRing(ctx, ring))
    fillRoundRect(ctx, card.x, card.y, card.width, card.height, card.radius, COLORS.paper)

    drawText(ctx, CARD_TITLE, layout.title.x, layout.title.y, {
      size: layout.title.size,
      weight: 700,
      color: COLORS.cardPrimary,
      align: 'center',
      maxWidth: layout.title.maxWidth,
    })
    fillRoundRect(
      ctx,
      layout.titleDivider.x,
      layout.titleDivider.y,
      layout.titleDivider.width,
      layout.titleDivider.height,
      layout.titleDivider.radius,
      COLORS.gold
    )

    layout.separators.forEach((line) => drawDashedLine(ctx, line.x1, line.x2, line.y, COLORS.tear, 2, [6, 8]))

    layout.games.forEach((block, i) => {
      const item = items[i]
      if (item) {
        drawBlock(ctx, item, block)
      }
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
    if (first) {
      drawText(ctx, first.qrCaption, layout.qrCaption.x, layout.qrCaption.y, {
        size: layout.qrCaption.size,
        color: COLORS.cardSecondary,
        maxWidth: layout.qrCaption.maxWidth,
      })
      drawText(ctx, first.brandName, layout.brandName.x, layout.brandName.y, {
        size: layout.brandName.size,
        weight: 600,
        color: COLORS.brand,
        maxWidth: layout.brandName.maxWidth,
      })
    }
    drawQrCard(ctx, images.qr, layout.qr.x, layout.qr.y, layout.qr.size)

    if (first) {
      drawText(ctx, first.slogan, layout.slogan.x, layout.slogan.y, {
        size: layout.slogan.size,
        weight: 600,
        color: COLORS.slogan,
        align: 'center',
        maxWidth: layout.slogan.maxWidth,
      })
    }
  },
}
