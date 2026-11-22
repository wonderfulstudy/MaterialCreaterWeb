import { useEffect, useState } from 'react'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import TabBar from '@/components/TabBar'
import {
  ensureSession,
  maskOpenid,
  updateProfile,
  type AuthErrorCode,
  type AuthSession,
} from '@/services/auth'
import {
  importFromAlbum,
  readImage,
  saveImageToAlbum,
  WechatQrError,
  type WechatQrErrorCode,
} from '@/services/wechat-qr'
import { generateWechatQrPoster } from '@/utils/posters/wechat-qr'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'
const TOP_INSET_H5 = 20
const DEFAULT_AVATAR_TOP = 44
const DEFAULT_NICKNAME = '微信用户'
const FOOTER_TEXT = '彩店管理助手 · v1.0.0'
const ABOUT_CONTENT = '素材与推荐单管理工具。当前为界面改版预览版本。'

const AUTH_ERROR_COPY: Record<AuthErrorCode, string> = {
  invalid_payload: '登录失败，请重试',
  wx_code_invalid: '登录失败，请重试',
  session_expired: '登录失败，请重试',
  wx_login_failed: '登录失败，请重试',
  rate_limited: '操作太频繁，请稍后再试',
  wx_upstream_error: '微信服务异常',
  internal_error: '服务异常',
  network_error: '服务异常',
}

const QR_ERROR_COPY: Record<WechatQrErrorCode, string> = {
  invalid_image: '导入失败，请重新选择二维码截图',
  not_recognized: '没识别到二维码，换一张试试',
  permission_denied: '导入失败，请重新选择二维码截图',
  save_failed: '导入失败，请重新选择二维码截图',
  storage_failed: '导入失败，请重新选择二维码截图',
  unsupported: '导入失败，请重新选择二维码截图',
}

const QR_STEPS = [
  '打开微信 → 我 → 点击顶部头像',
  '进入「二维码名片」，截图保存到相册',
  '回到这里，从相册选择刚才的截图',
]

type QrBusy = 'idle' | 'importing' | 'saving' | 'poster'

function topInset(): number {
  if (IS_H5) return TOP_INSET_H5
  try {
    const barHeight = Taro.getSystemInfoSync().statusBarHeight
    return (typeof barHeight === 'number' ? barHeight : 20) + DEFAULT_AVATAR_TOP
  } catch {
    return 20 + DEFAULT_AVATAR_TOP
  }
}

function cx(base: string, extra?: string | false): string {
  return extra ? base + ' ' + extra : base
}

