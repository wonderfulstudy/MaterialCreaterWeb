import { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppConfig from '@/config/app'
import { ensureSession } from '@/services/auth'
import { isSessionValid, readSession } from '@/services/auth/storage'
import styles from './index.module.scss'

const HOME_PATH = '/pages/home/index'

/** 全仓唯一的 H5 判定：gate 页只在下面那一处用到 */
const IS_H5 = process.env.TARO_ENV === 'h5'

/** idle 首屏 / busy 核验中 / failed 可重试 / denied 无权限终态 */
type GateStatus = 'idle' | 'busy' | 'failed' | 'denied'

/**
 * 登录 gate 页（启动首屏）：微信登录 → 后端核对授权名单 → 进首页。
 * 403 not_allowed 是终态：只显示「没有使用权限」，不给重试按钮，也不自动重试。
 */
export default function GatePage() {
  const [status, setStatus] = useState<GateStatus>('idle')
  const [failure, setFailure] = useState('')

  useEffect(() => {
    // M1 自用阶段 H5 走本地调试旁路，后端 WX_SECRET 未配置：不请求后端，进页即进首页
    if (IS_H5) {
      void Taro.reLaunch({ url: HOME_PATH })
      return
    }
    // 本地会话仍在有效期内就不再登一次（设计稿：有 token 时不显示本屏）
    if (isSessionValid(readSession())) {
      void Taro.reLaunch({ url: HOME_PATH })
    }
  }, [])

  const login = async () => {
    setStatus('busy')
    setFailure('')
    const result = await ensureSession({ force: true })
    if (result.ok) {
      void Taro.reLaunch({ url: HOME_PATH })
      return
    }
    // 403 not_allowed：白名单拒绝，终态，用户点不动也不自动重试
    if (result.error.statusCode === 403) {
      setStatus('denied')
      return
    }
    setFailure(result.error.message || '登录失败，请重试')
    setStatus('failed')
  }

  if (status === 'denied') {
    return (
      <View className={styles.page}>
        <View className={styles.deny}>
          <View className={styles.denyIcon}>
            <View className={styles.lockShackle} />
            <View className={styles.lockBody} />
          </View>
          <Text className={styles.denyTitle}>没有使用权限</Text>
          <Text className={styles.denyText}>请联系店主开通，开通后重新进入即可使用</Text>
        </View>
      </View>
    )
  }

  const buttonText = status === 'busy' ? '正在核对授权名单…' : status === 'failed' ? '重试' : '微信登录'

  return (
    <View className={styles.page}>
      <View className={styles.main}>
        <View className={styles.mark} />
        <Text className={styles.title}>{AppConfig.app.name}</Text>
        <Text className={styles.desc}>仅限本店授权成员使用 · 微信登录只读取标识用于核对名单</Text>
        <View className={styles.action}>
          <Button
            className={styles.loginBtn}
            disabled={status === 'busy'}
            onClick={() => {
              void login()
            }}
          >
            {buttonText}
          </Button>
        </View>
        {status === 'failed' ? <Text className={styles.failure}>{failure}</Text> : null}
        <Text className={styles.terms}>登录即表示同意《使用条款》与《隐私政策》</Text>
      </View>
    </View>
  )
}
