/**
 * 经营域（v1.1.0）API 底座：只做 base url 解析与查询串拼接，
 * 请求统一走 @/api/client 的 request（信封 {code,data} 由它拆）。
 */
import AppConfig from '@/config/app'
import { request } from '@/api/client'

/** 构建期常量由 config/index.ts 的 defineConstants 注入，与 @/api/proxy 同口径；
 *  未注入（jest 等）时退回 AppConfig 配置，再退回同源相对路径 */
export function apiBaseUrl(): string {
  if (typeof __API_BASE__ === 'string' && __API_BASE__) return __API_BASE__.replace(/\/+$/, '')
  return (AppConfig.app.api_base_url || '').replace(/\/+$/, '')
}

export type QueryValue = string | number | boolean | undefined | null

export function buildQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = []
  Object.keys(params).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  })
  return parts.length ? `?${parts.join('&')}` : ''
}

export async function getJson<T>(path: string, params: Record<string, QueryValue> = {}): Promise<T> {
  return request<T>({ url: `${apiBaseUrl()}${path}${buildQuery(params)}` })
}

export async function postJson<T>(path: string, data: unknown): Promise<T> {
  return request<T>({
    url: `${apiBaseUrl()}${path}`,
    method: 'POST',
    data,
    header: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function putJson<T>(path: string, data: unknown): Promise<T> {
  return request<T>({
    url: `${apiBaseUrl()}${path}`,
    method: 'PUT',
    data,
    header: { 'content-type': 'application/json; charset=utf-8' },
  })
}
