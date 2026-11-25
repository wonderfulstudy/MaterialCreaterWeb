import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Picker, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import { ApiError } from '@/api/client'
import {
  fetchMovements,
  fetchStockOverview,
  fetchTicketTypes,
  movementTypeLabel,
  parseTicketBookNo,
  stockIn,
  stockOut,
  type MovementItem,
  type StockOverview,
  type StockOverviewType,
  type TicketType,
} from '@/api/business/stock'
import { centsToYuan } from '@/api/business/sales'
import ScanPanel, { formatBookNo, type ScanMode, type ScanState } from './ScanPanel'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'
const PAGE_SIZE = 50

type MovementKind = 'all' | 'in' | 'out'

const KIND_OPTIONS: { key: MovementKind; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'in', label: '入库' },
  { key: 'out', label: '出库' },
]

interface MovementFilter {
  kind: MovementKind
  from: string
  to: string
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** 2026-11-25T10:00:00+08:00 → 11-25 10:00 */
function formatDateTime(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw || '')
  if (!match) return raw || '—'
  return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`
}

function signedQuantity(quantity: number): string {
  return quantity > 0 ? `+${quantity}` : String(quantity)
}

/** 业务错误码口径（API.r6 §6.3 / §6.4）：-3 已在库、-4 不在库、-5 票种不可用 */
function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === -3) return '该本已在库'
    if (error.code === -4) return '该本不在库'
    if (error.code === -5) return '票种不存在或已停用'
    return error.message || '操作失败，请重试'
  }
  return '网络异常，请重试'
}

export default function StockPage() {
  const router = useRouter()
  const action = router.params?.action
  const firstShow = useRef(true)
  // 页面实例在 H5 下会被复用，一次性 ref 会让第二次带 action 进入时静默失效，
  // 因此按“最近一次自动触发过的 action”去重（参数变化即触发）
  const lastAutoAction = useRef<string | undefined>(undefined)

  const [overview, setOverview] = useState<StockOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [typesError, setTypesError] = useState('')

  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const [scan, setScan] = useState<ScanState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [movementsOpen, setMovementsOpen] = useState(false)
  const [movementKind, setMovementKind] = useState<MovementKind>('all')
  const [movementFrom, setMovementFrom] = useState('')
  const [movementTo, setMovementTo] = useState('')
  const [movements, setMovements] = useState<MovementItem[]>([])
  const [movementTotal, setMovementTotal] = useState(0)
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementsError, setMovementsError] = useState('')
  const movementSeq = useRef(0)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError('')
    try {
      setOverview(await fetchStockOverview())
    } catch {
      setOverviewError('库存总览加载失败，请重试')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadTicketTypes = useCallback(async () => {
    setTypesLoading(true)
    setTypesError('')
    try {
      setTicketTypes(await fetchTicketTypes())
    } catch {
      setTypesError('票种列表加载失败，请重试')
    } finally {
      setTypesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
    void loadTicketTypes()
  }, [loadOverview, loadTicketTypes])

  const enabledTypes = useMemo(() => ticketTypes.filter((item) => item.enabled), [ticketTypes])
  const types = overview?.types ?? []
  const selectedTypeId = scan?.ticketTypeId ?? enabledTypes[0]?.id ?? null

  const loadMovements = useCallback(
    async (filter: MovementFilter, mode: 'reset' | 'more', currentCount: number) => {
      const seq = movementSeq.current + 1
      movementSeq.current = seq
      setMovementsLoading(true)
      setMovementsError('')
      try {
        const data = await fetchMovements({
          kind: filter.kind === 'all' ? undefined : filter.kind,
          from: filter.from || undefined,
          to: filter.to || undefined,
          limit: PAGE_SIZE,
          offset: mode === 'reset' ? 0 : currentCount,
        })
        if (movementSeq.current !== seq) return
        setMovementTotal(data.total)
        setMovements((prev) => (mode === 'reset' ? data.items : prev.concat(data.items)))
      } catch {
        if (movementSeq.current === seq) setMovementsError('出入库记录加载失败，请重试')
      } finally {
        if (movementSeq.current === seq) setMovementsLoading(false)
      }
    },
    [],
  )

  const applyScannedCode = useCallback((mode: ScanMode, raw: string) => {
    const bookNo = parseTicketBookNo(raw)
    if (!bookNo) {
      setScan({
        mode,
        step: 'input',
        code: raw,
        bookNo: '',
        ticketTypeId: null,
        message: '票号格式不正确，请扫票面二维码或手输完整票号',
      })
      return
    }
    setScan({ mode, step: 'confirm', code: raw, bookNo, ticketTypeId: null, message: '' })
  }, [])

  const openScan = useCallback(
    async (mode: ScanMode) => {
      if (IS_H5) {
        setScan({ mode, step: 'input', code: '', bookNo: '', ticketTypeId: null, message: '' })
        return
      }
      try {
        const result = await Taro.scanCode({ scanType: ['qrCode', 'barCode'] })
        applyScannedCode(mode, result.result)
      } catch {
        // 用户取消扫码：不改变页面状态
      }
    },
    [applyScannedCode],
  )

  // 经营页卡片带 ?action=in|out 进来时自动开扫码浮层。
  // H5 同一路由的页面实例会被复用、router.params 可能仍是上一次的值，故优先读实时 hash。
  const currentAction = useCallback((): string | undefined => {
    if (IS_H5 && typeof window !== 'undefined') {
      const hash = window.location.hash || ''
      const at = hash.indexOf('?')
      if (at >= 0) {
        const matched = /(?:^|&)action=([^&]*)/.exec(hash.slice(at + 1))
        if (matched) return decodeURIComponent(matched[1])
      }
      return undefined
    }
    return action
  }, [action])

  const openActionSheet = useCallback(() => {
    const next = currentAction()
    if (next !== 'in' && next !== 'out') return
    if (lastAutoAction.current === next) return
    lastAutoAction.current = next
    void openScan(next)
  }, [currentAction, openScan])

  // 页面展示时刷新总览（票种可能新增/改名），并处理 ?action=
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false
    } else {
      void loadOverview()
      void loadTicketTypes()
    }
    openActionSheet()
  })

  // H5 复用实例时 didShow 未必触发，hashchange 兜底
  useEffect(() => {
    if (!IS_H5 || typeof window === 'undefined') return undefined
    const onHashChange = () => openActionSheet()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [openActionSheet])

  const changeScanCode = (value: string) => {
    setScan((prev) => (prev ? { ...prev, code: value, message: '' } : prev))
  }

  const selectScanType = (id: number) => {
    setScan((prev) => (prev ? { ...prev, ticketTypeId: id, message: '' } : prev))
  }

  const submitManualCode = () => {
    if (!scan) return
    const raw = scan.code.trim()
    if (!raw) {
      setScan({ ...scan, message: '请输入票面票号' })
      return
    }
    const bookNo = parseTicketBookNo(raw)
    if (!bookNo) {
      setScan({ ...scan, message: '票号格式不正确：15 位本号，或 18 / 20 位完整票号' })
      return
    }
    setScan({ ...scan, step: 'confirm', bookNo, message: '' })
  }

  const submitScan = async () => {
    if (!scan || submitting) return
    if (scan.mode === 'in' && !selectedTypeId) {
      setScan({
        ...scan,
        message: enabledTypes.length ? '请先选择票种' : '没有可用票种，请先到票种管理新增或启用',
      })
      return
    }
    setSubmitting(true)
    try {
      if (scan.mode === 'in') {
        await stockIn({ code: scan.bookNo, ticketTypeId: selectedTypeId as number })
        void Taro.showToast({ title: '入库成功', icon: 'success' })
      } else {
        await stockOut({ code: scan.bookNo })
        void Taro.showToast({ title: '出库成功', icon: 'success' })
      }
      setScan(null)
      // 一次性动作已消费：下次带同一 ?action= 进入时仍应自动开浮层
      lastAutoAction.current = undefined
      void loadOverview()
      void loadTicketTypes()
      if (movementsOpen) {
        void loadMovements(
          { kind: movementKind, from: movementFrom, to: movementTo },
          'reset',
          0,
        )
      }
    } catch (error) {
      setScan((prev) => (prev ? { ...prev, message: mutationErrorMessage(error) } : prev))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleType = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const goBooks = (type: StockOverviewType) => {
    void Taro.navigateTo({
      url: `/pages/stock-books/index?ticketTypeId=${type.id}&name=${encodeURIComponent(type.name)}`,
    })
  }

  const goTicketTypes = () => {
    void Taro.navigateTo({ url: '/pages/ticket-types/index' })
  }

  const toggleMovements = () => {
    const next = !movementsOpen
    setMovementsOpen(next)
    if (next && movements.length === 0 && !movementsLoading) {
      void loadMovements({ kind: movementKind, from: movementFrom, to: movementTo }, 'reset', 0)
    }
  }

  const changeMovementKind = (kind: MovementKind) => {
    if (kind === movementKind) return
    setMovementKind(kind)
    if (movementsOpen) {
      void loadMovements({ kind, from: movementFrom, to: movementTo }, 'reset', 0)
    }
  }

  const changeMovementFrom = (from: string) => {
    setMovementFrom(from)
    if (movementsOpen) {
      void loadMovements({ kind: movementKind, from, to: movementTo }, 'reset', 0)
    }
  }

  const changeMovementTo = (to: string) => {
    setMovementTo(to)
    if (movementsOpen) {
      void loadMovements({ kind: movementKind, from: movementFrom, to }, 'reset', 0)
    }
  }

  const clearMovementDates = () => {
    setMovementFrom('')
    setMovementTo('')
    if (movementsOpen) {
      void loadMovements({ kind: movementKind, from: '', to: '' }, 'reset', 0)
    }
  }

  return (
    <View className={styles.page}>
      <View className={styles.summary}>
        <View className={styles.summaryCell}>
          <Text className={styles.summaryLabel}>在库总本数</Text>
          <View className={styles.summaryValueRow}>
            <Text className={styles.summaryValue}>
              {overview ? overview.inStockBooks : '—'}
            </Text>
            <Text className={styles.summaryUnit}>本</Text>
          </View>
        </View>
        <View className={styles.summaryCell}>
          <Text className={styles.summaryLabel}>库存金额合计</Text>
          <Text className={styles.summaryAmount}>
            {overview ? `¥${centsToYuan(overview.stockCents)}` : '—'}
          </Text>
        </View>
      </View>

      {overviewError ? (
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>{overviewError}</Text>
          <Text className={styles.errorAction} onClick={() => void loadOverview()}>
            重试
          </Text>
        </View>
      ) : null}

      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>票种总览</Text>
        <Text className={styles.sectionHint}>
          {types.length ? `${types.length} 个票种 · 按本计数` : '按本计数'}
        </Text>
      </View>

      {overviewLoading && !overview ? (
        <Text className={styles.placeholder}>加载中…</Text>
      ) : null}

      <View className={styles.typeList}>
        {types.map((type) => {
          const books = type.books || []
          const open = Boolean(expanded[type.id])
          return (
            <View key={type.id} className={styles.typeItem}>
              <View className={styles.typeHead}>
                <View className={styles.typeMain} onClick={() => goBooks(type)}>
                  <Text className={styles.typeName}>{type.name}</Text>
                  <Text className={styles.typeMeta}>
                    {`¥${centsToYuan(type.faceCents)}/张 · 整本 ${type.sheetsPerBook} 张 · ¥${centsToYuan(type.bookCents)}/本`}
                  </Text>
                </View>
                <Text className={styles.typeCount}>{`${type.inStockBooks ?? 0} 本`}</Text>
                <View className={styles.typeToggle} onClick={() => toggleType(type.id)}>
                  <Text className={classnames(styles.chevron, open && styles.chevronOpen)}>⌄</Text>
                </View>
              </View>

              {open ? (
                <View className={styles.books}>
                  {books.length ? (
                    books.map((book) => (
                      <View key={book.bookNo} className={styles.bookRow}>
                        <Text className={styles.bookNo}>{formatBookNo(book.bookNo)}</Text>
                        <Text className={styles.bookTime}>
                          {`${formatDateTime(book.inboundAt)} 入库`}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className={styles.bookEmpty}>暂无在库本</Text>
                  )}
                  <View className={styles.bookAll} onClick={() => goBooks(type)}>
                    <Text className={styles.bookAllText}>查看每本 ›</Text>
                    <Text className={styles.bookAllMeta}>
                      {`共 ${type.inStockBooks ?? 0} 本 · ¥${centsToYuan(type.stockCents ?? 0)}`}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      {!overviewLoading && !types.length ? (
        <Text className={styles.placeholder}>暂无票种，先到票种管理新增</Text>
      ) : null}

      <View className={styles.entryRow} onClick={toggleMovements}>
        <Text className={styles.entryTitle}>出入库记录</Text>
        <Text className={styles.entryMeta}>{movementsOpen ? '收起' : '展开'}</Text>
      </View>

      {movementsOpen ? (
        <View className={styles.movements}>
          <View className={styles.chipRow}>
            {KIND_OPTIONS.map((option) => (
              <View
                key={option.key}
                className={classnames(
                  styles.chip,
                  movementKind === option.key && styles.chipOn,
                )}
                onClick={() => changeMovementKind(option.key)}
              >
                <Text>{option.label}</Text>
              </View>
            ))}
          </View>

          <View className={styles.dateRow}>
            <Picker
              mode="date"
              value={movementFrom || todayKey()}
              onChange={(event) => changeMovementFrom(event.detail.value)}
            >
              <View className={classnames(styles.dateField, !movementFrom && styles.dateFieldMute)}>
                <Text>{movementFrom || '开始日期'}</Text>
              </View>
            </Picker>
            <Text className={styles.dateSep}>至</Text>
            <Picker
              mode="date"
              value={movementTo || todayKey()}
              onChange={(event) => changeMovementTo(event.detail.value)}
            >
              <View className={classnames(styles.dateField, !movementTo && styles.dateFieldMute)}>
                <Text>{movementTo || '结束日期'}</Text>
              </View>
            </Picker>
            {movementFrom || movementTo ? (
              <Text className={styles.dateClear} onClick={clearMovementDates}>
                清除
              </Text>
            ) : null}
          </View>

          {movementsError ? (
            <View className={styles.errorBar}>
              <Text className={styles.errorText}>{movementsError}</Text>
              <Text
                className={styles.errorAction}
                onClick={() =>
                  void loadMovements(
                    { kind: movementKind, from: movementFrom, to: movementTo },
                    'reset',
                    0,
                  )
                }
              >
                重试
              </Text>
            </View>
          ) : null}

          {movements.map((item, index) => (
            <View
              key={`${item.bookNo}-${item.movementType}-${item.occurredAt}-${index}`}
              className={styles.movement}
            >
              <View className={styles.movementTop}>
                <Text
                  className={classnames(
                    styles.movementType,
                    item.movementType === 'inbound' && styles.movementTypeIn,
                  )}
                >
                  {movementTypeLabel(item.movementType)}
                </Text>
                <Text className={styles.movementQty}>
                  {`${signedQuantity(item.quantity)} 本`}
                </Text>
              </View>
              <Text className={styles.movementNo}>{formatBookNo(item.bookNo)}</Text>
              <View className={styles.movementBottom}>
                <Text className={styles.movementTypeName}>{item.ticketTypeName}</Text>
                <Text className={styles.movementTime}>
                  {`${formatDateTime(item.occurredAt)} · ${item.operator || '—'}`}
                </Text>
              </View>
            </View>
          ))}

          {movementsLoading ? <Text className={styles.placeholder}>加载中…</Text> : null}

          {!movementsLoading && !movements.length && !movementsError ? (
            <Text className={styles.placeholder}>没有符合条件的记录</Text>
          ) : null}

          {!movementsLoading && movements.length < movementTotal ? (
            <View
              className={styles.loadMore}
              onClick={() => void loadMovements(
                { kind: movementKind, from: movementFrom, to: movementTo },
                'more',
                movements.length,
              )}
            >
              <Text>加载更多（{`${movements.length}/${movementTotal}`}）</Text>
            </View>
          ) : null}

          <Text className={styles.note}>
            类型只有入库和出库；历史导入的拆封 / 销售扣张 / 盘点调整记录按原样只读保留。
          </Text>
        </View>
      ) : null}

      <View className={styles.manageRow} onClick={goTicketTypes}>
        <Text className={styles.manageTitle}>票种管理</Text>
        <Text className={styles.manageMeta}>新增 / 编辑票种 ›</Text>
      </View>

      <Text className={styles.note}>
        入库、出库都扫票面二维码：扫任意一张即可识别整本，按整本加减库存，单位是「本」。
      </Text>

      <View className={styles.footbar}>
        <View className={classnames(styles.footBtn, styles.footIn)} onClick={() => void openScan('in')}>
          <Text>入库</Text>
        </View>
        <View
          className={classnames(styles.footBtn, styles.footOut)}
          onClick={() => void openScan('out')}
        >
          <Text>出库</Text>
        </View>
      </View>

      {scan ? (
        <ScanPanel
          scan={scan}
          isH5={IS_H5}
          ticketTypes={enabledTypes}
          typesLoading={typesLoading}
          typesError={typesError}
          selectedTypeId={selectedTypeId}
          submitting={submitting}
          onChangeCode={changeScanCode}
          onSelectType={selectScanType}
          onRetryTypes={() => void loadTicketTypes()}
          onClose={() => setScan(null)}
          onSubmitInput={submitManualCode}
          onConfirm={() => void submitScan()}
        />
      ) : null}
    </View>
  )
}
