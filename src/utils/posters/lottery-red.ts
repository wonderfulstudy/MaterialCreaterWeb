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
  bgStart: '#8B0000',
  bgMiddle: '#DC143C',
  bgEnd: '#FF6B6B',
  title: '#FFFFFF',
  subtitle: '#FFD700',
  date: '#FFFACD',
  cardBg: 'rgba(255, 255, 255, 0.15)',
  cardBorder: 'rgba(255, 215, 0, 0.3)',
  redBall: '#FF4757',
  blueBall: '#3742FA',
  prizePool: '#FFD700',
  textSecondary: 'rgba(255, 255, 255, 0.85)',
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

function drawBall(ctx: Taro.CanvasContext, x: number, y: number, radius: number, number: string, color: string) {
  ctx.save()
  
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.setFillStyle(color)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.35, 0, 2 * Math.PI)
  ctx.setFillStyle('rgba(255, 255, 255, 0.4)')
  ctx.fill()

  ctx.setFillStyle('#FFFFFF')
  ctx.setFontSize(radius * 0.8)
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  ctx.fillText(number, x, y)
  ctx.restore()
}

export interface RedPosterOptions {
  results: LatestResult[]
  width?: number
  height?: number
}

export async function generateRedPoster(options: RedPosterOptions): Promise<string> {
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

      const totalHeight = height || (200 + results.length * 160 + 180 + 60)

      const headerHeight = totalHeight * 0.22
      const footerHeight = totalHeight * 0.18
      const contentTop = headerHeight
      const availableContentHeight = totalHeight - headerHeight - footerHeight
      const cardHeight = availableContentHeight / results.length
      const cardPadding = cardHeight * 0.08
      const cardInnerHeight = cardHeight - cardPadding * 2

      const gradient = ctx.createLinearGradient(0, 0, width, totalHeight)
      gradient.addColorStop(0, COLORS.bgStart)
      gradient.addColorStop(0.5, COLORS.bgMiddle)
      gradient.addColorStop(1, COLORS.bgEnd)
      ctx.setFillStyle(gradient)
      ctx.fillRect(0, 0, width, totalHeight)

      const subtitleFontSize = Math.max(12, width * 0.035)
      ctx.setFillStyle(COLORS.subtitle)
      ctx.setFontSize(subtitleFontSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('top')
      ctx.fillText('✨ 实时开奖 · 智能提醒', width / 2, headerHeight * 0.12)

      const titleFontSize = Math.max(28, width * 0.09)
      ctx.setFillStyle(COLORS.title)
      ctx.setFontSize(titleFontSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('middle')
      ctx.fillText('今日开奖结果', width / 2, headerHeight * 0.5)

      const currentDate = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })
      const dateFontSize = Math.max(11, width * 0.03)
      ctx.setFillStyle(COLORS.date)
      ctx.setFontSize(dateFontSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('top')
      ctx.fillText(`${currentDate}`, width / 2, headerHeight * 0.78)

      let yOffset = contentTop

      const cardX = width * 0.05
      const cardWidth = width - cardX * 2
      const cardRadius = Math.min(12, cardInnerHeight * 0.1)

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

        const nameFontSize = Math.max(18, cardH * 0.22)
        ctx.setFillStyle(COLORS.title)
        ctx.setFontSize(nameFontSize)
        ctx.setTextAlign('left')
        ctx.setTextBaseline('top')
        ctx.fillText(`${result.name}`, cardX + cardWidth * 0.04, cardY + cardH * 0.12)

        const issueFontSize = Math.max(11, cardH * 0.13)
        ctx.setFillStyle(COLORS.textSecondary)
        ctx.setFontSize(issueFontSize)
        ctx.fillText(`第 ${result.issue} 期`, cardX + cardWidth * 0.04, cardY + cardH * 0.42)

        if (result.pool) {
          const poolFontSize = Math.max(11, cardH * 0.12)
          ctx.setFillStyle(COLORS.prizePool)
          ctx.setFontSize(poolFontSize)
          ctx.setTextAlign('right')
          ctx.setTextBaseline('top')
          ctx.fillText(`奖池 ${result.pool}`, cardX + cardWidth - cardWidth * 0.04, cardY + cardH * 0.12)
        }

        const ballRadius = Math.min(18, cardH * 0.22)
        const ballSpacing = ballRadius * 0.4
        const allBalls = result.redBalls.length + result.blueBalls.length
        const totalBallsWidth = allBalls * (ballRadius * 2) + (allBalls - 1) * ballSpacing
        const maxBallWidth = cardWidth * 0.9
        if (totalBallsWidth > maxBallWidth) {
          const scale = maxBallWidth / totalBallsWidth
          const newRadius = ballRadius * scale
          const newSpacing = ballSpacing * scale
          const newTotalWidth = allBalls * (newRadius * 2) + (allBalls - 1) * newSpacing
          let ballX = cardX + (cardWidth - newTotalWidth) / 2 + newRadius
          const ballY = cardY + cardH * 0.72

          result.redBalls.forEach((ball) => {
            drawBall(ctx, ballX, ballY, newRadius, ball, COLORS.redBall)
            ballX += newRadius * 2 + newSpacing
          })

          result.blueBalls.forEach((ball) => {
            drawBall(ctx, ballX, ballY, newRadius, ball, COLORS.blueBall)
            ballX += newRadius * 2 + newSpacing
          })
        } else {
          let ballX = cardX + (cardWidth - totalBallsWidth) / 2 + ballRadius
          const ballY = cardY + cardH * 0.72

          result.redBalls.forEach((ball) => {
            drawBall(ctx, ballX, ballY, ballRadius, ball, COLORS.redBall)
            ballX += ballRadius * 2 + ballSpacing
          })

          result.blueBalls.forEach((ball) => {
            drawBall(ctx, ballX, ballY, ballRadius, ball, COLORS.blueBall)
            ballX += ballRadius * 2 + ballSpacing
          })
        }

        ctx.restore()
        yOffset += cardHeight
      })

      const footerY = totalHeight - footerHeight
      const qrSize = Math.min(120, footerHeight * 0.7)
      ctx.save()
      roundRect(ctx, (width - qrSize) / 2, footerY + (footerHeight - qrSize - 20) / 2, qrSize, qrSize, 12)
      ctx.setFillStyle('rgba(255, 255, 255, 0.95)')
      ctx.fill()
      ctx.restore()

      const footerTextSize = Math.max(10, width * 0.028)
      ctx.setFillStyle('#333333')
      ctx.setFontSize(footerTextSize)
      ctx.setTextAlign('center')
      ctx.setTextBaseline('top')
      ctx.fillText('扫码关注获取更多', width / 2, footerY + (footerHeight - qrSize - 20) / 2 + qrSize + 5)

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

export default generateRedPoster