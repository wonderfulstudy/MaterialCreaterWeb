/** 与平台无关的 RGBA 位图数据（每像素 4 字节） */
export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** 文本行在原图中的矩形区域 */
export interface TextLineBox {
  x: number
  y: number
  width: number
  height: number
}

/** 识别模型输入：NCHW float32，通道顺序 BGR，取值 [-1, 1] */
export interface RecInput {
  data: Float32Array
  width: number
  height: number
}

/** 识别模型输出：CTC logits / 概率，形状 [1, timeSteps, classes] */
export interface RecOutput {
  data: Float32Array
  timeSteps: number
  classes: number
}

/** 推理会话抽象，便于替换运行时（小程序 / 浏览器） */
export interface OcrSession {
  run(input: RecInput): Promise<RecOutput>
  destroy(): void
}

export interface OcrLine {
  text: string
  score: number
  box: TextLineBox
}

export interface OcrResult {
  /** 所有文本行按从上到下顺序拼接，行间以换行分隔 */
  text: string
  lines: OcrLine[]
  imageWidth: number
  imageHeight: number
  durationMs: number
}

export type OcrStage = 'downloading' | 'loading' | 'segmenting' | 'recognizing'

export interface OcrProgress {
  stage: OcrStage
  current: number
  total: number
  /** 下载阶段进度百分比 0-100 */
  percent?: number
}
