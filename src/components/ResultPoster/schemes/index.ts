import type { PosterScheme, PosterSchemeId } from '../types'
import { redTicketScheme } from './red-ticket'

/** 当前启用的海报方案；定稿为红金票据，新增风格时在这里追加并保持 id 唯一 */
export const POSTER_SCHEMES: readonly PosterScheme[] = [redTicketScheme]

export const DEFAULT_SCHEME_ID: PosterSchemeId = 'red-ticket'

export function getPosterScheme(id: PosterSchemeId): PosterScheme {
  return POSTER_SCHEMES.find((item) => item.id === id) ?? redTicketScheme
}
