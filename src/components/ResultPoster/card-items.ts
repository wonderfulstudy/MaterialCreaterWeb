/**
 * 海报入参 → 共享卡片的视图模型。
 * 海报预览直接用 LotteryCardView 渲染这份数据，保存出去的图就是它。
 */
import type { LotteryCardItem } from '@/components/LotteryCardView/types'
import type { ResultPosterInput } from './types'

/** 彩种在弹层里的稳定标识：同名同期的两条数据视为同一项 */
export function posterKey(item: ResultPosterInput): string {
  return `${item.gameName}|${item.issue}`
}

/** 海报里的彩种都已是开奖结果，字段与卡片展示一一对应 */
export function toCardItems(results: readonly ResultPosterInput[]): LotteryCardItem[] {
  return results.map((item) => ({
    id: posterKey(item),
    name: item.gameName,
    status: 'drawn',
    issue: item.issue,
    drawDate: item.drawDate,
    redNumbers: item.redNumbers,
    blueNumbers: item.blueNumbers,
  }))
}
