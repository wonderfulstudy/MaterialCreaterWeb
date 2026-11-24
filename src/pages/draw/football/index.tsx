import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'
import DateBar, { type PeriodOption } from '@/components/DateBar'
import MatchCardView from '@/components/MatchCardView'
import {
  loadFootballResults,
  recentDateKeys,
  shiftDateKey,
  toDateKey,
  type SportMatchResult,
} from '@/api/lottery/results'
import { formatUpdatedAt } from '@/services/cache/remote-cache'
import { formatDrawDate } from '@/utils/lottery-format'
import styles from '../draw.module.scss'

const TODAY_KEY = toDateKey(new Date())
/** 竞彩赛果默认展示昨天的比赛 */
const DEFAULT_DATE = shiftDateKey(TODAY_KEY, -1)
/** 更多期次弹层里给出最近 10 天 */
const PERIOD_KEYS = recentDateKeys(10, TODAY_KEY)
const OLDEST_KEY = PERIOD_KEYS[PERIOD_KEYS.length - 1]

const PERIOD_OPTIONS: PeriodOption[] = PERIOD_KEYS.map((key) => ({
  key,
  label: formatDrawDate(key),
  hint: key === TODAY_KEY ? '今天' : key === DEFAULT_DATE ? '昨天' : '',
}))

type PageStatus = 'loading' | 'ready' | 'empty' | 'error'

/** 竞彩足球赛果详情：顶部悬浮日期条 + 按日期切换的赛果列表 */
export default function FootballDrawPage() {
  const [dateKey, setDateKey] = useState(DEFAULT_DATE)
  const [matches, setMatches] = useState<SportMatchResult[]>([])
  const [status, setStatus] = useState<PageStatus>('loading')
  const [meta, setMeta] = useState<{ updatedAt: number; fromCache: boolean } | null>(null)

  const load = useCallback(async (key: string) => {
    setStatus('loading')
    const loaded = await loadFootballResults(key)

    if (!loaded) {
      setMatches([])
      setMeta(null)
      setStatus('error')
      return
    }

    setMatches(loaded.data)
    setMeta({ updatedAt: loaded.updatedAt, fromCache: loaded.fromCache })
    setStatus(loaded.data.length > 0 ? 'ready' : 'empty')
  }, [])

  useEffect(() => {
    void load(dateKey)
  }, [dateKey, load])

  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: '足球开奖' })
  }, [])

  const handleStep = (delta: -1 | 1) => {
    const next = shiftDateKey(dateKey, delta)
    if (next > TODAY_KEY || next < OLDEST_KEY) {
      return
    }
    setDateKey(next)
  }

  return (
    <View className={styles.page}>
      <DateBar
        title='足球开奖'
        currentLabel={formatDrawDate(dateKey)}
        options={PERIOD_OPTIONS}
        activeKey={dateKey}
        onSelect={setDateKey}
        onStep={handleStep}
        onBack={() => void Taro.navigateBack()}
      />

      <View className={styles.body}>
        {meta && (
          <View className={styles.metaBar}>
            <Text className={styles.metaText}>
              {meta.fromCache ? '网络不可用 · ' : ''}更新于 {formatUpdatedAt(meta.updatedAt)}
            </Text>
            <Text className={styles.metaRetry} onClick={() => void load(dateKey)}>
              重试
            </Text>
          </View>
        )}

        {status === 'loading' && <Text className={styles.status}>加载中…</Text>}
        {status === 'empty' && <Text className={styles.status}>当日暂无赛果</Text>}
        {status === 'error' && <Text className={styles.status}>赛果加载失败，请稍后重试</Text>}

        {/* 页面与分享海报共用同一份赛果卡 JSX，见 components/MatchCardView */}
        {status === 'ready' && <MatchCardView matches={matches} />}

        <Text className={styles.note}>
          玩法口径：胜平负取全场赛果，让球与大小分按官方收盘盘口；半全场取半场与全场赛果组合。
        </Text>
      </View>

      <View
        className={styles.fab}
        onClick={() => void Taro.navigateTo({ url: `/pages/share/index?source=jc-football&date=${dateKey}` })}
      >
        <Text className={styles.fabIcon}>↑</Text>
      </View>
    </View>
  )
}
