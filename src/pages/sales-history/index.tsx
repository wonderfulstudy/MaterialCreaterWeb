import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import {
  fetchSalesDay,
  fetchSalesDays,
  type SalesDay,
  type SalesDaySummary,
} from '@/api/business/sales'
import {
  dayLabel,
  isFutureMonth,
  moneyText,
  monthLabel,
  parseMonth,
  salesDayRows,
  shiftMonth,
  sortDaysDesc,
} from '@/pages/business/sales-model'
import styles from './index.module.scss'

interface DetailState {
  status: 'loading' | 'ready' | 'error'
  day?: SalesDay
  message?: string
}

/**
 * 收入历史（FR-27 / AC-50）：
 * 月份可回翻（未来月拦住）；点整张卡片进录入页改当天数据，右侧箭头单独展开 10 大类明细。
 */
export default function SalesHistoryPage() {
  const router = useRouter()
  const [month, setMonth] = useState(() => parseMonth(router.params?.month))
  const [items, setItems] = useState<SalesDaySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState('')
  const [details, setDetails] = useState<Record<string, DetailState>>({})

  const canNext = useMemo(() => !isFutureMonth(shiftMonth(month, 1)), [month])

  const loadMonth = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchSalesDays(month)
      setItems(sortDaysDesc(result.items || []))
    } catch {
      setError('本月收入记录加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void loadMonth()
  }, [loadMonth])

  const loadDetail = useCallback(async (date: string) => {
    setDetails((prev) => ({ ...prev, [date]: { status: 'loading' } }))
    try {
      const day = await fetchSalesDay(date)
      setDetails((prev) => ({ ...prev, [date]: { status: 'ready', day } }))
    } catch {
      setDetails((prev) => ({
        ...prev,
        [date]: { status: 'error', message: '当天明细加载失败，请重试' },
      }))
    }
  }, [])

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta)
    if (isFutureMonth(next)) return
    setMonth(next)
    setExpanded('')
  }

  const goEntry = (date: string) => {
    void Taro.navigateTo({ url: `/pages/sales-entry/index?date=${date}` })
  }

  const goReport = () => {
    void Taro.navigateTo({ url: `/pages/sales-report/index?month=${month}` })
  }

  /** 右侧箭头只展开明细，不触发整卡跳转 */
  const toggleDetail = (event: { stopPropagation: () => void }, date: string) => {
    event.stopPropagation()
    if (expanded === date) {
      setExpanded('')
      return
    }
    setExpanded(date)
    const state = details[date]
    if (!state || state.status === 'error') void loadDetail(date)
  }

  const renderDetail = (date: string) => {
    const state = details[date]
    if (!state || state.status === 'loading') {
      return <Text className={styles.detailHint}>明细加载中…</Text>
    }
    if (state.status === 'error') {
      return (
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>{state.message}</Text>
          <View
            className={styles.errorAction}
            onClick={(event: { stopPropagation: () => void }) => {
              event.stopPropagation()
              void loadDetail(date)
            }}
          >
            <Text>重试</Text>
          </View>
        </View>
      )
    }
    const day = state.day
    if (!day) return <Text className={styles.detailHint}>没有明细数据</Text>
    const rows = salesDayRows(day)
    const total = rows.reduce((sum, row) => sum + row.cents, 0)
    return (
      <View className={styles.detailBody}>
        {rows.map((row) => (
          <View key={row.key} className={styles.detailLine}>
            <Text className={styles.detailLabel}>{row.label}</Text>
            <Text className={classnames(styles.detailValue, row.cents === 0 && styles.detailMute)}>
              {moneyText(row.cents)}
            </Text>
          </View>
        ))}
        <View className={styles.detailSum}>
          <Text className={styles.detailSumLabel}>合计</Text>
          <Text className={styles.detailSumValue}>{moneyText(total)}</Text>
        </View>
        <Text className={styles.detailHint}>点卡片任意位置可修改当天数据</Text>
      </View>
    )
  }

  return (
    <View className={styles.page}>
      <View className={styles.content}>
        <View className={styles.seg}>
          <View className={classnames(styles.segItem, styles.segItemActive)}>
            <Text>记录</Text>
          </View>
          <View className={styles.segItem} onClick={goReport}>
            <Text>月报</Text>
          </View>
        </View>

        <View className={styles.monthRow}>
          <View
            className={styles.monthStep}
            onClick={() => changeMonth(-1)}
          >
            <Text>‹</Text>
          </View>
          <View className={styles.monthCurrent}>
            <Text className={styles.monthText}>{monthLabel(month)}</Text>
            <Text className={styles.monthSub}>按日期倒序</Text>
          </View>
          <View
            className={classnames(styles.monthStep, !canNext && styles.monthStepOff)}
            onClick={() => changeMonth(1)}
          >
            <Text>›</Text>
          </View>
        </View>

        {error ? (
          <View className={styles.errorBar}>
            <Text className={styles.errorText}>{error}</Text>
            <View className={styles.errorAction} onClick={() => void loadMonth()}>
              <Text>重试</Text>
            </View>
          </View>
        ) : null}

        {loading && !items.length ? <Text className={styles.placeholder}>加载中…</Text> : null}

        {!loading && !items.length && !error ? (
          <View className={styles.empty}>
            <Text className={styles.emptyTitle}>{monthLabel(month)}暂无销量记录</Text>
            <Text className={styles.emptyHint}>录入后这里按日期倒序显示每天的合计与收益</Text>
          </View>
        ) : null}

        <View className={styles.dayList}>
          {items.map((item) => {
            const open = expanded === item.date
            return (
              <View
                key={item.date}
                className={classnames(styles.day, open && styles.dayOpen)}
                onClick={() => goEntry(item.date)}
              >
                <View className={styles.dayHead}>
                  <View className={styles.dayMain}>
                    <Text className={styles.dayDate}>{dayLabel(item.date)}</Text>
                    <Text className={styles.dayOperator}>{item.operator || '—'}</Text>
                  </View>
                  <View className={styles.dayAmounts}>
                    <Text className={styles.dayTotal}>{moneyText(item.totalCents)}</Text>
                    <Text className={styles.dayProfit}>收益 {moneyText(item.profitCents)}</Text>
                  </View>
                  <View
                    className={styles.dayToggle}
                    onClick={(event) => toggleDetail(event, item.date)}
                  >
                    <Text className={classnames(styles.chevron, open && styles.chevronOpen)}>⌄</Text>
                  </View>
                </View>
                {open ? renderDetail(item.date) : null}
              </View>
            )
          })}
        </View>

        <Text className={styles.note}>点卡片任意位置可修改当天数据；箭头只展开当天各彩种明细。</Text>
      </View>
    </View>
  )
}
