/**
 * 我的微信二维码：导入 / 读取 / 保存 / 清除
 * - 微信端：临时文件 saveFile 到 USER_DATA_PATH/wechat-qr.png，存储里放路径字符串
 * - H5 端：读取本地图片为 base64 dataURL，存储里直接放 dataURL
 * - 保存到相册：微信端 Taro.saveImageToPhotosAlbum，H5 降级为浏览器下载
 */
import Taro from '@tarojs/taro'
import { readQrPath, saveQrPath } from './storage'
import {
  MAX_QR_IMAGE_BYTES,
  WECHAT_QR_FILE_NAME,
  WechatQrError,
  type QrImportResult,
  type QrSaveTarget,
} from './types'

function isH5(): boolean {
  return process.env.TARO_ENV === 'h5'
}

export function readImage(): string {
  return readQrPath()
}

/** 微信端持久化目标路径（USER_DATA_PATH/wechat-qr.png） */
export function targetFilePath(): string {
  const env = Taro.env
  const root = env && typeof env.USER_DATA_PATH === 'string' ? env.USER_DATA_PATH : ''
  return root ? root + '/' + WECHAT_QR_FILE_NAME : ''
}

function pickImage(): Promise<{ path: string; size: number } | null> {
  return Taro.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album'] })
    .then((result) => {
      const path = result.tempFilePaths && result.tempFilePaths.length > 0 ? result.tempFilePaths[0] : ''
      if (!path) return null
      const file = result.tempFiles && result.tempFiles.length > 0 ? result.tempFiles[0] : null
      return { path, size: file && typeof file.size === 'number' ? file.size : 0 }
    })
    .catch((error: unknown) => {
      if (error && typeof error === 'object') {
        const errMsg = (error as { errMsg?: unknown }).errMsg
        if (typeof errMsg === 'string' && errMsg.indexOf('cancel') >= 0) return null
      }
      throw new WechatQrError('invalid_image', '选择图片失败')
    })
}

function removeFile(filePath: string): Promise<void> {
  const manager = Taro.getFileSystemManager()
  return new Promise<void>((resolve) => {
    manager.access({
      path: filePath,
      success: () => {
        manager.unlink({ filePath, complete: () => resolve() })
      },
      fail: () => resolve(),
    })
  })
}

function persistFile(tempFilePath: string): Promise<string> {
  const target = targetFilePath()
  if (!target) {
    return Promise.reject(new WechatQrError('storage_failed', '当前环境不支持本地文件存储'))
  }
  return removeFile(target).then(
    () =>
      new Promise<string>((resolve, reject) => {
        Taro.getFileSystemManager().saveFile({
          tempFilePath,
          filePath: target,
          success: () => resolve(target),
          fail: () => reject(new WechatQrError('storage_failed', '保存二维码失败')),
        })
      }),
  )
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new WechatQrError('unsupported', '当前环境不支持读取图片'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string' && result.indexOf('data:image/') === 0) resolve(result)
      else reject(new WechatQrError('invalid_image', '图片格式不支持'))
    }
    reader.onerror = () => reject(new WechatQrError('invalid_image', '读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

async function h5ToDataUrl(filePath: string): Promise<string> {
  if (typeof fetch !== 'function') throw new WechatQrError('unsupported', '当前环境不支持导入图片')
  const response = await fetch(filePath)
  if (!response.ok) throw new WechatQrError('invalid_image', '读取图片失败')
  const blob = await response.blob()
  if (blob.size > MAX_QR_IMAGE_BYTES) throw new WechatQrError('invalid_image', '图片体积过大')
  if (blob.type && blob.type.indexOf('image/') !== 0) throw new WechatQrError('invalid_image', '请选择图片文件')
  return readBlobAsDataUrl(blob)
}

export async function importFromAlbum(): Promise<QrImportResult> {
  try {
    const picked = await pickImage()
    if (!picked) return { status: 'cancelled' }
    if (isH5()) {
      const dataUrl = await h5ToDataUrl(picked.path)
      if (!saveQrPath(dataUrl)) return { status: 'error', code: 'storage_failed' }
      return { status: 'ok', value: dataUrl }
    }
    if (picked.size > MAX_QR_IMAGE_BYTES) return { status: 'error', code: 'invalid_image' }
    const value = await persistFile(picked.path)
    if (!saveQrPath(value)) return { status: 'error', code: 'storage_failed' }
    return { status: 'ok', value }
  } catch (error) {
    return { status: 'error', code: error instanceof WechatQrError ? error.code : 'invalid_image' }
  }
}

function downloadInBrowser(filePath: string): void {
  if (typeof document === 'undefined') throw new WechatQrError('unsupported', '当前环境不支持保存图片')
  const link = document.createElement('a')
  link.href = filePath
  link.download = '我的微信二维码.png'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const errMsg = (error as { errMsg?: unknown }).errMsg
  if (typeof errMsg !== 'string') return false
  return (
    errMsg.indexOf('auth deny') >= 0 ||
    errMsg.indexOf('auth denied') >= 0 ||
    errMsg.indexOf('authorize') >= 0 ||
    errMsg.indexOf('permission') >= 0
  )
}

/** 保存到相册：微信端写相册（授权失败抛 permission_denied），H5 端降级下载 */
export async function saveImageToAlbum(filePath: string): Promise<QrSaveTarget> {
  if (!filePath) throw new WechatQrError('save_failed', '没有可保存的图片')
  if (isH5()) {
    downloadInBrowser(filePath)
    return 'download'
  }
  try {
    await Taro.saveImageToPhotosAlbum({ filePath })
    return 'album'
  } catch (error) {
    throw new WechatQrError(
      isPermissionDenied(error) ? 'permission_denied' : 'save_failed',
      '保存到相册失败',
    )
  }
}

export { WechatQrError, MAX_QR_IMAGE_BYTES, WECHAT_QR_FILE_NAME, WECHAT_QR_STORAGE_KEY } from './types'
export type { QrImportResult, QrSaveTarget, WechatQrErrorCode } from './types'
