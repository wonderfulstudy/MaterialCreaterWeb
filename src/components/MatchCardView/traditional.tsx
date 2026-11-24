import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
// 复用开奖详情页的样式：页面与海报只有这一份卡片 CSS
import styles from '@/pages/draw/draw.module.scss'
import type { TraditionalCardViewProps } from './types'

/**
 * 传统足彩 14 场期次卡：数据源只给 3/1/0，这里也只渲染主胜/平/客胜，
 * 不补对阵名单。页面与分享海报共用这一份 JSX。
 */
export default function TraditionalCardView({ draw, className }: TraditionalCardViewProps) {
  return (
    <View className={className}>
      <View className={styles.tinfo}>
        <Text className={styles.tinfoTitle}>胜负彩 {formatIssue(draw.issue)}</Text>
        <Text className={classnames(styles.pill, styles.pillWin)}>已开奖</Text>
        <Text className={styles.tinfoDate}>{formatDrawDate(draw.drawDate)}</Text>
      </View>

      <View className={styles.listCard}>
        {draw.results.map((result, index) => (
          <View className={styles.trow} key={`${draw.issue}-${index}`}>
            <Text className={styles.tNo}>{index + 1}</Text>
            <Text className={styles.tTeam}>第 {index + 1} 场</Text>
            <Text
              className={classnames(
                styles.tResult,
                result === '3' && styles.r3,
                result === '1' && styles.r1,
                result === '0' && styles.r0
              )}
            >
              {result}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
