import { useState } from 'react'
import PlanCalculator, { useSportSchedule, type SportKey } from '@/components/PlanCalculator'

/** 计算器页：直接铺开复用组件，选择结果只做本地试算 */
export default function SelectorPage() {
  const [sport, setSport] = useState<SportKey>('football')
  const { states, load } = useSportSchedule(sport)
  const current = states[sport]

  return (
    <PlanCalculator
      title="场次选择计算器"
      sport={sport}
      schedule={current.schedule}
      status={current.status}
      error={current.error}
      onSportChange={setSport}
      onRetry={() => void load(sport)}
    />
  )
}
