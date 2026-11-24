import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import type { PlanHistoryEntry, SharePlan } from '../SharePoster/model'
import { PosterLead, PosterTop, TicketPerf } from './chrome'
import {
  bonusRange,
  historyOutcome,
  legContent,
  matchNo,
  money,
  moneyExact,
  oddsText,
  playChips,
  shortDate,
  subLine,
  type DayStats,
} from './model'
import styles from './index.module.scss'

export interface PlanPosterAProps {
  plan: SharePlan
  /** 页顶日期：2026-11-24 周一 */
  dateText: string
  /** 分享时刻：09:37 */
  timeText: string
  /** 按天记录的累计战绩 */
  stats: DayStats
  /** 本方案自己的历史版本（已按 plan.id 过滤） */
  history: PlanHistoryEntry[]
}

/** A 卡：今日推荐 —— 方案名 / 玩法 / 奖金 / 本期场次 / 历史 / 累计战绩 / 引流区 */
export default function PlanPosterA({ plan, dateText, timeText, stats, history }: PlanPosterAProps) {
  const legCounts = new Map<number, number>()
  plan.legs.forEach((leg) => legCounts.set(leg.matchId, (legCounts.get(leg.matchId) ?? 0) + 1))
  const summary = plan.summary

  return (
    <View className={styles.po}>
      <PosterTop dateText={dateText} />

      <Text className={styles.name}>{plan.name}</Text>
      <Text className={styles.sub}>{subLine(plan) + ' · 分享于 ' + timeText}</Text>

      <View className={styles.chips}>
        {playChips(plan).map((chip) => (
          <Text className={styles.chip} key={chip.label}>
            {chip.label}
            <Text className={styles.chipValue}>{chip.value}</Text>
          </Text>
        ))}
      </View>

      <View className={styles.card}>
        <View className={styles.range}>
          <Text className={styles.rangeLabel}>
            {summary && summary.minBonus !== summary.maxBonus ? '理论奖金区间' : '理论奖金'}
          </Text>
          <Text className={classnames(styles.rangeValue, styles.num)}>{bonusRange(summary)}</Text>
        </View>

        <TicketPerf />

        <View className={styles.sect}>
          <View className={styles.sectHead}>
            <Text>本期场次</Text>
            <Text className={styles.sectHint}>{plan.legs.length + ' 场选号'}</Text>
          </View>
          {plan.legs.map((leg, index) => {
            const combo = (legCounts.get(leg.matchId) ?? 0) > 1
            return (
              <View className={styles.leg} key={leg.matchId + '-' + leg.poolCode + '-' + leg.optionKey + '-' + index}>
                <Text className={classnames(styles.legNo, styles.num)}>{matchNo(leg)}</Text>
                <View className={styles.legTeam}>
                  <Text className={styles.legTeamName}>{leg.homeTeam + ' vs ' + leg.awayTeam}</Text>
                  <Text className={styles.legLeague}>{leg.league}</Text>
                </View>
                <View className={styles.legPick}>
                  <Text className={styles.legPickName}>{leg.optionLabel}</Text>
                  <Text className={classnames(styles.legOdds, styles.num)}>{'@ ' + oddsText(leg.odds)}</Text>
                </View>
                <Text className={classnames(styles.badge, combo ? styles.badgeCombo : styles.badgeSingle)}>
                  {combo ? '复式' : '单关'}
                </Text>
              </View>
            )
          })}
        </View>

        <TicketPerf />

        <View className={styles.sect}>
          <View className={styles.sectHead}>
            <Text>历史战绩</Text>
            <Text className={styles.sectHint}>{history.length ? '近 ' + history.length + ' 期' : '本方案暂无'}</Text>
          </View>
          <View className={styles.htab}>
            <View className={classnames(styles.hrow, styles.hrowHead)}>
              <Text>日期</Text>
              <Text>方案内容</Text>
              <Text className={styles.cRight}>投注</Text>
              <Text className={styles.cRight}>理论奖金</Text>
              <Text className={styles.cRight}>中/未</Text>
            </View>
            {history.map((entry) => {
              const outcome = historyOutcome(entry)
              return (
                <View className={styles.hrow} key={entry.id}>
                  <Text className={classnames(styles.hd, styles.num)}>{shortDate(entry.date)}</Text>
                  <Text className={styles.hc}>{legContent(entry.legs)}</Text>
                  <Text className={classnames(styles.cRight, styles.num)}>
                    {entry.summary ? money(entry.summary.amount) : '—'}
                  </Text>
                  <Text className={classnames(styles.cRight, styles.num)}>
                    {entry.summary ? moneyExact(entry.summary.maxBonus) : '—'}
                  </Text>
                  <Text
                    className={classnames(
                      styles.cRight,
                      outcome.tone === 'win' ? styles.toneWin : outcome.tone === 'lose' ? styles.toneLose : styles.tonePend
                    )}
                  >
                    {outcome.text}
                  </Text>
                </View>
              )
            })}
            {history.length === 0 ? <Text className={styles.emptyRow}>发布过的版本会按日期列在这里</Text> : null}
          </View>
        </View>

        <TicketPerf />

        <View className={styles.sum}>
          <Text>累计战绩</Text>
          <Text className={classnames(styles.sumValue, styles.num)}>{stats.total + ' 期中 ' + stats.hit + ' 期'}</Text>
          <Text className={styles.sumSep}>·</Text>
          <Text className={classnames(styles.sumValue, styles.num)}>{'连中 ' + stats.streak}</Text>
        </View>

        {plan.note ? (
          <View className={styles.note}>
            <Text className={styles.noteLabel}>备注</Text>
            <Text>{plan.note}</Text>
          </View>
        ) : null}
      </View>

      <PosterLead />
    </View>
  )
}
