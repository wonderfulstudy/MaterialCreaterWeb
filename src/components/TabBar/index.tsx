import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import homeIcon from '@/assets/tabbar/home.png'
import materialIcon from '@/assets/tabbar/material.png'
import profileIcon from '@/assets/tabbar/profile.png'
import businessIcon from '@/assets/tabbar/business.png'
import styles from './index.module.scss'

export type TabBarKey = 'home' | 'material' | 'business' | 'profile'

interface TabDefinition {
  key: TabBarKey
  label: string
  icon: string
  url: string
}

const TABS: TabDefinition[] = [
  { key: 'home', label: '开奖', icon: homeIcon, url: '/pages/home/index' },
  { key: 'material', label: '方案', icon: materialIcon, url: '/pages/recommend/index' },
  { key: 'business', label: '经营', icon: businessIcon, url: '/pages/business/index' },
  { key: 'profile', label: '我的', icon: profileIcon, url: '/pages/profile/index' },
]

interface TabBarProps {
  active: TabBarKey
}

/**
 * 页面级自定义底栏。
 * 未使用原生 tabBar：H5 端不会渲染 custom tabBar，页面级组件可在 weapp/H5 保持一致。
 */
export default function TabBar({ active }: TabBarProps) {
  const handleSwitch = (tab: TabDefinition) => {
    if (tab.key === active) {
      return
    }
    void Taro.reLaunch({ url: tab.url })
  }

  return (
    <View className={styles.tabBar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <View
            key={tab.key}
            className={styles.item}
            onClick={() => handleSwitch(tab)}
          >
            <View className={classnames(styles.iconPill, isActive && styles.iconPillActive)}>
              <Image
                className={classnames(styles.icon, !isActive && styles.iconMuted)}
                src={tab.icon}
                mode='aspectFit'
              />
            </View>
            <Text className={classnames(styles.label, isActive && styles.labelActive)}>
              {tab.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
