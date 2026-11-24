import type { SportMatchResult, TraditionalDraw } from '@/api/lottery/results'

/** 竞彩赛果卡列表：足球与篮球同构，页面与海报共用 */
export interface MatchCardViewProps {
  matches: readonly SportMatchResult[]
  /** 追加到列表根节点的类名 */
  className?: string
}

/** 传统足彩 14 场期次卡 */
export interface TraditionalCardViewProps {
  draw: TraditionalDraw
  /** 追加到根节点的类名 */
  className?: string
}
