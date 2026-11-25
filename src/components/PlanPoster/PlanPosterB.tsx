import { Image, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import placeholderBackground from '@/assets/share/poster-bg-placeholder.png'
import { PosterLead, PosterTop } from './chrome'
import type { DayStats, PosterRecordRow } from './model'
import styles from './index.module.scss'

/** 分张切片：只有超长长图被切成多张时才传，单张不传，DOM 结构与分张上线前完全一致 */
export interface PlanPosterBSlice {
  /** 第几张，0 起 */
  index: number
  /** 共几张 */
  total: number
  /** 封面图只放第 1 张 */
  showCover: boolean
  /** 说明 + 引流区只放最后一张（表头每张都放，第 2 张起就是重复表头） */
  showTail: boolean
}

export interface PlanPosterBProps {
  /** 当前方案名，仅用于占位图上的说明文案 */
  planName: string
  /** 页顶日期：2026-11-24 周一 */
  dateText: string
  /** 本张要画的战绩行（旧 → 新，末行是当前方案） */
  rows: PosterRecordRow[]
  /** storage 里配置的背景图，空串回落到静态占位图 */
  coverImage: string
  stats: DayStats
  /** 分张信息；省略即整张一次导出 */
  slice?: PlanPosterBSlice
}

/**
 * B 卡：战绩长图 —— 背景图 + 5 列表格（≤50 行）+ 引流区。
 * 超长分张时每张都保留页顶与表头，封面只第 1 张、说明与引流只最后一张。
 *
 * 注意：单张渲染时 .po 的直接子节点顺序固定为「页顶 / 封面 / 表头 / 表格 / 说明 / 引流」，
 * index.tsx 的 measureRecordPaging 依赖这个顺序量高度，两边要同时改。
 */
export default function PlanPosterB({ planName, dateText, rows, coverImage, stats, slice }: PlanPosterBProps) {
  const cover = coverImage || placeholderBackground
  const total = slice?.total ?? 1
  const pageIndex = slice?.index ?? 0
  const showCover = slice?.showCover ?? true
  const showTail = slice?.showTail ?? true
  const title =
    total > 1 ? dateText + ' · 战绩长图 ' + (pageIndex + 1) + '/' + total : dateText + ' · 战绩长图'

  return (
    <View className={styles.po}>
      <PosterTop dateText={title} />

      {showCover ? (
        <View className={styles.cover}>
          <Image className={styles.coverImage} src={cover} mode='aspectFill' />
          {coverImage ? null : (
            <View className={styles.coverBox}>
              <Text className={styles.coverT1}>{planName}</Text>
            </View>
          )}
          <Text className={styles.coverTag}>战绩长图</Text>
        </View>
      ) : null}

      <View className={styles.bHead}>
        <Text>日期</Text>
        <Text>方案内容</Text>
        <Text className={styles.cRight}>投入</Text>
        <Text className={styles.cRight}>收获</Text>
        <Text className={styles.cRight}>连中</Text>
      </View>

      <View className={styles.bTab}>
        {rows.map((row) =>
          row.rest ? (
            <View className={classnames(styles.bRow, styles.bRest)} key={row.key}>
              <Text className={classnames(styles.hd, styles.num)}>{row.date}</Text>
              <Text className={styles.bRestText}>{row.content}</Text>
              <Text className={classnames(styles.cRight, styles.bCnt)}>—</Text>
            </View>
          ) : (
            <View className={classnames(styles.bRow, row.current ? styles.bCur : null)} key={row.key}>
              <Text className={classnames(styles.hd, styles.num)}>{row.date}</Text>
              <Text className={styles.bContent}>{row.content}</Text>
              <Text className={classnames(styles.cRight, styles.num)}>{row.stake}</Text>
              <Text className={classnames(styles.cRight, styles.bPay, styles.num)}>{row.payout}</Text>
              <Text className={classnames(styles.cRight, styles.bCnt, row.streak === '0' ? styles.bCntZero : null)}>
                {row.streak}
              </Text>
            </View>
          )
        )}
        {rows.length === 0 ? <Text className={styles.emptyRow}>还没有战绩记录</Text> : null}
      </View>

      {showTail ? (
        <View className={styles.bNote}>
          <Text className={styles.bNoteLabel}>说明</Text>
          <Text>
            {stats.total + ' 期中 ' + stats.hit + ' 期 · 连中 ' + stats.streak + '；收获按理论最高奖金计，赛后以实际派奖为准'}
          </Text>
        </View>
      ) : null}

      {showTail ? <PosterLead /> : null}
    </View>
  )
}
