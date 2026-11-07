import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { LATEST_LOTTERIES, mapCwlHistory, mapLotteryHistory } from './lottery.model'
import type { CwlHistory } from '../api/cwl.dto'
import type { LotteryHistory } from '../api/lottery.dto'

// 真实福彩双色球接口响应（2026-11-05 抓取，仅保留应用读取的字段）
// 注意 date 带星期后缀 "(二)"，需在模型层归一化
const ssqFixture: CwlHistory = {
  state: 0,
  message: '查询成功',
  Tflag: 0,
  result: [
    {
      name: '双色球',
      code: '2026126',
      date: '2026-11-03(二)',
      red: '09,10,13,22,29,32',
      blue: '12',
    },
    {
      name: '双色球',
      code: '2026125',
      date: '2026-10-30(五)',
      red: '03,08,15,22,31',
      blue: '04,12',
    },
  ],
}

test('将福彩双色球 DTO 映射为内部 LotteryResult', () => {
  const results = mapCwlHistory(ssqFixture, 'ssq')

  assert.equal(results.length, 2)
  assert.deepEqual(results[0], {
    gameCode: 'ssq',
    name: '双色球',
    issue: '2026126',
    drawDate: '2026-11-03',
    redNumbers: ['09', '10', '13', '22', '29', '32'],
    blueNumbers: ['12'],
  })
})

test('福彩 date 去掉星期后缀，保留号码前导零与红蓝分区', () => {
  const results = mapCwlHistory(ssqFixture, 'ssq')

  assert.equal(results[1].drawDate, '2026-10-30')
  // 红球首号为 "03"，不能被转成数字丢失前导零
  assert.equal(results[1].redNumbers[0], '03')
  assert.deepEqual(results[1].redNumbers, ['03', '08', '15', '22', '31'])
  assert.deepEqual(results[1].blueNumbers, ['04', '12'])
})

test('蓝球为空时返回空数组而非 undefined', () => {
  // 真实福彩3D响应：blue 为空串
  const dto: CwlHistory = {
    state: 0,
    message: '查询成功',
    Tflag: 0,
    result: [
      { name: '3D', code: '2026294', date: '2026-11-04(三)', red: '2,6,1', blue: '' },
    ],
  }

  const results = mapCwlHistory(dto, 'fc3d')

  assert.deepEqual(results[0].redNumbers, ['2', '6', '1'])
  assert.deepEqual(results[0].blueNumbers, [])
})

// 真实体彩大乐透接口响应（2026-11-05 抓取，仅保留应用读取的字段）
// 注意：列表在 value.list 下，不是顶层 list
const dltFixture: LotteryHistory = {
  dataFrom: '',
  emptyFlag: false,
  errorCode: '0',
  errorMessage: '处理成功',
  success: true,
  value: {
    list: [
      {
        lotteryDrawNum: '26126',
        lotteryDrawResult: '05 11 17 25 34 04 06',
        lotteryDrawTime: '2026-11-04',
        lotteryGameName: '超级大乐透',
        lotteryGameNum: '85',
      },
    ],
  },
}

test('将体彩大乐透 DTO 映射为内部 LotteryResult（5 红 + 2 蓝）', () => {
  const results = mapLotteryHistory(dltFixture, 'dlt')

  assert.equal(results.length, 1)
  assert.deepEqual(results[0], {
    gameCode: 'dlt',
    name: '超级大乐透',
    issue: '26126',
    drawDate: '2026-11-04',
    redNumbers: ['05', '11', '17', '25', '34'],
    blueNumbers: ['04', '06'],
  })
})

test('体彩单组号码彩种全部映射为红球且蓝球为空', () => {
  // 真实排列3响应：lotteryDrawResult 为 "3 2 9"
  const pl3Fixture: LotteryHistory = {
    ...dltFixture,
    value: {
      list: [
        {
          lotteryDrawNum: '26294',
          lotteryDrawResult: '3 2 9',
          lotteryDrawTime: '2026-11-04',
          lotteryGameName: '排列3',
          lotteryGameNum: '35',
        },
      ],
    },
  }

  const results = mapLotteryHistory(pl3Fixture, 'pl3')

  assert.deepEqual(results[0].redNumbers, ['3', '2', '9'])
  assert.deepEqual(results[0].blueNumbers, [])
})

test('七星彩按 6 红 + 1 蓝拆分', () => {
  // 真实7星彩响应：lotteryDrawResult 为 "3 3 3 4 1 7 8"
  const qxcFixture: LotteryHistory = {
    ...dltFixture,
    value: {
      list: [
        {
          lotteryDrawNum: '26126',
          lotteryDrawResult: '3 3 3 4 1 7 8',
          lotteryDrawTime: '2026-11-03',
          lotteryGameName: '7星彩',
          lotteryGameNum: '04',
        },
      ],
    },
  }

  const results = mapLotteryHistory(qxcFixture, 'qxc')

  assert.deepEqual(results[0].redNumbers, ['3', '3', '3', '4', '1', '7'])
  assert.deepEqual(results[0].blueNumbers, ['8'])
})

test('定义首页八种彩票及顺序', () => {
  assert.deepEqual(
    LATEST_LOTTERIES.map(({ code, name, numberType }) => [code, name, numberType]),
    [
      ['dlt', '大乐透', 'red-blue'],
      ['pl3', '排列三', 'single'],
      ['pl5', '排列五', 'single'],
      ['qxc', '七星彩', 'red-blue'],
      ['ssq', '双色球', 'red-blue'],
      ['qlc', '七乐彩', 'red-blue'],
      ['fc3d', '福彩3D', 'single'],
      ['kl8', '快乐8', 'single'],
    ]
  )
})

test('福彩接口间歇返回 null 时 mapper 不崩溃，返回空数组', () => {
  // 实测 cwl.gov.cn 偶发返回 null 响应体（反爬/限流），
  // 曾导致 Cannot read properties of null (reading 'result')
  assert.deepEqual(mapCwlHistory(null as unknown as CwlHistory, 'ssq'), [])
  assert.deepEqual(
    mapCwlHistory({ state: 0, message: '', Tflag: 0, result: null } as unknown as CwlHistory, 'ssq'),
    []
  )
})

test('体彩接口返回 null 或缺少 value.list 时 mapper 不崩溃，返回空数组', () => {
  assert.deepEqual(mapLotteryHistory(null as unknown as LotteryHistory, 'dlt'), [])
  assert.deepEqual(
    mapLotteryHistory({ success: true, value: null } as unknown as LotteryHistory, 'dlt'),
    []
  )
})

test('快乐8 二十个号码全部映射为红球且蓝球为空', () => {
  // 真实快乐8响应：red 为 20 个逗号分隔号码，blue 为空串
  const kl8Fixture: CwlHistory = {
    state: 0,
    message: '查询成功',
    Tflag: 0,
    result: [
      {
        name: '快乐8',
        code: '2026294',
        date: '2026-11-04(三)',
        red: '03,07,10,16,21,25,29,33,35,43,45,52,58,60,64,68,69,72,76,80',
        blue: '',
      },
    ],
  }

  const results = mapCwlHistory(kl8Fixture, 'kl8')

  assert.equal(results[0].drawDate, '2026-11-04')
  assert.equal(results[0].redNumbers.length, 20)
  assert.equal(results[0].redNumbers[0], '03')
  assert.deepEqual(results[0].blueNumbers, [])
})
