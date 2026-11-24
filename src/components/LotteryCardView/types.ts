/** 单张彩种卡片的展示数据：加载中 / 已开奖 / 暂无数据 */

interface LotteryCardBase {
  /** 稳定标识，用作渲染 key 与列表替换 */
  id: string
  /** 彩种名称，如「双色球」 */
  name: string
}

/** 已开奖：期号与日期已是展示文案，组件不再二次格式化 */
export interface DrawnLotteryCard extends LotteryCardBase {
  status: 'drawn'
  /** 已格式化的期号，如「2026132期」 */
  issue: string
  /** 已格式化的开奖日期，如「11-17 周二」 */
  drawDate: string
  /** 红球/主号码 */
  redNumbers: readonly string[]
  /** 蓝球/附加号码，无则为空数组 */
  blueNumbers: readonly string[]
}

/** 接口还没回来时的占位卡片 */
export interface LoadingLotteryCard extends LotteryCardBase {
  status: 'loading'
}

/** 当期没有开奖数据 */
export interface UnavailableLotteryCard extends LotteryCardBase {
  status: 'unavailable'
}

export type LotteryCardItem = DrawnLotteryCard | LoadingLotteryCard | UnavailableLotteryCard
