import { Image, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import type { ReactNode } from 'react'
import type { PlanSeriesChip, PlanSeriesStatus } from '@mc/core/services/plan/plan-series'
import styles from './index.module.scss'

/** 徽标与 chip 的数据形态归 @mc/core（与卡面文案计算同源），这里只再导出 */
export type { PlanSeriesChip, PlanSeriesStatus, PlanSeriesTone } from '@mc/core/services/plan/plan-series'

export interface PlanSeriesCardProps {
  /** 方案名 */
  name: string
  /** 缩略图地址；缺省时用品牌渐变占位 */
  thumb?: string
  /** 状态徽标 */
  status: PlanSeriesStatus
  /** 第二行元信息，由调用方按「日期 · 注数 · 倍数 · 投入」拼好 */
  meta: string
  /** 第三行 chips */
  chips: PlanSeriesChip[]
  /** 删除模式的勾选态（与 onSelect 一起传才显示勾选框） */
  selected?: boolean
  /** 勾选回调；传入后卡头左侧出现勾选框，预设卡不传 */
  onSelect?: () => void
  /** 整卡点击 */
  onClick?: () => void
  /** 卡片主区附加内容 */
  headExtra?: ReactNode
}

/**
 * 方案「系列卡」：左侧缩略图 + 方案名/状态徽标 + 元信息 + chips。
 * 手动方案与预设方案共用这一个组件（D60），卡面内容全部由调用方算好传入。
 */
export default function PlanSeriesCard({
  name,
  thumb,
  status,
  meta,
  chips,
  selected = false,
  onSelect,
  onClick,
  headExtra,
}: PlanSeriesCardProps) {
  return (
    <View className={classnames(styles.seriesCard, selected && styles.seriesCardPicked)} onClick={onClick}>
      {onSelect ? (
        <View
          className={styles.seriesHit}
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
          }}
        >
          <View className={classnames(styles.seriesCheckbox, selected && styles.seriesCheckboxOn)}>
            <Text className={styles.seriesCheckboxMark}>{selected ? '✓' : ''}</Text>
          </View>
        </View>
      ) : null}

      <View className={styles.seriesThumb}>
        {thumb ? (
          <Image className={styles.seriesThumbImage} src={thumb} mode='aspectFill' />
        ) : (
          <Text className={styles.seriesThumbGlyph}>单</Text>
        )}
      </View>

      <View className={styles.seriesMain}>
        <View className={styles.seriesTop}>
          <Text className={styles.seriesName}>{name}</Text>
          <Text
            className={classnames(
              styles.seriesPill,
              status.tone === 'win' && styles.seriesPillWin,
              status.tone === 'lose' && styles.seriesPillLose,
              status.tone === 'pend' && styles.seriesPillPend
            )}
          >
            {status.text}
          </Text>
        </View>
        <Text className={styles.seriesMeta}>{meta}</Text>
        <View className={styles.seriesBot}>
          {chips.map((chip, index) => (
            <Text
              key={`${chip.text}-${index}`}
              className={classnames(styles.seriesChip, chip.on && styles.seriesChipOn)}
            >
              {chip.text}
            </Text>
          ))}
          {headExtra}
        </View>
      </View>
    </View>
  )
}
