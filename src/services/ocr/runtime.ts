import { OCR_MODEL } from './config'
import type { OcrSession, RecInput, RecOutput } from './types'

interface WxTensor {
  type: string
  data: ArrayBuffer
  shape: number[]
}

interface WxInferenceSession {
  onLoad(callback: () => void): void
  onError(callback: (error: unknown) => void): void
  run(inputs: Record<string, WxTensor>): Promise<Record<string, WxTensor>>
  destroy(): void
}

interface WxFileSystemManager {
  accessSync(path: string): void
  readFileSync(path: string): ArrayBuffer
  writeFileSync(path: string, data: ArrayBuffer): void
  unlinkSync?(path: string): void
  copyFileSync?(srcPath: string, destPath: string): void
  statSync?(path: string): { size: number }
}

interface WxDownloadTask {
  onProgressUpdate?(callback: (result: { progress: number; totalBytesWritten: number }) => void): void
  abort?(): void
}

interface WxApi {
  createInferenceSession?: (options: {
    model: string
    precisionLevel?: number
    allowNPU?: boolean
    allowQuantize?: boolean
    typicalShape?: Record<string, number[]>
  }) => WxInferenceSession
  getFileSystemManager?: () => WxFileSystemManager
  downloadFile?: (options: {
    url: string
    timeout?: number
    success: (result: { tempFilePath: string; statusCode?: number }) => void
    fail: (error: unknown) => void
  }) => WxDownloadTask | undefined
  env?: { USER_DATA_PATH: string }
}

function getWx(): WxApi | undefined {
  return (globalThis as unknown as { wx?: WxApi }).wx
}

/** 当前运行环境是否具备本地推理能力 */
export function isOcrSupported(): boolean {
  const wxApi = getWx()
  return typeof wxApi?.createInferenceSession === 'function'
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'string') {
    return new Error(error)
  }
  if (error && typeof error === 'object') {
    const record = error as { errMsg?: unknown; message?: unknown; errCode?: unknown }
    const message = record.errMsg ?? record.message
    if (message) {
      return new Error(String(message))
    }
    if (record.errCode !== undefined) {
      return new Error(`错误码 ${String(record.errCode)}`)
    }
  }
  return new Error('模型推理失败')
}

/**
 * 代码包内模型路径的几种写法：不同基础库对「代码包相对路径」的解析不一致，
 * 逐个尝试可避免因路径规则差异导致的加载失败。
 */
const MODEL_PATH_CANDIDATES = [
  OCR_MODEL.modelPath,
  `./${OCR_MODEL.modelPath}`,
  `/${OCR_MODEL.modelPath}`,
]

function createSession(wxApi: WxApi, modelPath: string): Promise<WxInferenceSession> {
  return new Promise<WxInferenceSession>((resolve, reject) => {
    let session: WxInferenceSession | undefined
    let settled = false

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        try {
          session?.destroy()
        } catch {
          // ignore
        }
        reject(error)
      } else {
        resolve(session!)
      }
    }

    const timer = setTimeout(() => finish(new Error('模型加载超时，请重试')), 60000)

    try {
      session = wxApi.createInferenceSession!({
        model: modelPath,
        precisionLevel: OCR_MODEL.precisionLevel,
        allowNPU: false,
        allowQuantize: false,
        typicalShape: {
          [OCR_MODEL.inputName]: [1, 3, OCR_MODEL.recHeight, 320],
        },
      })
    } catch (error) {
      finish(toError(error))
      return
    }

    session.onError((error) => finish(toError(error)))
    session.onLoad(() => finish())
  })
}

/** 本地用户目录中已缓存的模型路径 */
function findCachedModel(wxApi: WxApi): string | undefined {
  if (typeof wxApi.getFileSystemManager !== 'function' || !wxApi.env?.USER_DATA_PATH) {
    return undefined
  }

  const target = `${wxApi.env.USER_DATA_PATH}/${OCR_MODEL.fileName}`
  try {
    wxApi.getFileSystemManager().accessSync(target)
    return target
  } catch {
    return undefined
  }
}

