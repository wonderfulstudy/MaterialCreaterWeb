import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import {
  centsToYuan,
  fetchSalesDay,
  saveSalesDay,
  yuanToCents,
  type SalesDay,
  type SalesDayItem,
} from '@/api/business/sales'
import {
  GAME_DEFINITIONS,
  JC_SUBGAME_DEFINITIONS,
  type JcSubgameKey,
  type SalesGameKey,
} from '@/api/business/games'
import { readSession } from '@/services/auth/storage'
import { isOcrSupported, recognizeImage } from '@/services/ocr'
import { parseReceiptLines } from '@/services/receipt-sales'
import styles from './index.module.scss'

/** H5 无法本地识别，拍照入口只在小程序出现（FR-14a） */
const IS_H5 = process.env.TARO_ENV === 'h5'

/** 识别成功的行高亮时长 */
const HIGHLIGHT_MS = 1500

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const SUBGAME_KEYS: JcSubgameKey[] = JC_SUBGAME_DEFINITIONS.map((item) => item.key)

type ValueMap = Partial<Record<SalesGameKey, string>>

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 今天 → 2026-11-22 */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** 2026-11-22 → 周六（时区无关，按年月日构造） */
function weekdayLabel(date: string): string {
  const parts = date.split('-').map((item) => Number(item))
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) return ''
  const day = new Date(parts[0], parts[1] - 1, parts[2])
  return WEEK_LABELS[day.getDay()] || ''
}

/** 输入框只收「元」，两位小数；非法中间态直接丢弃本次输入 */
function sanitizeMoney(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!/^[0-9]*\.?[0-9]{0,2}$/.test(cleaned)) return null
  return cleaned
}

function centsOfText(text: string | undefined): number {
  if (!text) return 0
  return yuanToCents(text) ?? 0
}

function errorMessageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  if (typeof errMsg === 'string' && errMsg) return errMsg
  return fallback
}

