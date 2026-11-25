import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import classnames from 'classnames'
import TabBar from '@/components/TabBar'
import {
  fetchMonthReport,
  fetchSalesDays,
  type MonthReport,
  type SalesDaySummary,
} from '@/api/business/sales'
import { fetchStockOverview, type StockOverview } from '@/api/business/stock'
import {
  dayLabel,
  findDay,
  moneyText,
  monthKey,
  monthOfDate,
  todayKey,
  yesterdayKey,
} from './sales-model'
import styles from './index.module.scss'

interface ErrorBarProps {
  text: string
  onRetry: () => void
}

/** 接口失败时的可见错误条：文案 + 重试，绝不白屏 */
function ErrorBar({ text, onRetry }: ErrorBarProps) {
  return (
    <View className={styles.errorBar}>
      <Text className={styles.errorText}>{text}</Text>
      <View
        className={styles.errorAction}
        onClick={(event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          onRetry()
        }}
      >
        <Text>重试</Text>
      </View>
    </View>
  )
}

/**
 * 经营开屏（FR-28 / AC-32）：
 * 本月汇总条 → 昨日收入票根卡 → 当前库存卡，三块独立请求、独立错误态。
 */
export default function BusinessPage() {
  const [month] = useState(() => monthKey())
  const [yesterday] = useState(() => yesterdayKey())
  const [yesterdayMonth] = useState(() => monthOfDate(yesterday))
  const shown = useRef(0)

  const [report, setReport] = useState<MonthReport | null>(null)
  const [reportError, setReportError] = useState('')

  const [record, setRecord] = useState<SalesDaySummary | null>(null)
  const [recordLoaded, setRecordLoaded] = useState(false)
  const [recordError, setRecordError] = useState('')

  const [stock, setStock] = useState<StockOverview | null>(null)
  const [stockError, setStockError] = useState('')

  const loadReport = useCallback(async () => {
    setReportError('')
    try {
      setReport(await fetchMonthReport(month))
    } catch {
      setReportError('本月汇总加载失败，请重试')
    }
  }, [month])

  const loadRecord = useCallback(async () => {
    setRecordError('')
    try {
      const result = await fetchSalesDays(yesterdayMonth)
      setRecord(findDay(result.items, yesterday))
    } catch {
      setRecordError('昨日收入加载失败，请重试')
    } finally {
      setRecordLoaded(true)
    }
  }, [yesterday, yesterdayMonth])

  const loadStock = useCallback(async () => {
    setStockError('')
    try {
      setStock(await fetchStockOverview())
    } catch {
      setStockError('库存总览加载失败，请重试')
    }
  }, [])

  useEffect(() => {
    void loadReport()
    void loadRecord()
    void loadStock()
  }, [loadRecord, loadReport, loadStock])

  // 从录入页 / 库存页返回时刷新，避免看到旧数字；首次进入由 useEffect 负责，不重复请求
  useDidShow(() => {
    shown.current += 1
    if (shown.current <= 1) return
    void loadReport()
    void loadRecord()
    void loadStock()
  })

  const goEntryToday = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    void Taro.navigateTo({ url: `/pages/sales-entry/index?date=${todayKey()}` })
  }

  const goHistory = () => {
    void Taro.navigateTo({ url: `/pages/sales-history/index?month=${month}` })
  }

  const goStock = () => {
    void Taro.navigateTo({ url: '/pages/stock/index' })
  }

  const goStockAction = (action: 'in' | 'out') => (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    void Taro.navigateTo({ url: `/pages/stock/index?action=${action}` })
  }

  const recordMissing = recordLoaded && !record

  return (
    <View className={styles.page}>
      <View className={styles.content}>
        <View className={styles.summaryBar}>
          <View className={styles.summaryCell}>
            <Text className={styles.summaryLabel}>本月总销量</Text>
            <Text className={styles.summaryValue}>{report ? moneyText(report.columns.total) : '—'}</Text>
          </View>
          <View className={styles.summaryDivider} />
          <View className={styles.summaryCell}>
            <Text className={styles.summaryLabel}>本月总收益</Text>
            <Text className={classnames(styles.summaryValue, styles.summaryGold)}>
              {report ? moneyText(report.profit.totalCents) : '—'}
            </Text>
          </View>
        </View>
        {reportError ? <ErrorBar text={reportError} onRetry={() => void loadReport()} /> : null}

        <View className={styles.ticket} onClick={goHistory}>
          <View className={styles.ticketHead}>
            <Text className={styles.ticketName}>昨日收入</Text>
            <Text className={styles.ticketDate}>{dayLabel(yesterday)}</Text>
          </View>

          <View className={styles.bigRow}>
            <View className={styles.bigCell}>
              <Text className={styles.bigLabel}>总销量</Text>
              <Text className={styles.bigSales}>
                {record ? moneyText(record.totalCents) : recordLoaded ? moneyText(0) : '—'}
              </Text>
            </View>
            <View className={styles.bigCell}>
              <Text className={styles.bigLabel}>总收益</Text>
              <Text className={styles.bigProfit}>
                {record ? moneyText(record.profitCents) : recordLoaded ? moneyText(0) : '—'}
              </Text>
            </View>
            {recordMissing ? <Text className={styles.pending}>未录入</Text> : null}
          </View>

          {recordError ? <ErrorBar text={recordError} onRetry={() => void loadRecord()} /> : null}

          <View className={styles.perf} />

          <View className={styles.primaryButton} onClick={goEntryToday}>
            <Text className={styles.primaryButtonText}>填写今日销量</Text>
          </View>
          <View className={styles.cardHint}>
            <Text>点卡片其他区域看收入历史 ›</Text>
          </View>
        </View>

        <View className={styles.card} onClick={goStock}>
          <View className={styles.cardHead}>
            <Text className={styles.cardTitle}>当前库存情况</Text>
            <Text className={styles.cardGo}>点卡片看库存详情 ›</Text>
          </View>

          <View className={styles.invGrid}>
            <View className={styles.invCell}>
              <Text className={styles.invLabel}>在库总本数</Text>
              <Text className={styles.invValue}>
                {stock ? stock.inStockBooks : '—'}
                <Text className={styles.invUnit}> 本</Text>
              </Text>
            </View>
            <View className={styles.invCell}>
              <Text className={styles.invLabel}>库存金额合计</Text>
              <Text className={styles.invValue}>{stock ? moneyText(stock.stockCents) : '—'}</Text>
            </View>
          </View>

          {stockError ? <ErrorBar text={stockError} onRetry={() => void loadStock()} /> : null}

          <View className={styles.actionRow}>
            <View className={styles.ghostButton} onClick={goStockAction('in')}>
              <Text>入库</Text>
            </View>
            <View className={styles.ghostButton} onClick={goStockAction('out')}>
              <Text>出库</Text>
            </View>
          </View>
        </View>

        <Text className={styles.note}>
          销量按分录入、页面按元展示；库存按整本计数，入库出库都扫票面二维码。
        </Text>
      </View>

      <TabBar active='business' />
    </View>
  )
}
