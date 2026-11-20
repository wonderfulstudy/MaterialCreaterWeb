import { View, Text } from '@tarojs/components'
import classnames from 'classnames'
import styles from './index.module.scss'

interface BallNumberProps {
  number: string
  type: 'red' | 'blue' | 'gold'
  size?: 'small' | 'normal'
}

export default function BallNumber({ number, type, size = 'normal' }: BallNumberProps) {
  return (
    <View
      className={classnames(
        styles.ball,
        type === 'red' && styles.red,
        type === 'blue' && styles.blue,
        type === 'gold' && styles.gold,
        size === 'small' && styles.small
      )}
    >
      <Text className={classnames(styles.ballText, size === 'small' && styles.smallText)}>
        {number}
      </Text>
    </View>
  )
}
