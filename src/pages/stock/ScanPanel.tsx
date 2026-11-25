import { Input, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import type { TicketType } from '@/api/business/stock'
import { centsToYuan } from '@/api/business/sales'
import styles from './index.module.scss'

export type ScanMode = 'in' | 'out'

export interface ScanState {
  mode: ScanMode
  step: 'input' | 'confirm'
  /** 手输/扫码拿到的原始串，仅用于回填输入框 */
  code: string
  /** parseTicketBookNo 解析出的 15 位本号 */
  bookNo: string
  ticketTypeId: number | null
  message: string
}

/** 361052000153200 → 3610 5200 0153 200 */
export function formatBookNo(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

interface ScanPanelProps {
  scan: ScanState
  isH5: boolean
  ticketTypes: TicketType[]
  typesLoading: boolean
  typesError: string
  selectedTypeId: number | null
  submitting: boolean
  onChangeCode: (value: string) => void
  onSelectType: (id: number) => void
  onRetryTypes: () => void
  onClose: () => void
  onSubmitInput: () => void
  onConfirm: () => void
}

/**
 * 扫码面板：H5 直接进手输步骤，weapp 由父页先调 Taro.scanCode 再带本号进来。
 * 入库未定票种时在这里选票种（FR-18）；出库只确认本号（FR-19）。
 */
export default function ScanPanel(props: ScanPanelProps) {
  const {
    scan,
    isH5,
    ticketTypes,
    typesLoading,
    typesError,
    selectedTypeId,
    submitting,
    onChangeCode,
    onSelectType,
    onRetryTypes,
    onClose,
    onSubmitInput,
    onConfirm,
  } = props

  const title = scan.mode === 'in' ? '扫码入库' : '扫码出库'

  return (
    <View className={styles.mask}>
      <View className={styles.sheet}>
        <View className={styles.sheetHead}>
          <Text className={styles.sheetTitle}>{title}</Text>
          <Text className={styles.sheetClose} onClick={onClose}>
            ✕
          </Text>
        </View>

        {scan.step === 'input' ? (
          <View className={styles.sheetBody}>
            <Text className={styles.sheetHint}>
              {isH5
                ? 'H5 调试端：请手动输入票面票号，可输完整 20 位、18 位或 15 位本号'
                : '把票面上的二维码放进取景框；也可以手动输入票号'}
            </Text>
            <Input
              className={styles.codeInput}
              value={scan.code}
              placeholder="如 36105200015320004358"
              placeholderClass={styles.codePlaceholder}
              onInput={(event) => onChangeCode(event.detail.value)}
            />
            {scan.message ? <Text className={styles.sheetError}>{scan.message}</Text> : null}
            <View className={styles.sheetActions}>
              <View className={classnames(styles.btn, styles.btnGhost)} onClick={onClose}>
                <Text>取消</Text>
              </View>
              <View className={classnames(styles.btn, styles.btnPrimary)} onClick={onSubmitInput}>
                <Text>识别票号</Text>
              </View>
            </View>
          </View>
        ) : (
          <View className={styles.sheetBody}>
            <Text className={styles.sheetHint}>已识别到本号</Text>
            <Text className={styles.scanBookNo}>{formatBookNo(scan.bookNo)}</Text>
            <Text className={styles.bookNote}>
              {scan.mode === 'in' ? '按整本入库，入库后在库 +1 本' : '按整本出库，出库后在库 −1 本'}
            </Text>

            {scan.mode === 'in' ? (
              <View className={styles.typePickList}>
                <Text className={styles.pickLabel}>选择票种</Text>
                {typesLoading ? <Text className={styles.sheetHint}>票种加载中…</Text> : null}
                {typesError ? (
                  <View className={styles.inlineError}>
                    <Text className={styles.inlineErrorText}>{typesError}</Text>
                    <Text className={styles.inlineErrorAction} onClick={onRetryTypes}>
                      重试
                    </Text>
                  </View>
                ) : null}
                {!typesLoading && !typesError && ticketTypes.length === 0 ? (
                  <Text className={styles.sheetHint}>没有可用票种，请先到票种管理新增或启用</Text>
                ) : null}
                {ticketTypes.map((type) => {
                  const active = selectedTypeId === type.id
                  return (
                    <View
                      key={type.id}
                      className={classnames(styles.pickItem, active && styles.pickItemOn)}
                      onClick={() => onSelectType(type.id)}
                    >
                      <View className={classnames(styles.radio, active && styles.radioOn)} />
                      <View className={styles.pickInfo}>
                        <Text className={styles.pickName}>{type.name}</Text>
                        <Text className={styles.pickMeta}>
                          {`¥${centsToYuan(type.faceCents)}/张 · 整本 ${type.sheetsPerBook} 张 · ¥${centsToYuan(type.bookCents)}/本`}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <Text className={styles.bookNote}>
                出库按整本登记：在库 −1 本并写一条出库记录；不在库的本会提示「该本不在库」。
              </Text>
            )}

            {scan.message ? <Text className={styles.sheetError}>{scan.message}</Text> : null}

            <View className={styles.sheetActions}>
              <View className={classnames(styles.btn, styles.btnGhost)} onClick={onClose}>
                <Text>取消</Text>
              </View>
              <View
                className={classnames(
                  styles.btn,
                  styles.btnPrimary,
                  submitting && styles.btnDisabled,
                )}
                onClick={onConfirm}
              >
                <Text>
                  {submitting ? '提交中…' : scan.mode === 'in' ? '确认入库' : '确认出库'}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
