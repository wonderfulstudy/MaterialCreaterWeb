import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import SavePlanButton from '../SavePlanButton'
import {
  EXTRA_POOLS,
  KEYPAD_KEYS,
  MAX_MATCH,
  MULTIPLE_PRESETS,
  PASS_OPTIONS,
  POOL_DEFS,
  PRIMARY_POOLS,
  SPORTS,
  passLabel,
  type OddsOption,
  type PlanLeg,
  type PoolCode,
  type PoolRow,
  type ScheduleStatus,
  type SelectionSummary,
  type SportKey,
  type SportMatch,
  type SportSchedule,
} from './model'
import { formatAmount, formatDateLabel, formatGoalLine, formatOdds, planOdds, summarizeLegs } from './calc'
import styles from './index.module.scss'

export interface PlanCalculatorProps {
  /** 是否展示，sheet 变体用来控制弹出 */
  visible?: boolean
  /** page：铺满页面的计算器；sheet：底部抽屉（默认 page） */
  variant?: 'page' | 'sheet'
  title?: string
  sport: SportKey
  schedule: SportSchedule
  status: ScheduleStatus
  error?: string
  /** 初始已选方案，如再次编辑已有方案 */
  initialLegs?: PlanLeg[]
  /** 是否允许同一场比赛选择多个选项，默认 true */
  allowMultiSelect?: boolean
  /** 是否展示过关方式 / 倍数 / 金额计算区，默认 true */
  showPassBar?: boolean
  /** 最多可选场次，默认 MAX_MATCH */
  maxMatch?: number
  confirmText?: string
  /** 传入后展示竞足 / 竞篮切换 */
  onSportChange?: (sport: SportKey) => void
  onRetry?: () => void
  onCancel?: () => void
  onConfirm?: (legs: PlanLeg[], summary: SelectionSummary) => void
}

interface DateGroup {
  date: string
  matches: SportMatch[]
}

/** 左侧盘口列文案 */
function rowLineText(row: PoolRow): string {
  if (row.poolCode === 'MNL') {
    return '-'
  }
  if (row.poolCode === 'HAD') {
    return '0'
  }
  if (row.poolCode === 'HILO') {
    return row.line
  }
  return formatGoalLine(row.line)
}

function gridClass(poolCode: PoolCode): string {
  const columns = POOL_DEFS[poolCode].columns
  return columns === 2 ? styles.grid2 : columns === 3 ? styles.grid3 : styles.grid4
}

function toLeg(match: SportMatch, row: PoolRow, option: OddsOption, sport: SportKey): PlanLeg {
  return {
    sport,
    matchId: match.matchId,
    matchNumStr: match.matchNumStr,
    league: match.league,
    matchDate: match.businessDate,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    poolCode: row.poolCode,
    poolName: row.title,
    goalLine: row.line,
    optionKey: option.key,
    optionLabel: option.label,
    odds: option.odds,
  }
}

function shortTime(matchTime: string): string {
  return matchTime ? matchTime.slice(0, 5) : ''
}

