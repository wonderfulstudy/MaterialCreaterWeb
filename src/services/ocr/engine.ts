import { OCR_MODEL } from './config'
import { loadRgbaImage } from './canvas'
import { decodeCtc } from './decode'
import { buildRecInput } from './preprocess'
import { getOcrSession } from './runtime'
import { detectTextLines } from './segment'
import type { OcrLine, OcrProgress, OcrResult } from './types'

export interface RecognizeOptions {
  onProgress?: (progress: OcrProgress) => void
}

/** 识别结果的日志结构，便于在控制台折叠查看 */
export interface ResultLog {
  /** 完整识别文本（按行拼接） */
  文本: string
  /** 识别到的文本行数 */
  行数: number
  /** 图片尺寸（分析时已缩放） */
  图片尺寸: string
  /** 总耗时（毫秒） */
  耗时ms: number
  /** 每行明细 */
  明细: Array<{
    序号: number
    文本: string
    置信度: number
    区域: string
  }>
}

/** 组装可打印的识别结果，独立成函数便于测试 */
export function buildResultLog(result: OcrResult): ResultLog {
  return {
    文本: result.text,
    行数: result.lines.length,
    图片尺寸: `${result.imageWidth}×${result.imageHeight}`,
    耗时ms: result.durationMs,
    明细: result.lines.map((line, index) => ({
      序号: index + 1,
      文本: line.text,
      置信度: Number(line.score.toFixed(3)),
      区域: `x=${line.box.x} y=${line.box.y} w=${line.box.width} h=${line.box.height}`,
    })),
  }
}

/** 把识别结果打印到控制台 */
export function logResult(sourcePath: string, result: OcrResult): void {
  if (!OCR_MODEL.logResults) {
    return
  }

  console.log(`[ocr] 识别完成：${sourcePath}`)
  console.log(`[ocr] 识别文本（${result.lines.length} 行）：\n${result.text}`)
  console.table?.(buildResultLog(result).明细)
  console.log('[ocr] 识别详情：', buildResultLog(result))
}

/**
 * 识别图片中的文字。
 *
 * 流程：解码图片 → 投影切分文本行 → 逐行送入 PP-OCRv6 识别 → CTC 解码。
 */
export async function recognizeImage(sourcePath: string, options: RecognizeOptions = {}): Promise<OcrResult> {
  if (!sourcePath) {
    throw new Error('请先选择图片')
  }

  const startedAt = Date.now()
  const onProgress = options.onProgress

  onProgress?.({ stage: 'loading', current: 0, total: 0 })

  const [image, session] = await Promise.all([
    loadRgbaImage(sourcePath),
    getOcrSession({
      onDownloadProgress: (percent) => {
        if (percent < 100) {
          onProgress?.({ stage: 'downloading', current: percent, total: 100, percent })
        }
      },
    }),
  ])

  onProgress?.({ stage: 'segmenting', current: 0, total: 0 })

  const boxes = detectTextLines(image)
  if (!boxes.length) {
    throw new Error('未检测到文字，请换一张文字更清晰、背景更干净的图片')
  }

  const targets = boxes.slice(0, OCR_MODEL.maxLines)
  const lines: OcrLine[] = []

  for (let index = 0; index < targets.length; index += 1) {
    onProgress?.({ stage: 'recognizing', current: index + 1, total: targets.length })

    const input = buildRecInput(image, targets[index])
    const output = await session.run(input)
    const decoded = decodeCtc(output.data, output.timeSteps, output.classes)

    if (decoded.text) {
      lines.push({ text: decoded.text, score: decoded.score, box: targets[index] })
    }
  }

  const result: OcrResult = {
    text: lines.map((line) => line.text).join('\n'),
    lines,
    imageWidth: image.width,
    imageHeight: image.height,
    durationMs: Date.now() - startedAt,
  }

  logResult(sourcePath, result)
  return result
}