// 体彩原始数据结构
// 真实响应中奖期列表位于 value.list 下（2026-11-05 实测）
export interface LotteryHistory {
    dataFrom: string
    emptyFlag: Boolean
    errorCode: string
    errorMessage: string
    success: Boolean
    value: {
        list: {
            lotteryDrawNum: string
            lotteryDrawResult: string
            lotteryDrawTime: string
            lotteryGameName: string
            lotteryGameNum: string
        }[]
    }
}