import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import LotteryCardView from '@/components/LotteryCardView'
import MatchCardView from '@/components/MatchCardView'
import TraditionalCardView from '@/components/MatchCardView/traditional'
import PosterFrame, { type PosterFrameHandle } from '@/components/PosterFrame'
import PosterFooter from '@/components/PosterFrame/poster-footer'
import { toCardItems } from '@/components/ResultPoster/card-items'
import { DEFAULT_BRAND_NAME, DEFAULT_QR_CAPTION, DEFAULT_QR_IMAGE, DEFAULT_SLOGAN } from '@/components/ResultPoster/config'
import { toPosterInputs, type DrawSource, type PosterDefaults } from '@/components/ResultPoster/poster-inputs'
import { loadLatestGame } from '@/api/latest-lottery'
import {
  loadBasketballResults,
  loadFootballResults,
  loadTraditionalDraws,
  shiftDateKey,
  toDateKey,
  type SportMatchResult,
  type TraditionalDraw,
} from '@/api/lottery/results'
import { DEMO_DRAWS, IS_DEMO_MODE } from '@/config/demo'
import { LATEST_LOTTERIES, type LotteryGameCode } from '@/models/lottery.model'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import {
  DEFAULT_SELECTION,
  DIGITAL_GAMES,
  pickDrawEntries,
  resolveShareSource,
  selectAllGames,
  sharePosterFileName,
  shareSportPosterFileName,
  toggleGameSelection,
  type ShareDrawEntry,
} from './share-data'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'

const DEFAULTS: PosterDefaults = {
  qrImage: DEFAULT_QR_IMAGE,
  qrCaption: DEFAULT_QR_CAPTION,
  brandName: DEFAULT_BRAND_NAME,
  slogan: DEFAULT_SLOGAN,
}

/** 竞彩赛果缺省看昨天，与两个详情页的默认日期一致 */
const DEFAULT_SPORT_DATE = shiftDateKey(toDateKey(new Date()), -1)

type Phase = 'select' | 'preview'
type LoadStatus = 'loading' | 'ready' | 'empty' | 'error'

/** 一个彩种的最新开奖 → 海报入参；落款统一走 config 默认值 */
function createEntry(code: LotteryGameCode, source: DrawSource): ShareDrawEntry {
  const inputs = toPosterInputs([source], DEFAULTS)
  return { code, input: inputs[0] }
}

/** 拉全部彩种的最新一期，按彩种带上 code，供勾选筛选 */
async function loadDrawEntries(): Promise<ShareDrawEntry[]> {
  if (IS_DEMO_MODE) {
    return DEMO_DRAWS.flatMap((draw) => {
      const definition = LATEST_LOTTERIES.find(({ code }) => code === draw.code)
      return definition
        ? [
            createEntry(draw.code, {
              gameName: definition.name,
              issue: formatIssue(draw.issue),
              drawDate: formatDrawDate(draw.drawDate),
              redNumbers: draw.redNumbers,
              blueNumbers: draw.blueNumbers,
            }),
          ]
        : []
    })
  }

  const games = await Promise.all(DIGITAL_GAMES.map(({ code }) => loadLatestGame(code)))
  return games.flatMap((game) =>
    game.status === 'drawn'
      ? [
          {
            code: game.gameCode,
            input: toPosterInputs(
              [
                {
                  gameName: game.result.name,
                  issue: formatIssue(game.result.issue),
                  drawDate: formatDrawDate(game.result.drawDate),
                  redNumbers: game.result.redNumbers,
                  blueNumbers: game.result.blueNumbers,
                },
              ],
              DEFAULTS
            )[0],
          },
        ]
      : []
  )
}

/**
 * 分享海报页（按来源单张）。
 * - source=draw：勾选彩种 → 预览态整张数字彩合集海报；
 * - source=jc-football / jc-basketball：直接进预览态，正文是当日赛果卡列表；
 * - source=jc-traditional：直接进预览态，正文是该期 14 场 3/1/0。
 * 海报视觉就是页面卡片 + 海报页脚，截图节点宽 375px、导出 scale=2 即 750px 成品。
 */
