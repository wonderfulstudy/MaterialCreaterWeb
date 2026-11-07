import React from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import AppConfig from '@/config/app'
import styles from './index.module.scss'

export default function HomePage() {
  const handleLotteryPoster = () => {
    Taro.navigateTo({ url: '/pages/poster/index' })
  }

  return (
    <ScrollView className={styles.homePage} scrollY>
      <View className={styles.header}>
        <Text className={styles.headerTitle}>{AppConfig.app.name}</Text>
        <Text className={styles.headerSubtitle}>{AppConfig.app.description}</Text>
      </View>

      <View className={styles.buttonList}>
        <View className={`${styles.buttonCard} ${styles.lotteryCard}`} onClick={handleLotteryPoster}>
          <View className={styles.buttonIcon}>🎱</View>
          <View className={styles.buttonContent}>
            <Text className={styles.buttonTitle}>我目前是足球资讯</Text>
            <Text className={styles.buttonDesc}>大乐透 · 排列三 · 排列五 · 七星彩</Text>
          </View>
          <View className={styles.buttonArrow}>
            <Text className={styles.arrowIcon}>›</Text>
          </View>
        </View>
      </View>

      <View className={styles.tips}>
        <Text className={styles.tipsText}>💡 点击生成精美宣传海报，支持左右滑动选择，一键分享保存</Text>
      </View>
    </ScrollView>
  )
}
