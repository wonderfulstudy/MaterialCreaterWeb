import { PPOCRV6_TINY_DICT } from './dict'

/**
 * PP-OCRv6 的 CTC 输出类别布局（实测 tiny 模型 classes = 6906）：
 *   0                         -> blank
 *   1 .. dict.length          -> 字典字符（下标 - 1）
 *   dict.length + 1 .. 末尾   -> 空格等特殊字符
 */
const BLANK_INDEX = 0

export interface DecodedText {
  text: string
  /** 所有有效字符的平均置信度，0 - 1 */
  score: number
}

let cachedClasses = -1
let cachedLabels: string[] = []

function buildLabels(classes: number, dict: string[]): string[] {
  if (cachedClasses === classes && cachedLabels.length && dict === PPOCRV6_TINY_DICT) {
    return cachedLabels
  }

  const labels = new Array<string>(classes).fill('')
  for (let i = 0; i < dict.length && i + 1 < classes; i += 1) {
    labels[i + 1] = dict[i]
  }
  // 末尾类别为空格（PaddleOCR 的 use_space_char）
  if (classes > dict.length + 1) {
    labels[classes - 1] = ' '
  }

  cachedClasses = classes
  cachedLabels = labels
  return labels
}

/** 判断输出是否已经过 softmax（模型导出时通常已包含） */
function isProbabilityOutput(raw: Float32Array, classes: number): boolean {
  if (!classes) {
    return false
  }
  for (let i = 0; i < classes; i += 1) {
    const value = raw[i]
    if (value < -0.0001 || value > 1.0001) {
      return false
    }
  }
  return true
}

/**
 * CTC 贪心解码：取每个时间步的最大类别，合并重复、去掉 blank。
 */
export function decodeCtc(
  raw: Float32Array,
  timeSteps: number,
  classes: number,
  dict: string[] = PPOCRV6_TINY_DICT
): DecodedText {
  if (!timeSteps || !classes) {
    return { text: '', score: 0 }
  }

  const labels = buildLabels(classes, dict)
  const probabilityOutput = isProbabilityOutput(raw, classes)

  let text = ''
  let scoreSum = 0
  let emitted = 0
  let previousIndex = -1

  for (let t = 0; t < timeSteps; t += 1) {
    const offset = t * classes
    let bestIndex = 0
    let bestValue = raw[offset]

    for (let c = 1; c < classes; c += 1) {
      const value = raw[offset + c]
      if (value > bestValue) {
        bestValue = value
        bestIndex = c
      }
    }

    if (bestIndex !== BLANK_INDEX && bestIndex !== previousIndex) {
      const label = labels[bestIndex]
      if (label) {
        text += label
      }

      if (probabilityOutput) {
        scoreSum += bestValue
      } else {
        let sum = 0
        for (let c = 0; c < classes; c += 1) {
          sum += Math.exp(raw[offset + c] - bestValue)
        }
        scoreSum += 1 / sum
      }
      emitted += 1
    }

    previousIndex = bestIndex
  }

  return {
    text: text.trim(),
    score: emitted ? scoreSum / emitted : 0,
  }
}