/** 删除损坏/过期的缓存文件 */
function removeModelFile(wxApi: WxApi, path: string): void {
  try {
    wxApi.getFileSystemManager?.().unlinkSync?.(path)
  } catch {
    // ignore
  }
}

/** 代码包内该路径是否存在（开发者工具可能过滤无依赖文件） */
function existsInPackage(wxApi: WxApi, path: string): boolean {
  if (typeof wxApi.getFileSystemManager !== 'function') {
    return false
  }
  try {
    wxApi.getFileSystemManager().accessSync(path)
    return true
  } catch {
    return false
  }
}

/** 把代码包内的模型复制到可写的用户目录 */
function copyPackageModelToUserData(wxApi: WxApi, packagePath: string): string {
  if (typeof wxApi.getFileSystemManager !== 'function' || !wxApi.env?.USER_DATA_PATH) {
    throw new Error('文件系统不可用（wx.getFileSystemManager / wx.env.USER_DATA_PATH 缺失）')
  }

  const fileSystem = wxApi.getFileSystemManager()
  const target = `${wxApi.env.USER_DATA_PATH}/${OCR_MODEL.fileName}`
  const buffer = fileSystem.readFileSync(packagePath)
  fileSystem.writeFileSync(target, buffer)
  return target
}

/** 下载文件到临时路径 */
function downloadFile(
  wxApi: WxApi,
  url: string,
  onProgress?: (percent: number) => void
): Promise<{ tempFilePath: string; statusCode?: number }> {
  if (typeof wxApi.downloadFile !== 'function') {
    throw new Error('当前环境不支持文件下载（wx.downloadFile 缺失）')
  }

  return new Promise((resolve, reject) => {
    const task = wxApi.downloadFile!({
      url,
      timeout: OCR_MODEL.downloadTimeout,
      success: resolve,
      fail: (error) => reject(toError(error)),
    })
    task?.onProgressUpdate?.((result) => {
      if (typeof result?.progress === 'number') {
        onProgress?.(Math.max(0, Math.min(100, Math.round(result.progress))))
      }
    })
  })
}

/** 把底层下载错误翻译成可操作的提示 */
function describeDownloadError(error: Error, url: string): string {
  const message = error.message || ''

  if (/not in domain list|domain list|合法域名/i.test(message)) {
    const host = url.replace(/^https?:\/\//, '').split('/')[0]
    return `下载域名未配置：请在小程序后台「开发管理 → 开发设置 → 服务器域名 → downloadFile 合法域名」添加 ${host}，开发阶段可临时勾选「不校验合法域名」`
  }
  if (/timeout|超时/i.test(message)) {
    return `模型下载超时（超过 ${Math.round(OCR_MODEL.downloadTimeout / 1000)} 秒），请检查网络后重试`
  }
  if (/network|ERR_|abort/i.test(message)) {
    return `模型下载失败（网络异常）：${message}`
  }
  return `模型下载失败：${message}`
}

/** 结合 HTTP 状态码给出的提示，OSS 常见状态码单独说明 */
function describeHttpStatus(statusCode: number): string {
  if (statusCode === 403) {
    return '模型下载被拒绝（HTTP 403）：对象不是公共读，或链接的签名已过期。请把该对象设为公共读后使用不带参数的直链'
  }
  if (statusCode === 404) {
    return '模型下载失败（HTTP 404）：对象不存在，请检查 Bucket 中的文件路径与文件名'
  }
  return `模型下载失败，HTTP ${statusCode}`
}

/** 读取字节前若干位作为可读文本（小程序环境不保证有 TextDecoder） */
function previewAscii(buffer: ArrayBuffer, maxBytes: number): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes))
  let text = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const code = bytes[i]
    text += code >= 32 && code < 127 ? String.fromCharCode(code) : code === 10 || code === 13 ? ' ' : '.'
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** 校验下载结果：既看大小，也看是否其实是 XML/HTML 报错页 */
function assertModelFile(wxApi: WxApi, path: string): void {
  const fileSystem = wxApi.getFileSystemManager?.()
  if (!fileSystem) {
    return
  }

  const size = fileSystem.statSync?.(path)?.size
  if (size === undefined) {
    return
  }

  if (size === 0) {
    throw new Error('模型下载结果为空文件')
  }
  if (size === OCR_MODEL.expectedBytes) {
    return
  }

  // 体积对不上时，多半是服务端把错误信息当成文件返回了
  if (size < 64 * 1024) {
    let preview = ''
    try {
      const buffer = fileSystem.readFileSync(path)
      preview = previewAscii(buffer, 200)
    } catch {
      // ignore
    }
    const detail = preview.startsWith('<') ? `，服务端返回：${preview}` : ''
    throw new Error(`模型下载内容不是有效的 ONNX 文件（${size} 字节）${detail}`)
  }

  throw new Error(
    `模型下载不完整：期望 ${OCR_MODEL.expectedBytes} 字节，实际 ${size} 字节，请重试`
  )
}

