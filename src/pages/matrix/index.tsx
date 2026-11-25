import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import {
  formatDateLabel,
  formatOdds,
  useSportSchedule,
  type OddsOption,
  type PoolCode,
  type SportKey,
} from '@/components/PlanCalculator'
import {
  MATRIX_POOLS,
  buildMatrixRows,
  buildMatrixSnapshot,
  checkMatrixCompleteness,
  clearPoolSelections,
  matrixCellKey,
  matrixPoolName,
  selectedOptionKeys,
  todayKey,
  toggleMatrixSelection,
  uniformPoolLine,
  type MatrixCell,
  type MatrixSelectionMap,
  type MatrixSettings,
  type MatrixTableRow,
} from './matrix-data'
import { findMatrix, loadMatrixSettings, saveMatrix, saveMatrixSettings } from '@/services/matrix-store'
import styles from './index.module.scss'

const SPORTS: { key: SportKey; label: string }[] = [
  { key: 'football', label: '足球' },
  { key: 'basketball', label: '篮球' },
]

/** 综合大数据：当日预测矩阵（需求 §6.1.7） */
export default function MatrixPage() {
  const [sport, setSport] = useState<SportKey>('football')
  const [date, setDate] = useState('')
  const [settings, setSettings] = useState<MatrixSettings>(() => loadMatrixSettings())
  const [selections, setSelections] = useState<MatrixSelectionMap>({})
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { states, load } = useSportSchedule(sport)
  const current = states[sport]
  const schedule = current.schedule

  const pools = useMemo(() => settings[sport], [settings, sport])

  /** 赛程日期落地后自动选日期：优先今天，否则取最近一天 */
  useEffect(() => {
    const dates = schedule.dates
    if (!dates.length) return
    if (date && dates.includes(date)) return
    const today = todayKey()
    setDate(dates.includes(today) ? today : dates[0])
  }, [schedule.dates, date])

  /** 换运动 / 换日期时把已存快照回填成选中态；没有快照就清空 */
  useEffect(() => {
    const stored = date ? findMatrix(sport, date) : null
    const restored: MatrixSelectionMap = {}
    stored?.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        restored[matrixCellKey(row.matchId, cell.poolCode)] = cell.options.map((option) => ({
          poolCode: cell.poolCode,
          optionKey: option.optionKey,
          label: option.label,
          odds: option.odds,
          line: cell.line,
        }))
      })
    })
    setSelections(restored)
  }, [sport, date])

  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: '综合大数据' })
  }, [])

  const rows = useMemo(
    () => buildMatrixRows(schedule.matches, sport, pools, date),
    [schedule.matches, sport, pools, date],
  )

  /** 只认当前表格里仍然存在的选项：赔率与盘口线始终取最新赛程，不用点选时的旧值 */
  const valid = useMemo(() => {
    const next: MatrixSelectionMap = {}
    rows.forEach((row) => {
      pools.forEach((pool) => {
        const cell = row.cells[pool]
        const picked = selections[matrixCellKey(row.matchId, pool)]
        if (!cell || !picked?.length) return
        const keys = selectedOptionKeys(picked)
        // 顺序取表格里的选项顺序（不是点选顺序），复式连写才稳定
        const picks = cell.options
          .filter((option) => keys.has(option.key))
          .map((option) => ({
            poolCode: pool,
            optionKey: option.key,
            label: option.label,
            odds: option.odds,
            line: cell.line,
          }))
        if (!picks.length) return
        next[matrixCellKey(row.matchId, pool)] = picks
      })
    })
    return next
  }, [rows, pools, selections])

  const completeness = useMemo(
    () => checkMatrixCompleteness(rows, pools, valid),
    [rows, pools, valid],
  )

  /** 选项多的玩法（比分 31 个、胜分差 12 个）列宽加倍，避免一行被撑成十几层 */
  const widePools = useMemo(() => {
    const wide = new Set<PoolCode>()
    rows.forEach((row) => {
      pools.forEach((pool) => {
        const cell = row.cells[pool]
        if (cell && cell.options.length > 12) wide.add(pool)
      })
    })
    return wide
  }, [rows, pools])

  const goBack = () => {
    Taro.navigateBack().catch(() => {
      void Taro.redirectTo({ url: '/pages/recommend/index' })
    })
  }

  /** 右下常驻入口：分享当日已保存的矩阵长图（需求 §6.1.7） */
  const handleSharePoster = () => {
    if (!date || !findMatrix(sport, date)) {
      void Taro.showToast({ title: '请先保存矩阵', icon: 'none' })
      return
    }
    void Taro.navigateTo({ url: `/pages/share/index?source=matrix&sport=${sport}&date=${date}` })
  }

  /** 点未选 = 加入该格（复式），点已选 = 从该格移除；移除到空该格回到未填 */
  const handlePick = (row: MatrixTableRow, cell: MatrixCell, option: OddsOption) => {
    setSelections((prev) =>
      toggleMatrixSelection(
        prev,
        { matchId: row.matchId, poolCode: cell.poolCode, line: cell.line },
        option,
      ),
    )
  }

  const handleTogglePool = (target: SportKey, pool: PoolCode) => {
    const active = settings[target]
    const on = active.includes(pool)
    if (on && active.length <= 1) {
      void Taro.showToast({ title: '至少保留一个玩法', icon: 'none' })
      return
    }
    const nextPools = on
      ? active.filter((item) => item !== pool)
      : MATRIX_POOLS[target].filter((code) => code === pool || active.includes(code))
    const next: MatrixSettings = { ...settings, [target]: nextPools }
    setSettings(next)
    saveMatrixSettings(next)
    if (on) {
      setSelections((prev) => clearPoolSelections(prev, pool))
    }
  }

  const handleSave = () => {
    if (!rows.length) return
    if (!completeness.complete) {
      void Taro.showToast({
        title: `还差 ${completeness.missingRowCount} 场 / ${completeness.missingCount} 格`,
        icon: 'none',
      })
      return
    }
    saveMatrix(
      buildMatrixSnapshot({ date, sport, rows, pools, selections: valid, updatedAt: Date.now() }),
    )
    void Taro.showToast({ title: '矩阵已保存', icon: 'success' })
    setTimeout(goBack, 600)
  }

  const dateLabel = date ? formatDateLabel(date) : '今日'

  return (
    <View className={styles.page}>
      <View className={styles.head}>
        <Text className={styles.back} onClick={goBack}>
          ‹
        </Text>
        <Text className={styles.title}>综合大数据</Text>
        <Text className={styles.setting} onClick={() => setDrawerOpen(true)}>
          设置
        </Text>
      </View>

      <View className={styles.sports}>
        {SPORTS.map((item) => (
          <Text
            key={item.key}
            className={classnames(styles.sportTab, sport === item.key && styles.sportTabOn)}
            onClick={() => setSport(item.key)}
          >
            {item.label}
          </Text>
        ))}
      </View>

      {schedule.dates.length > 0 && (
        <ScrollView scrollX enhanced showScrollbar={false} className={styles.dates}>
          <View className={styles.dateRow}>
            {schedule.dates.map((item) => (
              <Text
                key={item}
                className={classnames(styles.dateChip, date === item && styles.dateChipOn)}
                onClick={() => setDate(item)}
              >
                {formatDateLabel(item)}
              </Text>
            ))}
          </View>
        </ScrollView>
      )}

      <View className={styles.meta}>
        <Text className={styles.metaText}>
          {`${dateLabel} · 共 ${rows.length} 场`}
        </Text>
        <Text className={styles.metaText}>
          {`已选 ${completeness.filledCount}/${completeness.cellCount} 格`}
        </Text>
      </View>

      {current.status === 'loading' && <Text className={styles.status}>加载中…</Text>}
      {current.status === 'error' && (
        <View className={styles.statusBox}>
          <Text className={styles.status}>{current.error || '赛程加载失败'}</Text>
          <Text className={styles.retry} onClick={() => void load(sport)}>
            重试
          </Text>
        </View>
      )}
      {current.status === 'ready' && !rows.length && (
        <Text className={styles.status}>当日暂无可选场次</Text>
      )}

      {rows.length > 0 && (
        <ScrollView scrollX enhanced showScrollbar={false} className={styles.table}>
          <View className={styles.tableInner}>
            <View className={styles.headRow}>
              <View className={classnames(styles.infoHead, styles.headCell)}>
                <Text className={styles.headText}>场次</Text>
              </View>
              {pools.map((pool) => (
                <View
                  key={pool}
                  className={classnames(
                    styles.cellHead,
                    styles.headCell,
                    widePools.has(pool) && styles.headWide,
                  )}
                >
                  <Text className={styles.headText}>{matrixPoolName(pool)}</Text>
                  {uniformPoolLine(rows, pool) ? (
                    <Text className={styles.headLine}>{uniformPoolLine(rows, pool)}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {rows.map((row) => (
              <View key={row.matchId} className={styles.row}>
                <View className={styles.infoCell}>
                  <View className={styles.matchTop}>
                    <Text className={styles.matchNo}>{row.matchNo}</Text>
                    <Text className={styles.matchTime}>{row.time}</Text>
                  </View>
                  <Text className={styles.matchLeague}>{row.league}</Text>
                  <Text className={styles.matchTeams}>{row.home + ' VS ' + row.away}</Text>
                </View>

                {pools.map((pool) => {
                  const cell = row.cells[pool]
                  if (!cell) {
                    return (
                      <View
                        key={pool}
                        className={classnames(styles.cell, widePools.has(pool) && styles.cellWide)}
                      >
                        <Text className={styles.cellEmpty}>--</Text>
                      </View>
                    )
                  }
                  const picks = valid[matrixCellKey(row.matchId, pool)]
                  const selectedKeys = selectedOptionKeys(picks)
                  return (
                    <View
                      key={pool}
                      className={classnames(styles.cell, widePools.has(pool) && styles.cellWide)}
                    >
                      {cell.line ? <Text className={styles.cellLine}>{cell.line}</Text> : null}
                      {picks?.length ? (
                        <View className={styles.chosenRow}>
                          <Text className={styles.chosenLabel}>
                            {picks.map((pick) => pick.label).join(' / ')}
                          </Text>
                          <Text className={styles.chosenOdds}>
                            {picks.map((pick) => formatOdds(pick.odds)).join(' / ')}
                          </Text>
                        </View>
                      ) : null}
                      <View className={styles.options}>
                        {cell.options.map((option) => (
                          <View
                            key={option.key}
                            className={classnames(
                              styles.option,
                              selectedKeys.has(option.key) && styles.optionOn,
                            )}
                            onClick={() => handlePick(row, cell, option)}
                          >
                            <Text className={styles.optionLabel}>{option.label}</Text>
                            <Text className={styles.optionOdds}>{formatOdds(option.odds)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <View className={styles.footer}>
        <Text className={styles.footerHint}>
          {completeness.complete
            ? '每场每玩法已选齐'
            : `还差 ${completeness.missingRowCount} 场 / ${completeness.missingCount} 格`}
        </Text>
        <Text
          className={classnames(styles.save, !completeness.complete && styles.saveOff)}
          onClick={handleSave}
        >
          保存矩阵
        </Text>
      </View>

      <View className={styles.fab} onClick={handleSharePoster}>
        <Text className={styles.fabIcon}>↗</Text>
      </View>

      {drawerOpen && (
        <View className={styles.mask} onClick={() => setDrawerOpen(false)}>
          <View className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <View className={styles.sheetHead}>
              <Text className={styles.sheetTitle}>显示玩法</Text>
              <Text className={styles.sheetClose} onClick={() => setDrawerOpen(false)}>
                完成
              </Text>
            </View>

            {SPORTS.map((item) => (
              <View key={item.key} className={styles.group}>
                <Text className={styles.groupTitle}>{item.label}</Text>
                {MATRIX_POOLS[item.key].map((pool) => {
                  const on = settings[item.key].includes(pool)
                  return (
                    <View
                      key={pool}
                      className={styles.switchRow}
                      onClick={() => handleTogglePool(item.key, pool)}
                    >
                      <Text className={styles.switchLabel}>{matrixPoolName(pool)}</Text>
                      <View className={classnames(styles.switch, on && styles.switchOn)}>
                        <View className={styles.switchDot} />
                      </View>
                    </View>
                  )
                })}
              </View>
            ))}

            <Text className={styles.sheetHint}>每种运动至少保留 1 个玩法</Text>
          </View>
        </View>
      )}
    </View>
  )
}
