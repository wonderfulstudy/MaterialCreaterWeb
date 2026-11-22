/**
 * 我的微信二维码相关的类型与常量（存储键与文件路径来自 docs/api/auth-contract.md）
 */

export type WechatQrErrorCode =
  | 'invalid_image'
  | 'not_recognized'
  | 'permission_denied'
  | 'save_failed'
  | 'storage_failed'
  | 'unsupported'

export class WechatQrError extends Error {
  readonly code: WechatQrErrorCode

  constructor(code: WechatQrErrorCode, message: string) {
    super(message)
    this.name = 'WechatQrError'
    this.code = code
  }
}

export type QrImportResult =
  | { status: 'ok'; value: string }
  | { status: 'cancelled' }
  | { status: 'error'; code: WechatQrErrorCode }

/** album = 微信端写入相册；download = H5 降级为浏览器下载 */
export type QrSaveTarget = 'album' | 'download'

/** 契约：二维码存储键 */
export const WECHAT_QR_STORAGE_KEY = 'mc.wechat.qr.v1'

/** 契约：微信端持久化文件名（USER_DATA_PATH/wechat-qr.png） */
export const WECHAT_QR_FILE_NAME = 'wechat-qr.png'

/** 单张二维码图片体积上限 5MB（超出即视为非法截图，页面给导入失败提示） */
export const MAX_QR_IMAGE_BYTES = 5 * 1024 * 1024