/** 代码包不可用时的兜底：从远端下载模型并缓存到用户目录 */
async function downloadModelToUserData(
  wxApi: WxApi,
  onProgress?: (percent: number) => void
): Promise<string> {
  const url = getRemoteUrl()
  if (!url) {
    throw new Error(
      '未配置模型下载地址。请在 src/services/ocr/config.ts 填写 remoteUrl（公共读直链），或构建时设置 OCR_MODEL_URL，或运行时调用 setOcrModelUrl(url)'
    )
  }
  if (typeof wxApi.getFileSystemManager !== 'function' || !wxApi.env?.USER_DATA_PATH) {
    throw new Error('文件系统不可用（wx.getFileSystemManager / wx.env.USER_DATA_PATH 缺失）')
  }

  const cached = findCachedModel(wxApi)
  if (cached) {
    return cached
  }

  let downloaded: { tempFilePath: string; statusCode?: number }
  try {
    downloaded = await downloadFile(wxApi, url, onProgress)
  } catch (error) {
    throw new Error(describeDownloadError(error as Error, url))
  }

  const { tempFilePath, statusCode } = downloaded
  if (statusCode && statusCode !== 200) {
    throw new Error(describeHttpStatus(statusCode))
  }
  if (!tempFilePath) {
    throw new Error('模型下载失败：未返回临时文件路径')
  }

  assertModelFile(wxApi, tempFilePath)

  const fileSystem = wxApi.getFileSystemManager()
  const target = `${wxApi.env.USER_DATA_PATH}/${OCR_MODEL.fileName}`
  if (typeof fileSystem.copyFileSync === 'function') {
    fileSystem.copyFileSync(tempFilePath, target)
  } else {
    fileSystem.writeFileSync(target, fileSystem.readFileSync(tempFilePath))
  }

  assertModelFile(wxApi, target)
  return target
}

function toOcrSession(session: WxInferenceSession): OcrSession {
  return {
    async run(input: RecInput): Promise<RecOutput> {
      const result = await session.run({
        [OCR_MODEL.inputName]: {
          type: 'float32',
          data: input.data.buffer as ArrayBuffer,
          shape: [1, 3, input.height, input.width],
        },
      })

      const tensor =
        result[OCR_MODEL.outputName] ?? result.output0 ?? (Object.values(result)[0] as WxTensor | undefined)

      if (!tensor) {
        throw new Error('模型没有返回推理结果')
      }

      const shape = tensor.shape ?? []
      const timeSteps = shape.length >= 2 ? shape[shape.length - 2] : 0
      const classes = shape.length >= 1 ? shape[shape.length - 1] : 0

      return {
        data: new Float32Array(tensor.data),
        timeSteps,
        classes,
      }
    },
    destroy() {
      try {
        session.destroy()
      } catch {
        // ignore
      }
    },
  }
}

let remoteUrl = OCR_MODEL.remoteUrl

/**
 * 运行时覆盖模型下载地址。
 *
 * OSS 的签名链接会过期，可以由后端下发新链接后调用本方法：
 *   setOcrModelUrl(res.url)
 * 传入空字符串表示清除覆盖，回到构建时配置的地址。
 */
