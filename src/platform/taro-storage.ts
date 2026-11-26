import type { KeyValueStore } from '@mc/core/platform/storage'

declare function require(id: string): any

interface TaroRuntime {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
}

/** 懒加载宿主 SDK：方法内取，测试里 jest.mock('@tarojs/taro') 的工厂才能生效 */
function taro(): TaroRuntime {
  const mod: any = require('@tarojs/taro')
  return mod.default ?? mod
}

/** Web 宿主键值存储：Taro 同步存储；未命中返回 null（Taro 返回空串） */
export const taroStorage: KeyValueStore = {
  get(key: string): string | null {
    const value = taro().getStorageSync(key)
    return value === '' || value === undefined || value === null ? null : String(value)
  },
  set(key: string, value: string): void {
    taro().setStorageSync(key, value)
  },
  remove(key: string): void {
    taro().removeStorageSync(key)
  },
}
