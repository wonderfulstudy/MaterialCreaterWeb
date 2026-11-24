import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import { useCallback, useEffect, useState } from 'react'
import DateBar, { type PeriodOption } from '@/components/DateBar'
import {
  loadTraditionalDraws,
  shiftDateKey,
  toDateKey,
  type TraditionalDraw,
} from '@/api/lottery/results'
import { formatUpdatedAt } from '@/services/cache/remote-cache'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import styles from '../draw.module.scss'

const YESTERDAY_KEY = shiftDateKey(toDateKey(new Date()), -1)

/**
 * 默认看最近一期：优先取开奖日期不晚于昨天的那一期，
 * 数据源还没更新时退回最新一期，避免默认落在未来的期次上。
 */
function pickDefaultIssue(draws: TraditionalDraw[]): string {
  const matched = draws.find((draw) => draw.drawDate && draw.drawDate <= YESTERDAY_KEY)
  return (matched ?? draws[0])?.issue ?? ''
}

type PageStatus = 'loading' | 'ready' | 'empty' | 'error'

/**
 * 传统足彩 14 场开奖详情。
 * 数据源（gameNo=90）只给 14 场的 3/1/0，页面因此只呈现主胜/平/客胜，
 * 不取也绝不渲染任何赛事分数。
 */
export default function TraditionalDrawPage() {
  const [draws, setDraws] = useState<TraditionalDraw[]>([])
  const [issue, setIssue] = useState('')
  const [status, setStatus] = useState<PageStatus>('loading')
  const [meta, setMeta] = useState<{ updatedAt: number; fromCache: boolean } | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    const loaded = await loadTraditionalDraws()

    if (!loaded) {
      setDraws([])
      setMeta(null)
      setStatus('error')
      return
    }

    setDraws(loaded.data)
    setMeta({ updatedAt: loaded.updatedAt, fromCache: loaded.fromCache })
    setStatus(loaded.data.length > 0 ? 'ready' : 'empty')
    setIssue((current) => {
      const stillThere = current && loaded.data.some((draw) => draw.issue === current)
      return stillThere ? current : pickDefaultIssue(loaded.data)
    })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: '传统足彩开奖' })
  }, [])

  const active = draws.find((draw) => draw.issue === issue) ?? draws[0] ?? null

  const options: PeriodOption[] = draws.map((draw) => ({
    key: draw.issue,
    label: formatIssue(draw.issue),
    hint: formatDrawDate(draw.drawDate),
  }))

  const handleStep = (delta: -1 | 1) => {
    const index = draws.findIndex((draw) => draw.issue === issue)
    if (index < 0) {
      return
    }
    const nextIndex = delta === -1 ? index + 1 : index - 1
    if (nextIndex < 0 || nextIndex >= draws.length) {
      return
    }
    setIssue(draws[nextIndex].issue)
  }

  return (
    <View className={styles.page}>
      <DateBar
        title='传统足彩'
        currentLabel={active ? `${formatIssue(active.issue)} ${formatDrawDate(active.drawDate)}` : '—'}
        options={options}
        activeKey={active ? active.issue : ''}
        stepLabels={['上一期', '下一期']}
        onSelect={setIssue}
        onStep={handleStep}
        onBack={() => void Taro.navigateBack()}
      />

      <View className={styles.body}>
        {meta && (
          <View className={styles.metaBar}>
            <Text className={styles.metaText}>
              {meta.fromCache ? '网络不可用 · ' : ''}更新于 {formatUpdatedAt(meta.updatedAt)}
            </Text>
            <Text className={styles.metaRetry} onClick={() => void load()}>
              重试
            </Text>
          </View>
        )}

        {status === 'loading' && <Text className={styles.status}>加载中…</Text>}
        {status === 'empty' && <Text className={styles.status}>暂无开奖期次</Text>}
        {status === 'error' && <Text className={styles.status}>开奖数据加载失败，请稍后重试</Text>}

        {status === 'ready' && active && (
          <>
            <View className={styles.tinfo}>
              <Text className={styles.tinfoTitle}>胜负彩 {formatIssue(active.issue)}</Text>
              <Text className={classnames(styles.pill, styles.pillWin)}>已开奖</Text>
              <Text className={styles.tinfoDate}>{formatDrawDate(active.drawDate)}</Text>
            </View>

            <View className={styles.listCard}>
              {active.results.map((result, index) => (
                <View className={styles.trow} key={`${active.issue}-${index}`}>
                  <Text className={styles.tNo}>{index + 1}</Text>
                  <Text className={styles.tTeam}>第 {index + 1} 场</Text>
                  <Text
                    className={classnames(
                      styles.tResult,
                      result === '3' && styles.r3,
                      result === '1' && styles.r1,
                      result === '0' && styles.r0
                    )}
                  >
                    {result}
                  </Text>
                </View>
              ))}
            </View>

            <Text className={styles.note}>任选九场 = 从 14 场中任选 9 场，猜中 9 场即中奖</Text>
            <Text className={styles.note}>3 主胜 · 1 平 · 0 客胜</Text>
            <Text className={styles.note}>数据来源：中国体彩官网。数据源只提供 14 场赛果，不含对阵名单。</Text>
          </>
        )}
      </View>
    </View>
  )
}