/** 方案计算器：选场 + 玩法 + 过关方式 + 倍数 -> 注数 / 金额 / 奖金 */
export default function PlanCalculator(props: PlanCalculatorProps) {
  const {
    visible = true,
    variant = 'page',
    title = '方案计算器',
    sport,
    schedule,
    status,
    error = '',
    initialLegs = [],
    allowMultiSelect = true,
    showPassBar = true,
    maxMatch = MAX_MATCH,
    confirmText = '保存',
    onSportChange,
    onRetry,
    onCancel,
    onConfirm,
  } = props

  const isSheet = variant === 'sheet'
  const isH5 = process.env.TARO_ENV === 'h5'

  const [legs, setLegs] = useState<PlanLeg[]>([])
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({})
  const [popupMatchId, setPopupMatchId] = useState<number | null>(null)
  const [leagueFilter, setLeagueFilter] = useState('')
  const [showLeagueFilter, setShowLeagueFilter] = useState(false)
  const [gameOpen, setGameOpen] = useState(false)
  const [passSizes, setPassSizes] = useState<number[]>([1])
  const [passOpen, setPassOpen] = useState(false)
  const [multiple, setMultiple] = useState(1)
  const [multOpen, setMultOpen] = useState(false)
  const [multInput, setMultInput] = useState('1')
  const replaceMultInput = useRef(true)

  const opened = useRef(false)

  // 每次打开（或首次挂载）时用 initialLegs 重置面板状态
  useEffect(() => {
    if (!visible) {
      opened.current = false
      return
    }
    if (opened.current) {
      return
    }
    opened.current = true
    setLegs(initialLegs.map((leg) => ({ ...leg })))
    setCollapsedDates({})
    setPopupMatchId(null)
    setLeagueFilter('')
    setShowLeagueFilter(false)
    setGameOpen(false)
    setPassSizes([Math.min(maxMatch, Math.max(1, new Set(initialLegs.map((leg) => leg.matchId)).size))])
    setPassOpen(false)
    setMultiple(1)
    setMultInput('1')
    setMultOpen(false)
  }, [visible, initialLegs, maxMatch])

  // 切换竞足 / 竞篮后，旧的选项不再有效
  const sportRef = useRef(sport)
  useEffect(() => {
    if (sportRef.current === sport) {
      return
    }
    sportRef.current = sport
    setLegs([])
    setPopupMatchId(null)
    setPassSizes([1])
    setMultiple(1)
    setMultOpen(false)
    setCollapsedDates({})
  }, [sport])

  const leagues = useMemo(() => {
    const names = new Set<string>()
    schedule.matches.forEach((match) => {
      if (match.league) {
        names.add(match.league)
      }
    })
    return Array.from(names)
  }, [schedule.matches])

  const groups = useMemo<DateGroup[]>(() => {
    const map = new Map<string, SportMatch[]>()
    schedule.matches.forEach((match) => {
      if (leagueFilter && match.league !== leagueFilter) {
        return
      }
      const list = map.get(match.businessDate)
      if (list) {
        list.push(match)
      } else {
        map.set(match.businessDate, [match])
      }
    })
    return Array.from(map.entries()).map(([date, matches]) => ({ date, matches }))
  }, [leagueFilter, schedule.matches])

  const selectedMatchCount = useMemo(() => new Set(legs.map((leg) => leg.matchId)).size, [legs])
  // 已选比赛场数变化时，默认选中对应的几串1。
  const defaultPassSize = Math.min(maxMatch, Math.max(1, selectedMatchCount))
  const availablePassOptions = PASS_OPTIONS.filter((option) => option.size <= defaultPassSize)

  useEffect(() => {
    if (!showPassBar) {
      return
    }
    setPassSizes([defaultPassSize])
  }, [defaultPassSize, selectedMatchCount, showPassBar])

  const summary = useMemo(() => summarizeLegs(legs, passSizes, multiple), [legs, passSizes, multiple])

  const isSelected = (matchId: number, row: PoolRow, option: OddsOption) =>
    legs.some(
      (leg) => leg.matchId === matchId && leg.poolCode === row.poolCode && leg.optionKey === option.key,
    )

  const toggleOption = (match: SportMatch, row: PoolRow, option: OddsOption) => {
    if (!option.odds) {
      return
    }
    const picked = isSelected(match.matchId, row, option)
    if (!picked) {
      const matchIds = new Set(legs.map((leg) => leg.matchId))
      if (!matchIds.has(match.matchId) && matchIds.size >= maxMatch) {
        Taro.showToast({ title: `最多选择 ${maxMatch} 场比赛`, icon: 'none' })
        return
      }
    }

    setLegs((prev) => {
      const target = prev.find(
        (leg) =>
          leg.matchId === match.matchId && leg.poolCode === row.poolCode && leg.optionKey === option.key,
      )
      if (target) {
        return prev.filter((leg) => leg !== target)
      }
      const leg = toLeg(match, row, option, sport)
      if (allowMultiSelect) {
        return [...prev, leg]
      }
      return [...prev.filter((item) => item.matchId !== match.matchId), leg]
    })
  }

  const togglePass = (size: number) => {
    setPassSizes((prev) =>
      prev.includes(size) ? prev.filter((item) => item !== size) : [...prev, size].sort((a, b) => a - b),
    )
  }

  const changeMultiple = (delta: number) => {
    setMultiple((prev) => Math.max(1, prev + delta))
    setMultOpen(false)
  }

  const pressKey = (key: string) => {
    if (key === '删除') {
      replaceMultInput.current = false
      setMultInput((prev) => prev.slice(0, -1))
      return
    }
    const replace = replaceMultInput.current
    replaceMultInput.current = false
    setMultInput((prev) => (replace || prev === '0' ? key : prev + key))
  }

  const confirmMultiple = () => {
    const num = Number.parseInt(multInput, 10)
    if (!Number.isFinite(num) || num < 1) {
      Taro.showToast({ title: '请输入大于等于 1 的倍数', icon: 'none' })
      return
    }
    setMultiple(num)
    setMultOpen(false)
  }

  const clearSelection = () => {
    setLegs([])
    setPassSizes([1])
    setMultiple(1)
    setMultOpen(false)
  }

  const renderCell = (match: SportMatch, row: PoolRow, option: OddsOption) => {
    const active = isSelected(match.matchId, row, option)
    const single = match.bettingSingle === 1
    return (
      <View
        key={option.key}
        className={classnames(
          styles.oddsCell,
          single ? styles.cellSingle : styles.cellParlay,
          active && styles.cellActive,
          !option.odds && styles.cellDisabled,
        )}
        onClick={() => toggleOption(match, row, option)}
      >
        <Text className={styles.oddsLabel}>{option.label}</Text>
        <Text className={styles.oddsValue}>{option.odds ? option.odds.toFixed(2) : '--'}</Text>
      </View>
    )
  }

  const renderRow = (match: SportMatch, row: PoolRow) => (
    <View className={styles.oddsRow} key={`${match.matchId}-${row.poolCode}`}>
      <Text className={styles.goalLine}>{rowLineText(row)}</Text>
      {row.options.map((option) => renderCell(match, row, option))}
    </View>
  )

  const renderMatchCard = (match: SportMatch) => {
    const primaryRows = PRIMARY_POOLS[sport]
      .map((code) => match.rows.find((row) => row.poolCode === code))
      .filter((row): row is PoolRow => Boolean(row))
    const extraCount = EXTRA_POOLS[sport].filter((code) => match.rows.some((row) => row.poolCode === code)).length

    return (
      <View key={match.matchId} className={styles.matchCard}>
        <View className={styles.matchHead}>
          <View className={styles.matchNo}>
            <Text className={styles.matchWeek}>{match.matchWeek}</Text>
            <Text className={styles.matchNum}>{String(match.matchNum).slice(-3)}</Text>
          </View>
          <View className={styles.matchTeams}>
            <View className={styles.teamSide}>
              <Text className={styles.teamName}>{match.homeTeam}</Text>
              {match.homeRank ? (
                <Text className={styles.teamRank}>{match.homeRank}</Text>
                ) : null}
            </View>
            <Text className={styles.vs}>VS</Text>
            <View className={styles.teamSide}>
              <Text className={styles.teamName}>{match.awayTeam}</Text>
              {match.awayRank ? (
                <Text className={styles.teamRank}>{match.awayRank}</Text>
                ) : null}
            </View>
          </View>
        </View>
        <View className={styles.matchBody}>
          <View className={styles.matchAside}>
            <Text className={styles.leagueTag} style={{ background: `#${match.backColor || '86909c'}` }}>
              {match.league}
            </Text>
            <Text className={styles.matchTime}>{shortTime(match.matchTime)}</Text>
            {match.bettingSingle === 1 ? <Text className={styles.singleTag}>单关</Text> : null}
          </View>
          <View className={styles.oddsBoard}>
            <View className={styles.oddsRows}>{primaryRows.map((row) => renderRow(match, row))}</View>
            {extraCount > 0 ? (
              <View className={styles.morePlays} onClick={() => setPopupMatchId(match.matchId)}>
                <Text className={styles.morePlaysText}>更多玩法</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    )
  }

  const headerActions = (
    <View className={styles.headerActions}>
      {isSheet && legs.length ? (
        <Text className={styles.headerAction} onClick={clearSelection}>
          清空
        </Text>
      ) : null}
      <Text
        className={classnames(styles.headerAction, showLeagueFilter && styles.headerActionActive)}
        onClick={() => setShowLeagueFilter((prev) => !prev)}
      >
        筛选
      </Text>
      {onRetry ? (
        <Text className={styles.headerAction} onClick={onRetry}>
          刷新
        </Text>
      ) : null}
    </View>
  )

  const sportDropdown = onSportChange ? (
    <View className={styles.gameDd}>
      <View className={styles.ddTrigger} onClick={() => setGameOpen((prev) => !prev)}>
        <Text className={styles.ddValue}>{SPORTS.find((item) => item.key === sport)?.label}</Text>
        <Text className={classnames(styles.ddArrow, gameOpen && styles.ddArrowOpen)}>▾</Text>
      </View>
      {gameOpen ? (
        <View className={styles.ddMenu}>
          {SPORTS.map((option) => (
            <View
              key={option.key}
              className={classnames(styles.ddItem, option.key === sport && styles.ddItemActive)}
              onClick={() => {
                setGameOpen(false)
                if (option.key !== sport) {
                  onSportChange(option.key)
                }
              }}
            >
              <Text className={styles.ddItemText}>{option.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  ) : null

  const leagueBar = showLeagueFilter ? (
    <ScrollView scrollX className={styles.leagueBar} enhanced showScrollbar={false}>
      <View className={styles.leagueList}>
        <View
          className={classnames(styles.leagueChip, !leagueFilter && styles.leagueChipActive)}
          onClick={() => setLeagueFilter('')}
        >
          <Text className={styles.leagueChipText}>全部</Text>
        </View>
        {leagues.map((name) => (
          <View
            key={name}
            className={classnames(styles.leagueChip, leagueFilter === name && styles.leagueChipActive)}
            onClick={() => setLeagueFilter(name === leagueFilter ? '' : name)}
          >
            <Text className={styles.leagueChipText}>{name}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  ) : null

  const body = (
    <ScrollView scrollY className={styles.body}>
      {status === 'loading' ? (
        <View className={styles.stateBox}>
          <Text className={styles.stateText}>正在加载赛程与赔率…</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View className={styles.stateBox}>
          <Text className={styles.stateText}>{error || '赛程加载失败'}</Text>
          {onRetry ? (
            <View className={styles.retryBtn} onClick={onRetry}>
              <Text className={styles.retryText}>重新加载</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {status === 'ready' && !groups.length ? (
        <View className={styles.stateBox}>
          <Text className={styles.stateText}>暂无可选比赛</Text>
          <Text className={styles.stateHint}>请稍后重试，或调整联赛筛选</Text>
        </View>
      ) : null}

      {groups.map((group) => {
        const collapsed = Boolean(collapsedDates[group.date])
        return (
          <View className={styles.dateGroup} key={group.date}>
            <View
              className={styles.dateHeader}
              onClick={() =>
                setCollapsedDates((prev) => ({ ...prev, [group.date]: !prev[group.date] }))
              }
            >
              <Text className={styles.dateHeaderText}>
                {formatDateLabel(group.date)} 共{group.matches.length}场
              </Text>
              <Text className={classnames(styles.dateArrow, collapsed && styles.dateArrowCollapsed)}>▾</Text>
            </View>
            {!collapsed ? (
              <View className={styles.matchList}>{group.matches.map(renderMatchCard)}</View>
            ) : null}
          </View>
        )
      })}

      {schedule.updateTime ? <Text className={styles.updateTime}>更新时间 {schedule.updateTime}</Text> : null}
      <View className={styles.bottomPlaceholder} />
    </ScrollView>
  )

  const popupMatch = popupMatchId === null ? null : schedule.matches.find((match) => match.matchId === popupMatchId) ?? null
  const popupRows = popupMatch
    ? EXTRA_POOLS[sport]
        .map((code) => popupMatch.rows.find((row) => row.poolCode === code))
        .filter((row): row is PoolRow => Boolean(row))
    : []

  const popup = popupMatch ? (
    <View className={styles.popupMask} onClick={() => setPopupMatchId(null)}>
      <View className={styles.popupPanel} onClick={(event) => event.stopPropagation()}>
        <View className={styles.popupHead}>
          <View className={styles.popupTitleBox}>
            <Text className={styles.popupTitle}>
              {popupMatch.matchNumStr} {popupMatch.homeTeam} VS {popupMatch.awayTeam}
            </Text>
            <Text className={styles.popupSubtitle}>更多玩法 · 点击赔率即可选择</Text>
          </View>
          <Text className={styles.popupClose} onClick={() => setPopupMatchId(null)}>
            ✕
          </Text>
        </View>
        <ScrollView scrollY className={styles.popupBody}>
          {popupRows.map((row) => (
            <View key={row.poolCode} className={styles.popupSection}>
              <Text className={styles.popupSectionTitle}>
                {row.title}
                {formatGoalLine(row.line) ? ` ${formatGoalLine(row.line)}` : ''}
              </Text>
              <View className={classnames(styles.popupGrid, gridClass(row.poolCode))}>
                {row.options.map((option) => renderCell(popupMatch, row, option))}
              </View>
            </View>
          ))}
          {!popupRows.length ? <Text className={styles.popupEmpty}>暂无更多玩法</Text> : null}
        </ScrollView>
      </View>
    </View>
  ) : null

  const footer = (
    <View className={classnames(styles.bottomBar, !isSheet && styles.pageBottomBar)}>
      <View className={classnames(!isSheet && styles.footerMain)}>
        {showPassBar ? (
          <>
            <View className={styles.barRow}>
              <View className={styles.passDd}>
                <View
                  className={styles.ddTrigger}
                  onClick={() => {
                    setMultOpen(false)
                    setPassOpen((prev) => !prev)
                  }}
                >
                  <Text className={styles.ddLabel}>过关方式</Text>
                  <Text className={styles.ddValue}>
                    {passSizes.length ? passSizes.map((size) => passLabel(size)).join('、') : '未选择'}
                  </Text>
                  <Text className={classnames(styles.ddArrow, passOpen && styles.ddArrowOpen)}>▾</Text>
                </View>
                {passOpen ? (
                  <View className={classnames(styles.ddMenu, styles.ddMenuUp)}>
                    {availablePassOptions.map((option) => (
                      <View
                        key={option.size}
                        className={classnames(styles.ddItem, passSizes.includes(option.size) && styles.ddItemActive)}
                        onClick={() => togglePass(option.size)}
                      >
                        <Text className={styles.ddItemText}>{option.label}</Text>
                        {passSizes.includes(option.size) ? <Text className={styles.ddCheck}>✓</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View className={styles.multBox}>
                <View className={styles.multipleBtn} onClick={() => changeMultiple(-1)}>
                  <Text className={styles.multipleBtnText}>-</Text>
                </View>
                <View className={styles.multDd}>
                  <View
                    className={styles.ddTrigger}
                    onClick={() => {
                      if (!multOpen) {
                        setMultInput(String(multiple))
                        replaceMultInput.current = true
                      }
                      setPassOpen(false)
                      setMultOpen(!multOpen)
                    }}
                  >
                    <Text className={styles.ddLabel}>倍数</Text>
                    <Text className={styles.ddValue}>{multOpen ? multInput || '0' : multiple}</Text>
                    <Text className={classnames(styles.ddArrow, multOpen && styles.ddArrowOpen)}>▾</Text>
                  </View>
                  {multOpen ? (
                    <View className={classnames(styles.ddMenu, styles.ddMenuUp, styles.multMenu)}>
                      <View className={styles.presetRow}>
                        {MULTIPLE_PRESETS.map((preset) => (
                          <View
                            key={preset}
                            className={classnames(styles.presetChip, multiple === preset && styles.presetChipActive)}
                            onClick={() => {
                              setMultiple(preset)
                              setMultOpen(false)
                            }}
                          >
                            <Text className={styles.presetChipText}>{preset}倍</Text>
                          </View>
                        ))}
                      </View>
                      <View className={styles.keypad}>
                        {KEYPAD_KEYS.map((key) => (
                          <View
                            key={key}
                            className={classnames(
                              styles.keypadKey,
                              key === '确认倍数' ? styles.keypadConfirm : key !== '删除' && styles.keypadNum,
                            )}
                            onClick={() => (key === '确认倍数' ? confirmMultiple() : pressKey(key))}
                          >
                            <Text className={styles.keypadKeyText}>{key}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
                <View className={styles.multipleBtn} onClick={() => changeMultiple(1)}>
                  <Text className={styles.multipleBtnText}>+</Text>
                </View>
              </View>
            </View>

            <View className={styles.bonusRow}>
              <Text className={styles.legendText}>红色边框可投单关</Text>
              {isSheet ? (
                <Text className={styles.maxBonus}>最高奖金：{formatAmount(summary.maxBonus)}元</Text>
              ) : (
                <View className={styles.pageBonusAmounts}>
                  <Text className={styles.ticketAmount}>票面金额：{formatAmount(summary.amount)}元</Text>
                  <Text className={styles.maxBonus}>最高奖金：{formatAmount(summary.maxBonus)}元</Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View className={styles.calcRow}>
            <View className={styles.calcInfo}>
              <Text className={styles.calcLine}>已选 {legs.length} 场</Text>
              <Text className={styles.calcBonus}>共 {summary.optionCount} 个选项</Text>
            </View>
            <View className={styles.amountBox}>
              <Text className={styles.amountUnit}>理论赔率</Text>
              <Text className={styles.amountValue}>{formatOdds(planOdds(legs))}</Text>
            </View>
          </View>
        )}
      </View>

      {!isSheet ? (
        <View className={styles.pageActions}>
          <Button className={styles.clearButton} disabled={!legs.length} onClick={clearSelection}>
            清空
          </Button>
          <SavePlanButton
            className={styles.saveButton}
            legs={legs}
            matches={schedule.matches}
            summary={summary}
            passSizes={passSizes}
            onOpen={() => {
              setPassOpen(false)
              setMultOpen(false)
              setGameOpen(false)
            }}
          />
        </View>
      ) : null}

      {isSheet && (onCancel || onConfirm) ? (
        <View className={styles.footerActions}>
          {onCancel ? (
            <View className={styles.cancelBtn} onClick={onCancel}>
              <Text className={styles.cancelText}>取消</Text>
            </View>
          ) : null}
          {onConfirm ? (
            <View
              className={classnames(styles.confirmBtn, !legs.length && styles.confirmBtnDisabled)}
              onClick={() => legs.length && onConfirm(legs, summary)}
            >
              <Text className={styles.confirmText}>{confirmText}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )

  if (!visible) {
    return null
  }

  if (isSheet) {
    return (
      <View className={classnames(styles.overlay, isH5 && styles.overlayH5)} onClick={onCancel}>
        <View className={styles.mask} catchMove />
        <View className={styles.sheet} onClick={(event) => event.stopPropagation()}>
          <View className={styles.handle} />
          <View className={styles.sheetHeader}>
            <Text className={styles.title}>{title}</Text>
            {headerActions}
            {onCancel ? (
              <View className={styles.close} onClick={onCancel}>
                <Text className={styles.closeText}>✕</Text>
              </View>
            ) : null}
          </View>
          {leagueBar}
          {body}
          {footer}
        </View>
        {popup}
      </View>
    )
  }

  return (
    <View className={classnames(styles.page, isH5 && styles.pageH5)}>
      <View className={styles.toolbar}>
        {sportDropdown}
        <Text className={styles.toolbarTitle}>{title}</Text>
        {headerActions}
      </View>
      {leagueBar}
      {body}
      {footer}
      {popup}
    </View>
  )
}
