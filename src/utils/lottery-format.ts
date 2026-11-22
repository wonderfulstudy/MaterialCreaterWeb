/** 开奖数据的展示格式化：首页卡片与分享海报共用同一套规则 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** '2026-11-17' → '11-17 周二'；解析失败时原样返回 */
export function formatDrawDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return value
  }
  const weekday = new Date(year, month - 1, day).getDay()
  return `${pad(month)}-${pad(day)} 周${WEEKDAYS[weekday]}`
}

/** '2026132' → '2026132期'；已带单位时不重复追加 */
export function formatIssue(issue: string): string {
  return issue.endsWith('期') ? issue : `${issue}期`
}
