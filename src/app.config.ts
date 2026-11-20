import AppConfig from './config/app'

export default defineAppConfig({
  pages: [
    'pages/home/index',
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
