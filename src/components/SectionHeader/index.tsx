import React from 'react'
import { View, Text } from '@tarojs/components'
import styles from './index.module.scss'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  actionText?: string
  onAction?: () => void
}

export default function SectionHeader({ title, subtitle, actionText, onAction }: SectionHeaderProps) {
  return (
    <View className={styles.header}>
      <View className={styles.left}>
        <Text className={styles.title}>{title}</Text>
        {subtitle && <Text className={styles.subtitle}>{subtitle}</Text>}
      </View>
      {actionText && (
        <View className={styles.action} onClick={onAction}>
          <Text className={styles.actionText}>{actionText}</Text>
        </View>
      )}
    </View>
  )
}
