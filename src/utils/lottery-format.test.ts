import { formatDrawDate, formatIssue } from './lottery-format'

describe('formatDrawDate', () => {
  it('把日期格式化成「月-日 周X」', () => {
    expect(formatDrawDate('2026-11-17')).toBe('11-17 周二')
  })

  it('补零到两位，跨年跨月也按本地日期算星期', () => {
    expect(formatDrawDate('2026-01-05')).toBe('01-05 周一')
    expect(formatDrawDate('2026-12-31')).toBe('12-31 周四')
  })

  it('解析不了时原样返回，不抛异常', () => {
    expect(formatDrawDate('')).toBe('')
    expect(formatDrawDate('待定')).toBe('待定')
    expect(formatDrawDate('2026/11/17')).toBe('2026/11/17')
  })
})

describe('formatIssue', () => {
  it('末尾补「期」', () => {
    expect(formatIssue('2026132')).toBe('2026132期')
  })

  it('已经带单位时不重复追加', () => {
    expect(formatIssue('2026132期')).toBe('2026132期')
  })
})
