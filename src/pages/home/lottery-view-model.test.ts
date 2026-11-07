import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLoadingCards, toCardView } from './lottery-view-model'

test('初始生成八张按既定顺序的加载卡片', () => {
  const cards = createLoadingCards()

  assert.deepEqual(
    cards.map(({ code, name, numberType, status }) => [code, name, numberType, status]),
    [
      ['dlt', '大乐透', 'red-blue', 'loading'],
      ['pl3', '排列三', 'single', 'loading'],
      ['pl5', '排列五', 'single', 'loading'],
      ['qxc', '七星彩', 'red-blue', 'loading'],
      ['ssq', '双色球', 'red-blue', 'loading'],
      ['qlc', '七乐彩', 'red-blue', 'loading'],
      ['fc3d', '福彩3D', 'single', 'loading'],
      ['kl8', '快乐8', 'single', 'loading'],
    ]
  )
})

test('已开奖结果映射为 drawn 卡片，保留日期期号与号码分区', () => {
  const card = toCardView({
    gameCode: 'dlt',
    status: 'drawn',
    result: {
      gameCode: 'dlt',
      name: '超级大乐透',
      issue: '26126',
      drawDate: '2026-11-04',
      redNumbers: ['05', '11', '17', '25', '34'],
      blueNumbers: ['04', '06'],
    },
  })

  assert.deepEqual(card, {
    code: 'dlt',
    name: '大乐透',
    numberType: 'red-blue',
    status: 'drawn',
    drawDate: '2026-11-04',
    issue: '26126',
    redNumbers: ['05', '11', '17', '25', '34'],
    blueNumbers: ['04', '06'],
  })
})

test('暂无数据映射为 unavailable 卡片', () => {
  const card = toCardView({ gameCode: 'ssq', status: 'unavailable' })

  assert.deepEqual(card, {
    code: 'ssq',
    name: '双色球',
    numberType: 'red-blue',
    status: 'unavailable',
  })
})
