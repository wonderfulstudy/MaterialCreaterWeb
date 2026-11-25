import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import classnames from 'classnames'
import { ApiError } from '@/api/client'
import {
  fetchStockOverview,
  fetchTicketTypes,
  saveTicketType,
  type StockOverviewType,
  type TicketType,
} from '@/api/business/stock'
import { centsToYuan, yuanToCents } from '@/api/business/sales'
import styles from './index.module.scss'

interface DraftState {
  id: number | null
  name: string
  faceYuan: string
  sheets: string
  enabled: boolean
}

interface DraftErrors {
  name?: string
  face?: string
  sheets?: string
}

const EMPTY_DRAFT: DraftState = { id: null, name: '', faceYuan: '', sheets: '', enabled: true }

function draftOf(type: TicketType): DraftState {
  return {
    id: type.id,
    name: type.name,
    faceYuan: centsToYuan(type.faceCents),
    sheets: String(type.sheetsPerBook),
    enabled: type.enabled,
  }
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === -5) return '票种不存在或已停用'
    if (error.code === -1) return '票种参数校验失败，请检查名称、面额与整本规格'
    return error.message || '保存失败，请重试'
  }
  return '网络异常，请重试'
}

export default function TicketTypesPage() {
  const firstShow = useRef(true)

  const [types, setTypes] = useState<TicketType[]>([])
  const [stockMap, setStockMap] = useState<Record<number, StockOverviewType>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, overview] = await Promise.all([fetchTicketTypes(), fetchStockOverview()])
      const map: Record<number, StockOverviewType> = {}
      ;(overview.types || []).forEach((item) => {
        map[item.id] = item
      })
      setTypes(list)
      setStockMap(map)
    } catch {
      setError('票种列表加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false
      return
    }
    void loadAll()
  })

  // 实时整本金额 = 面额 × 整本规格，由系统算，不可手填
  const liveBookCents = useMemo(() => {
    if (!draft) return null
    const cents = yuanToCents(draft.faceYuan)
    const sheets = Number(draft.sheets)
    if (cents === null || cents <= 0) return null
    if (!Number.isFinite(sheets) || sheets <= 0 || !Number.isInteger(sheets)) return null
    return cents * sheets
  }, [draft])

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT })
    setDraftErrors({})
    setSaveError('')
  }

  const openEdit = (type: TicketType) => {
    setDraft(draftOf(type))
    setDraftErrors({})
    setSaveError('')
  }

  const closeDraft = () => {
    setDraft(null)
    setDraftErrors({})
    setSaveError('')
  }

  const patchDraft = (patch: Partial<DraftState>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setSaveError('')
  }

  const validate = (): { errors: DraftErrors; faceCents: number; sheets: number } => {
    const errors: DraftErrors = {}
    const name = (draft?.name || '').trim()
    if (!name) errors.name = '票种名称不能为空'

    const faceCents = draft ? yuanToCents(draft.faceYuan) : null
    if (faceCents === null) {
      errors.face = '请输入正确的面额，最多两位小数'
    } else if (faceCents <= 0) {
      errors.face = '面额必须大于 0'
    }

    const sheets = Number(draft?.sheets)
    if (!draft?.sheets?.trim()) {
      errors.sheets = '请输入整本规格'
    } else if (!Number.isInteger(sheets)) {
      errors.sheets = '整本规格必须是整数'
    } else if (sheets <= 0) {
      errors.sheets = '整本规格必须大于 0'
    }

    return { errors, faceCents: faceCents ?? 0, sheets }
  }

  const submitDraft = async () => {
    if (!draft || saving) return
    const { errors, faceCents, sheets } = validate()
    setDraftErrors(errors)
    if (Object.keys(errors).length) return

    setSaving(true)
    setSaveError('')
    try {
      await saveTicketType({
        id: draft.id ?? undefined,
        name: draft.name.trim(),
        faceCents,
        sheetsPerBook: sheets,
        enabled: draft.enabled,
      })
      void Taro.showToast({ title: '保存成功', icon: 'success' })
      closeDraft()
      void loadAll()
    } catch (err) {
      setSaveError(saveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <Text className={styles.headerTitle}>票种管理</Text>
        <Text className={styles.headerHint}>
          面额与整本规格由票种决定，整本金额系统按面额 × 规格自动计算
        </Text>
      </View>

      {error ? (
        <View className={styles.errorBar}>
          <Text className={styles.errorText}>{error}</Text>
          <Text className={styles.errorAction} onClick={() => void loadAll()}>
            重试
          </Text>
        </View>
      ) : null}

      {loading && !types.length ? <Text className={styles.placeholder}>加载中…</Text> : null}

      <View className={styles.list}>
        {types.map((type) => (
          <View key={type.id} className={styles.item} onClick={() => openEdit(type)}>
            <View className={styles.itemMain}>
              <View className={styles.itemNameRow}>
                <Text className={styles.itemName}>{type.name}</Text>
                {!type.enabled ? <Text className={styles.itemOff}>已停用</Text> : null}
              </View>
              <Text className={styles.itemMeta}>
                {`¥${centsToYuan(type.faceCents)}/张 · 整本 ${type.sheetsPerBook} 张 · ¥${centsToYuan(type.bookCents)}/本`}
              </Text>
            </View>
            <View className={styles.itemRight}>
              <Text className={styles.itemCount}>
                {`在库 ${stockMap[type.id]?.inStockBooks ?? 0} 本`}
              </Text>
              <Text className={styles.itemAction}>编辑 ›</Text>
            </View>
          </View>
        ))}
      </View>

      {!loading && !types.length && !error ? (
        <Text className={styles.placeholder}>还没有票种，点下面「新增票种」开始</Text>
      ) : null}

      <View className={styles.footbar}>
        <View className={styles.addBtn} onClick={openCreate}>
          <Text>新增票种</Text>
        </View>
      </View>

      {draft ? (
        <View className={styles.mask}>
          <View className={styles.sheet}>
            <View className={styles.sheetHead}>
              <Text className={styles.sheetTitle}>{draft.id ? '编辑票种' : '新增票种'}</Text>
              <Text className={styles.sheetClose} onClick={closeDraft}>
                ✕
              </Text>
            </View>

            <View className={styles.field}>
              <Text className={styles.fieldLabel}>票种名称</Text>
              <Input
                className={styles.fieldInput}
                value={draft.name}
                placeholder="如 绿茵冠军 10 元"
                placeholderClass={styles.fieldPlaceholder}
                onInput={(event) => patchDraft({ name: event.detail.value })}
              />
              {draftErrors.name ? (
                <Text className={styles.fieldError}>{draftErrors.name}</Text>
              ) : null}
            </View>

            <View className={styles.field}>
              <Text className={styles.fieldLabel}>单张面额（元）</Text>
              <Input
                className={styles.fieldInput}
                value={draft.faceYuan}
                type="digit"
                placeholder="如 10"
                placeholderClass={styles.fieldPlaceholder}
                onInput={(event) => patchDraft({ faceYuan: event.detail.value })}
              />
              {draftErrors.face ? (
                <Text className={styles.fieldError}>{draftErrors.face}</Text>
              ) : null}
            </View>

            <View className={styles.field}>
              <Text className={styles.fieldLabel}>整本规格（一本多少张）</Text>
              <Input
                className={styles.fieldInput}
                value={draft.sheets}
                type="number"
                placeholder="如 60"
                placeholderClass={styles.fieldPlaceholder}
                onInput={(event) => patchDraft({ sheets: event.detail.value })}
              />
              {draftErrors.sheets ? (
                <Text className={styles.fieldError}>{draftErrors.sheets}</Text>
              ) : null}
            </View>

            <View className={styles.field}>
              <Text className={styles.fieldLabel}>整本金额（系统计算）</Text>
              <Text className={styles.bookAmount}>
                {liveBookCents === null ? '—' : `¥${centsToYuan(liveBookCents)}`}
              </Text>
            </View>

            <View className={styles.switchRow} onClick={() => patchDraft({ enabled: !draft.enabled })}>
              <Text className={styles.fieldLabel}>启用该票种</Text>
              <View className={classnames(styles.switch, draft.enabled && styles.switchOn)}>
                <View className={classnames(styles.switchDot, draft.enabled && styles.switchDotOn)} />
              </View>
            </View>

            {saveError ? <Text className={styles.saveError}>{saveError}</Text> : null}

            <View className={styles.sheetActions}>
              <View className={classnames(styles.btn, styles.btnGhost)} onClick={closeDraft}>
                <Text>取消</Text>
              </View>
              <View
                className={classnames(
                  styles.btn,
                  styles.btnPrimary,
                  saving && styles.btnDisabled,
                )}
                onClick={() => void submitDraft()}
              >
                <Text>{saving ? '保存中…' : '保存'}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
