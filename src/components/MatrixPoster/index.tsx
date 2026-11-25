/**
 * 综合大数据长图海报（需求 §6.2.3 C）：当日预测矩阵整表进图。
 * 画布 750 宽、导出 scale=1（成品仍是 750 宽），内容超 3000px 按场次行分张：
 * 第 2 张起重复表头，店名 / 二维码 / 两行合规声明只跟最后一张。
 * 预览与 H5 截图用的是 PosterFrame 里同一份 JSX（离屏 1:1 副本），所以所见即所得。
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import classnames from 'classnames'
import PosterFrame, { POSTER_CANVAS_WIDTH, type PosterFrameHandle } from '@/components/PosterFrame'
import PosterFooter from '@/components/PosterFrame/poster-footer'
import type { MatrixSnapshot } from '@/pages/matrix/matrix-data'
import {
  MATRIX_POSTER_EXPORT_SCALE,
  MATRIX_POSTER_FOOTER_FALLBACK_HEIGHT,
  MATRIX_POSTER_FOOTER_SCALE,
  MATRIX_POSTER_HEADER_HEIGHT,
  MATRIX_POSTER_ROW_HEIGHT,
  MATRIX_POSTER_TABLE_HEAD_HEIGHT,
  MATRIX_POSTER_WIDTH,
  buildMatrixPosterModel,
  matrixPosterPages,
  type MatrixPosterModel,
  type MatrixPosterPage,
} from './model'
import styles from './index.module.scss'

const IS_H5 = process.env.TARO_ENV === 'h5'

export interface MatrixPosterHandle {
  /** 逐张截取 1:1 画布，返回每张的 PNG dataURL（各自的成品宽 750）；画布未渲染时抛错 */
  capture: () => Promise<string[]>
}

export interface MatrixPosterProps {
  /** mc.matrix.v1 里的当日快照 */
  snapshot: MatrixSnapshot
  /** 追加到外层容器的类名 */
  className?: string
}

/**
 * 页脚按 375 逻辑宽写成（132rpx 二维码等），在 750 画布里放大 2 倍才赶得上
 * red-ticket 的 750 口径（QR 200 / 合规 20px）。缩放不改布局高度，所以外面这层
 * 用实测的自然高度 × 2 撑开占位，否则 captureNodeToDataUrl 会按 offsetHeight 裁掉页脚。
 */
function MatrixFooter() {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(MATRIX_POSTER_FOOTER_FALLBACK_HEIGHT)

  useEffect(() => {
    const node = innerRef.current
    const natural = node && typeof node.offsetHeight === 'number' ? node.offsetHeight : 0
    if (natural > 0) {
      setHeight(natural * MATRIX_POSTER_FOOTER_SCALE)
    }
  }, [])

  return (
    <View className={styles.footerStage} style={{ height: `${height}px` }}>
      <View
        className={styles.footerScale}
        ref={innerRef}
        style={{
          width: `${POSTER_CANVAS_WIDTH}px`,
          transform: `scale(${MATRIX_POSTER_FOOTER_SCALE})`,
        }}
      >
        <PosterFooter />
      </View>
    </View>
  )
}

/** 单张内容：首张带标题头，其余只重复表头 */
function MatrixSheet({ model, page }: { model: MatrixPosterModel; page: MatrixPosterPage }) {
  const rows = model.rows.slice(page.start, page.end)

  return (
    <>
      {page.repeatHeader ? null : (
        <View className={styles.head} style={{ height: `${MATRIX_POSTER_HEADER_HEIGHT}px` }}>
          <Text className={styles.title}>{model.title}</Text>
          <View className={styles.headMeta}>
            <Text className={styles.headDate}>{model.dateLabel}</Text>
            <Text className={styles.headSport}>{model.sportLabel}</Text>
          </View>
        </View>
      )}

      <View className={styles.table}>
        <View className={styles.headRow} style={{ height: `${MATRIX_POSTER_TABLE_HEAD_HEIGHT}px` }}>
          <Text className={styles.infoHead}>场次</Text>
          {model.columns.map((column) => (
            <Text className={styles.cellHead} key={column.poolCode}>
              {column.name}
            </Text>
          ))}
        </View>

        {rows.length === 0 ? (
          <View className={styles.emptyBox} style={{ height: `${MATRIX_POSTER_ROW_HEIGHT}px` }}>
            <Text className={styles.emptyText}>当日暂无场次</Text>
          </View>
        ) : (
          rows.map((row) => (
            <View className={styles.row} key={row.key} style={{ height: `${MATRIX_POSTER_ROW_HEIGHT}px` }}>
              <View className={styles.infoCell}>
                <Text className={styles.matchTop}>
                  {row.matchNo} {row.time}
                </Text>
                <Text className={styles.matchLeague}>{row.league}</Text>
                <Text className={styles.matchTeams}>{row.teams}</Text>
              </View>
              {row.cells.map((cell, index) => (
                <View className={styles.cell} key={model.columns[index]?.poolCode ?? index}>
                  <Text className={classnames(styles.cellLabel, cell.empty && styles.cellLabelEmpty)}>
                    {cell.label}
                  </Text>
                  {cell.odds ? <Text className={styles.cellOdds}>{cell.odds}</Text> : null}
                </View>
              ))}
            </View>
          ))
        )}
      </View>
    </>
  )
}

const MatrixPoster = forwardRef<MatrixPosterHandle, MatrixPosterProps>(function MatrixPoster(
  { snapshot, className },
  ref
) {
  const model = useMemo(() => buildMatrixPosterModel(snapshot), [snapshot])
  const pages = useMemo(() => matrixPosterPages(model.rows.length), [model.rows.length])
  const frameRefs = useRef<(PosterFrameHandle | null)[]>([])

  useImperativeHandle(
    ref,
    () => ({
      capture: async () => {
        const urls: string[] = []
        for (let index = 0; index < pages.length; index += 1) {
          const frame = frameRefs.current[index]
          if (!frame) {
            continue
          }
          urls.push(await frame.capture())
        }
        if (urls.length === 0) {
          throw new Error('海报画布尚未渲染')
        }
        return urls
      },
    }),
    [pages.length]
  )

  return (
    <View className={classnames(styles.wrapper, className)}>
      {pages.map((page, index) => (
        <View
          className={classnames(styles.sheet, index > 0 && styles.sheetGap)}
          key={`${page.start}-${page.end}`}
        >
          {pages.length > 1 ? (
            <Text className={styles.sheetLabel}>{`第 ${index + 1} / ${pages.length} 张`}</Text>
          ) : null}
          <PosterFrame
            ref={(node) => {
              frameRefs.current[index] = node
            }}
            canvasWidth={MATRIX_POSTER_WIDTH}
            exportScale={MATRIX_POSTER_EXPORT_SCALE}
            footer={page.withFooter ? <MatrixFooter /> : undefined}
          >
            <MatrixSheet model={model} page={page} />
          </PosterFrame>
        </View>
      ))}
      {/* weapp 不伪造导出：只给预览和一行提示，画布重绘留给 Skyline 迁移 */}
      {IS_H5 ? null : <Text className={styles.hint}>小程序端暂不支持保存长图</Text>}
    </View>
  )
})

export default MatrixPoster
