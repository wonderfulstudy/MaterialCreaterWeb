import { useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import classnames from 'classnames'
import BallNumber from '@/components/BallNumber'
import { loadLatestGame } from '@/api/latest-lottery'
import { LATEST_LOTTERIES } from '@/models/lottery.model'
import { createLoadingCards, toCardView, type LotteryCardView } from './lottery-view-model'
import styles from './index.module.scss'

export default function HomePage() {
  const requestId = useRef(0)
  const [cards, setCards] = useState<LotteryCardView[]>(createLoadingCards)

  /**
   * 重置为流光加载态并逐彩种独立请求，谁先回来谁先定格。
   * 返回全部请求落定的 Promise，供下拉刷新收起指示器。
   */
  function loadAllGames(): Promise<void> {
    const currentRequestId = ++requestId.current
    setCards(createLoadingCards())

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

  return (
    <View className={styles.page}>
      <View className={styles.content}>
        <View className={styles.resultsSection}>
          <View className={styles.sectionHeader}>
            <Text className={styles.sectionTitle}>最新开奖结果</Text>
          </View>

          {cards.map((game) => (
            <View
              className={classnames(styles.card, game.status === 'loading' && styles.cardLoading)}
              key={game.code}
            >
              <View className={styles.cardBody}>
                <View className={styles.resultHeader}>
                  <Text className={styles.gameName}>{game.name}</Text>
                  {game.status === 'drawn' && (
                    <View className={styles.resultMeta}>
                      <Text className={styles.issue}>第{game.issue}期</Text>
                    </View>
                  )}
                </View>

                {game.status === 'loading' && (
                  <Text className={styles.gameStatus}>正在加载开奖号码...</Text>
                )}
                {game.status === 'unavailable' && (
                  <Text className={styles.gameStatus}>暂无最新开奖数据</Text>
                )}
                {game.status === 'drawn' && game.numberType === 'red-blue' && (
                  <View className={styles.numbers}>
                    {game.redNumbers.map((number, index) => (
                      <BallNumber
                        key={`${game.code}-red-${index}`}
                        number={number}
                        type='red'
                        size='small'
                      />
                    ))}
                    {game.blueNumbers.map((number, index) => (
                      <BallNumber
                        key={`${game.code}-blue-${index}`}
                        number={number}
                        type='blue'
                        size='small'
                      />
                    ))}
                  </View>
                )}
                {game.status === 'drawn' && game.numberType === 'single' && (
                  <View className={styles.numbers}>
                    {game.redNumbers.map((number, index) => (
                      <View className={styles.singleNumber} key={`${game.code}-${index}`}>
                        <Text className={styles.singleNumberText}>{number}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
