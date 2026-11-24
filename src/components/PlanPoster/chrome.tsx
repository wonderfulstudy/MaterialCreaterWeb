import { Image, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import { DEFAULT_BRAND_NAME, DEFAULT_QR_CAPTION, DEFAULT_QR_IMAGE } from '@/components/ResultPoster/config'
import styles from './index.module.scss'

/** 合规声明：文案照 design/ui-drafts/40-poster-plan-ab.html:166 两行定稿 */
const COMPLIANCE_LINES = ['理性购彩 · 量力而行', '方案仅供参考，请到线下体彩门店购买'] as const

export interface PosterTopProps {
  /** 右侧日期文案 */
  dateText: string
}

/** 两卡共用页顶：左侧署名，右侧日期 */
export function PosterTop({ dateText }: PosterTopProps) {
  return (
    <View className={styles.top}>
      <Text>{DEFAULT_BRAND_NAME}</Text>
      <Text className={classnames(styles.topDate, styles.num)}>{dateText}</Text>
    </View>
  )
}

/** 票根虚线撕票口：用真实节点画两侧缺口，html2canvas 不支持伪元素 */
export function TicketPerf() {
  return (
    <View className={styles.perf}>
      <View className={classnames(styles.notch, styles.notchLeft)} />
      <View className={classnames(styles.notch, styles.notchRight)} />
    </View>
  )
}

/** 两卡共用底部引流区：二维码在左，合规声明在右 */
export function PosterLead() {
  return (
    <View className={styles.lead}>
      <View className={styles.qrCol}>
        <View className={styles.qrBox}>
          <Image className={styles.qrImage} src={DEFAULT_QR_IMAGE} mode='aspectFit' />
        </View>
        <Text className={styles.qrCap}>{DEFAULT_QR_CAPTION}</Text>
      </View>
      <Text className={styles.leadMid}>加我微信</Text>
      <View className={styles.leadLaw}>
        {COMPLIANCE_LINES.map((line) => (
          <Text className={styles.leadLawLine} key={line}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}