export default function SharePage() {
  const router = useRouter()
  const resolved = useMemo(
    () =>
      resolveShareSource(router.params.source, {
        date: router.params.date,
        issue: router.params.issue,
      }),
    [router.params.source, router.params.date, router.params.issue]
  )

  const [selected, setSelected] = useState<LotteryGameCode[]>(DEFAULT_SELECTION)
  const [phase, setPhase] = useState<Phase>(() => (resolved.directPreview ? 'preview' : 'select'))
  const [entries, setEntries] = useState<ShareDrawEntry[]>([])
  const [matches, setMatches] = useState<SportMatchResult[]>([])
  const [draw, setDraw] = useState<TraditionalDraw | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [imagePath, setImagePath] = useState('')
  const [capturing, setCapturing] = useState(false)
  const frameRef = useRef<PosterFrameHandle | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: '分享海报' })
  }, [])

  /** 竞彩赛果日期：分享页没带 date 时回落到昨天 */
  const sportDate = resolved.date || DEFAULT_SPORT_DATE

  const load = useCallback(async () => {
    const current = ++requestId.current
    setStatus('loading')
    setEntries([])
    setMatches([])
    setDraw(null)

    try {
      if (resolved.kind === 'draw') {
        const list = await loadDrawEntries()
        if (requestId.current !== current) {
          return
        }
        setEntries(list)
        setStatus(list.length > 0 ? 'ready' : 'empty')
        return
      }

      if (resolved.kind === 'jc-football' || resolved.kind === 'jc-basketball') {
        const loaded =
          resolved.kind === 'jc-football'
            ? await loadFootballResults(sportDate)
            : await loadBasketballResults(sportDate)
        if (requestId.current !== current) {
          return
        }
        if (!loaded) {
          setStatus('error')
          return
        }
        setMatches(loaded.data)
        setStatus(loaded.data.length > 0 ? 'ready' : 'empty')
        return
      }

      if (resolved.kind === 'jc-traditional') {
        const loaded = await loadTraditionalDraws()
        if (requestId.current !== current) {
          return
        }
        if (!loaded) {
          setStatus('error')
          return
        }
        // 带了期次就锁定该期，否则取最新一期
        const target = loaded.data.find((item) => item.issue === resolved.issue) ?? loaded.data[0] ?? null
        setDraw(target)
        setStatus(target ? 'ready' : 'empty')
        return
      }

      // 未知来源：占位文案在下面的分支里渲染
      setStatus('empty')
    } catch (error: unknown) {
      if (requestId.current !== current) {
        return
      }
      console.error('[SharePage] 开奖数据加载失败', error)
      setStatus('error')
    }
  }, [resolved.kind, resolved.issue, sportDate])

  useEffect(() => {
    void load()
  }, [load])

  const selectedEntries = useMemo(() => pickDrawEntries(selected, entries), [selected, entries])
  const cards = useMemo(() => toCardItems(selectedEntries.map(({ input }) => input)), [selectedEntries])

  /** 海报正文：页面与海报共用同一个组件的唯一实例，缺数据时为 null */
  const posterBody = useMemo<ReactNode>(() => {
    if (status !== 'ready') {
      return null
    }
    if (resolved.kind === 'draw') {
      return cards.length > 0 ? <LotteryCardView cards={cards} /> : null
    }
    if (resolved.kind === 'jc-football' || resolved.kind === 'jc-basketball') {
      return matches.length > 0 ? <MatchCardView matches={matches} /> : null
    }
    if (resolved.kind === 'jc-traditional') {
      return draw ? <TraditionalCardView draw={draw} /> : null
    }
    return null
  }, [status, resolved.kind, cards, matches, draw])

  /** 预览态下先让版式定下来再截图，避免拿到半张图 */
  useEffect(() => {
    if (!IS_H5 || phase !== 'preview' || !posterBody) {
      return
    }
    const current = ++requestId.current
    setCapturing(true)
    setImagePath('')
    const timer = setTimeout(() => {
      const frame = frameRef.current
      if (!frame) {
        setCapturing(false)
        return
      }
      frame.capture().then(
        (dataUrl) => {
          if (requestId.current !== current) {
            return
          }
          setImagePath(dataUrl)
          setCapturing(false)
        },
        (error: unknown) => {
          console.error('[SharePage] 海报截图失败', error)
          if (requestId.current !== current) {
            return
          }
          setCapturing(false)
          void Taro.showToast({ title: '海报生成失败，请重试', icon: 'none' })
        }
      )
    }, 120)
    return () => {
      clearTimeout(timer)
    }
  }, [phase, posterBody])

  function handleBack(): void {
    void Taro.navigateBack()
  }

  function handleToggle(code: LotteryGameCode): void {
    const result = toggleGameSelection(selected, code)
    if (result.blocked) {
      void Taro.showToast({ title: '至少保留一个彩种', icon: 'none' })
      return
    }
    setSelected(result.selected)
    setImagePath('')
  }

  function handleSelectAll(): void {
    setSelected(selectAllGames())
    setImagePath('')
  }

  function handleGenerate(): void {
    if (status !== 'ready' || selectedEntries.length === 0) {
      void Taro.showToast({ title: '暂无可分享的开奖数据', icon: 'none' })
      return
    }
    setPhase('preview')
  }

  function handleSave(): void {
    if (capturing || !imagePath) {
      void Taro.showToast({ title: '海报还在生成中', icon: 'none' })
      return
    }
    if (IS_H5 && typeof document !== 'undefined') {
      const link = document.createElement('a')
      link.href = imagePath
      link.download =
        resolved.kind === 'draw' ? sharePosterFileName(selectedEntries) : shareSportPosterFileName(resolved)
      document.body.appendChild(link)
      link.click()
      link.remove()
      void Taro.showToast({ title: '已开始下载', icon: 'success' })
      return
    }
    // 小程序端的画布导出随 Skyline 迁移一起做，本轮只保证 H5 所见即所得
    void Taro.showToast({ title: '小程序端暂不支持保存，请用浏览器打开', icon: 'none' })
  }

  function handleShare(): void {
    void Taro.showToast({ title: '请保存图片后分享', icon: 'none' })
  }

  if (resolved.kind === 'unsupported') {
    return (
      <View className={styles.page}>
        <View className={styles.bar}>
          <View className={styles.barBtn} onClick={handleBack}>
            <Text className={styles.barBtnIcon}>‹</Text>
          </View>
          <Text className={styles.barTitle}>分享海报</Text>
          <View className={styles.barBtnGhost} />
        </View>
        <View className={styles.placeholder}>
          <Text className={styles.placeholderTitle}>该来源暂不支持分享海报</Text>
          <Text className={styles.placeholderHint}>目前支持数字彩合集与竞彩足球 / 篮球 / 传统足彩赛果海报</Text>
        </View>
      </View>
    )
  }

  const issueOf = (code: LotteryGameCode): string => {
    const found = entries.find((entry) => entry.code === code)
    return found ? found.input.issue : ''
  }

  /** 预览态占位文案：三种 jc-* 来源进入页面时可能还在取数 */
  const placeholderTitle =
    status === 'loading' ? '海报生成中…' : status === 'error' ? '赛果加载失败' : '暂无可分享的赛果'
  const placeholderHint =
    status === 'loading' ? '正在获取赛果数据，请稍候' : '请返回开奖页刷新后重试'

  return (
    <View className={styles.page}>
      <View className={styles.bar}>
        {phase === 'preview' && !resolved.directPreview ? (
          <View className={styles.barBtn} onClick={() => setPhase('select')}>
            <Text className={styles.barBtnIcon}>×</Text>
          </View>
        ) : (
          <View className={styles.barBtn} onClick={handleBack}>
            <Text className={styles.barBtnIcon}>‹</Text>
          </View>
        )}
        <Text className={styles.barTitle}>分享海报 · {resolved.title}</Text>
        <View className={styles.barBtnGhost} />
      </View>

      {phase === 'select' ? (
        <>
          <ScrollView scrollY className={styles.body}>
            <View className={styles.selHead}>
              <Text className={styles.selTitle}>选择要分享的数字彩</Text>
              <Text className={styles.selCount}>
                已选 {selected.length} / {DIGITAL_GAMES.length}
              </Text>
            </View>
            {router.params.date ? <Text className={styles.selDate}>开奖日期 {router.params.date}</Text> : null}
            <View className={styles.selList}>
              <View className={styles.selAll} onClick={handleSelectAll}>
                <Text className={styles.selAllText}>全选</Text>
                <Text className={styles.selAllHint}>7 个彩种</Text>
              </View>
              {DIGITAL_GAMES.map((game) => {
                const active = selected.includes(game.code)
                return (
                  <View className={styles.selRow} key={game.code} onClick={() => handleToggle(game.code)}>
                    <View className={classnames(styles.check, active && styles.checkOn)}>
                      {active ? <Text className={styles.checkMark}>✓</Text> : null}
                    </View>
                    <Text className={styles.selName}>{game.name}</Text>
                    <Text className={styles.selIssue}>{issueOf(game.code)}</Text>
                  </View>
                )
              })}
            </View>
            <Text className={styles.selTip}>朋友只能保存到相册再发；发给好友可直接分享卡片</Text>
          </ScrollView>
          <View className={styles.actionBar}>
            <View className={styles.primary} onClick={handleGenerate}>
              <Text className={styles.primaryText}>生成数字彩合集海报</Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <ScrollView scrollY className={styles.body}>
            {posterBody ? (
              <PosterFrame ref={frameRef} footer={<PosterFooter />}>
                {posterBody}
              </PosterFrame>
            ) : (
              <View className={styles.placeholder}>
                <Text className={styles.placeholderTitle}>{placeholderTitle}</Text>
                <Text className={styles.placeholderHint}>{placeholderHint}</Text>
              </View>
            )}
          </ScrollView>
          <View className={styles.actionBar}>
            <View className={classnames(styles.action, styles.actionGhost)} onClick={handleShare}>
              <Text className={styles.actionGhostText}>分享好友</Text>
            </View>
            <View
              className={classnames(styles.action, styles.actionPrimary, (capturing || !imagePath) && styles.actionIdle)}
              onClick={handleSave}
            >
              <Text className={styles.actionPrimaryText}>
                {capturing ? '生成中…' : IS_H5 ? '保存图片' : '保存相册'}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  )
}
