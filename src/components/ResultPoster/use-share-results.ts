import { useEffect, useRef, useState } from 'react'
import { loadShareResults } from './latest-results'
import type { ResultPosterInput } from './types'

/** idle: 弹层没打开；loading: 正在取数；ready/empty: 取到数据或当期无数据；error: 请求异常 */
export type ShareResultsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface ShareResults {
  status: ShareResultsStatus
  results: ResultPosterInput[]
}

/**
 * 弹层打开时自带取数；调用方传入 results 时以传入值为准（预览、快照等场景）。
 * 用内容签名做依赖，调用方每次渲染新建数组也不会反复请求。
 */
export function useShareResults(active: boolean, provided?: readonly ResultPosterInput[]): ShareResults {
  const [status, setStatus] = useState<ShareResultsStatus>('idle')
  const [results, setResults] = useState<ResultPosterInput[]>([])

  const requestId = useRef(0)
  const providedRef = useRef(provided)
  providedRef.current = provided

  const providedSignature = provided ? JSON.stringify(provided) : ''

  useEffect(() => {
    const override = providedRef.current
    if (override) {
      setResults([...override])
      setStatus(override.length > 0 ? 'ready' : 'empty')
      return
    }

    if (!active) {
      return
    }

    const currentRequest = ++requestId.current
    setStatus('loading')

    loadShareResults().then(
      (list) => {
        if (requestId.current !== currentRequest) {
          return
        }
        setResults(list)
        setStatus(list.length > 0 ? 'ready' : 'empty')
      },
      (error) => {
        if (requestId.current !== currentRequest) {
          return
        }
        console.error('[ResultPoster] load failed', error)
        setStatus('error')
      }
    )
  }, [active, providedSignature])

  return { status, results }
}
