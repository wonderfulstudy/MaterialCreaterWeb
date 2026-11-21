import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import classnames from 'classnames'
import BallNumber from '@/components/BallNumber'
import ResultPoster, { type ResultPosterInput } from '@/components/ResultPoster'
import {
  DEFAULT_BRAND_NAME,
  DEFAULT_QR_CAPTION,
  DEFAULT_QR_IMAGE,
  DEFAULT_SLOGAN,
} from '@/components/ResultPoster/config'
import TabBar from '@/components/TabBar'
import { loadLatestGame } from '@/api/latest-lottery'
import { LATEST_LOTTERIES } from '@/models/lottery.model'
import {
  IS_DEMO_MODE,
  OPEN_SHARE_ON_LOAD,
  SPORT_REPORTS,
  TRADITIONAL_REPORT,
  createDemoCards,
} from './home-data'
import { createLoadingCards, toCardView, type LotteryCardView } from './lottery-view-model'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** '2026-11-17' → '11-17 周二' */
function formatDrawDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return value
  }
  const weekday = new Date(year, month - 1, day).getDay()
  return `${pad(month)}-${pad(day)} 周${WEEKDAYS[weekday]}`
}

function formatIssue(issue: string): string {
  return issue.endsWith('期') ? issue : `${issue}期`
}

export default function HomePage() {
  const requestId = useRef(0)
  const [cards, setCards] = useState<LotteryCardView[]>(createLoadingCards)
  const [topInset, setTopInset] = useState(IS_H5 ? 20 : 64)
  const [shareOpen, setShareOpen] = useState(OPEN_SHARE_ON_LOAD)

  // 只把已开奖的彩种交给海报组件：加载中与无数据的彩种没有号码可画
  const posterInputs = useMemo<ResultPosterInput[]>(
    () =>
      cards.flatMap((card) =>
        card.status === 'drawn'
          ? [
              {
                gameName: card.name,
                issue: formatIssue(card.issue),
                drawDate: formatDrawDate(card.drawDate),
                redNumbers: card.redNumbers,
                blueNumbers: card.blueNumbers,
                qrImage: DEFAULT_QR_IMAGE,
                qrCaption: DEFAULT_QR_CAPTION,
                brandName: DEFAULT_BRAND_NAME,
                slogan: DEFAULT_SLOGAN,
              },
            ]
          : []
      ),
    [cards]
  )

  const openShare = () => {
    if (!posterInputs.length) {
      void Taro.showToast({ title: '开奖数据还没回来', icon: 'none' })
      return
    }
    setShareOpen(true)
  }

  useEffect(() => {
    if (IS_H5) {
      return
    }
    const { statusBarHeight = 20 } = Taro.getSystemInfoSync()
    // 自定义导航：给状态栏和右上角胶囊留出空间
    setTopInset(statusBarHeight + 44)
  }, [])

  /**
   * 重置为加载态并逐彩种独立请求，谁先回来谁先定格。
   * 返回全部请求落定的 Promise，供下拉刷新收起指示器。
   */
  function loadAllGames(): Promise<void> {
    const currentRequestId = ++requestId.current
    setCards(createLoadingCards())

    if (IS_DEMO_MODE) {
      setCards(createDemoCards())
      return Promise.resolve()
    }

    return Promise.all(
      LATEST_LOTTERIES.map(({ code }) =>
        loadLatestGame(code).then((game) => {
          if (requestId.current !== currentRequestId) {
            return
          }

          const card = toCardView(game)
          setCards((prev) => prev.map((item) => (item.code === code ? card : item)))
        })
      )
    ).then(() => undefined)
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

  const openMaterial = (sport: 'football' | 'basketball') => {
    void Taro.reLaunch({ url: `/pages/recommend/index?sport=${sport}` })
  }

  const openTraditional = () => {
    void Taro.showToast({ title: '传统足彩数据接入中', icon: 'none' })
  }

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

        <View className={styles.summaryCard}>
          {SPORT_REPORTS.map((report, index) => (
            <Fragment key={report.key}>
              {index > 0 && <View className={styles.divider} />}
              <View className={styles.summaryRow} onClick={() => openMaterial(report.key)}>
                <View className={styles.summaryHead}>
                  <Text className={styles.summaryTitle}>{report.title}</Text>
                  <Text className={styles.summaryDate}>{report.date}</Text>
                  <View className={styles.chevron} />
                </View>
                <View className={styles.stats}>
                  {report.stats.map((stat) => (
                    <View className={styles.statCol} key={stat.label}>
                      <Text className={styles.statLabel}>{stat.label}</Text>
                      <View className={styles.statBox}>
                        <Text
                          className={classnames(
                            styles.statValue,
                            stat.tone === 'muted' && styles.statMuted,
                            stat.tone === 'red' && styles.statRed,
                            stat.tone === 'plain' && styles.statPlain,
                            stat.tone === 'green' && styles.statGreen
                          )}
                        >
                          {stat.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Fragment>
          ))}

          <View className={styles.divider} />

          <View className={styles.summaryRow} onClick={openTraditional}>
            <View className={styles.summaryHead}>
              <Text className={styles.summaryTitle}>{TRADITIONAL_REPORT.title}</Text>
              <Text className={styles.summaryDate}>
                {formatIssue(TRADITIONAL_REPORT.issue)}
              </Text>
              <View className={styles.chevron} />
            </View>
            <Text className={styles.traditionalDate}>{TRADITIONAL_REPORT.date}</Text>
            <View className={styles.traditionalBalls}>
              {TRADITIONAL_REPORT.results.map((result, index) => (
                <View className={styles.traditionalBall} key={`traditional-${index}`}>
                  <Text className={styles.traditionalBallText}>{result}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className={styles.lotteryCard}>
          {cards.map((game) => (
            <View className={styles.lotteryRow} key={game.code}>
              <View className={styles.lotteryHead}>
                <Text className={styles.lotteryName}>{game.name}</Text>
                {game.status === 'drawn' && (
                  <>
                    <Text className={styles.lotteryIssue}>{formatIssue(game.issue)}</Text>
                    <Text className={styles.lotteryDate}>{formatDrawDate(game.drawDate)}</Text>
                  </>
                )}
              </View>

              {game.status === 'loading' && (
                <View className={styles.numbers}>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <View className={styles.skeletonBall} key={`${game.code}-skeleton-${index}`} />
                  ))}
                </View>
              )}

              {game.status === 'unavailable' && (
                <Text className={styles.lotteryEmpty}>暂无最新开奖数据</Text>
              )}

              {game.status === 'drawn' && (
                <View className={styles.numbers}>
                  {game.redNumbers.map((number, index) => (
                    <BallNumber
                      key={`${game.code}-red-${index}`}
                      number={number}
                      type='red'
                    />
                  ))}
                  {game.blueNumbers.length > 0 && <View className={styles.blueGap} />}
                  {game.blueNumbers.map((number, index) => (
                    <BallNumber
                      key={`${game.code}-blue-${index}`}
                      number={number}
                      type='blue'
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      <TabBar active='home' />

      <ResultPoster
        visible={shareOpen}
        results={posterInputs}
        onClose={() => setShareOpen(false)}
      />
    </View>
  )
}
