import { SingleMatch } from "@/models/football.model"

export interface matchCalculator {
    dataFrom: string
    emptyFlag: Boolean
    errorCode: string
    errorMessage: string
    success: Boolean
    value: {
        totalCount: number
        lastUpdateTime: string
        matchInfoList: {
            businessDate: string
            weekday: string
            matchCount: number
            matchNumDate: string
            subMatchList: SingleMatch[]
        }[]
        matchDateList: {
            businessDate: string
            businessDateCn: string
            matchDate: string
            matchDateCn: string
        }[]
        leagueList: {
            leagueId: string
            leagueName: string
            leagueNameAbbr: string
        }[]
    }
}