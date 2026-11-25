import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import classnames from 'classnames'
import {
  formatAmount,
  formatDateLabel,
  sportLabel,
  type SelectionSummary,
  type SportKey,
} from '@/components/PlanCalculator'
import { judgeRecentPlans } from '@/services/plan-judge'
import { findDay, listDaysMap, markRest, primaryPlanId, saveDay, type StoredPlanDay } from '@/services/plan-store'
import styles from './index.module.scss'

const WEEK_HEADS = ['日', '一', '二', '三', '四', '五', '六']

/** 近 7 天（含今天）可记录 */
const RECENT_DAYS = 7

const EMPTY_SUMMARY: SelectionSummary = {
  matchCount: 0,
  optionCount: 0,
  parlayCount: 0,
  betCount: 0,
  multiple: 1,
  amount: 0,
  maxBonus: 0,
  minBonus: 0,
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Date → 2026-11-24 */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function shiftDay(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset)
}

/** 判中徽标文案：中 / 未 / 待（缺省与 pending 同显示为「待」） */
function judgeText(judged?: StoredPlanDay['judged']): string {
  if (judged === 'hit') {
    return '中'
  }
  return judged === 'miss' ? '未' : '待'
}

function bonusRange(summary: SelectionSummary): string {
  return `${formatAmount(summary.minBonus)}~${formatAmount(summary.maxBonus)}`
}

/** 无记录日期也能标记休息：plan-store 的 markRest 只更新已有记录，因此先落一条空记录 */
function restOnlyDay(date: string, sport: SportKey, planId: string): StoredPlanDay {
  return {
    planId,
    date,
    sport,
    multiple: 1,
    passIds: [],
    legs: [],
    summary: { ...EMPTY_SUMMARY },
    rest: true,
    updatedAt: Date.now(),
  }
}

