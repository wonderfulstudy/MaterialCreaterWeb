import Taro from '@tarojs/taro'

/** 旧版海报工具自行声明的开奖结果结构 */
interface LatestResult {
  name: string
  issue: string
  pool?: string
  redBalls: string[]
  blueBalls: string[]
}

const COLORS = {
  bgStart: '#0A0A2E',
  bgMiddle: '#1A1A4E',
  bgEnd: '#0F2862',
  title: '#FFFFFF',
  subtitle: '#00D4FF',
  date: '#87CEEB',
  cardBg: 'rgba(255, 255, 255, 0.08)',
  cardBorder: 'rgba(0, 212, 255, 0.2)',
  redBall: '#FF4757',
  blueBall: '#00D4FF',
  prizePool: '#00D4FF',
  textSecondary: 'rgba(255, 255, 255, 0.8)',
}

function roundRect(ctx: Taro.CanvasContext, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function drawBall(ctx: Taro.CanvasContext, x: number, y: number, radius: number, number: string, color: string) {
  ctx.save()

  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.setFillStyle(color)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.35, 0, 2 * Math.PI)
  ctx.setFillStyle('rgba(255, 255, 255, 0.5)')
  ctx.fill()

  ctx.setShadow(0, 2, 8, hexToRgba(color, 0.4))
  ctx.setFillStyle('#FFFFFF')
  ctx.setFontSize(radius * 0.75)
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  ctx.fillText(number, x, y)
  ctx.restore()
}

function drawStar(ctx: Taro.CanvasContext, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string) {
  let rot = Math.PI / 2 * 3
  let x = cx
  let y = cy
  const step = Math.PI / spikes

  ctx.beginPath()
  ctx.moveTo(cx, cy - outerRadius)

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius
    y = cy + Math.sin(rot) * outerRadius
    ctx.lineTo(x, y)
    rot += step

    x = cx + Math.cos(rot) * innerRadius
    y = cy + Math.sin(rot) * innerRadius
    ctx.lineTo(x, y)
    rot += step
  }

  ctx.lineTo(cx, cy - outerRadius)
  ctx.closePath()
  ctx.setFillStyle(color)
  ctx.fill()
}

function drawHexagon(ctx: Taro.CanvasContext, x: number, y: number, radius: number, alpha: number) {
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (i * 2 * Math.PI) / 6 - Math.PI / 2
    const px = x + radius * Math.cos(angle)
    const py = y + radius * Math.sin(angle)
    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.closePath()
  ctx.setStrokeStyle(`rgba(0, 212, 255, ${alpha})`)
  ctx.setLineWidth(1)
  ctx.stroke()
  ctx.restore()
}

function drawGridLine(ctx: Taro.CanvasContext, x1: number, y1: number, x2: number, y2: number, alpha: number) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.setStrokeStyle(`rgba(0, 212, 255, ${alpha})`)
  ctx.setLineWidth(1)
  ctx.stroke()
  ctx.restore()
}

export interface BluePosterOptions {
  results: LatestResult[]
  width?: number
  height?: number
}

