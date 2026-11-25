import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import {
  MULTI_PASS_OPTIONS,
  formatAmount,
  formatOdds,
  type SportKey,
} from '@/components/PlanCalculator'
import {
  MULTI_PASS_FALLBACK_ID,
  PRESET_DEFS,
  buildPresetCandidates,
  buildStoredPreset,
  findPresetPass,
  findPresetPassByLabel,
  isMultiPass,
  presetAvailableMatches,
  presetBonusText,
  presetMatchNo,
  type PresetPassOption,
  resolveCandidateIndex,
  samePreset,
  todayKey,
} from '@/pages/recommend/preset-plan'
import { findMatrix } from '@/services/matrix-store'
import { findPreset, savePreset } from '@/services/preset-store'
import styles from './index.module.scss'

/** 串法主档位：需求 AC-40 的四个按钮 */
const PASS_TABS = [
  { key: 'single', label: '单关' },
  { key: 'p2x1', label: '2串1' },
  { key: 'p3x1', label: '3串1' },
  { key: 'multi', label: 'M串N' },
]

/** 串法至少需要的场次数：多串档按最大串数（一注里装几场）算，与 buildPresetCandidates 的门槛同口径 */
function passMatchNeed(option: PresetPassOption): number {
  return Math.max(...option.sizes)
}

const MULTIPLE_MAX = 9999
const MULTIPLE_STEPS = [1, 2, 5, 10]

function clampMultiple(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(MULTIPLE_MAX, Math.max(1, Math.round(value)))
}

