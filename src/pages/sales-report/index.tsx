import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import { fetchMonthReport, type MonthReport } from '@/api/business/sales'
import {
  hasJczqDetail,
  isFutureMonth,
  jczqSubgameRows,
  moneyText,
  monthLabel,
  monthReportRows,
  parseMonth,
  percentText,
  ratioCheck,
  shiftMonth,
} from '@/pages/business/sales-model'
import styles from './index.module.scss'

/**
 * 月报（FR-27 / FR-25 / AC-51）：
 * 六列 + 电脑票小计（不参与相加）+ 总销量 / 总利润；竞彩可展开 13 子玩法；底部 22 项占比校验。
 */
export default function SalesReportPage() {
  const router = useRouter()
  const [month, setMonth] = useState(() => parseMonth(router.params?.month))
  const [report, setReport] = useState<MonthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subgameOpen, setSubgameOpen] = useState(false)

  const canNext = useMemo(() => !isFutureMonth(shiftMonth(month, 1)), [month])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setReport(await fetchMonthReport(month))
    } catch {
      setError('月报加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta)
    if (isFutureMonth(next)) return
    setMonth(next)
    setSubgameOpen(false)
  }

  const rows = report ? monthReportRows(report) : []
  const subgames = report ? jczqSubgameRows(report) : []
  const expandable = report ? hasJczqDetail(report) : false
  const check = report ? ratioCheck(report) : null
  const empty = Boolean(report) && (report?.days ?? 0) === 0

  return (
    <View className={styles.page}>
      <View className={styles.content}>
        <View className={styles.monthRow}>
          <View className={styles.monthStep} onClick={() => changeMonth(-1)}>
            <Text>‹</Text>
          </View>
          <View className={styles.monthCurrent}>
            <Text className={styles.monthText}>{monthLabel(month)}</Text>
            <Text className={styles.monthSub}>
              {report ? `${report.days} 天有记录` : '月报'}
            </Text>
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
            <View className={styles.errorAction} onClick={() => void load()}>
              <Text>重试</Text>
            </View>
          </View>
        ) : null}

        {loading && !report ? <Text className={styles.placeholder}>加载中…</Text> : null}

        {report ? (
          <>
            <View className={styles.ticket}>
              <View className={styles.totRow}>
                <View className={styles.totCell}>
                  <Text className={styles.totLabel}>总销量</Text>
                  <Text className={styles.totSales}>{moneyText(report.columns.total)}</Text>
                </View>
                <View className={styles.totCell}>
                  <Text className={styles.totLabel}>总利润</Text>
                  <Text className={styles.totProfit}>{moneyText(report.profit.totalCents)}</Text>
                </View>
              </View>
              <Text className={styles.totHint}>利润 = 机器销量利润 + 刮刮乐利润，口径以服务端为准</Text>
            </View>

            {empty ? (
              <Text className={styles.emptyHint}>本月暂无销量记录，占比按 0 显示</Text>
            ) : null}

            <View className={styles.rows}>
              {rows.map((row) => {
                const isJczq = row.key === 'jczq'
                return (
                  <View key={row.key}>
                    <View
                      className={classnames(
                        styles.row,
                        row.kind === 'subtotal' && styles.rowSub,
                        row.kind === 'total' && styles.rowTotal,
                      )}
                      onClick={isJczq && expandable ? () => setSubgameOpen((prev) => !prev) : undefined}
                    >
                      <View className={styles.rowName}>
                        <Text className={styles.rowLabel}>{row.label}</Text>
                        {row.hint ? <Text className={styles.rowHint}>{row.hint}</Text> : null}
                      </View>
                      <Text className={styles.rowMoney}>{moneyText(row.cents)}</Text>
                      <Text className={styles.rowPct}>{percentText(row.bp)}</Text>
                      {isJczq && expandable ? (
                        <Text className={classnames(styles.rowChevron, subgameOpen && styles.rowChevronOpen)}>
                          ⌄
                        </Text>
                      ) : null}
                    </View>

                    {isJczq && expandable && subgameOpen ? (
                      <View className={styles.subgames}>
                        {subgames.map((subgame) => (
                          <View key={subgame.key} className={styles.subgameRow}>
                            <Text className={styles.subgameLabel}>{subgame.label}</Text>
                            <Text className={styles.subgameMoney}>{moneyText(subgame.cents)}</Text>
                            <Text className={styles.subgamePct}>{percentText(subgame.bp)}</Text>
                          </View>
                        ))}
                        <View className={styles.subgameSum}>
                          <Text className={styles.subgameSumLabel}>竞彩合计</Text>
                          <Text className={styles.subgameSumValue}>{percentText(report.ratios.jczq)}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )
              })}
            </View>

            {check ? (
              <View className={styles.checkCard}>
                <View className={styles.checkHead}>
                  <Text className={styles.checkTitle}>22 项占比校验</Text>
                  <Text className={classnames(styles.checkBadge, !check.ok && styles.checkBadgeOff)}>
                    {check.ok ? '校验通过' : '校验不通过'}
                  </Text>
                </View>
                <Text className={styles.checkMeta}>{check.title}</Text>
                <View className={styles.pctGrid}>
                  {check.items.map((item) => (
                    <View key={item.key} className={styles.pctItem}>
                      <Text className={styles.pctLabel}>{item.label}</Text>
                      <Text className={styles.pctValue}>{percentText(item.bp)}</Text>
                    </View>
                  ))}
                </View>
                <View className={styles.pctSum}>
                  <Text className={styles.pctSumLabel}>合计</Text>
                  <Text className={styles.pctSumValue}>{check.totalText}</Text>
                </View>
                <Text className={styles.checkNote}>
                  分母为总销量：8 个单款大类 + 竞彩 13 子玩法 + 刮刮乐 = 22 项，
                  合计恒为 100.00%；竞彩当月无子玩法明细时只占 1 项。
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        <Text className={styles.note}>电脑票是小计行，含于总销量，不与其他六项相加。</Text>
      </View>
    </View>
  )
}