export default function PlanRecordPage() {
  const [today] = useState(startOfToday)
  const [days, setDays] = useState<Record<string, StoredPlanDay>>(() => listDaysMap())
  const [selected, setSelected] = useState(() => dayKey(startOfToday()))
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))

  const refresh = useCallback(() => {
    setDays(listDaysMap())
  }, [])

  // AC-17：赛果回填后自动判中，写回 plan-store 后重读一次让徽标立即生效。
  // 判定本身只覆盖近 7 天且有 legs 的天，失败静默：不弹错、不阻塞页面。
  useDidShow(() => {
    refresh()
    void judgeRecentPlans()
      .then((judged) => {
        if (judged.length) refresh()
      })
      .catch(() => undefined)
  })

  // AC-18：休息理由要落到 B 海报那一行，所以休息日可编辑 note
  const [noteDraft, setNoteDraft] = useState('')
  useEffect(() => {
    setNoteDraft(days[selected]?.note ?? '')
  }, [days, selected])

  // 只在 onBlur 存太脆（未聚焦的输入框不会有 blur），输入即落盘，失焦再收尾 trim
  const persistNote = (raw: string) => {
    const current = findDay(selected)
    if (!current || (current.note ?? '') === raw) return
    saveDay({ ...current, note: raw, updatedAt: Date.now() })
    refresh()
  }

  const commitNote = () => {
    const current = findDay(selected)
    const next = noteDraft.trim()
    if (!current || (current.note ?? '') === next) return
    saveDay({ ...current, note: next, updatedAt: Date.now() })
    refresh()
  }

  const todayText = dayKey(today)
  const windowStart = dayKey(shiftDay(today, -(RECENT_DAYS - 1)))

  const canPrev = useMemo(() => {
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return cursor.year !== prev.getFullYear() || cursor.month !== prev.getMonth()
  }, [cursor, today])

  const canNext = useMemo(
    () => cursor.year !== today.getFullYear() || cursor.month !== today.getMonth(),
    [cursor, today],
  )

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const total = new Date(cursor.year, cursor.month + 1, 0).getDate()
    const list: (string | null)[] = []
    for (let index = 0; index < first.getDay(); index += 1) {
      list.push(null)
    }
    for (let day = 1; day <= total; day += 1) {
      list.push(`${cursor.year}-${pad2(cursor.month + 1)}-${pad2(day)}`)
    }
    return list
  }, [cursor])

  const selectedDay = days[selected]
  const selectedRecord = selectedDay && selectedDay.legs.length ? selectedDay : null
  const selectedRest = Boolean(selectedDay?.rest)

  const goPrevMonth = () => {
    if (!canPrev) {
      return
    }
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month - 1, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const goNextMonth = () => {
    if (!canNext) {
      return
    }
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + 1, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const toggleRest = () => {
    const current = findDay(selected)
    if (current?.rest) {
      markRest(selected, false)
    } else if (current) {
      markRest(selected, true)
    } else {
      saveDay(restOnlyDay(selected, 'football', primaryPlanId() ?? 'plan-1'))
    }
    refresh()
  }

  const goNext = () => {
    const url = selectedRecord
      ? `/pages/plan-detail/index?date=${selected}`
      : `/pages/selector/index?date=${selected}`
    void Taro.navigateTo({ url })
  }

  const renderCell = (date: string | null, index: number) => {
    if (!date) {
      return <View key={`blank-${index}`} className={styles.cell} />
    }

    const selectable = date >= windowStart && date <= todayText
    const record = days[date]
    const hasPlan = Boolean(record && record.legs.length)
    const rest = Boolean(record?.rest)

    return (
      <View
        key={date}
        className={classnames(
          styles.cell,
          !selectable && styles.cellMute,
          date === selected && styles.cellOn,
        )}
        onClick={() => selectable && setSelected(date)}
      >
        <Text className={styles.cellDay}>{Number(date.slice(-2))}</Text>
        {hasPlan ? <View className={styles.dot} /> : null}
        {hasPlan ? (
          <Text
            className={classnames(
              styles.judgeTag,
              record?.judged === 'hit' && styles.judgeTagHit,
              record?.judged === 'miss' && styles.judgeTagMiss,
            )}
          >
            {judgeText(record?.judged)}
          </Text>
        ) : null}
        {rest ? <Text className={styles.restTag}>休</Text> : null}
      </View>
    )
  }

  return (
    <View className={styles.page}>
      <View className={styles.calCard}>
        <View className={styles.calHead}>
          <View
            className={classnames(styles.calNav, !canPrev && styles.calNavOff)}
            onClick={goPrevMonth}
          >
            <Text className={styles.calNavText}>‹</Text>
          </View>
          <Text className={styles.calMonth}>
            {cursor.year} 年 {cursor.month + 1} 月
          </Text>
          <View
            className={classnames(styles.calNav, !canNext && styles.calNavOff)}
            onClick={goNextMonth}
          >
            <Text className={styles.calNavText}>›</Text>
          </View>
        </View>

        <View className={styles.calWeek}>
          {WEEK_HEADS.map((head) => (
            <Text key={head} className={styles.calWeekCell}>
              {head}
            </Text>
          ))}
        </View>

        <View className={styles.calGrid}>{cells.map(renderCell)}</View>

        <View className={styles.legend}>
          <View className={styles.legendItem}>
            <View className={styles.legendDot} />
            <Text className={styles.legendText}>有记录</Text>
          </View>
          <View className={styles.legendItem}>
            <Text className={styles.legendRest}>休</Text>
            <Text className={styles.legendText}>已休息</Text>
          </View>
          <View className={styles.legendItem}>
            <Text className={styles.legendJudge}>中/未/待</Text>
            <Text className={styles.legendText}>判中</Text>
          </View>
          <Text className={styles.legendHint}>仅近 7 天可记录</Text>
        </View>
      </View>

      <View className={styles.ticket}>
        <View className={styles.ticketHead}>
          <Text className={styles.ticketDate}>{formatDateLabel(selected)}</Text>
          {selectedRecord ? (
            <Text className={styles.ticketSport}>{sportLabel(selectedRecord.sport)}</Text>
          ) : null}
          {selectedRest ? <Text className={styles.ticketRest}>已休息</Text> : null}
          {selectedRecord ? (
            <Text
              className={classnames(
                styles.ticketJudge,
                selectedRecord.judged === 'hit' && styles.ticketJudgeHit,
                selectedRecord.judged === 'miss' && styles.ticketJudgeMiss,
              )}
            >
              判中 {judgeText(selectedRecord.judged)}
            </Text>
          ) : null}
        </View>

        {selectedRecord ? (
          <View className={styles.stats}>
            <View className={styles.statCell}>
              <Text className={styles.statValue}>{selectedRecord.summary.betCount}</Text>
              <Text className={styles.statLabel}>注数</Text>
            </View>
            <View className={styles.statCell}>
              <Text className={styles.statValue}>{formatAmount(selectedRecord.summary.amount)}</Text>
              <Text className={styles.statLabel}>投入（元）</Text>
            </View>
            <View className={styles.statCellWide}>
              <Text className={styles.statValue}>{bonusRange(selectedRecord.summary)}</Text>
              <Text className={styles.statLabel}>理论奖金（元）</Text>
            </View>
          </View>
        ) : (
          <Text className={styles.ticketEmpty}>该日还没有记录</Text>
        )}
      </View>

      {selectedRest ? (
        <View className={styles.restNoteRow}>
          <Text className={styles.restNoteLabel}>休息理由</Text>
          <Input
            className={styles.restNoteInput}
            value={noteDraft}
            maxlength={30}
            placeholder="如：国庆休息 4 天"
            placeholderClass={styles.restNotePlaceholder}
            onInput={(event) => {
              setNoteDraft(event.detail.value)
              persistNote(event.detail.value)
            }}
            onBlur={commitNote}
          />
        </View>
      ) : null}

      <Text className={styles.hint}>只能记录近 7 天（含今天）的日期</Text>

      <View className={styles.dock}>
        <View className={styles.dockGhost} onClick={toggleRest}>
          <Text className={styles.dockGhostText}>{selectedRest ? '取消休息' : '标记休息'}</Text>
        </View>
        <View className={styles.dockPrimary} onClick={goNext}>
          <Text className={styles.dockPrimaryText}>
            {selectedRecord ? '下一步：看方案' : '下一步：选场次'}
          </Text>
        </View>
      </View>
    </View>
  )
}