export default function Profile() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginBusy, setLoginBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [qrPath, setQrPath] = useState('')
  const [qrBusy, setQrBusy] = useState<QrBusy>('idle')
  const [qrError, setQrError] = useState('')
  const [posterPath, setPosterPath] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)

  const runLogin = async (force: boolean) => {
    setAuthLoading(true)
    if (force) setLoginBusy(true)
    setAuthError('')
    const result = await ensureSession({ force })
    if (result.ok) {
      setSession(result.session)
    } else {
      setSession(null)
      setAuthError(AUTH_ERROR_COPY[result.error.code])
    }
    setAuthLoading(false)
    setLoginBusy(false)
  }

  useEffect(() => {
    setQrPath(readImage())
  }, [])

  useDidShow(() => {
    void runLogin(false)
  })

  const handleImport = async () => {
    if (!session || qrBusy !== 'idle') return
    setQrBusy('importing')
    setQrError('')
    const result = await importFromAlbum()
    if (result.status === 'ok') {
      setQrPath(result.value)
    } else if (result.status === 'error') {
      const copy = QR_ERROR_COPY[result.code]
      if (qrPath) void Taro.showToast({ title: copy, icon: 'none' })
      else setQrError(copy)
    }
    setQrBusy('idle')
  }

  const handleSaveToAlbum = async (filePath: string) => {
    if (!filePath || qrBusy !== 'idle') return
    setQrBusy('saving')
    try {
      const target = await saveImageToAlbum(filePath)
      void Taro.showToast({ title: target === 'download' ? '已开始下载' : '已保存到相册', icon: 'none' })
    } catch (error) {
      if (error instanceof WechatQrError && error.code === 'permission_denied') {
        void Taro.showModal({
          title: '保存失败',
          content: '请在设置里允许保存到相册',
          showCancel: false,
          confirmText: '知道了',
        })
      } else {
        void Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    } finally {
      setQrBusy('idle')
    }
  }

  const handlePoster = async () => {
    if (!qrPath || qrBusy !== 'idle') return
    setQrBusy('poster')
    try {
      const path = await generateWechatQrPoster(qrPath)
      setPosterPath(path)
    } catch {
      void Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
    } finally {
      setQrBusy('idle')
    }
  }

  const openEditor = () => {
    if (!session) return
    setDraftName(session.user.nickname)
    setDraftAvatar(session.user.avatarUrl)
    setEditorOpen(true)
  }

  const handleSaveProfile = async () => {
    if (profileBusy) return
    setProfileBusy(true)
    const result = await updateProfile({ nickname: draftName.trim(), avatarUrl: draftAvatar })
    if (result.ok) {
      setSession(result.session)
      setEditorOpen(false)
    } else {
      void Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    setProfileBusy(false)
  }

  const openMaterial = () => {
    void Taro.reLaunch({ url: '/pages/recommend/index' })
  }

  const openSelector = () => {
    void Taro.navigateTo({ url: '/pages/selector/index' })
  }

  const openAbout = () => {
    void Taro.showModal({
      title: '彩店管理助手',
      content: ABOUT_CONTENT,
      showCancel: false,
      confirmText: '知道了',
    })
  }

  const displayName = session ? session.user.nickname || DEFAULT_NICKNAME : ''
  const avatarChar = displayName ? displayName.slice(0, 1) : ''
  const qrMeta = !session ? '未登录' : qrPath ? '已导入' : '未导入'
  const loginText = loginBusy ? '登录中…' : authError ? '重新登录' : '微信一键登录'

  return (
    <View className={styles.page}>
      <View className={styles.content} style={{ paddingTop: topInset() + 'px' }}>
        <Text className={styles.title}>我的</Text>

        <View className={cx(styles.card, styles.idCard)}>
          {session ? (
            <View className={cx(styles.avatar, styles.avatarActive)}>
              {session.user.avatarUrl ? (
                <Image className={styles.avatarImage} src={session.user.avatarUrl} mode='aspectFill' />
              ) : (
                <Text className={styles.avatarText}>{avatarChar}</Text>
              )}
            </View>
          ) : (
            <View className={styles.avatar}>
              <View className={styles.personIcon} />
            </View>
          )}

          <View className={styles.identity}>
            {session ? (
              <Text className={styles.name}>{displayName}</Text>
            ) : (
              <Text className={cx(styles.name, styles.nameWeak)}>
                {authLoading ? '正在登录…' : '— 未登录 —'}
              </Text>
            )}
            {session && (
              <View className={styles.statusRow}>
                <View className={styles.statusDot} />
                <Text className={styles.statusText}>微信已登录</Text>
              </View>
            )}
            {session ? (
              <Text className={styles.subline}>{'openid ' + maskOpenid(session.user.openid)}</Text>
            ) : authError ? (
              <Text className={styles.sublineError}>{authError}</Text>
            ) : (
              <Text className={styles.subline}>登录后可同步昵称与头像</Text>
            )}
          </View>

          {session ? (
            <View className={styles.editAction} onClick={openEditor}>
              <Text className={styles.editActionText}>编辑昵称头像</Text>
              <View className={styles.chevron} />
            </View>
          ) : null}
          {!session && !authLoading ? (
            <View
              className={styles.loginBtn}
              style={{ opacity: loginBusy ? 0.7 : 1 }}
              onClick={() => {
                void runLogin(true)
              }}
            >
              <Text className={styles.loginBtnText}>{loginText}</Text>
            </View>
          ) : null}
        </View>

        <View className={cx(styles.card, styles.qrCard)}>
          <View className={styles.qrHead}>
            <Text className={styles.qrTitle}>我的微信二维码</Text>
            <Text className={styles.qrMeta}>{qrMeta}</Text>
          </View>

          {!session ? (
            <View className={styles.qrSlot}>
              <View className={styles.lockIcon} />
              <Text className={cx(styles.slotTitle, styles.slotTitleWeak)}>登录后可管理你的二维码</Text>
              <Text className={styles.slotHint}>完成上方登录即可导入</Text>
            </View>
          ) : qrPath ? (
            <View>
              <View className={styles.qrFrame}>
                <Image
                  className={styles.qrImage}
                  src={qrPath}
                  mode='aspectFit'
                  showMenuByLongpress
                />
              </View>
              <Text className={styles.qrNote}>客户扫码即可加我微信</Text>
              <View
                className={styles.primaryBtn}
                onClick={() => {
                  void handleSaveToAlbum(qrPath)
                }}
              >
                <Text className={styles.primaryText}>{qrBusy === 'saving' ? '保存中…' : '保存到相册'}</Text>
              </View>
              <View className={styles.secondaryRow}>
                <View className={styles.secondaryBtn} onClick={() => { void handlePoster() }}>
                  <Text className={styles.secondaryText}>
                    {qrBusy === 'poster' ? '生成中…' : '生成分享海报'}
                  </Text>
                </View>
                <View className={styles.secondaryBtn} onClick={() => { void handleImport() }}>
                  <Text className={styles.secondaryText}>
                    {qrBusy === 'importing' ? '正在导入…' : '更换'}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View>
              <View className={styles.qrSlot}>
                <View className={styles.imageIcon} />
                <Text className={styles.slotTitle}>还没有导入二维码</Text>
                <Text className={styles.slotHint}>导入后客户可直接扫码加你</Text>
              </View>
              {qrError ? <Text className={styles.qrError}>{qrError}</Text> : null}
              <View className={styles.primaryBtn} onClick={() => { void handleImport() }}>
                <Text className={styles.primaryText}>
                  {qrBusy === 'importing' ? '正在导入…' : '从相册导入我的微信二维码'}
                </Text>
              </View>
              <View className={styles.steps}>
                <Text className={styles.stepsTitle}>操作步骤</Text>
                {QR_STEPS.map((step, index) => (
                  <View className={styles.stepRow} key={step}>
                    <View className={styles.stepIndex}>
                      <Text className={styles.stepIndexText}>{index + 1}</Text>
                    </View>
                    <Text className={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View className={cx(styles.card, styles.menu)}>
          <View className={styles.menuItem} onClick={openMaterial}>
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>素</Text>
            </View>
            <Text className={styles.menuLabel}>推荐单素材</Text>
            <View className={styles.menuArrow} />
          </View>
          <View className={styles.menuDivider} />
          <View className={styles.menuItem} onClick={openSelector}>
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>算</Text>
            </View>
            <Text className={styles.menuLabel}>场次计算器</Text>
            <View className={styles.menuArrow} />
          </View>
          <View className={styles.menuDivider} />
          <View className={styles.menuItem} onClick={openAbout}>
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>i</Text>
            </View>
            <Text className={styles.menuLabel}>关于小程序</Text>
            <View className={styles.menuArrow} />
          </View>
        </View>

        <Text className={styles.footer}>{FOOTER_TEXT}</Text>
      </View>

      {editorOpen ? (
        <View className={styles.mask}>
          <View className={styles.editCard}>
            <Text className={styles.panelTitle}>编辑昵称头像</Text>
            <Button
              className={styles.avatarPicker}
              openType='chooseAvatar'
              onChooseAvatar={(event) => {
                const avatarUrl = event.detail.avatarUrl
                if (avatarUrl) setDraftAvatar(avatarUrl)
              }}
            >
              {draftAvatar ? (
                <Image className={styles.avatarPreview} src={draftAvatar} mode='aspectFill' />
              ) : (
                <Text className={styles.avatarPickerText}>选择头像</Text>
              )}
            </Button>
            <Input
              className={styles.editInput}
              type={IS_H5 ? 'text' : 'nickname'}
              value={draftName}
              maxlength={20}
              placeholder='请输入昵称'
              onInput={(event) => setDraftName(event.detail.value)}
            />
            <View className={styles.panelActions}>
              <View className={styles.cancelBtn} onClick={() => setEditorOpen(false)}>
                <Text className={styles.panelBtnText}>取消</Text>
              </View>
              <View className={styles.saveBtn} onClick={() => { void handleSaveProfile() }}>
                <Text className={styles.panelBtnText}>{profileBusy ? '保存中…' : '保存'}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {posterPath ? (
        <View className={styles.mask}>
          <View className={styles.posterCard}>
            <Text className={styles.panelTitle}>分享海报</Text>
            <Image className={styles.posterImage} src={posterPath} mode='widthFix' />
            <View className={styles.panelActions}>
              <View className={styles.cancelBtn} onClick={() => setPosterPath('')}>
                <Text className={styles.panelBtnText}>关闭</Text>
              </View>
              <View className={styles.saveBtn} onClick={() => { void handleSaveToAlbum(posterPath) }}>
                <Text className={styles.panelBtnText}>{qrBusy === 'saving' ? '保存中…' : '保存到相册'}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <TabBar active='profile' />
    </View>
  )
}