export function setOcrModelUrl(url: string): void {
  remoteUrl = url ? url.trim() : OCR_MODEL.remoteUrl
  // 地址变了意味着可能要重新下载，重置会话让下次识别重新准备模型
  releaseOcrSession()
}

function getRemoteUrl(): string {
  return remoteUrl
}

async function loadSession(options: LoadSessionOptions = {}): Promise<OcrSession> {
  const wxApi = getWx()
  if (!wxApi || typeof wxApi.createInferenceSession !== 'function') {
    throw new Error('当前环境不支持本地 AI 推理，请在微信小程序（基础库 2.30.0+）中使用')
  }

  const failures: string[] = []

  // 已经下载/复制过的本地模型，直接加载，避免每次启动重复拷贝大文件
  const cached = findCachedModel(wxApi)
  if (cached) {
    try {
      return toOcrSession(await createSession(wxApi, cached))
    } catch (error) {
      failures.push(`本地缓存 ${cached}: ${toError(error).message}`)
      // 缓存可能已损坏，删除后走后续流程重新准备
      removeModelFile(wxApi, cached)
    }
  }

  // 优先加载代码包内的模型。先确认文件真实存在：
  // 开发者工具的「忽略未使用文件」会把没有 JS 依赖的 .onnx 过滤掉，
  // 此时直接交给 createInferenceSession 只会得到含义不明的 "model path invalid"。
  const packagePaths = MODEL_PATH_CANDIDATES.filter((candidate) => existsInPackage(wxApi, candidate))

  if (!packagePaths.length) {
    failures.push(
      `代码包内找不到 ${OCR_MODEL.modelPath}。若为开发者工具，请关闭「详情 → 本地设置 → 忽略未使用的文件」，或直接使用「不校验」模式重新编译`
    )
  }

  for (const candidate of packagePaths) {
    // 代码包路径能被识别时直接加载，省去一次 4MB 拷贝
    try {
      return toOcrSession(await createSession(wxApi, candidate))
    } catch (error) {
      failures.push(`${candidate}: ${toError(error).message}`)
    }

    // 部分基础库不接受代码包路径，复制到用户目录（可写）后再加载
    try {
      const localPath = copyPackageModelToUserData(wxApi, candidate)
      return toOcrSession(await createSession(wxApi, localPath))
    } catch (error) {
      failures.push(`${candidate} 复制到本地: ${toError(error).message}`)
    }
  }

  // 真机包体放不下模型时，从配置的地址下载
  try {
    const downloadedPath = await downloadModelToUserData(wxApi, options.onDownloadProgress)
    return toOcrSession(await createSession(wxApi, downloadedPath))
  } catch (error) {
    failures.push(`下载模型: ${toError(error).message}`)
  }

  console.warn('[ocr] 模型加载失败', failures)

  if (!getRemoteUrl()) {
    throw new Error(
      `模型加载失败：代码包内没有 ${OCR_MODEL.modelPath}，也没有配置下载地址。请在 src/services/ocr/config.ts 填写 remoteUrl（公共读直链），或构建时设置 OCR_MODEL_URL`
    )
  }

  // 已经配置了下载地址，说明用户就是想走远端，优先暴露下载失败的原因
  const downloadFailure = failures.find((item) => item.startsWith('下载模型: '))
  const reason = downloadFailure ?? failures[0] ?? '未知原因'
  throw new Error(`模型加载失败：${reason.replace(/^下载模型: /, '')}`)
}

export interface LoadSessionOptions {
  /** 下载模型时的进度回调（0-100） */
  onDownloadProgress?: (percent: number) => void
}

let sessionPromise: Promise<OcrSession> | undefined

/** 单例推理会话：模型加载较慢，页面内重复识别时复用 */
export function getOcrSession(options: LoadSessionOptions = {}): Promise<OcrSession> {
  if (!sessionPromise) {
    sessionPromise = loadSession(options).catch((error) => {
      sessionPromise = undefined
      throw error
    })
  }
  return sessionPromise
}

export function releaseOcrSession(): void {
  sessionPromise
    ?.then((session) => session.destroy())
    .catch(() => undefined)
  sessionPromise = undefined
}
