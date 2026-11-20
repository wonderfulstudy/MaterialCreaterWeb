import { useEffect, useRef, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import classnames from 'classnames'
import styles from './index.module.scss'

export interface RenameDialogProps {
  /** 是否展示弹窗 */
  visible: boolean
  /** 当前名称，每次打开时作为输入框初始值 */
  name: string
  /** 弹窗标题 */
  title?: string
  /** 名称最大长度 */
  maxlength?: number
  /** 点击遮罩、关闭按钮或取消按钮时回调 */
  onCancel: () => void
  /** 点击确定时回调，参数为去除首尾空格后的名称（保证非空） */
  onConfirm: (name: string) => void
}

/**
 * 修改名称弹窗：长按推单卡片后居中弹出，输入新名称后确定。
 * 草稿由组件内部维护，每次打开时以 name 重置。
 *
 * 用法：
 * ```tsx
 * <RenameDialog
 *   visible={Boolean(renameId)}
 *   name={target?.name ?? ''}
 *   onCancel={() => setRenameId('')}
 *   onConfirm={(name) => rename(renameId, name)}
 * />
 * ```
 */
export default function RenameDialog({
  visible,
  name,
  title = '修改方案名称',
  maxlength = 20,
  onCancel,
  onConfirm,
}: RenameDialogProps) {
  const [draft, setDraft] = useState(name)
  const [prevVisible, setPrevVisible] = useState(visible)
  /** 键盘高度（px），弹窗据此整体上移，避免被键盘遮挡 */
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const openedAt = useRef(0)

  // 打开瞬间在渲染期同步草稿，避免 useEffect 慢一帧导致输入框闪现旧值
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) {
      setDraft(name)
      openedAt.current = Date.now()
    }
  }

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0)
      return
    }
    if (typeof Taro.onKeyboardHeightChange !== 'function') {
      return
    }
    const handleKeyboard = (res: { height: number }) => setKeyboardHeight(res.height || 0)
    try {
      Taro.onKeyboardHeightChange(handleKeyboard)
    } catch {
      // 部分平台不支持键盘高度监听，退化为居中展示
      return
    }
    return () => {
      try {
        Taro.offKeyboardHeightChange?.(handleKeyboard)
      } catch {
        // 忽略不支持监听的平台
      }
    }
  }, [visible])

  if (!visible) {
    return null
  }

  const trimmed = draft.trim()
  const canSubmit = Boolean(trimmed)

  const handleMaskClick = () => {
    // 长按松手后补发的幽灵 click 会落在刚出现的遮罩上，吞掉它避免弹窗秒关
    if (Date.now() - openedAt.current < 400) {
      return
    }
    onCancel()
  }

  const handleSubmit = () => {
    if (canSubmit) {
      onConfirm(trimmed)
    }
  }

  return (
    <View
      className={styles.mask}
      style={keyboardHeight ? { paddingBottom: `${keyboardHeight}px` } : undefined}
    >
      <View className={styles.backdrop} onClick={handleMaskClick} catchMove />
      <View className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <View className={styles.head}>
          <Text className={styles.title}>{title}</Text>
          <View className={styles.close} onClick={onCancel}>
            <Text className={styles.closeText}>✕</Text>
          </View>
        </View>

        <View className={styles.inputBox}>
          <Input
            className={styles.input}
            value={draft}
            maxlength={maxlength}
            focus
            confirmType="done"
            onInput={(event) => setDraft(event.detail.value)}
            onConfirm={handleSubmit}
          />
        </View>

        <View className={styles.meta}>
          <Text className={styles.hint}>名称为空时将不会保存</Text>
          <Text
            className={classnames(styles.counter, draft.length >= maxlength && styles.counterFull)}
          >
            {draft.length}/{maxlength}
          </Text>
        </View>

        <View className={styles.actions}>
          <View className={styles.cancel} onClick={onCancel}>
            <Text className={styles.cancelText}>取消</Text>
          </View>
          <View
            className={classnames(styles.ok, !canSubmit && styles.okDisabled)}
            onClick={handleSubmit}
          >
            <Text className={classnames(styles.okText, !canSubmit && styles.okDisabledText)}>
              确定
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
