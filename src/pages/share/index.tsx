import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import LotteryCardView from '@/components/LotteryCardView'
import PosterFrame, { type PosterFrameHandle } from '@/components/PosterFrame'
import PosterFooter from '@/components/PosterFrame/poster-footer'
import { toCardItems } from '@/components/ResultPoster/card-items'
import { DEFAULT_BRAND_NAME, DEFAULT_QR_CAPTION, DEFAULT_QR_IMAGE, DEFAULT_SLOGAN } from '@/components/ResultPoster/config'
import { toPosterInputs, type DrawSource, type PosterDefaults } from '@/components/ResultPoster/poster-inputs'
import { loadLatestGame } from '@/api/latest-lottery'
import { DEMO_DRAWS, IS_DEMO_MODE } from '@/config/demo'
import { LATEST_LOTTERIES, type LotteryGameCode } from '@/models/lottery.model'
import { formatDrawDate, formatIssue } from '@/utils/lottery-format'
import {
  DEFAULT_SELECTION,
  DIGITAL_GAMES,
  pickDrawEntries,
  selectAllGames,
  sharePosterFileName,
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

type Phase = 'select' | 'preview'
type LoadStatus = 'loading' | 'ready' | 'empty'

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
 * 选择态勾彩种 → 预览态展示整张海报 → 保存图片。
 * 海报视觉就是页面卡片 + 海报页脚，截图节点宽 375px、导出 scale=2 即 750px 成品。
 */
export default function SharePage() {
  const router = useRouter()
  const source = router.params.source ?? 'draw'
  // TODO(B2b): date 参数用于分享历史某一期的海报，本轮只分享最新一期
  const date = router.params.date ?? ''
  const isDrawSource = source === 'draw'

  const [selected, setSelected] = useState<LotteryGameCode[]>(DEFAULT_SELECTION)
  const [phase, setPhase] = useState<Phase>('select')
  const [entries, setEntries] = useState<ShareDrawEntry[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [imagePath, setImagePath] = useState('')
  const [capturing, setCapturing] = useState(false)
  const frameRef = useRef<PosterFrameHandle | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: '分享海报' })
  }, [])

  const load = useCallback(async () => {
    const current = ++requestId.current
    setStatus('loading')
    try {
      const list = await loadDrawEntries()
      if (requestId.current !== current) {
        return
      }
      setEntries(list)
      setStatus(list.length > 0 ? 'ready' : 'empty')
    } catch (error: unknown) {
      if (requestId.current !== current) {
        return
      }
      console.error('[SharePage] 开奖数据加载失败', error)
      setEntries([])
      setStatus('empty')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedEntries = useMemo(() => pickDrawEntries(selected, entries), [selected, entries])
  const cards = useMemo(() => toCardItems(selectedEntries.map(({ input }) => input)), [selectedEntries])

  /** 预览态下先让版式定下来再截图，避免拿到半张图 */
  useEffect(() => {
    if (!IS_H5 || phase !== 'preview' || status !== 'ready' || cards.length === 0) {
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
  }, [phase, status, cards])

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
      link.download = sharePosterFileName(selectedEntries)
      document.body.appendChild(link)
      link.click()
      link.remove()
      void Taro.showToast({ title: '已开始下载', icon: 'success' })
      return
    }
    // TODO(B2b): 小程序端改走 ResultPoster 的离屏画布分支，本轮只保证 H5 所见即所得
    void Taro.showToast({ title: '请回到开奖页保存海报', icon: 'none' })
  }

  function handleShare(): void {
    void Taro.showToast({ title: '请保存图片后分享', icon: 'none' })
  }

  if (!isDrawSource) {
    // TODO(B2b): football / basketball / traditional 三种来源的合集海报不在本轮范围内
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
          <Text className={styles.placeholderHint}>目前只支持数字彩合集海报，其它彩种合集稍后上线</Text>
        </View>
      </View>
    )
  }

  const issueOf = (code: LotteryGameCode): string => {
    const found = entries.find((entry) => entry.code === code)
    return found ? found.input.issue : ''
  }

  return (
    <View className={styles.page}>
      <View className={styles.bar}>
        {phase === 'preview' ? (
          <View className={styles.barBtn} onClick={() => setPhase('select')}>
            <Text className={styles.barBtnIcon}>×</Text>
          </View>
        ) : (
          <View className={styles.barBtn} onClick={handleBack}>
            <Text className={styles.barBtnIcon}>‹</Text>
          </View>
        )}
        <Text className={styles.barTitle}>分享海报 · 数字彩合集</Text>
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
            {date ? <Text className={styles.selDate}>开奖日期 {date}</Text> : null}
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
            {status === 'ready' && cards.length > 0 ? (
              <PosterFrame ref={frameRef} footer={<PosterFooter />}>
                <LotteryCardView cards={cards} />
              </PosterFrame>
            ) : (
              <View className={styles.placeholder}>
                <Text className={styles.placeholderTitle}>暂无可分享的开奖数据</Text>
                <Text className={styles.placeholderHint}>请返回开奖页刷新后重试</Text>
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
