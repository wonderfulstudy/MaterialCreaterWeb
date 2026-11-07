/** 一张素材图片的汇总信息 */
export interface MaterialSummary {
  /** 图片标题：取识别文本的首行 */
  title: string
  /** 日期：识别文本中的日期，取不到时用识别当天 */
  date: string
  /** 方案：除标题外的关键内容 */
  plan: string
}

export interface SummaryRow extends MaterialSummary {
  id: string
}

export interface SummaryGroup {
  date: string
  rows: SummaryRow[]
}

const MAX_TITLE_LENGTH = 18
const MAX_PLAN_LENGTH = 40

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Date → YYYY-MM-DD */
export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function toDateKey(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/**
 * 从识别文本中提取日期。
 * 支持 2026-11-06 / 2026/11/6 / 2026.11.6 / 2026年11月6日 / 20261106 / 11月6日。
 */
export function extractDate(text: string, now: Date = new Date()): string | undefined {
  const full = text.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/)
  if (full) {
    const key = toDateKey(Number(full[1]), Number(full[2]), Number(full[3]))
    if (key) {
      return key
    }
  }

  const compact = text.match(/(20\d{2})(\d{2})(\d{2})/)
  if (compact) {
    const key = toDateKey(Number(compact[1]), Number(compact[2]), Number(compact[3]))
    if (key) {
      return key
    }
  }

  const short = text.match(/(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/)
  if (short) {
    const month = Number(short[1])
    const day = Number(short[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = now.getFullYear()
      const candidate = new Date(year, month - 1, day)
      // 只写「月-日」且日期在未来时，按上一年的日期处理
      if (candidate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
        year -= 1
      }
      return toDateKey(year, month, day)
    }
  }

  return undefined
}

/** 标题取首个非空行 */
export function extractTitle(lines: string[], fallback: string): string {
  const first = lines.find((line) => line.trim().length > 0)
  if (!first) {
    return fallback
  }
  const title = first.trim()
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH)}…` : title
}

/** 去掉文本中的日期片段 */
function stripDatePatterns(value: string): string {
  return value
    .replace(/20\d{2}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?/g, '')
    .replace(/20\d{6}/g, '')
    .replace(/\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?/g, '')
}

/**
 * 判断某一行是否只是日期（含「开奖日期：2026-11-05」这类标签行）。
 * 这类内容已经体现在日期列里，不再重复进入方案。
 */
function isDateOnlyLine(line: string): boolean {
  const remainder = stripDatePatterns(line)
    .replace(/(?:(?:开奖|兑奖|派奖|截止|开始|发布|更新)\s*)*(?:日期|时间)/g, '')
    .replace(/[\s:：,，.。;；()（）\-/]/g, '')

  return remainder.length < 2
}

/** 方案取标题之外、带数字或方案关键词的内容 */
export function extractPlan(lines: string[]): string {
  const titleLine = lines.find((line) => line.trim().length > 0) ?? ''
  const rest = lines.filter((line) => {
    const value = line.trim()
    if (!value || value === titleLine.trim()) {
      return false
    }
    return !isDateOnlyLine(value)
  })

  if (!rest.length) {
    return '—'
  }

  const keywords = /(号码|注|元|方案|复式|胆拖|追加|期)/
  const preferred = rest.filter((line) => /\d/.test(line) || keywords.test(line))
  const picked = preferred.length ? preferred : rest
  const joined = picked.join(' / ').trim()

  return joined.length > MAX_PLAN_LENGTH ? `${joined.slice(0, MAX_PLAN_LENGTH)}…` : joined
}

/** 把一张图片的识别文本汇总成表格行 */
export function summarize(
  text: string,
  fallbackTitle: string,
  now: Date = new Date()
): MaterialSummary {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    title: extractTitle(lines, fallbackTitle),
    date: extractDate(text, now) ?? formatDateKey(now),
    plan: extractPlan(lines),
  }
}

/**
 * 只保留最近若干天（默认最近两日）的汇总，并按日期倒序分组。
 * 没有数据的日期不会出现在结果里。
 */
export function groupRecentSummaries(
  rows: SummaryRow[],
  now: Date = new Date(),
  days = 2
): SummaryGroup[] {
  const allowKeys: string[] = []
  for (let i = 0; i < days; i += 1) {
    allowKeys.push(formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)))
  }

  const buckets = new Map<string, SummaryRow[]>()
  allowKeys.forEach((key) => buckets.set(key, []))

  rows.forEach((row) => {
    const bucket = buckets.get(row.date)
    if (bucket) {
      bucket.push(row)
    }
  })

  return allowKeys
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => ({ date: key, rows: buckets.get(key) as SummaryRow[] }))
}
