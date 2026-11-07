import type { RgbaImage, TextLineBox } from './types'

/** 一行中“有墨水”的像素数至少占整行宽度的比例 */
const ROW_INK_RATIO = 0.002
/** 一列中“有墨水”的像素数至少占行高的比例 */
const COLUMN_INK_RATIO = 0.03
/** 行内墨水密度上限，超过说明命中的是色块/照片而不是文字 */
const MAX_INK_DENSITY = 0.7
/** 行内墨水密度下限，过滤纯噪点 */
const MIN_INK_DENSITY = 0.004

function otsuThreshold(histogram: Uint32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < histogram.length; i += 1) {
    sum += i * histogram[i]
  }

  let sumBackground = 0
  let weightBackground = 0
  let maxVariance = -1
  let threshold = 127

  for (let i = 0; i < histogram.length; i += 1) {
    weightBackground += histogram[i]
    if (weightBackground === 0) {
      continue
    }

    const weightForeground = total - weightBackground
    if (weightForeground === 0) {
      break
    }

    sumBackground += i * histogram[i]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) * (meanBackground - meanForeground)

    if (variance > maxVariance) {
      maxVariance = variance
      threshold = i
    }
  }

  return threshold
}

interface RowRun {
  start: number
  end: number
}

function mergeRuns(runs: RowRun[], maxGap: number): RowRun[] {
  if (runs.length <= 1) {
    return runs
  }

  const merged: RowRun[] = [runs[0]]
  for (let i = 1; i < runs.length; i += 1) {
    const current = runs[i]
    const previous = merged[merged.length - 1]
    if (current.start - previous.end <= maxGap) {
      previous.end = current.end
    } else {
      merged.push({ ...current })
    }
  }

  return merged
}

function median(values: number[]): number {
  if (!values.length) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * 基于水平投影的轻量文本行检测。
 *
 * 说明：项目只引入了 PP-OCRv6 的识别模型（没有检测模型），因此这里用
 * 二值化 + 行/列投影来切分文本行。对于截图、票据、公告这类背景干净、
 * 排版规整的图片效果较好；复杂照片类图片建议接入检测模型。
 */
export function detectTextLines(image: RgbaImage): TextLineBox[] {
  const { data, width, height } = image
  const total = width * height
  if (!total) {
    return []
  }

  const gray = new Uint8Array(total)
  const histogram = new Uint32Array(256)
  for (let i = 0, p = 0; i < total; i += 1, p += 4) {
    const value = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000
    const level = value | 0
    gray[i] = level
    histogram[level] += 1
  }

  const threshold = otsuThreshold(histogram, total)

  let darkCount = 0
  for (let i = 0; i < total; i += 1) {
    if (gray[i] <= threshold) {
      darkCount += 1
    }
  }

  // 多数像素偏暗时，认为文字是亮色（深色背景截图）
  const inkIsDark = darkCount <= total * 0.55
  const ink = new Uint8Array(total)
  let inkTotal = 0
  for (let i = 0; i < total; i += 1) {
    const isInk = inkIsDark ? gray[i] <= threshold : gray[i] > threshold
    if (isInk) {
      ink[i] = 1
      inkTotal += 1
    }
  }

  if (inkTotal < total * 0.0005) {
    return []
  }

  const rowInk = new Uint32Array(height)
  for (let y = 0; y < height; y += 1) {
    const offset = y * width
    let count = 0
    for (let x = 0; x < width; x += 1) {
      if (ink[offset + x]) {
        count += 1
      }
    }
    rowInk[y] = count
  }

  const rowThreshold = Math.max(2, Math.round(width * ROW_INK_RATIO))
  const rawRuns: RowRun[] = []
  let runStart = -1
  for (let y = 0; y <= height; y += 1) {
    const active = y < height && rowInk[y] >= rowThreshold
    if (active && runStart < 0) {
      runStart = y
    } else if (!active && runStart >= 0) {
      if (y - runStart >= 2) {
        rawRuns.push({ start: runStart, end: y })
      }
      runStart = -1
    }
  }

  if (!rawRuns.length) {
    return []
  }

  const medianRunHeight = median(rawRuns.map((run) => run.end - run.start))
  const mergeGap = Math.max(1, Math.min(8, Math.round(medianRunHeight * 0.2)))
  const minLineHeight = Math.max(4, Math.round(height * 0.003))
  const maxLineHeight = Math.max(8, Math.round(height * 0.45))

  const boxes: TextLineBox[] = []
  const columnInk = new Uint32Array(width)

  for (const run of mergeRuns(rawRuns, mergeGap)) {
    const bandHeight = run.end - run.start
    if (bandHeight < minLineHeight || bandHeight > maxLineHeight) {
      continue
    }

    columnInk.fill(0)
    let bandInk = 0
    for (let y = run.start; y < run.end; y += 1) {
      const offset = y * width
      for (let x = 0; x < width; x += 1) {
        if (ink[offset + x]) {
          columnInk[x] += 1
          bandInk += 1
        }
      }
    }

    const columnThreshold = Math.max(1, Math.round(bandHeight * COLUMN_INK_RATIO))
    let left = -1
    let right = -1
    for (let x = 0; x < width; x += 1) {
      if (columnInk[x] >= columnThreshold) {
        if (left < 0) {
          left = x
        }
        right = x
      }
    }

    if (left < 0) {
      continue
    }

    const padding = Math.max(1, Math.round(bandHeight * 0.06))
    const x = Math.max(0, left - padding)
    const y = Math.max(0, run.start - padding)
    const boxWidth = Math.min(width - x, right - left + 1 + padding * 2)
    const boxHeight = Math.min(height - y, bandHeight + padding * 2)

    if (boxWidth < 4 || boxHeight < 4) {
      continue
    }

    const density = bandInk / (boxWidth * boxHeight)
    if (density < MIN_INK_DENSITY || density > MAX_INK_DENSITY) {
      continue
    }

    boxes.push({ x, y, width: boxWidth, height: boxHeight })
  }

  return boxes.sort((a, b) => a.y - b.y)
}
