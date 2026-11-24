import { Image, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import placeholderBackground from '@/assets/share/poster-bg-placeholder.png'
import { PosterLead, PosterTop } from './chrome'
import type { DayStats, PosterRecordRow } from './model'
import styles from './index.module.scss'

export interface PlanPosterBProps {
  /** 当前方案名，仅用于占位图上的说明文案 */
  planName: string
  /** 页顶日期：2026-11-24 周一 */
  dateText: string
  /** 战绩表行（旧 → 新，末行是当前方案） */
  rows: PosterRecordRow[]
  /** storage 里配置的背景图，空串回落到静态占位图 */
  coverImage: string
  stats: DayStats
}

/** B 卡：战绩长图 —— 背景图 + 5 列表格（≤50 行）+ 引流区 */
export default function PlanPosterB({ planName, dateText, rows, coverImage, stats }: PlanPosterBProps) {
  const cover = coverImage || placeholderBackground

  return (
    <View className={styles.po}>
      <PosterTop dateText={dateText + ' · 战绩长图'} />

      <View className={styles.cover}>
        <Image className={styles.coverImage} src={cover} mode='aspectFill' />
        {coverImage ? null : (
          <View className={styles.coverBox}>
            <Text className={styles.coverT1}>{planName}</Text>
          </View>
        )}
        <Text className={styles.coverTag}>战绩长图</Text>
      </View>

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

      <View className={styles.bNote}>
        <Text className={styles.bNoteLabel}>说明</Text>
        <Text>
          {stats.total + ' 期中 ' + stats.hit + ' 期 · 连中 ' + stats.streak + '；收获按理论最高奖金计，赛后以实际派奖为准'}
        </Text>
      </View>

      <PosterLead />
    </View>
  )
}
