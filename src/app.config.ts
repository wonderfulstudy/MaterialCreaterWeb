import AppConfig from './config/app'

/**
 * 小程序端启动首屏必须是登录 gate（D66/D87）；H5 是店主自用调试端（D78），
 * 直接进首页，避免每次刷新闪一下登录屏。判断写死方向：环境变量缺失时按需要 gate 处理。
 */
const WITH_GATE = process.env.TARO_ENV !== 'h5'

export default defineAppConfig({
  pages: [
    ...(WITH_GATE ? ['pages/gate/index'] : []),
    'pages/home/index',
    'pages/draw/football/index',
    'pages/draw/basketball/index',
    'pages/draw/traditional/index',
    'pages/share/index',
    'pages/recommend/index',
    'pages/selector/index',
    'pages/profile/index',
    'pages/plan-record/index',
    'pages/plan-detail/index',
    'pages/plan-preset/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#E53935',
    navigationBarTitleText: AppConfig.app.name,
    navigationBarTextStyle: 'white'
  }
})
