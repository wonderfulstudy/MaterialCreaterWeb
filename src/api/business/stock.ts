/**
 * 库存接口（API.r6 §6）：票种、扫码入出库、库存总览、详细库存、出入库记录。
 * 库存单位是「本」；整本金额 = 面额 × 整本张数，由服务端算。
 */
import { getJson, postJson } from './base'

export interface TicketType {
  id: number
  name: string
  faceCents: number
  sheetsPerBook: number
  bookCents: number
  enabled: boolean
  inStockBooks?: number
  stockCents?: number
}

export interface TicketTypePayload {
  id?: number
  name: string
  faceCents: number
  sheetsPerBook: number
  enabled?: boolean
}

export type BookStatus = 'in_stock' | 'outbound'

export interface StockOverviewBook {
  bookNo: string
  inboundAt: string
  operator: string
}

export interface StockOverviewType extends TicketType {
  books: StockOverviewBook[]
}

export interface StockOverview {
  inStockBooks: number
  stockCents: number
  types: StockOverviewType[]
}

export interface StockBook {
  bookNo: string
  ticketTypeName: string
  faceCents: number
  sheetsPerBook: number
  bookCents: number
  inboundAt: string
  operator: string
  status: BookStatus
}

export interface Paged<T> {
  total: number
  items: T[]
}

export interface StockBooksQuery {
  ticketTypeId: number
  status?: BookStatus
  q?: string
  limit?: number
  offset?: number
}

export type MovementType = 'inbound' | 'outbound' | 'opened' | 'sold_cards' | 'adjustment'

export interface MovementItem {
  bookNo: string
  ticketTypeId: number
  ticketTypeName: string
  movementType: MovementType
  quantity: number
  occurredAt: string
  operator: string
}

export interface MovementsQuery {
  ticketTypeId?: number
  from?: string
  to?: string
  kind?: 'in' | 'out'
  limit?: number
  offset?: number
}

export interface StockMutationResult {
  bookNo: string
  ticketTypeId: number
  inStockBooks: number
  stockCents: number
}

export async function fetchTicketTypes(): Promise<TicketType[]> {
  const data = await getJson<{ items: TicketType[] }>('/api/ticket-types')
  return data.items || []
}

export async function saveTicketType(payload: TicketTypePayload): Promise<TicketType> {
  return postJson<TicketType>('/api/ticket-types', payload)
}

export async function stockIn(payload: { code: string; ticketTypeId: number; operator?: string; note?: string }): Promise<StockMutationResult> {
  return postJson<StockMutationResult>('/api/stock/in', payload)
}

export async function stockOut(payload: { code: string; operator?: string; note?: string }): Promise<StockMutationResult> {
  return postJson<StockMutationResult>('/api/stock/out', payload)
}

export async function fetchStockOverview(): Promise<StockOverview> {
  return getJson<StockOverview>('/api/stock/overview')
}

export async function fetchStockBooks(query: StockBooksQuery): Promise<Paged<StockBook>> {
  return getJson<Paged<StockBook>>('/api/stock/books', {
    ticketTypeId: query.ticketTypeId,
    status: query.status,
    q: query.q,
    limit: query.limit,
    offset: query.offset,
  })
}

export async function fetchMovements(query: MovementsQuery = {}): Promise<Paged<MovementItem>> {
  return getJson<Paged<MovementItem>>('/api/stock/movements', {
    ticketTypeId: query.ticketTypeId,
    from: query.from,
    to: query.to,
    kind: query.kind,
    limit: query.limit,
    offset: query.offset,
  })
}

/**
 * 票面字符串（可能带横线）解析出本号：结构 = 本号 15 位 + 张号 3 位 + 尾码 2 位（§3.4）。
 * 去非数字后：15 位直接用；18 位（本号+张号）与 ≥20 位（含尾码）取前 15 位；其他长度返回 null。
 */
export function parseTicketBookNo(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 15) return digits
  if (digits.length >= 18) return digits.slice(0, 15)
  return null
}

export function bookStatusLabel(status: BookStatus): string {
  return status === 'in_stock' ? '在库' : '已出库'
}

export function movementTypeLabel(type: MovementType): string {
  switch (type) {
    case 'inbound': return '入库'
    case 'outbound': return '出库'
    case 'opened': return '拆封'
    case 'sold_cards': return '销售扣张'
    case 'adjustment': return '盘点调整'
    default: return type
  }
}
