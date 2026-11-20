/**
 * PP-OCRv6 tiny 文字识别配置。
 *
 * 模型不再随代码包分发：首次识别时按 remoteUrl 下载并缓存到 wx.env.USER_DATA_PATH，
 * 之后离线复用。若本地临时放了 src/ocr_model/ 或 ocr_model/，config/index.ts 仍会把它
 * 拷进代码包，运行时优先用包内文件（modelPath 即代码包内的相对路径）。
 */

/**
 * 构建时注入的模型下载地址（见 config/index.ts 的 defineConstants）。
 *
 * 来源优先级：命令行环境变量 > .env.local > .env，避免把带签名的临时链接提交进仓库：
 *   .env 里写 OCR_MODEL_URL=https://...（已被 gitignore 忽略，推荐）
 *   PowerShell: $env:OCR_MODEL_URL="https://..."; npm run build:weapp
 * 也可以在运行时用 setOcrModelUrl() 覆盖（适合后端下发刷新后的链接）。
 */
declare const __OCR_MODEL_URL__: string | undefined

const BUILD_TIME_REMOTE_URL = typeof __OCR_MODEL_URL__ === 'string' ? __OCR_MODEL_URL__ : ''

export const OCR_MODEL = {
  /** 代码包内的模型路径（仅本地放了模型、随包分发时才会命中；默认走远端下载） */
  modelPath: 'ocr_model/PP-OCRv6_tiny.onnx',
  /** 模型文件名，复制到本地文件系统时使用 */
  fileName: 'PP-OCRv6_tiny.onnx',
  /** 模型字节数，用于校验下载结果是否完整（防止把服务端的 XML/HTML 报错页当成模型存下来） */
  expectedBytes: 4462639,
  /**
   * 模型下载地址：公共读直链。
   *
   * 小程序主包和单个分包的上限都是 2MB，而模型有 4.26MB，因此不随代码包分发：
   * 首次识别时从该地址下载并缓存到 wx.env.USER_DATA_PATH，之后离线可用。
   *
   * 填写方式三选一（优先级从高到低）：
   *   1. 运行时 setOcrModelUrl(url) —— 适合由后端下发地址
   *   2. 构建期 OCR_MODEL_URL（.env / 命令行环境变量）—— 不写进仓库，推荐
   *   3. 直接填在下面这个空字符串里
   *
   * 形如：'https://kael2026.oss-cn-chengdu.aliyuncs.com/PP-OCRv6_tiny.onnx'
   * 要求：HTTPS；不带签名参数（Expires / Signature）；域名需加入
   *       小程序后台「开发管理 → 开发设置 → 服务器域名 → downloadFile 合法域名」。
   */
  remoteUrl: BUILD_TIME_REMOTE_URL,
  /** 模型下载超时（毫秒） */
  downloadTimeout: 120000,
  /** 输入节点名（NCHW: [1, 3, 48, W]） */
  inputName: 'x',
  /** 输出节点名（[1, T, 6906]） */
  outputName: 'fetch_name_0',
  /** 识别网络固定输入高度 */
  recHeight: 48,
  /** 识别网络允许的最大输入宽度 */
  recMaxWidth: 1280,
  /**
   * 0 - 4，数值越大精度越高、速度越慢。
   * 识别任务对数值精度较敏感，这里使用 fp32 + 近似 math 的折中档位。
   */
  precisionLevel: 3,
  /** 图像分析时的最长边，过大只会拖慢处理且对识别精度没有帮助 */
  maxImageSide: 1280,
  /** 单次最多识别的文本行数，避免极端图片耗时过长 */
  maxLines: 60,
  /** 是否把识别结果打印到 console，便于检查识别质量 */
  logResults: true,
} as const
