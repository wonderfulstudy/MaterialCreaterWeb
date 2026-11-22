/**
 * 开奖数据 → 海报入参的纯映射，不含任何资源引用，便于单测。
 * 视觉类默认值（二维码图片、落款等）由调用方传入。
 */
import type { ResultPosterInput } from './types'

/** 一端开奖数据的展示字段，已按界面文案格式化过 */
export interface DrawSource {
  gameName: string
  issue: string
  drawDate: string
  redNumbers: readonly string[]
  blueNumbers: readonly string[]
}

/** 海报固定的视觉落款，默认值见 ./config */
export interface PosterDefaults {
  qrImage: string
  qrCaption: string
  brandName: string
  slogan: string
}

export function toPosterInputs(draws: readonly DrawSource[], defaults: PosterDefaults): ResultPosterInput[] {
  return draws.map((draw) => ({
    gameName: draw.gameName,
    issue: draw.issue,
    drawDate: draw.drawDate,
    redNumbers: [...draw.redNumbers],
    blueNumbers: [...draw.blueNumbers],
    qrImage: defaults.qrImage,
    qrCaption: defaults.qrCaption,
    brandName: defaults.brandName,
    slogan: defaults.slogan,
  }))
}
