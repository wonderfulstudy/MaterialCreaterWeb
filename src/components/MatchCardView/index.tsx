import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
// 复用开奖详情页的卡片样式：页面与海报只有这一份卡片 CSS
import styles from '@/pages/draw/draw.module.scss'
import type { SportMatchResult } from '@/api/lottery/results'
import type { MatchCardViewProps } from './types'

/** 单场竞彩赛果卡：足球与篮球同构，页面与海报共用这一份 JSX */
export function SportMatchCard({ match }: { match: SportMatchResult }) {
  return (
    <View className={styles.matchCard}>
      <View className={styles.matchHead}>
        <Text className={styles.matchLeague}>{match.league}</Text>
        <Text className={styles.matchNo}>{match.matchNo}</Text>
        {!match.finished && <Text className={styles.matchLive}>未结束</Text>}
      </View>

      <View className={styles.matchTeams}>
        <Text className={styles.matchTeam}>{match.homeTeam}</Text>
        <Text className={styles.matchScore}>{match.score || '—'}</Text>
        <Text className={styles.matchTeam}>{match.awayTeam}</Text>
      </View>

      {match.halfScore ? <Text className={styles.matchHalf}>半场 {match.halfScore}</Text> : null}

      <View className={styles.plays}>
        {match.plays.map((play) => (
          <View className={styles.play} key={play.label}>
            <Text className={styles.playLabel}>{play.label}</Text>
            <Text
              className={classnames(
                styles.playValue,
                play.tone === 'win' && styles.playWin,
                play.tone === 'lose' && styles.playLose,
                play.tone === 'draw' && styles.playDraw
              )}
            >
              {play.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * 竞彩赛果卡列表的唯一渲染实现：足球/篮球详情页与分享海报预览共用同一份 JSX，
 * 保证「页面看到的卡片」与「海报保存出去的图」一致。
 */
export default function MatchCardView({ matches, className }: MatchCardViewProps) {
  return (
    <View className={className}>
      {matches.map((match) => (
        <SportMatchCard match={match} key={match.id} />
      ))}
    </View>
  )
}
