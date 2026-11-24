import { ScrollView, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import { useState } from 'react'
// 样式与三个开奖详情页共用同一份，避免各页重复定义悬浮条
import styles from '@/pages/draw/draw.module.scss'

/** 一个可选期次：按天翻页时 key 是日期，传足按「期」翻页时 key 是期号 */
export interface PeriodOption {
  key: string
  label: string
  hint?: string
}

export interface DateBarProps {
  /** 左侧标题，如「足球开奖」 */
  title: string
  /** 悬浮条上显示的当前日期/期次文案 */
  currentLabel: string
  options: readonly PeriodOption[]
  activeKey: string
  /** 弹层里两个翻页按钮的文案，默认按天 */
  stepLabels?: readonly [string, string]
  onSelect: (key: string) => void
  onStep: (delta: -1 | 1) => void
  onBack: () => void
}

/**
 * 竞彩详情页顶部悬浮条：显示当前查看的日期，点「更多期次」展开期次弹层。
 * 弹层里既能直接选某一期，也能按天/按期前后翻，纯展示，切换逻辑交给页面。
 */
export default function DateBar({
  title,
  currentLabel,
  options,
  activeKey,
  stepLabels = ['前一天', '后一天'],
  onSelect,
  onStep,
  onBack,
}: DateBarProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (key: string) => {
    setOpen(false)
    onSelect(key)
  }

  return (
    <View className={styles.topbarWrap}>
      <View className={styles.topbar}>
        <View className={styles.topbarBack} onClick={onBack}>
          <Text className={styles.topbarBackIcon}>‹</Text>
        </View>
        <Text className={styles.topbarTitle}>{title}</Text>
        <Text className={styles.topbarDate}>{currentLabel}</Text>
        <View className={styles.topbarMore} onClick={() => setOpen((value) => !value)}>
          <Text className={styles.topbarMoreText}>更多期次</Text>
          <Text className={styles.topbarMoreIcon}>›</Text>
        </View>
      </View>

      {open && (
        <View className={styles.sheet}>
          <View className={styles.sheetHead}>
            <Text className={styles.sheetTitle}>更多期次</Text>
            <Text className={styles.sheetClose} onClick={() => setOpen(false)}>
              关闭
            </Text>
          </View>

          <View className={styles.sheetSteps}>
            <View className={styles.sheetStep} onClick={() => onStep(-1)}>
              <Text className={styles.sheetStepText}>{stepLabels[0]}</Text>
            </View>
            <View className={styles.sheetStep} onClick={() => onStep(1)}>
              <Text className={styles.sheetStepText}>{stepLabels[1]}</Text>
            </View>
          </View>

          <ScrollView scrollY className={styles.sheetList}>
            {options.map((option) => (
              <View
                key={option.key}
                className={classnames(
                  styles.sheetItem,
                  option.key === activeKey && styles.sheetItemActive
                )}
                onClick={() => handleSelect(option.key)}
              >
                <Text className={styles.sheetItemLabel}>{option.label}</Text>
                {option.hint ? <Text className={styles.sheetItemHint}>{option.hint}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}