export async function generateBluePoster(options: BluePosterOptions): Promise<string> {
  const { results, width = 600, height } = options

  const MAX_RETRY = 2
  const TIMEOUT_MS = 5000

  const drawPoster = (retryCount: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (retryCount < MAX_RETRY) {
          clearTimeout(timeoutId)
          drawPoster(retryCount + 1).then(resolve).catch(reject)
        } else {
          reject(new Error('canvas draw timeout'))
        }
      }, TIMEOUT_MS)

      const ctx = Taro.createCanvasContext('posterCanvas')

      const totalHeight = height || (220 + results.length * 180 + 200 + 80)

      const headerHeight = totalHeight * 0.24
      const footerHeight = totalHeight * 0.18
      const contentTop = headerHeight
      const availableContentHeight = totalHeight - headerHeight - footerHeight
      const cardHeight = availableContentHeight / results.length
      const cardPadding = cardHeight * 0.06
      const cardInnerHeight = cardHeight - cardPadding * 2

      const gradient = ctx.createLinearGradient(0, 0, width, totalHeight)
      gradient.addColorStop(0, COLORS.bgStart)
      gradient.addColorStop(0.5, COLORS.bgMiddle)
      gradient.addColorStop(1, COLORS.bgEnd)
      ctx.setFillStyle(gradient)
      ctx.fillRect(0, 0, width, totalHeight)

      const gridSize = Math.min(80, totalHeight / 12)
      const numGridLines = Math.ceil(totalHeight / gridSize) + 1
      for (let i = 0; i < numGridLines; i++) {
        drawGridLine(ctx, 0, i * gridSize, width, i * gridSize, 0.05)
      }
      const numVGridLines = Math.ceil(width / gridSize) + 1
      for (let i = 0; i < numVGridLines; i++) {
        drawGridLine(ctx, i * gridSize, 0, i * gridSize, totalHeight, 0.05)
      }

      const starSize = Math.min(18, width * 0.03)
      drawStar(ctx, width * 0.1, headerHeight * 0.3, 5, starSize, starSize * 0.45, 'rgba(0, 212, 255, 0.5)')
      drawStar(ctx, width * 0.87, headerHeight * 0.4, 5, starSize * 0.75, starSize * 0.4, 'rgba(0, 212, 255, 0.35)')
      drawStar(ctx, width * 0.15, contentTop + cardHeight * 0.5, 5, starSize * 0.55, starSize * 0.35, 'rgba(0, 212, 255, 0.3)')
      drawStar(ctx, width * 0.8, contentTop + cardHeight * 1.2, 5, starSize * 0.8, starSize * 0.45, 'rgba(0, 212, 255, 0.4)')
      drawStar(ctx, width * 0.9, contentTop + cardHeight * 2, 5, starSize * 0.65, starSize * 0.4, 'rgba(0, 212, 255, 0.35)')

      const hexRadius = Math.min(80, width * 0.13)
      drawHexagon(ctx, width / 2, headerHeight * 0.4, hexRadius, 0.1)
      drawHexagon(ctx, width / 2, headerHeight * 0.4, hexRadius * 0.75, 0.15)

      const headerGradient = ctx.createLinearGradient(0, 0, 0, headerHeight)
      headerGradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)')
      headerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.setFillStyle(headerGradient)
      ctx.fillRect(0, 0, width, headerHeight)

      const subtitleFontSize = Math.max(12, width * 0.038)
      ctx.setFillStyle(COLORS.subtitle)
      ctx.setFontSize(subtitleFontSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('top')
      ctx.fillText('🚀 专业分析 · 精准预测', width / 2, headerHeight * 0.12)

      const titleFontSize = Math.max(28, width * 0.09)
      ctx.setFillStyle(COLORS.title)
      ctx.setFontSize(titleFontSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('middle')
      ctx.setShadow(0, 4, 15, 'rgba(0, 212, 255, 0.3)')
      ctx.fillText('今日开奖结果', width / 2, headerHeight * 0.5)

      const currentDate = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })
      ctx.setShadow(0, 0, 0, 'transparent')
      const dateFontSize = Math.max(11, width * 0.03)
      ctx.setFillStyle(COLORS.date)
      ctx.setFontSize(dateFontSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('top')
      ctx.fillText(`${currentDate}`, width / 2, headerHeight * 0.78)

      let yOffset = contentTop

      const cardX = width * 0.05
      const cardWidth = width - cardX * 2
      const cardRadius = Math.min(16, cardInnerHeight * 0.12)

      results.forEach((result) => {
        const cardY = yOffset + cardPadding
        const cardH = cardInnerHeight

        ctx.save()
        roundRect(ctx, cardX, cardY, cardWidth, cardH, cardRadius)
        ctx.setFillStyle(COLORS.cardBg)
        ctx.fill()

        ctx.beginPath()
        roundRect(ctx, cardX, cardY, cardWidth, cardH, cardRadius)
        ctx.setStrokeStyle(COLORS.cardBorder)
        ctx.setLineWidth(1)
        ctx.stroke()

        const cardGlow = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardH)
        cardGlow.addColorStop(0, 'rgba(0, 212, 255, 0.08)')
        cardGlow.addColorStop(0.5, 'rgba(0, 212, 255, 0.04)')
        cardGlow.addColorStop(1, 'rgba(0, 212, 255, 0)')
        ctx.beginPath()
        roundRect(ctx, cardX, cardY, cardWidth, cardH, cardRadius)
        ctx.setFillStyle(cardGlow)
        ctx.fill()

        const nameFontSize = Math.max(18, cardH * 0.22)
        ctx.setFillStyle(COLORS.title)
        ctx.setFontSize(nameFontSize)
        ctx.setTextAlign('left')
        ctx.setTextBaseline('top')
        ctx.fillText(`${result.name}`, cardX + cardWidth * 0.05, cardY + cardH * 0.12)

        const issueFontSize = Math.max(11, cardH * 0.13)
        ctx.setFillStyle(COLORS.textSecondary)
        ctx.setFontSize(issueFontSize)
        ctx.fillText(`第 ${result.issue} 期`, cardX + cardWidth * 0.05, cardY + cardH * 0.42)

        if (result.pool) {
          const poolFontSize = Math.max(11, cardH * 0.12)
          ctx.setFillStyle(COLORS.prizePool)
          ctx.setFontSize(poolFontSize)
          ctx.setTextAlign('right')
          ctx.setTextBaseline('top')
          ctx.fillText(`奖池 ${result.pool}`, cardX + cardWidth - cardWidth * 0.05, cardY + cardH * 0.12)
        }

        const ballRadius = Math.min(18, cardH * 0.22)
        const ballSpacing = ballRadius * 0.45
        const allBalls = result.redBalls.length + result.blueBalls.length
        const totalBallsWidth = allBalls * (ballRadius * 2) + (allBalls - 1) * ballSpacing
        const maxBallWidth = cardWidth * 0.9
        let finalRadius = ballRadius
        let finalSpacing = ballSpacing
        let finalTotalWidth = totalBallsWidth
        if (totalBallsWidth > maxBallWidth) {
          const scale = maxBallWidth / totalBallsWidth
          finalRadius = ballRadius * scale
          finalSpacing = ballSpacing * scale
          finalTotalWidth = allBalls * (finalRadius * 2) + (allBalls - 1) * finalSpacing
        }

        let ballX = cardX + (cardWidth - finalTotalWidth) / 2 + finalRadius
        const ballY = cardY + cardH * 0.72

        result.redBalls.forEach((ball) => {
          drawBall(ctx, ballX, ballY, finalRadius, ball, COLORS.redBall)
          ballX += finalRadius * 2 + finalSpacing
        })

        result.blueBalls.forEach((ball) => {
          drawBall(ctx, ballX, ballY, finalRadius, ball, COLORS.blueBall)
          ballX += finalRadius * 2 + finalSpacing
        })

        ctx.restore()
        yOffset += cardHeight
      })

      const footerY = totalHeight - footerHeight
      const qrSize = Math.min(130, footerHeight * 0.7)
      const qrTop = footerY + (footerHeight - qrSize - 20) / 2
      ctx.save()

      const qrRadius = Math.min(20, qrSize * 0.15)
      roundRect(ctx, (width - qrSize) / 2, qrTop, qrSize, qrSize, qrRadius)
      const footerGradient = ctx.createLinearGradient((width - qrSize) / 2, qrTop, (width - qrSize) / 2, qrTop + qrSize)
      footerGradient.addColorStop(0, 'rgba(10, 10, 46, 0.95)')
      footerGradient.addColorStop(1, 'rgba(26, 26, 78, 0.9)')
      ctx.setFillStyle(footerGradient)
      ctx.fill()

      ctx.beginPath()
      roundRect(ctx, (width - qrSize) / 2, qrTop, qrSize, qrSize, qrRadius)
      ctx.setStrokeStyle('rgba(0, 212, 255, 0.3)')
      ctx.setLineWidth(1)
      ctx.stroke()

      ctx.setShadow(0, 8, 25, 'rgba(0, 212, 255, 0.2)')
      ctx.restore()

      const footerTextSize = Math.max(10, width * 0.028)
      ctx.setFillStyle('#87CEEB')
      ctx.setFontSize(footerTextSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('top')
      ctx.fillText('扫码关注获取更多', width / 2, qrTop + qrSize + 5)

      ctx.draw(false, () => {
        clearTimeout(timeoutId)
        Taro.canvasToTempFilePath({
          canvasId: 'posterCanvas',
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => {
            if (retryCount < MAX_RETRY) {
              drawPoster(retryCount + 1).then(resolve).catch(reject)
            } else {
              reject(err)
            }
          }
        })
      })
    })
  }

  return drawPoster(0)
}

export default generateBluePoster