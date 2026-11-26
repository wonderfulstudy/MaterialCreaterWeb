import Taro from '@tarojs/taro'
import type { KeyValueStore } from '@mc/core/platform/storage'

/** Web 宿主键值存储：Taro 同步存储；未命中返回 null（Taro 返回空串） */
export const taroStorage: KeyValueStore = {
  get(key: string): string | null {
    const value = Taro.getStorageSync(key) as unknown
    if (value === '' || value === undefined || value === null) return null
    // Taro H5 会原样还原结构化值，统一序列化成字符串交给业务层解析
    return typeof value === 'string' ? value : JSON.stringify(value)
  },
  set(key: string, value: string): void {
    Taro.setStorageSync(key, value)
  },
  remove(key: string): void {
    Taro.removeStorageSync(key)
  },
}
