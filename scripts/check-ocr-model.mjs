#!/usr/bin/env node
/**
 * 校验 OCR 模型是否可用。
 *
 * 用法：
 *   node scripts/check-ocr-model.mjs                 检查源文件 / 构建产物 / 开发者工具开关
 *   node scripts/check-ocr-model.mjs --url <链接>     额外校验下载链接可用且大小正确
 *   node scripts/check-ocr-model.mjs --dist out      指定产物目录（默认 dist）
 *
 * 注意：本脚本检查的是磁盘上的产物。开发者工具还会再过滤一次「无依赖文件」
 * （ignoreDevUnusedFiles / ignoreUploadUnusedFiles），所以脚本会顺带检查这两个开关。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const MODEL_NAME = 'PP-OCRv6_tiny.onnx'
const EXPECTED_BYTES = 4462639

const args = process.argv.slice(2)
const argValue = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const outputRoot = argValue('--dist') ?? 'dist'
const checkUrl = argValue('--url') ?? process.env.OCR_MODEL_URL

let failed = false
const ok = (msg) => console.log(`  \u2705 ${msg}`)
const fail = (msg) => {
  console.log(`  \u274c ${msg}`)
  failed = true
}
const warn = (msg) => console.log(`  \u26a0\ufe0f  ${msg}`)

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

// ---- 1. 源文件 -------------------------------------------------------------
console.log('\n[1/4] 模型源文件')
const sourceDir = ['src/ocr_model', 'ocr_model'].find((dir) => existsSync(resolve(dir, MODEL_NAME)))
const sourcePath = sourceDir ? resolve(sourceDir, MODEL_NAME) : undefined
if (!sourcePath) {
  warn('src/ocr_model 与 ocr_model 下都没有模型；只能依赖远程下载')
} else {
  ok(`${sourcePath}，${statSync(sourcePath).size} 字节`)
}

// ---- 2. 构建产物 -----------------------------------------------------------
const artifactPath = resolve(outputRoot, 'ocr_model', MODEL_NAME)
console.log(`\n[2/4] 构建产物  ${artifactPath}`)
if (!existsSync(artifactPath)) {
  warn('未打进代码包。真机请用 OCR_MODEL_URL 配置下载地址；本地调试可把模型放回 src/ocr_model')
} else {
  const size = statSync(artifactPath).size
  if (size === EXPECTED_BYTES) {
    ok(`存在，${size} 字节`)
  } else {
    warn(`大小 ${size} 字节，与预期 ${EXPECTED_BYTES} 不一致（模型被替换或文件损坏）`)
  }
  if (sourcePath && sha256(sourcePath) !== sha256(artifactPath)) {
    fail('内容与源文件不一致，拷贝过程可能被截断')
  } else if (sourcePath) {
    ok('SHA256 与源文件一致')
  }
}

// ---- 3. 开发者工具开关 -----------------------------------------------------
console.log('\n[3/4] 开发者工具过滤开关')
for (const file of ['project.config.json', 'project.private.config.json']) {
  if (!existsSync(file)) continue
  const setting = JSON.parse(readFileSync(file, 'utf8')).setting ?? {}
  for (const key of ['ignoreDevUnusedFiles', 'ignoreUploadUnusedFiles']) {
    if (setting[key] === true) {
      fail(`${file} 中 ${key} = true，运行时包会剔除 .onnx（改成 false）`)
    } else if (setting[key] === false) {
      ok(`${file} 中 ${key} = false`)
    }
  }
}

// ---- 4. 下载链接 -----------------------------------------------------------
console.log('\n[4/4] 下载链接')
if (!checkUrl) {
  warn('未提供链接（--url 或 OCR_MODEL_URL），跳过')
} else if (!/^https:\/\//.test(checkUrl)) {
  fail('链接必须是 HTTPS（小程序 downloadFile 只允许 https，且域名需加入合法域名）')
} else {
  const expires = new URL(checkUrl).searchParams.get('Expires')
  if (expires) {
    const at = new Date(Number(expires) * 1000)
    const remainMinutes = Math.round((at.getTime() - Date.now()) / 60000)
    if (Number.isNaN(at.getTime())) {
      warn('链接带 Expires 参数但无法解析')
    } else if (remainMinutes <= 0) {
      fail(`签名链接已于 ${at.toLocaleString()} 过期，请重新生成`)
    } else if (remainMinutes < 60) {
      warn(`签名链接将在 ${remainMinutes} 分钟后过期（${at.toLocaleString()}）`)
    } else {
      ok(`签名链接有效期至 ${at.toLocaleString()}`)
    }
  }

  try {
    const response = await fetch(checkUrl, { headers: { Range: 'bytes=0-0' } })
    if (response.status === 206 || response.status === 200) {
      const range = response.headers.get('content-range')
      const total = range ? Number(range.split('/')[1]) : Number(response.headers.get('content-length'))
      if (total === EXPECTED_BYTES) {
        ok(`链接可访问，文件 ${total} 字节`)
      } else {
        warn(`链接可访问，但大小 ${total || '未知'} 字节（预期 ${EXPECTED_BYTES}）`)
      }
    } else if (response.status === 403) {
      fail('HTTP 403：链接已过期或无权限')
    } else if (response.status === 404) {
      fail('HTTP 404：对象不存在，检查 Bucket 内路径')
    } else {
      fail(`HTTP ${response.status}`)
    }
  } catch (error) {
    fail(`请求失败：${error.message}`)
  }
}

console.log(
  failed
    ? '\n结论：存在必须修复的问题，请按上面的 ❌ 逐项处理。\n'
    : '\n结论：检查通过。若运行时仍报错，请在开发者工具 Console 里用 readFileSync 做一次运行时检查。\n'
)
process.exit(failed ? 1 : 0)
