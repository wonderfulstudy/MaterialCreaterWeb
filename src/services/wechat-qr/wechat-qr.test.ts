import Taro from '@tarojs/taro'
import {
  importFromAlbum,
  readImage,
  saveImageToAlbum,
  MAX_QR_IMAGE_BYTES,
  WECHAT_QR_FILE_NAME,
  WECHAT_QR_STORAGE_KEY,
  WechatQrError,
} from './index'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    env: { USER_DATA_PATH: 'wxfile://usr' },
    chooseImage: jest.fn(),
    saveImageToPhotosAlbum: jest.fn(),
    getFileSystemManager: jest.fn(),
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
  },
}))

interface AccessOption {
  path: string
  success?: () => void
  fail?: () => void
}

interface UnlinkOption {
  filePath: string
  complete?: () => void
}

interface SaveFileOption {
  tempFilePath: string
  filePath: string
  success?: (result: { savedFilePath: string }) => void
  fail?: () => void
}

interface FsMock {
  access: jest.Mock
  unlink: jest.Mock
  saveFile: jest.Mock
}

interface TaroMock {
  env: { USER_DATA_PATH?: string }
  chooseImage: jest.Mock
  saveImageToPhotosAlbum: jest.Mock
  getFileSystemManager: jest.Mock
  getStorageSync: jest.Mock
  setStorageSync: jest.Mock
  removeStorageSync: jest.Mock
}

const taro = Taro as unknown as TaroMock
const store = new Map<string, unknown>()
const fs: FsMock = { access: jest.fn(), unlink: jest.fn(), saveFile: jest.fn() }
const envBefore = process.env.TARO_ENV
const QR_PATH = 'wxfile://usr/' + WECHAT_QR_FILE_NAME

beforeEach(() => {
  store.clear()
  process.env.TARO_ENV = 'weapp'
  taro.getStorageSync.mockImplementation((key: string) => (store.has(key) ? store.get(key) : ''))
  taro.setStorageSync.mockImplementation((key: string, value: unknown) => {
    store.set(key, value)
  })
  taro.removeStorageSync.mockImplementation((key: string) => {
    store.delete(key)
  })
  taro.getFileSystemManager.mockReturnValue(fs)
  fs.access.mockImplementation((option: AccessOption) => {
    if (option.fail) option.fail()
  })
  fs.unlink.mockImplementation((option: UnlinkOption) => {
    if (option.complete) option.complete()
  })
  fs.saveFile.mockImplementation((option: SaveFileOption) => {
    if (option.success) option.success({ savedFilePath: option.filePath })
  })
})

afterEach(() => {
  process.env.TARO_ENV = envBefore
})

describe('wechat-qr service', () => {
  it('微信端导入后写入 USER_DATA_PATH 并持久化路径，读取可还原', async () => {
    taro.chooseImage.mockResolvedValue({
      tempFilePaths: ['wxfile://tmp/qr.png'],
      tempFiles: [{ path: 'wxfile://tmp/qr.png', size: 2048 }],
    })

    const result = await importFromAlbum()

    expect(result).toEqual({ status: 'ok', value: QR_PATH })
    expect(taro.setStorageSync).toHaveBeenCalledWith(WECHAT_QR_STORAGE_KEY, QR_PATH)
    expect(readImage()).toBe(QR_PATH)
    const manager = taro.getFileSystemManager.mock.results[0].value
    expect(manager).toBeTruthy()
    const saveOptions = fs.saveFile.mock.calls[0][0]
    expect(saveOptions.tempFilePath).toBe('wxfile://tmp/qr.png')
    expect(saveOptions.filePath).toBe(QR_PATH)
  })

  it('取消选择时不写入存储且返回 cancelled', async () => {
    taro.chooseImage.mockRejectedValue({ errMsg: 'chooseImage:fail cancel' })

    const result = await importFromAlbum()

    expect(result).toEqual({ status: 'cancelled' })
    expect(store.has(WECHAT_QR_STORAGE_KEY)).toBe(false)
  })

  it('超过 5MB 的图片返回 invalid_image 且不落盘', async () => {
    taro.chooseImage.mockResolvedValue({
      tempFilePaths: ['wxfile://tmp/big.png'],
      tempFiles: [{ path: 'wxfile://tmp/big.png', size: MAX_QR_IMAGE_BYTES + 1 }],
    })

    const result = await importFromAlbum()

    expect(result).toEqual({ status: 'error', code: 'invalid_image' })
    expect(fs.saveFile).not.toHaveBeenCalled()
    expect(store.has(WECHAT_QR_STORAGE_KEY)).toBe(false)
  })

  it('微信端保存授权失败时抛出 permission_denied', async () => {
    taro.saveImageToPhotosAlbum.mockRejectedValue({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' })

    let caught: unknown = null
    try {
      await saveImageToAlbum(QR_PATH)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(WechatQrError)
    if (caught instanceof WechatQrError) expect(caught.code).toBe('permission_denied')
  })

  it('存储读取抛错时 readImage 返回空字符串', () => {
    taro.getStorageSync.mockImplementation(() => {
      throw new Error('storage broken')
    })

    expect(readImage()).toBe('')
  })

  it('H5 端导入把 dataURL 存进存储', async () => {
    process.env.TARO_ENV = 'h5'
    const globalScope = globalThis as { fetch?: unknown; FileReader?: unknown }
    const originalFetch = globalScope.fetch
    const originalFileReader = globalScope.FileReader

    class FakeReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL(): void {
        this.result = 'data:image/png;base64,AAAA'
        if (this.onload) this.onload()
      }
    }

    globalScope.FileReader = FakeReader
    globalScope.fetch = () =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve({ size: 1024, type: 'image/png' }),
      })
    taro.chooseImage.mockResolvedValue({
      tempFilePaths: ['blob:http://localhost/abc'],
      tempFiles: [{ path: 'blob:http://localhost/abc', size: 1024 }],
    })

    try {
      const result = await importFromAlbum()
      expect(result).toEqual({ status: 'ok', value: 'data:image/png;base64,AAAA' })
      expect(store.get(WECHAT_QR_STORAGE_KEY)).toBe('data:image/png;base64,AAAA')
      expect(fs.saveFile).not.toHaveBeenCalled()
    } finally {
      globalScope.fetch = originalFetch
      globalScope.FileReader = originalFileReader
    }
  })

  it('H5 端保存降级为浏览器下载', async () => {
    process.env.TARO_ENV = 'h5'
    const globalScope = globalThis as { document?: unknown }
    const originalDocument = globalScope.document
    let clicked = 0
    const link = {
      href: '',
      download: '',
      click: () => {
        clicked += 1
      },
    }
    globalScope.document = {
      createElement: () => link,
      body: { appendChild: () => undefined, removeChild: () => undefined },
    }

    try {
      const target = await saveImageToAlbum('data:image/png;base64,AAAA')
      expect(target).toBe('download')
      expect(link.download).toBe('我的微信二维码.png')
      expect(clicked).toBe(1)
      expect(taro.saveImageToPhotosAlbum).not.toHaveBeenCalled()
    } finally {
      globalScope.document = originalDocument
    }
  })
})
