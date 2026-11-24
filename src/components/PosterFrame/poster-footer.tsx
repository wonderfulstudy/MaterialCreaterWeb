/**
 * 海报页脚：店名 + 二维码 + 两行合规声明。
 * 落款与二维码图片沿用海报默认值（../ResultPoster/config），
 * 合规声明与「扫码加我」取自设计稿 42-poster-draw.html，不得改写；
 * 声明文案与小程序画布分支共用 red-ticket 里的 COMPLIANCE_LINES。
 */
import { Image, Text, View } from '@tarojs/components'
import { DEFAULT_BRAND_NAME, DEFAULT_QR_CAPTION, DEFAULT_QR_IMAGE } from '@/components/ResultPoster/config'
import { COMPLIANCE_LINES } from '@/components/ResultPoster/schemes/red-ticket'
import styles from './index.module.scss'

export interface PosterFooterProps {
  /** 店名落款 */
  brandName?: string
  /** 二维码图片，缺省为占位图 */
  qrImage?: string
  /** 二维码旁说明文案 */
  qrCaption?: string
}

export default function PosterFooter({
  brandName = DEFAULT_BRAND_NAME,
  qrImage = DEFAULT_QR_IMAGE,
  qrCaption = DEFAULT_QR_CAPTION,
}: PosterFooterProps) {
  return (
    <>
      <View className={styles.footer}>
        <View className={styles.footerBrand}>
          <Text className={styles.footerName}>{brandName}</Text>
          <Text className={styles.footerCaption}>{qrCaption}</Text>
        </View>
        <Text className={styles.footerScan}>扫码加我</Text>
        <View className={styles.footerQrBox}>
          <Image className={styles.footerQr} src={qrImage} mode='aspectFit' />
        </View>
      </View>
      <View className={styles.laws}>
        {COMPLIANCE_LINES.map((line) => (
          <Text className={styles.lawLine} key={line}>
            {line}
          </Text>
        ))}
      </View>
    </>
  )
}
