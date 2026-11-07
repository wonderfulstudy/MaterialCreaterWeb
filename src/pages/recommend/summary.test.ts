import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractDate, formatDateKey, groupRecentSummaries, summarize, type SummaryRow } from './summary'

const NOW = new Date(2026, 10, 6, 14, 0, 0)

test('日期识别支持常见写法', () => {
  assert.equal(extractDate('开奖 2026-11-06 20:30', NOW), '2026-11-06')
  assert.equal(extractDate('2026/11/5', NOW), '2026-11-05')
  assert.equal(extractDate('2026.11.4', NOW), '2026-11-04')
  assert.equal(extractDate('2026年11月3日 开奖', NOW), '2026-11-03')
  assert.equal(extractDate('期号20261102', NOW), '2026-11-02')
  assert.equal(extractDate('11月5日 方案', NOW), '2026-11-05')
})

test('只有月日且日期在未来时回退到上一年', () => {
  assert.equal(extractDate('12-31 截止', NOW), '2025-12-31')
})

test('无日期或非法日期返回 undefined', () => {
  assert.equal(extractDate('大乐透 开奖', NOW), undefined)
  assert.equal(extractDate('13-45', NOW), undefined)
})

test('汇总取首行为标题、日期列去重后作为方案', () => {
  assert.deepEqual(
    summarize(
      '大乐透 第26001期\n开奖日期 2026-11-05\n前区 03 08 15 22 31\n后区 05 10',
      '素材 1',
      NOW
    ),
    { title: '大乐透 第26001期', date: '2026-11-05', plan: '前区 03 08 15 22 31 / 后区 05 10' }
  )

  assert.deepEqual(summarize('排列三 第26296期\n2026-11-06', '素材 2', NOW), {
    title: '排列三 第26296期',
    date: '2026-11-06',
    plan: '—',
  })

  assert.deepEqual(summarize('', '素材 3', NOW), { title: '素材 3', date: '2026-11-06', plan: '—' })
})

test('只保留最近两日并按日期倒序分组', () => {
  const rows: SummaryRow[] = [
    { id: 'a', title: '今日A', date: '2026-11-06', plan: 'p1' },
    { id: 'b', title: '昨日B', date: '2026-11-05', plan: 'p2' },
    { id: 'c', title: '前日C', date: '2026-11-04', plan: 'p3' },
    { id: 'd', title: '今日D', date: '2026-11-06', plan: 'p4' },
  ]

  const groups = groupRecentSummaries(rows, NOW, 2)
  assert.deepEqual(
    groups.map((group) => group.date),
    ['2026-11-06', '2026-11-05']
  )
  assert.deepEqual(
    groups.map((group) => group.rows.map((row) => row.title)),
    [['今日A', '今日D'], ['昨日B']]
  )
})

test('跨月时最近两日仍然连续', () => {
  const rows: SummaryRow[] = [
    { id: 'x', title: '上月', date: '2026-10-31', plan: 'p' },
    { id: 'y', title: '本月', date: '2026-11-01', plan: 'p' },
  ]

  assert.deepEqual(
    groupRecentSummaries(rows, new Date(2026, 10, 1), 2).map((group) => group.date),
    ['2026-11-01', '2026-10-31']
  )
})

test('日期格式补零', () => {
  assert.equal(formatDateKey(new Date(2026, 0, 5)), '2026-01-05')
})
