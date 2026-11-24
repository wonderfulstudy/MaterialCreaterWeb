import AppConfig from './config/app'

export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/draw/football/index',
    'pages/draw/basketball/index',
    'pages/draw/traditional/index',
    'pages/recommend/index',
    'pages/selector/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#E53935',
    navigationBarTitleText: AppConfig.app.name,
    navigationBarTextStyle: 'white'
  }
})
