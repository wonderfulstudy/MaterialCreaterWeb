export { generateRedPoster } from './lottery-red'
export { generateBluePoster } from './lottery-blue'

export interface PosterInfo {
  id: string
  name: string
  description: string
}

export const availablePosters: PosterInfo[] = [
  { id: 'red', name: '红色喜庆版', description: '红色渐变背景，金色金币装饰' },
  { id: 'blue', name: '蓝色科技版', description: '蓝色渐变背景，星星装饰' },
]
