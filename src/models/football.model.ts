// 竞彩足球计算器接口返回的单场比赛结构

// 胜平负 / 让球胜平负 赔率
export interface OddsHda {
  goalLine: string
  goalLineValue: string
  h: string
  d: string
  a: string
  // 赔率开关：1 表示该玩法暂停投注
  hf?: string
  df?: string
  af?: string
  updateDate?: string
  updateTime?: string
}

// 半全场赔率
export interface OddsHafu {
  goalLine: string
  goalLineValue: string
  hh: string
  hd: string
  ha: string
  dh: string
  dd: string
  da: string
  ah: string
  ad: string
  aa: string
  updateDate?: string
  updateTime?: string
}

// 总进球赔率（s7 为 7+ 球）
export interface OddsTtg {
  goalLine: string
  goalLineValue: string
  s0: string
  s1: string
  s2: string
  s3: string
  s4: string
  s5: string
  s6: string
  s7: string
  updateDate?: string
  updateTime?: string
}

// 比分赔率
export interface OddsCrs {
  goalLine: string
  goalLineValue: string
  s01s00: string
  s02s00: string
  s02s01: string
  s03s00: string
  s03s01: string
  s03s02: string
  s04s00: string
  s04s01: string
  s04s02: string
  s05s00: string
  s05s01: string
  s05s02: string
  s1sh: string
  s00s00: string
  s01s01: string
  s02s02: string
  s03s03: string
  s1sd: string
  s00s01: string
  s00s02: string
  s00s03: string
  s00s04: string
  s00s05: string
  s01s02: string
  s01s03: string
  s01s04: string
  s01s05: string
  s02s03: string
  s02s04: string
  s02s05: string
  s1sa: string
  updateDate?: string
  updateTime?: string
}

// 竞篮胜负 / 让分胜负（无平局）
export interface OddsMnl {
  goalLine: string
  goalLineValue: string
  h: string
  a: string
  hf?: string
  af?: string
  updateDate?: string
  updateTime?: string
}

// 大小分赔率
export interface OddsHilo {
  goalLine: string
  goalLineValue: string
  h: string
  l: string
  hf?: string
  lf?: string
  updateDate?: string
  updateTime?: string
}

// 胜分差赔率（w 主胜分差 / l 客胜分差，1~6 档）
export interface OddsWnm {
  goalLine: string
  goalLineValue: string
  w1: string
  w2: string
  w3: string
  w4: string
  w5: string
  w6: string
  l1: string
  l2: string
  l3: string
  l4: string
  l5: string
  l6: string
  updateDate?: string
  updateTime?: string
}

// 单场比赛（竞足字段必有，竞篮字段可选）
export interface SingleMatch {
  matchId: number
  matchNum: number
  matchNumStr: string
  matchWeek: string
  matchDate: string
  matchTime: string
  businessDate: string
  matchNumDate: string
  matchStatus: string
  sellStatus?: string
  isHide: number
  isHot: number
  // 1 表示支持单关投注
  bettingSingle: number
  bettingAllUp: number
  backColor: string
  groupName: string
  leagueId: number
  leagueCode: string
  leagueAbbName: string
  leagueAllName: string
  homeTeamId: number
  homeTeamCode: string
  homeTeamAbbName: string
  homeTeamAbbEnName: string
  homeTeamAllName: string
  homeRank: string
  awayTeamId: number
  awayTeamCode: string
  awayTeamAbbName: string
  awayTeamAbbEnName: string
  awayTeamAllName: string
  awayRank: string
  had: OddsHda
  hhad: OddsHda
  hafu: OddsHafu
  ttg: OddsTtg
  crs: OddsCrs
  mnl?: OddsMnl
  hdc?: OddsMnl
  hilo?: OddsHilo
  wnm?: OddsWnm
}
