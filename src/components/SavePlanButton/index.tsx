import { useEffect, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import { formatAmount, formatOdds } from '../PlanCalculator/calc'
import {
  POOL_DEFS,
  passLabel,
  type OddsOption,
  type PlanLeg,
  type PoolCode,
  type SelectionSummary,
  type SportMatch,
} from '../PlanCalculator/model'
import styles from './index.module.scss'

export interface SavePlanButtonProps {
  className?: string
  legs: PlanLeg[]
  matches: SportMatch[]
  summary: SelectionSummary
  passSizes: number[]
  onOpen?: () => void
  onModify?: () => void
}

interface DetailRow {
  poolCode: PoolCode
  title: string
  line: string
  options: (OddsOption & { selected: boolean })[]
}

interface DetailMatch {
  matchId: number
  number: string
  league: string
  home: string
  away: string
  kickoff: string
  rows: DetailRow[]
}

interface PlanSnapshot {
  summary: SelectionSummary
  passText: string
  sportText: string
  matches: DetailMatch[]
}

/** 奖金口径：最低与最高一致（单选必然全中）时只给一个数，否则给区间 */
function bonusText(minBonus: number, maxBonus: number): string {
  const min = formatAmount(minBonus)
  const max = formatAmount(maxBonus)
  return min === max ? max : `${min}–${max}`
}

/** 保存入口与方案详情预览，可在需要展示方案的页面中复用。 */
export default function SavePlanButton({
  className,
  legs,
  matches,
  summary,
  passSizes,
  onOpen,
  onModify,
}: SavePlanButtonProps) {
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null)

  useEffect(() => {
    if (!snapshot || process.env.TARO_ENV !== 'h5') {
      return
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSnapshot(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [snapshot])

  const openDetails = () => {
    if (!legs.length || !summary.betCount) {
      return
    }
    const selectedOnly = new Set(legs.map((leg) => leg.poolCode)).size > 1
    const grouped = new Map<number, PlanLeg[]>()
    legs.forEach((leg) => {
      const list = grouped.get(leg.matchId) ?? []
      list.push(leg)
      grouped.set(leg.matchId, list)
    })
    const matchById = new Map(matches.map((match) => [match.matchId, match]))
    const detailMatches = Array.from(grouped.entries()).map(([matchId, selections]): DetailMatch => {
      const match = matchById.get(matchId)
      const first = selections[0]
      const poolCodes = Array.from(new Set(selections.map((leg) => leg.poolCode)))
      return {
        matchId,
        number: match?.matchNumStr || first.matchNumStr,
        league: match?.league || first.league,
        home: match?.homeTeam || first.homeTeam,
        away: match?.awayTeam || first.awayTeam,
        kickoff: match ? `${match.matchDate.slice(5)} ${match.matchTime.slice(0, 5)}`.trim() : first.matchDate.slice(5),
        rows: poolCodes.map((poolCode) => {
          const picked = selections.filter((leg) => leg.poolCode === poolCode)
          const source = match?.rows.find((row) => row.poolCode === poolCode)
          const pickedByKey = new Map(picked.map((leg) => [leg.optionKey, leg]))
          const options = source?.options ?? picked.map((leg) => ({
            key: leg.optionKey,
            label: leg.optionLabel,
            odds: leg.odds,
          }))
          // 已选赔率以计算器当前方案为准，避免刷新赛程后与汇总金额不一致。
          const allOptions = [...options]
          picked.forEach((leg) => {
            if (!allOptions.some((option) => option.key === leg.optionKey)) {
              allOptions.push({ key: leg.optionKey, label: leg.optionLabel, odds: leg.odds })
            }
          })
          return {
            poolCode,
            title: source?.title || picked[0].poolName,
            line: picked[0].goalLine,
            options: allOptions.filter((option) => !selectedOnly || pickedByKey.has(option.key)).map((option) => ({
              ...option,
              odds: pickedByKey.get(option.key)?.odds ?? option.odds,
              selected: pickedByKey.has(option.key),
            })),
          }
        }),
      }
    })
    onOpen?.()
    setSnapshot({
      summary: { ...summary },
      passText: passSizes.map(passLabel).join('、'),
      sportText: legs[0].sport === 'football' ? '竞足混合过关' : '竞篮混合过关',
      matches: detailMatches,
    })
  }

  const closeDetails = () => setSnapshot(null)
  const modifyPlan = () => {
    closeDetails()
    onModify?.()
  }

  return (
    <>
      <Button className={classnames(styles.saveButton, className)} disabled={!legs.length || !summary.betCount} onClick={openDetails}>
        保存
      </Button>
      {snapshot ? (
        <View className={styles.mask}>
          <View className={styles.backdrop} onClick={closeDetails} catchMove />
          <View className={styles.panel}>
            <View className={styles.heading}>
              <Text className={styles.title}>方案详情</Text>
              <Button className={styles.closeButton} onClick={closeDetails}>关闭</Button>
            </View>
            <ScrollView scrollY className={styles.scrollBody}>
              <View className={styles.ticket}>
                <View className={styles.summary}>
                  <View className={styles.amounts}>
                    <View className={styles.amountItem}>
                      <Text className={styles.caption}>金额：</Text>
                      <Text className={styles.amount}>{formatAmount(snapshot.summary.amount)}</Text>
                      <Text className={styles.caption}>元 [{snapshot.summary.multiple}倍]</Text>
                    </View>
                    <View className={styles.amountItem}>
                      <Text className={styles.caption}>理论奖金：</Text>
                      <Text className={classnames(styles.amount, styles.bonus)}>
                        {bonusText(snapshot.summary.minBonus, snapshot.summary.maxBonus)}
                      </Text>
                      <Text className={styles.caption}>元</Text>
                    </View>
                  </View>
                  <View className={styles.planInfo}>
                    <View className={styles.planTexts}>
                      <Text className={styles.planText}>
                        {snapshot.sportText} {snapshot.summary.matchCount}场
                      </Text>
                      {snapshot.passText ? <Text className={styles.passText}>{snapshot.passText}</Text> : null}
                    </View>
                    <Button className={styles.modifyButton} onClick={modifyPlan}>修改</Button>
                  </View>
                </View>
                {snapshot.matches.map((match) => (
                  <View className={styles.match} key={match.matchId}>
                    <View className={styles.matchMeta}>
                      <Text className={styles.matchNumber}>{match.number}</Text>
                      <Text className={styles.league}>{match.league}</Text>
                    </View>
                    <View className={styles.matchMain}>
                      <View className={styles.matchHeading}>
                        <Text className={styles.team}>{match.home}</Text>
                        <Text className={styles.kickoff}>{match.kickoff}</Text>
                        <Text className={classnames(styles.team, styles.awayTeam)}>{match.away}</Text>
                      </View>
                      {match.rows.map((row) => (
                        <View className={styles.play} key={row.poolCode}>
                          <View className={classnames(
                            styles.options,
                            styles[`columns${Math.min(POOL_DEFS[row.poolCode].columns, row.options.length)}`],
                          )}>
                            {row.options.map((option) => (
                              <View className={classnames(styles.option, option.selected && styles.selected)} key={option.key}>
                                <Text className={styles.optionLabel}>{option.label}</Text>
                                <Text className={styles.odds}>{formatOdds(option.odds)}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
                <View className={styles.disclaimer}>
                  <Text className={styles.disclaimerTitle}>免责声明</Text>
                  <Text>方案中展示的信息仅供参考，如需购彩请到线下彩票站。</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </>
  )
}
