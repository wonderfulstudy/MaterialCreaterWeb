import { OCR_MODEL } from './config'
import type { RecInput, RgbaImage, TextLineBox } from './types'

interface AxisMap {
  lower: Int32Array
  upper: Int32Array
  weight: Float32Array
}

/**
 * 计算目标坐标在源图上的采样位置。
 * 采样点对齐到像素中心，避免整幅图整体偏移半个像素。
 */
function createAxisMap(start: number, length: number, targetLength: number, maxIndex: number): AxisMap {
  const lower = new Int32Array(targetLength)
  const upper = new Int32Array(targetLength)
  const weight = new Float32Array(targetLength)

  for (let i = 0; i < targetLength; i += 1) {
    const source = start + ((i + 0.5) * length) / targetLength - 0.5
    const clamped = Math.min(Math.max(source, 0), maxIndex)
    const low = Math.min(Math.floor(clamped), maxIndex)
    lower[i] = low
    upper[i] = Math.min(low + 1, maxIndex)
    weight[i] = clamped - low
  }

  return { lower, upper, weight }
}

/**
 * 把文本行裁剪并缩放到识别网络输入尺寸。
 *
 * 与 PaddleOCR 的 `RecResizeImg` 保持一致：
 * - 高度固定 48，宽度按原图宽高比缩放
 * - 通道顺序 BGR
 * - 归一化 (x / 255 - 0.5) / 0.5，即 [-1, 1]
 */
export function buildRecInput(
  image: RgbaImage,
  box: TextLineBox,
  targetHeight: number = OCR_MODEL.recHeight,
  maxWidth: number = OCR_MODEL.recMaxWidth
): RecInput {
  const { data, width, height } = image

  const boxX = Math.min(Math.max(box.x, 0), Math.max(0, width - 1))
  const boxY = Math.min(Math.max(box.y, 0), Math.max(0, height - 1))
  const boxWidth = Math.max(1, Math.min(box.width, width - boxX))
  const boxHeight = Math.max(1, Math.min(box.height, height - boxY))

  const targetWidth = Math.max(
    8,
    Math.min(maxWidth, Math.round((targetHeight * boxWidth) / boxHeight))
  )
  const plane = targetWidth * targetHeight
  const output = new Float32Array(plane * 3)

  const xMap = createAxisMap(boxX, boxWidth, targetWidth, width - 1)
  const yMap = createAxisMap(boxY, boxHeight, targetHeight, height - 1)

  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = yMap.lower[y]
    const y1 = yMap.upper[y]
    const wy = yMap.weight[y]
    const row0 = y0 * width
    const row1 = y1 * width

    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = xMap.lower[x]
      const x1 = xMap.upper[x]
      const wx = xMap.weight[x]

      const p00 = (row0 + x0) * 4
      const p10 = (row0 + x1) * 4
      const p01 = (row1 + x0) * 4
      const p11 = (row1 + x1) * 4

      const w00 = (1 - wx) * (1 - wy)
      const w10 = wx * (1 - wy)
      const w01 = (1 - wx) * wy
      const w11 = wx * wy

      const r = data[p00] * w00 + data[p10] * w10 + data[p01] * w01 + data[p11] * w11
      const g = data[p00 + 1] * w00 + data[p10 + 1] * w10 + data[p01 + 1] * w01 + data[p11 + 1] * w11
      const b = data[p00 + 2] * w00 + data[p10 + 2] * w10 + data[p01 + 2] * w01 + data[p11 + 2] * w11

      const index = y * targetWidth + x
      output[index] = b / 127.5 - 1
      output[plane + index] = g / 127.5 - 1
      output[plane * 2 + index] = r / 127.5 - 1
    }
  }

  return { data: output, width: targetWidth, height: targetHeight }
}
