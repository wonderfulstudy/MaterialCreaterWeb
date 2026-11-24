import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import BallNumber from '@/components/BallNumber'
// 复用首页卡片的样式：页面与海报预览只有这一份卡片 CSS
import styles from '@/pages/home/index.module.scss'
import type { LotteryCardItem } from './types'

/** 加载态占位球数量：与数字彩彩种数一致，保证行高不跳动 */
const SKELETON_COUNT = 7

export interface LotteryCardViewProps {
  /** 要渲染的卡片，顺序即展示顺序 */
  cards: readonly LotteryCardItem[]
  /** 附带在卡片根节点上的类，首页用它补上卡片间距 */
  className?: string
}

/**
 * 开奖号码卡片的唯一渲染实现：首页列表与分享海报预览共用同一份 JSX，
 * 保证「页面看到的卡片」与「海报保存出去的图」内容一致。
 *
 * 纯展示，不取数、不处理点击，数据由调用方映射成 {@link LotteryCardItem}。
 */
export default function LotteryCardView({ cards, className }: LotteryCardViewProps) {
  return (
    <View className={classnames(styles.lotteryCard, className)}>
      {cards.map((card) => (
        <View className={styles.lotteryRow} key={card.id}>
          <View className={styles.lotteryHead}>
            <Text className={styles.lotteryName}>{card.name}</Text>
            {card.status === 'drawn' && (
              <>
                <Text className={styles.lotteryIssue}>{card.issue}</Text>
                <Text className={styles.lotteryDate}>{card.drawDate}</Text>
              </>
            )}
          </View>

          {card.status === 'loading' && (
            <View className={styles.numbers}>
              {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
                <View className={styles.skeletonBall} key={`${card.id}-skeleton-${index}`} />
              ))}
            </View>
          )}

          {card.status === 'unavailable' && (
            <Text className={styles.lotteryEmpty}>暂无最新开奖数据</Text>
          )}

          {card.status === 'drawn' && (
            <View className={styles.numbers}>
              {card.redNumbers.map((number, index) => (
                <BallNumber key={`${card.id}-red-${index}`} number={number} type='red' />
              ))}
              {card.blueNumbers.length > 0 && <View className={styles.blueGap} />}
              {card.blueNumbers.map((number, index) => (
                <BallNumber key={`${card.id}-blue-${index}`} number={number} type='blue' />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  )
}
