import Taro from '@tarojs/taro'
import { WECHAT_QR_STORAGE_KEY } from './types'

export function readQrPath(): string {
  try {
    const value = Taro.getStorageSync(WECHAT_QR_STORAGE_KEY)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

export function saveQrPath(value: string): boolean {
  if (!value) return false
  try {
    Taro.setStorageSync(WECHAT_QR_STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

export function clearQrPath(): void {
  try {
    Taro.removeStorageSync(WECHAT_QR_STORAGE_KEY)
  } catch {
    // 存储不可用时忽略：读取端本就会回落到空态
  }
}