export default function SalesEntryPage() {
  const router = useRouter()
  const routeDate = router.params?.date || ''
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : todayKey())
  const [values, setValues] = useState<ValueMap>({})
  const [operator, setOperator] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrNotice, setOcrNotice] = useState('')
  const [highlight, setHighlight] = useState<Record<string, boolean>>({})
  const [recognizedCount, setRecognizedCount] = useState(0)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const session = readSession()
    setOperator(session?.user?.nickname || '')
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      Object.keys(pending).forEach((key) => clearTimeout(pending[key]))
    }
  }, [])

  /** 接口回填：items 优先，缺失时退回服务端算好的 games（竞彩已按子玩法合计覆盖） */
  const applyDay = useCallback((day: SalesDay) => {
    const next: ValueMap = {}
    const items = Array.isArray(day.items) ? day.items : []
    items.forEach((item) => {
      if (!item || !item.gameKey) return
      next[item.gameKey] = centsToYuan(Number(item.salesCents) || 0)
    })
    const games = day.games || {}
    Object.keys(games).forEach((key) => {
      if (next[key as SalesGameKey] !== undefined) return
      next[key as SalesGameKey] = centsToYuan(Number(games[key]) || 0)
    })
    setValues(next)
    setExpanded(SUBGAME_KEYS.some((key) => centsOfText(next[key]) > 0))
    setRecognizedCount(0)
    setOcrNotice('')
  }, [])

  const loadDay = useCallback(
    async (target: string) => {
      setLoading(true)
      setLoadError('')
      setSaveError('')
      try {
        const day = await fetchSalesDay(target)
        applyDay(day)
      } catch (error) {
        // 换天失败时不留上一天的数字，避免把两天的金额混着提交
        setValues({})
        setExpanded(false)
        setLoadError(errorMessageOf(error, '读取当日销量失败'))
      } finally {
        setLoading(false)
      }
    },
    [applyDay],
  )

  useEffect(() => {
    loadDay(date)
    // 只在统计日变化时重新拉取（loadDay 依赖稳定）
  }, [date, loadDay])

  const detailSumCents = useMemo(
    () => SUBGAME_KEYS.reduce((sum, key) => sum + centsOfText(values[key]), 0),
    [values],
  )

  /** 只要 13 个玩法里有任何一个填了值，竞彩大类就按子玩法合计走（API.r6 §0.2） */
  const hasDetail = useMemo(
    () => SUBGAME_KEYS.some((key) => (values[key] || '').trim() !== ''),
    [values],
  )

  const jczqCents = hasDetail ? detailSumCents : centsOfText(values.jczq)

  const dayTotalCents = useMemo(
    () =>
      GAME_DEFINITIONS.reduce((sum, definition) => {
        if (definition.key === 'jczq') return sum + jczqCents
        return sum + centsOfText(values[definition.key])
      }, 0),
    [values, jczqCents],
  )

  const buildItems = useCallback((): SalesDayItem[] => {
    const items: SalesDayItem[] = []
    GAME_DEFINITIONS.forEach((definition) => {
      // 有子玩法明细时不再提交竞彩大类行，避免与大类金额打架
      if (definition.key === 'jczq' && hasDetail) return
      items.push({
        gameKey: definition.key,
        salesCents: centsOfText(values[definition.key]),
        granularity: 'total',
      })
    })
    if (hasDetail) {
      SUBGAME_KEYS.forEach((key) => {
        if ((values[key] || '').trim() === '') return
        items.push({ gameKey: key, salesCents: centsOfText(values[key]), granularity: 'detail' })
      })
    }
    return items
  }, [hasDetail, values])

  const handleChange = useCallback((key: SalesGameKey, raw: string) => {
    const next = sanitizeMoney(raw)
    if (next === null) return
    setValues((prev) => ({ ...prev, [key]: next }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (saving || loading) return
    setSaving(true)
    setSaveError('')
    try {
      await saveSalesDay({ date, operator, items: buildItems() })
      Taro.navigateBack()
    } catch (error) {
      setSaveError(errorMessageOf(error, '保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }, [buildItems, date, loading, operator, saving])

  const flash = useCallback((keys: SalesGameKey[]) => {
    setHighlight((prev) => {
      const next = { ...prev }
      keys.forEach((key) => {
        next[key] = true
      })
      return next
    })
    keys.forEach((key) => {
      const timer = timers.current[key]
      if (timer) clearTimeout(timer)
      timers.current[key] = setTimeout(() => {
        setHighlight((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }, HIGHLIGHT_MS)
    })
  }, [])

  /** 命中的行填值并高亮；空结果不动已填行，连拍可继续累加（AC-31 / AC-52） */
  const applyReceipt = useCallback(
    (items: Array<{ gameKey: SalesGameKey; salesCents: number }>) => {
      const next: ValueMap = { ...values }
      const hitKeys: SalesGameKey[] = []
      items.forEach((item) => {
        const current = (next[item.gameKey] || '').trim()
        // 0 元多半是报表里那一项没卖，不覆盖手输的已有金额
        if (item.salesCents === 0 && current !== '') return
        next[item.gameKey] = centsToYuan(item.salesCents)
        hitKeys.push(item.gameKey)
      })
      setValues(next)
      if (items.some((item) => SUBGAME_KEYS.indexOf(item.gameKey as JcSubgameKey) >= 0)) {
        setExpanded(true)
      }
      setRecognizedCount((count) => count + items.length)
      flash(hitKeys)
    },
    [flash, values],
  )

  const handleCapture = useCallback(async () => {
    if (ocrBusy) return
    setOcrBusy(true)
    setOcrError('')
    setOcrNotice('')
    try {
      const media = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['original'],
      })
      const path = media?.tempFiles?.[0]?.tempFilePath
      if (!path) return
      if (!isOcrSupported()) {
        setOcrError('当前环境不支持本地识别，请使用微信小程序（基础库 2.30.0 及以上）打开')
        return
      }
      setOcrNotice('识别中，请稍候…')
      const result = await recognizeImage(path)
      const lines = (result.lines || []).map((line) => line.text)
      if (!lines.length && result.text) {
        lines.push(...result.text.split(/\r?\n/).filter((line) => line.trim() !== ''))
      }
      const parsed = parseReceiptLines(lines)
      if (!parsed.items.length) {
        setOcrNotice('')
        setOcrError('这张小票没有识别到销售金额，请对准「销售(已减取消)」那一行再拍一次')
        return
      }
      applyReceipt(parsed.items)
      setOcrNotice('')
    } catch (error) {
      const message = errorMessageOf(error, '拍照识别失败，请重试')
      if (message.indexOf('cancel') >= 0) {
        setOcrNotice('')
        return
      }
      setOcrError(message)
    } finally {
      setOcrBusy(false)
    }
  }, [applyReceipt, ocrBusy])

  const handleRetry = useCallback(() => {
    loadDay(date)
  }, [date, loadDay])

  return (
    <View className={styles.page}>
      <View className={styles.topbar}>
        <Picker
          mode='date'
          value={date}
          onChange={(event) => setDate(event.detail.value)}
        >
          <View className={styles.dayChip}>
            <Text className={styles.dayLabel}>统计日</Text>
            <Text className={styles.dayValue}>
              {date} {weekdayLabel(date)}
            </Text>
            <Text className={styles.dayAction}>改日期</Text>
          </View>
        </Picker>
      </View>

      {loading ? <View className={styles.tipBar}>读取当日销量…</View> : null}

      {!loading && loadError ? (
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>读取失败：{loadError}</Text>
          <View className={styles.retryBtn} onClick={handleRetry}>
            重试
          </View>
        </View>
      ) : null}

      {recognizedCount > 0 ? (
        <View className={styles.recStrip}>
          已识别 {recognizedCount} 项 · 可继续拍照累加
        </View>
      ) : null}

      <View className={styles.card}>
        {GAME_DEFINITIONS.map((definition) => {
          const isJczq = definition.key === 'jczq'
          const value = isJczq && hasDetail ? centsToYuan(detailSumCents) : values[definition.key] || ''
          return (
            <View key={definition.key}>
              <View
                className={classnames(styles.frow, highlight[definition.key] && styles.recRow)}
              >
                <Text className={styles.nm}>{definition.label}</Text>
                {isJczq ? (
                  <View className={styles.chip} onClick={() => setExpanded((open) => !open)}>
                    {expanded ? '收起玩法' : `${SUBGAME_KEYS.length} 个玩法`}
                  </View>
                ) : null}
                {highlight[definition.key] ? <Text className={styles.recTag}>已识别</Text> : null}
                <View className={styles.inWrap}>
                  <Text className={styles.unit}>¥</Text>
                  <Input
                    className={classnames(styles.in, isJczq && hasDetail && styles.inRo)}
                    type='digit'
                    value={value}
                    disabled={isJczq && hasDetail}
                    placeholder='0.00'
                    onInput={(event) => handleChange(definition.key, event.detail.value)}
                  />
                </View>
              </View>

              {isJczq && expanded ? (
                <View className={styles.jcbox}>
                  {JC_SUBGAME_DEFINITIONS.map((subgame) => (
                    <View
                      key={subgame.key}
                      className={classnames(styles.srow, highlight[subgame.key] && styles.recRow)}
                    >
                      <Text className={styles.snm}>{subgame.label}</Text>
                      {highlight[subgame.key] ? <Text className={styles.recTag}>已识别</Text> : null}
                      <View className={styles.inWrap}>
                        <Text className={styles.unit}>¥</Text>
                        <Input
                          className={styles.in}
                          type='digit'
                          value={values[subgame.key] || ''}
                          placeholder='0.00'
                          onInput={(event) => handleChange(subgame.key, event.detail.value)}
                        />
                      </View>
                    </View>
                  ))}
                  <View className={styles.totRow}>
                    <Text className={styles.snm}>竞彩合计</Text>
                    <Text className={styles.totValue}>¥{centsToYuan(detailSumCents)}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      <View className={styles.hint}>
        留空即 0：没填的行按 ¥0.00 计入日合计。竞彩合计由 13 个玩法自动汇总。
      </View>

      {IS_H5 ? <View className={styles.h5Hint}>拍照识别仅小程序可用</View> : null}
      {ocrNotice ? <View className={styles.ocrNotice}>{ocrNotice}</View> : null}
      {ocrError ? <View className={styles.errorBar}>{ocrError}</View> : null}
      {saveError ? <View className={styles.errorBar}>保存失败：{saveError}</View> : null}

      {IS_H5 ? null : (
        <View
          className={classnames(styles.fab, ocrBusy && styles.fabBusy)}
          onClick={handleCapture}
        >
          {ocrBusy ? '识别中…' : '拍照'}
        </View>
      )}

      <View className={styles.footbar}>
        <View className={styles.totalBox}>
          <Text className={styles.totalLabel}>日合计</Text>
          <Text className={styles.totalValue}>¥{centsToYuan(dayTotalCents)}</Text>
        </View>
        <Button
          className={styles.submit}
          disabled={saving || loading}
          onClick={handleSubmit}
        >
          {saving ? '保存中…' : '确认'}
        </Button>
      </View>
    </View>
  )
}
