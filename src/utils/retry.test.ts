import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadWithRetryOnEmpty } from './retry'

test('首次返回数据时不重试', async () => {
  let calls = 0
  const results = await loadWithRetryOnEmpty(
    async () => {
      calls += 1
      return ['a']
    },
    { delayMs: 1 }
  )

  assert.deepEqual(results, ['a'])
  assert.equal(calls, 1)
})

test('返回空数组时重试，直到拿到数据', async () => {
  let calls = 0
  const results = await loadWithRetryOnEmpty(
    async () => {
      calls += 1
      return calls < 3 ? [] : ['a', 'b']
    },
    { attempts: 3, delayMs: 1 }
  )

  assert.deepEqual(results, ['a', 'b'])
  assert.equal(calls, 3)
})

test('重试次数用尽仍为空时返回空数组，不抛异常', async () => {
  let calls = 0
  const results = await loadWithRetryOnEmpty(
    async () => {
      calls += 1
      return []
    },
    { attempts: 3, delayMs: 1 }
  )

  assert.deepEqual(results, [])
  assert.equal(calls, 3)
})

test('load 抛出的异常原样向上传递，不吞掉', async () => {
  await assert.rejects(
    () => loadWithRetryOnEmpty(async () => { throw new Error('network down') }, { delayMs: 1 }),
    /network down/
  )
})
