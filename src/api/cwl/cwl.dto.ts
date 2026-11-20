// 福彩接口原始数据模型
export interface CwlHistory {
    state: number
    message: string
    Tflag: number
    result: {
        name: string
        code: string
        date: string
        red: string
        blue: string
    }[]
}
