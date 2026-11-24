import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import type { ReactNode } from 'react'
import {
  MAX_MATCH,
  formatAmount,
  formatGoalLine,
  formatOdds,
  passLabel,
  summarizeLegs,
  type PlanLeg,
  type SelectionSummary,
} from '@/components/PlanCalculator'
import styles from '@/pages/recommend/index.module.scss'

/**
 * 方案卡片的默认试算口径：全部场次串关 × 1 倍。
 * 页面与海报都通过这里取摘要，避免两处各算一次。
 */
export function summarizeCardLegs(legs: PlanLeg[], multiple = 1): SelectionSummary {
  const matchCount = new Set(legs.map((leg) => leg.matchId)).size
  return summarizeLegs(legs, [Math.min(MAX_MATCH, Math.max(1, matchCount))], multiple)
}

/** 奖金口径：最低与最高一致（单选必然全中）时只给一个数，否则给区间 */
function bonusText(minBonus: number, maxBonus: number): string {
  const min = formatAmount(minBonus)
  const max = formatAmount(maxBonus)
  return min === max ? max : `${min}–${max}`
}

/** 场次副标题：联赛 · 场次号 · 玩法(+盘口) */
function legMetaText(leg: PlanLeg): string {
  const line = formatGoalLine(leg.goalLine)
  const pool = line ? `${leg.poolName} ${line}` : leg.poolName
  return [leg.league, leg.matchNumStr, pool].filter(Boolean).join(' · ')
}

export interface PlanCardViewProps {
  /** 方案名 */
  name: string
  /** 方案内的比赛选择 */
  legs: PlanLeg[]
  /** 注数 / 金额 / 奖金试算结果，缺省时按全部场次串关试算 */
  summary?: SelectionSummary
  /** 是否展开全部场次；海报强制展开 */
  expanded?: boolean
  /** 识别失败等提示文案 */
  error?: string
  /** 附加到卡片根节点的类名（页面用选中态） */
  className?: string
  /** 传入后卡头显示展开/收起箭头（页面交互态，海报不传） */
  onToggleExpand?: () => void
  /** 卡头右侧附加内容（页面删除模式的勾选框，海报不传） */
  headExtra?: ReactNode
  /** 卡片内部底部附加内容（页面操作行，海报不传） */
  children?: ReactNode
}

/**
 * 方案卡片纯展示部分：卡头 + 场次明细 + 金额栏。
 * 推荐页与分享海报共用这一个组件，保证「页面看到的卡片」＝「海报里的卡片」。
 * 动作按钮、删除勾选、长按等交互由调用方通过 headExtra / children / onToggleExpand 注入。
 */
export default function PlanCardView({
  name,
  legs,
  summary,
  expanded = false,
  error,
  className,
  onToggleExpand,
  headExtra,
  children,
}: PlanCardViewProps) {
  const hasLegs = legs.length > 0
  const resolved = summary ?? summarizeCardLegs(legs)
  const passSize = Math.min(MAX_MATCH, Math.max(1, resolved.matchCount))

  return (
    <View className={classnames(styles.card, className)}>
      <View className={styles.cardHead}>
        <View className={styles.nameRow}>
          <Text className={styles.cardName}>{name}</Text>
          {hasLegs && onToggleExpand ? (
            <View
              className={styles.toggle}
              onTouchStart={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onToggleExpand()
              }}
            >
              <Text className={classnames(styles.toggleIcon, expanded && styles.toggleIconOpen)}>
                {'▾'}
              </Text>
            </View>
          ) : null}
        </View>
        <View className={styles.headMeta}>
          <Text className={classnames(styles.passPill, !hasLegs && styles.passPillEmpty)}>
            {hasLegs ? passLabel(passSize) : '未选比赛'}
          </Text>
          {hasLegs ? (
            <Text className={styles.headCount}>{`${resolved.matchCount} 场 · ${resolved.multiple} 倍`}</Text>
          ) : null}
        </View>
        {headExtra}
      </View>

      {hasLegs ? (
        expanded ? (
          <View className={styles.legs}>
            {legs.map((leg) => (
              <View
                key={`${leg.matchId}-${leg.poolCode}-${leg.optionKey}`}
                className={styles.leg}
              >
                <View className={styles.legLeft}>
                  <Text className={styles.legTeams}>
                    {leg.homeTeam}
                    <Text className={styles.legVs}> vs </Text>
                    {leg.awayTeam}
                  </Text>
                  <Text className={styles.legSub}>{legMetaText(leg)}</Text>
                </View>
                <View className={styles.legRight}>
                  <Text className={styles.legOption}>{leg.optionLabel}</Text>
                  <Text className={styles.legOdds}>{formatOdds(leg.odds)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null
      ) : (
        <View className={styles.emptyLegs}>
          <Text className={styles.emptyLegsTitle}>还没有选择比赛</Text>
          <Text className={styles.emptyLegsHint}>点击卡片去挑选赛程</Text>
        </View>
      )}

      {hasLegs ? (
        <View className={styles.moneyBar}>
          <View className={styles.moneyCell}>
            <Text className={styles.moneyLabel}>投注金额</Text>
            <Text className={styles.moneyValue}>{`¥${formatAmount(resolved.amount)}`}</Text>
          </View>
          <View className={styles.moneySep} />
          <View className={classnames(styles.moneyCell, styles.moneyCellRight)}>
            <Text className={styles.moneyLabel}>理论奖金</Text>
            <Text className={classnames(styles.moneyValue, styles.bonusValue)}>
              {`¥${bonusText(resolved.minBonus, resolved.maxBonus)}`}
            </Text>
          </View>
        </View>
      ) : null}

      {error ? <Text className={styles.cardError}>{error}</Text> : null}

      {children}
    </View>
  )
}
