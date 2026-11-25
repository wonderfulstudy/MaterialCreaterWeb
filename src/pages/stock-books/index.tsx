import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useReachBottom, useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import {
  bookStatusLabel,
  fetchStockBooks,
  fetchStockOverview,
  type StockBook,
  type StockOverviewType,
} from '@/api/business/stock'
import { centsToYuan } from '@/api/business/sales'
import { formatBookNo } from '../stock/ScanPanel'
import styles from './index.module.scss'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE = 300

type StatusFilter = 'all' | 'in_stock' | 'outbound'

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'in_stock', label: '在库' },
  { key: 'outbound', label: '已出库' },
]

/** 2026-11-25T10:00:00+08:00 → 11-25 10:00 */
function formatDateTime(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw || '')
  if (!match) return raw || '—'
  return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`
}

interface Query {
  ticketTypeId: number
  status: StatusFilter
  q: string
}

export default function StockBooksPage() {
  const router = useRouter()
  const rawTypeId = router.params?.ticketTypeId
  const paramName = (() => {
    const raw = router.params?.name
    if (!raw) return ''
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })()

  const ticketTypeId = useMemo(() => {
    const parsed = Number(rawTypeId)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [rawTypeId])

  const [typeInfo, setTypeInfo] = useState<StockOverviewType | null>(null)
  const [headerError, setHeaderError] = useState('')

  const [status, setStatus] = useState<StatusFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')

  const [items, setItems] = useState<StockBook[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const seq = useRef(0)

  // 票号搜索 300ms 防抖
  useEffect(() => {
    const timer = setTimeout(() => setQ(keyword.trim()), SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [keyword])

  const loadHeader = useCallback(async () => {
    if (!ticketTypeId) return
    setHeaderError('')
    try {
      const overview = await fetchStockOverview()
      const found = (overview.types || []).find((item) => item.id === ticketTypeId) || null
      setTypeInfo(found)
    } catch {
      setHeaderError('库存合计加载失败，请重试')
    }
  }, [ticketTypeId])

  const loadList = useCallback(
    async (query: Query, mode: 'reset' | 'more', currentCount: number) => {
      if (!query.ticketTypeId) return
      const current = seq.current + 1
      seq.current = current
      setLoading(true)
      setListError('')
      try {
        const data = await fetchStockBooks({
          ticketTypeId: query.ticketTypeId,
          status: query.status === 'all' ? undefined : query.status,
          q: query.q || undefined,
          limit: PAGE_SIZE,
          offset: mode === 'reset' ? 0 : currentCount,
        })
        if (seq.current !== current) return
        setTotal(data.total)
        setItems((prev) => (mode === 'reset' ? data.items : prev.concat(data.items)))
      } catch {
        if (seq.current === current) setListError('库存列表加载失败，请重试')
      } finally {
        if (seq.current === current) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadHeader()
  }, [loadHeader])

  useEffect(() => {
    if (!ticketTypeId) return
    void loadList({ ticketTypeId, status, q }, 'reset', 0)
  }, [ticketTypeId, status, q, loadList])

  const hasMore = items.length < total

  useReachBottom(() => {
    if (!loading && hasMore) {
      void loadList({ ticketTypeId, status, q }, 'more', items.length)
    }
  })

  const title = paramName || typeInfo?.name || '每本清单'

  if (!ticketTypeId) {
    return (
      <View className={styles.page}>
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>缺少票种参数，请从库存详情页进入</Text>
          <Text className={styles.errorAction} onClick={() => void Taro.navigateBack()}>
            返回
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <Text className={styles.headerTitle}>{`${title} · 每本清单`}</Text>
        <View className={styles.summaryRow}>
          <View className={styles.summaryCell}>
            <Text className={styles.summaryLabel}>在库</Text>
            <Text className={styles.summaryValue}>
              {`${typeInfo?.inStockBooks ?? 0} 本`}
            </Text>
          </View>
          <View className={styles.summaryCell}>
            <Text className={styles.summaryLabel}>库存金额合计</Text>
            <Text className={styles.summaryAmount}>
              {typeInfo ? `¥${centsToYuan(typeInfo.stockCents ?? 0)}` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {headerError ? (
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>{headerError}</Text>
          <Text className={styles.errorAction} onClick={() => void loadHeader()}>
            重试
          </Text>
        </View>
      ) : null}

      <View className={styles.filters}>
        <View className={styles.chipRow}>
          {STATUS_OPTIONS.map((option) => (
            <View
              key={option.key}
              className={classnames(styles.chip, status === option.key && styles.chipOn)}
              onClick={() => setStatus(option.key)}
            >
              <Text>{option.label}</Text>
            </View>
          ))}
        </View>
        <View className={styles.searchBox}>
          <Input
            className={styles.searchInput}
            value={keyword}
            placeholder="搜索票号，如 361052000153200"
            placeholderClass={styles.searchPlaceholder}
            onInput={(event) => setKeyword(event.detail.value)}
          />
          {keyword ? (
            <Text className={styles.searchClear} onClick={() => setKeyword('')}>
              ✕
            </Text>
          ) : null}
        </View>
      </View>

      {listError ? (
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>{listError}</Text>
          <Text
            className={styles.errorAction}
            onClick={() => void loadList({ ticketTypeId, status, q }, 'reset', 0)}
          >
            重试
          </Text>
        </View>
      ) : null}

      <View className={styles.list}>
        {items.map((item) => (
          <View key={item.bookNo} className={styles.listItem}>
            <View className={styles.itemTop}>
              <Text className={styles.itemNo}>{formatBookNo(item.bookNo)}</Text>
              <Text
                className={classnames(
                  styles.statusTag,
                  item.status === 'in_stock' && styles.statusTagIn,
                )}
              >
                {bookStatusLabel(item.status)}
              </Text>
            </View>
            <Text className={styles.itemMeta}>
              {`¥${centsToYuan(item.faceCents)} · 整本 ${item.sheetsPerBook} 张 · ¥${centsToYuan(item.bookCents)}`}
            </Text>
            <View className={styles.itemBottom}>
              <Text className={styles.itemTicket}>{item.ticketTypeName}</Text>
              <Text className={styles.itemTime}>
                {`入库 ${formatDateTime(item.inboundAt)} · ${item.operator || '—'}`}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {loading ? <Text className={styles.placeholder}>加载中…</Text> : null}

      {!loading && !items.length && !listError ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>
            {q ? `没有匹配「${q}」的本号` : '这个票种还没有本'}
          </Text>
          <View className={styles.emptyActions}>
            {q ? (
              <Text className={styles.emptyAction} onClick={() => setKeyword('')}>
                清除搜索
              </Text>
            ) : null}
            {status !== 'all' ? (
              <Text className={styles.emptyAction} onClick={() => setStatus('all')}>
                看全部状态
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {items.length ? (
        <Text className={styles.footNote}>
          {`已显示 ${items.length} / ${total} 本`}
        </Text>
      ) : null}

      {!loading && hasMore ? (
        <View
          className={styles.loadMore}
          onClick={() => void loadList({ ticketTypeId, status, q }, 'more', items.length)}
        >
          <Text>加载更多</Text>
        </View>
      ) : null}
    </View>
  )
}
