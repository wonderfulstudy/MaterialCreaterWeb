import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import TabBar from '@/components/TabBar'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'

export default function ProfilePage() {
  const topInset = IS_H5 ? 20 : (Taro.getSystemInfoSync().statusBarHeight || 20) + 44

  const openMaterial = () => {
    void Taro.reLaunch({ url: '/pages/recommend/index' })
  }

  const openSelector = () => {
    void Taro.navigateTo({ url: '/pages/selector/index' })
  }

  const openAbout = () => {
    void Taro.showModal({
      title: '彩店管理助手',
      content: '素材与推荐单管理工具。当前为界面改版预览版本。',
      showCancel: false,
      confirmText: '知道了',
    })
  }

  return (
    <View className={styles.page}>
      <View className={styles.content} style={{ paddingTop: `${topInset}px` }}>
        <Text className={styles.title}>我的</Text>

        <View className={styles.profileCard}>
          <View className={styles.avatar}>
            <Text className={styles.avatarText}>彩</Text>
          </View>
          <View className={styles.identity}>
            <Text className={styles.name}>彩店管理助手</Text>
            <Text className={styles.subtitle}>素材 · 方案 · 计算器</Text>
          </View>
        </View>

        <View className={styles.menu}>
          <View className={styles.menuItem} onClick={openMaterial}>
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>素</Text>
            </View>
            <Text className={styles.menuLabel}>推荐单素材</Text>
            <Text className={styles.menuArrow}>›</Text>
          </View>
          <View className={styles.menuDivider} />
          <View className={styles.menuItem} onClick={openSelector}>
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>算</Text>
            </View>
            <Text className={styles.menuLabel}>场次计算器</Text>
            <Text className={styles.menuArrow}>›</Text>
          </View>
          <View className={styles.menuDivider} />
          <View className={styles.menuItem} onClick={openAbout}>
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>i</Text>
            </View>
            <Text className={styles.menuLabel}>关于小程序</Text>
            <Text className={styles.menuArrow}>›</Text>
          </View>
        </View>

        <Text className={styles.footer}>彩店管理助手 · v1.0.0</Text>
      </View>

      <TabBar active='profile' />
    </View>
  )
}
