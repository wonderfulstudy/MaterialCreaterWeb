import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import LotteryCardView from '@/components/LotteryCardView'
import type { LotteryCardItem } from '@/components/LotteryCardView/types'
import ResultPoster from '@/components/ResultPoster'
import TabBar from '@/components/TabBar'
import { loadLatestGame } from '@/api/latest-lottery'
import { loadTraditionalDraws, type TraditionalDraw } from '@/api/lottery/results'
import { formatUpdatedAt } from '@/services/cache/remote-cache'
import { IS_DEMO_MODE, OPEN_SHARE_ON_LOAD } from '@/config/demo'
import { LATEST_LOTTERIES } from '@/models/lottery.model'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import { SPORT_ENTRIES, createDemoCards, type SportEntry } from './home-data'
import { createCachedCards, createLoadingCards, toCardView } from './lottery-view-model'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'

interface LoadMeta {
  /** 本次汇总数据的落库时间，缓存回退时为上次成功时间 */
  updatedAt: number
  /** 有任一数据来自本地缓存，说明当前网络不可用 */
  fromCache: boolean
}

/**
 * 首页开奖页：只保留两组入口。
 * 1) 竞彩开奖结果：足球 / 篮球 / 传统足彩三条入口行，点进各自的详情页；
 * 2) 数字彩开奖结果：7 个彩种纵向平铺，点不进详情，也没有彩种切换控件。
 */
export default function HomePage() {
  const requestId = useRef(0)
  const [cards, setCards] = useState<LotteryCardItem[]>(
    () => createCachedCards() ?? createLoadingCards()
  )
  const [traditional, setTraditional] = useState<TraditionalDraw | null>(null)
  const [meta, setMeta] = useState<LoadMeta | null>(null)
  const [topInset, setTopInset] = useState(IS_H5 ? 20 : 64)
  const [shareOpen, setShareOpen] = useState(OPEN_SHARE_ON_LOAD)

  /** 海报组件自己取当期开奖数据，这里只负责打开弹层 */
  const openShare = () => setShareOpen(true)

  useEffect(() => {
    if (IS_H5) {
      return
    }
    const { statusBarHeight = 20 } = Taro.getSystemInfoSync()
    // 自定义导航：给状态栏和右上角胶囊留出空间
    setTopInset(statusBarHeight + 44)
  }, [])

  /**
   * 逐彩种独立请求，谁先回来谁先定格；已有内容时不退回加载态。
   * 返回全部请求落定的 Promise，供下拉刷新收起指示器。
   */
  function loadAllGames(): Promise<void> {
    const currentRequestId = ++requestId.current

    if (IS_DEMO_MODE) {
      setCards(createDemoCards())
      return Promise.resolve()
    }

    setCards((prev) =>
      prev.every((card) => card.status === 'loading') ? createLoadingCards() : prev
    )

    let updatedAt = 0
    let fromCache = false

    const collect = (nextUpdatedAt: number, nextFromCache: boolean) => {
      updatedAt = Math.max(updatedAt, nextUpdatedAt)
      fromCache = fromCache || nextFromCache
    }

    const gameTasks = LATEST_LOTTERIES.map(({ code }) =>
      loadLatestGame(code).then((game) => {
        if (requestId.current !== currentRequestId) {
          return
        }
        collect(game.updatedAt, game.fromCache)
        const card = toCardView(game)
        setCards((prev) => prev.map((item) => (item.id === code ? card : item)))
      })
    )

    const traditionalTask = loadTraditionalDraws().then((loaded) => {
      if (!loaded || requestId.current !== currentRequestId) {
        return
      }
      collect(loaded.updatedAt, loaded.fromCache)
      setTraditional(loaded.data[0] ?? null)
    })

    return Promise.all([...gameTasks, traditionalTask]).then(() => {
      if (requestId.current !== currentRequestId || updatedAt === 0) {
        return
      }
      setMeta({ updatedAt, fromCache })
    })
  }

  useDidShow(() => {
    void loadAllGames()
  })

  usePullDownRefresh(() => {
    void loadAllGames().then(
      () => {
        Taro.stopPullDownRefresh()
      },
      () => {
        Taro.stopPullDownRefresh()
      }
    )
  })

  const openEntry = (entry: SportEntry) => {
    void Taro.navigateTo({ url: entry.url })
  }

  /** 传足入口的副文案带上真实期号与开奖日期 */
  const traditionalHint = traditional
    ? `${formatIssue(traditional.issue)} · ${formatDrawDate(traditional.drawDate)}`
    : ''

  return (
    <View className={styles.page}>
      <View className={styles.content} style={{ paddingTop: `${topInset}px` }}>
        <View className={styles.pageHead}>
          <Text className={styles.pageTitle}>开奖速览</Text>
          <View className={styles.shareEntry} onClick={openShare}>
            <Text className={styles.shareIcon}>↗</Text>
            <Text className={styles.shareText}>分享开奖</Text>
          </View>
        </View>

        {meta && meta.fromCache && (
          <View className={styles.metaBar}>
            <Text className={styles.metaText}>
              网络不可用，展示更新于 {formatUpdatedAt(meta.updatedAt)} 的数据
            </Text>
            <Text className={styles.metaRetry} onClick={() => void loadAllGames()}>
              重试
            </Text>
          </View>
        )}

        <View className={styles.secHead}>
          <Text className={styles.secTitle}>竞彩开奖结果</Text>
          <Text className={styles.secHint}>按日期查看</Text>
        </View>

        <View className={styles.entryCard}>
          {SPORT_ENTRIES.map((entry) => (
            <View className={styles.entryRow} key={entry.key} onClick={() => openEntry(entry)}>
              <View className={styles.entryIcon}>
                <Text className={styles.entryIconText}>{entry.glyph}</Text>
              </View>
              <View className={styles.entryBody}>
                <Text className={styles.entryTitle}>{entry.title}</Text>
                <Text className={styles.entrySub}>
                  {entry.key === 'traditional' && traditionalHint ? traditionalHint : entry.hint}
                </Text>
              </View>
              <Text className={styles.entryChevron}>›</Text>
            </View>
          ))}
          <Text className={styles.entryNote}>
            任九：从 14 场中任选 9 场，猜中 9 场即中奖
          </Text>
        </View>

        <View className={styles.secHead}>
          <Text className={styles.secTitle}>数字彩开奖结果</Text>
          <Text className={styles.secHint}>{LATEST_LOTTERIES.length} 个彩种</Text>
        </View>

        <LotteryCardView cards={cards} className={styles.lotteryCardSection} />

        <Text className={styles.sourceNote}>数据来源：中国体彩官网 · 中国福彩官网</Text>
      </View>

      <TabBar active='home' />

      <ResultPoster visible={shareOpen} onClose={() => setShareOpen(false)} />
    </View>
  )
}