/** 预设方案设置：串法按钮组 + 候选方案列表 + 底部倍数/奖金结果条 */
export default function PlanPresetPage() {
  const router = useRouter()
  const presetId = router.params?.id === 'min' ? 'min' : 'max'
  const def = useMemo(
    () => PRESET_DEFS.find((item) => item.id === presetId) ?? PRESET_DEFS[0],
    [presetId]
  )
  /** 首次进入读一次存储：串法/倍数/选中条从预设里带过来 */
  const initial = useMemo(() => findPreset(presetId), [presetId])
  const sport: SportKey = initial?.sport ?? 'football'

  const [passId, setPassId] = useState(() => findPresetPassByLabel(initial?.passLabel).id)
  const [multiple, setMultiple] = useState(() => clampMultiple(initial?.multiple ?? 1))
  const [candidateIndex, setCandidateIndex] = useState(() => initial?.candidateIndex ?? 1)

  const pass = findPresetPass(passId)
  const multiSelected = isMultiPass(pass)

  /** 候选只由当日矩阵已选选项算出（§6.1.8-2、AC-22） */
  const matrixDate = todayKey()
  const matrixRows = useMemo(() => findMatrix(sport, matrixDate)?.rows ?? [], [sport, matrixDate])
  const available = useMemo(() => presetAvailableMatches(matrixRows), [matrixRows])
  /** 各串法按钮所需的场次数：M串N 主按钮只要任一子档可用即可点 */
  const passNeed = (key: string) =>
    key === 'multi'
      ? Math.min(...MULTI_PASS_OPTIONS.map((option) => passMatchNeed(option)))
      : passMatchNeed(findPresetPass(key))

  const candidates = useMemo(
    () => buildPresetCandidates({ rows: matrixRows, date: matrixDate, sport }, pass, multiple, def.pick),
    [matrixRows, matrixDate, sport, pass, multiple, def.pick],
  )

  const activeIndex = resolveCandidateIndex(candidateIndex, candidates.length)
  const active = candidates.length ? candidates[activeIndex - 1] : null

  /** 选中项或倍数一变就落盘，方案页签回头即是最新内容 */
  useEffect(() => {
    if (!candidates.length) {
      return
    }
    const next = buildStoredPreset({
      def,
      sport,
      pass,
      multiple,
      candidates,
      candidateIndex: activeIndex,
      date: todayKey(),
    })
    if (!next || samePreset(findPreset(next.id), next)) {
      return
    }
    savePreset(next)
  }, [activeIndex, candidates, def, multiple, pass, sport])

  const goBack = () => {
    Taro.navigateBack().catch(() => {
      void Taro.redirectTo({ url: '/pages/recommend/index' })
    })
  }

  const handlePassTab = (key: string) => {
    if (available < passNeed(key)) {
      return
    }
    if (key === 'multi') {
      setPassId(multiSelected ? pass.id : MULTI_PASS_FALLBACK_ID)
      return
    }
    setPassId(key)
  }

  const handleSubPass = (id: string) => {
    if (available < passMatchNeed(findPresetPass(id))) {
      return
    }
    setPassId(id)
  }

  const handleMultiple = (value: number) => {
    setMultiple(clampMultiple(value))
  }

  return (
    <View className={styles.page}>
      <View className={styles.head}>
        <Text className={styles.headBack} onClick={goBack}>
          ‹
        </Text>
        <Text className={styles.headTitle}>{`${def.name} · 设置`}</Text>
        <Text className={styles.headDone} onClick={goBack}>
          完成
        </Text>
      </View>

      <View className={styles.ways}>
        {PASS_TABS.map((tab) => {
          const tabOn = tab.key === 'multi' ? multiSelected : pass.id === tab.key
          const tabOff = available < passNeed(tab.key)
          return (
            <View
              key={tab.key}
              className={classnames(styles.way, tabOn && styles.wayOn, tabOff && styles.wayOff)}
              onClick={() => handlePassTab(tab.key)}
            >
              <Text className={classnames(styles.wayText, tabOn && styles.wayTextOn)}>
                {tab.label}
              </Text>
            </View>
          )
        })}
      </View>

      {multiSelected ? (
        <View className={styles.ways2}>
          {MULTI_PASS_OPTIONS.map((option) => (
            <View
              key={option.id}
              className={classnames(
                styles.way2,
                pass.id === option.id && styles.way2On,
                available < passMatchNeed(option) && styles.way2Off
              )}
              onClick={() => handleSubPass(option.id)}
            >
              <Text
                className={classnames(styles.way2Text, pass.id === option.id && styles.way2TextOn)}
              >
                {option.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!matrixRows.length ? (
        <View className={styles.hint}>
          <Text className={styles.hintText}>综合大数据里还没选场次，先去矩阵勾选今天的比赛</Text>
        </View>
      ) : null}

      {matrixRows.length && !candidates.length ? (
        <View className={styles.hint}>
          <Text className={styles.hintText}>
            {`矩阵已选 ${available} 场，不够 ${pass.label} 所需场次，今天不生成该预设`}
          </Text>
        </View>
      ) : null}

      {candidates.length ? (
        <View className={styles.cands}>
          <View className={styles.candHead}>
            <Text className={styles.candHeadTitle}>候选方案</Text>
            <Text className={styles.candHeadNote}>
              {`按组合赔率${def.pick === 'max' ? '从高到低' : '从低到高'} · ${candidates.length} 条`}
            </Text>
          </View>
          {candidates.map((candidate) => {
            const on = candidate.index === activeIndex
            return (
              <View
                key={candidate.index}
                className={classnames(styles.cand, on && styles.candOn)}
                onClick={() => setCandidateIndex(candidate.index)}
              >
                <View className={styles.candTop}>
                  {on ? <Text className={styles.used}>已用第 {candidate.index} 条</Text> : null}
                  <Text className={classnames(styles.candOdds, on && styles.candOddsOn)}>
                    {formatOdds(candidate.odds)}
                  </Text>
                </View>
                <Text className={styles.candLegs}>
                  {candidate.legs
                    .map(
                      (leg) =>
                        `${presetMatchNo(leg)} ${leg.optionLabel} ${formatOdds(leg.odds)}`
                    )
                    .join(' ')}
                </Text>
                <View className={styles.candFoot}>
                  <Text className={styles.candMeta}>{candidate.summary.betCount} 注</Text>
                  <Text className={styles.candBonus}>
                    理论 {presetBonusText(candidate.summary)}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      ) : null}

      <View className={styles.rbar}>
        <View className={styles.rrow}>
          <Text className={styles.rlabel}>倍数</Text>
          <View className={styles.mctl}>
            <View
              className={classnames(styles.mbtn, multiple <= 1 && styles.mbtnOff)}
              onClick={() => handleMultiple(multiple - 1)}
            >
              <Text className={styles.mbtnText}>−</Text>
            </View>
            {MULTIPLE_STEPS.map((step) => (
              <View
                key={step}
                className={classnames(styles.mchip, multiple === step && styles.mchipOn)}
                onClick={() => handleMultiple(step)}
              >
                <Text
                  className={classnames(styles.mchipText, multiple === step && styles.mchipTextOn)}
                >
                  {step}
                </Text>
              </View>
            ))}
            <View
              className={classnames(styles.mbtn, multiple >= MULTIPLE_MAX && styles.mbtnOff)}
              onClick={() => handleMultiple(multiple + 1)}
            >
              <Text className={styles.mbtnText}>＋</Text>
            </View>
          </View>
          <Text className={styles.rwinLabel}>理论奖金</Text>
          <Text className={styles.rbonus}>
            {active ? presetBonusText(active.summary) : '—'}
          </Text>
        </View>
        <View className={styles.rrow}>
          <Text className={styles.rmeta}>
            {active
              ? `${active.summary.betCount} 注 · 投入 ¥${formatAmount(active.summary.amount)}`
              : '今天暂无可用候选'}
          </Text>
          <Text className={styles.rmeta}>{multiple} 倍</Text>
        </View>
      </View>
    </View>
  )
}
