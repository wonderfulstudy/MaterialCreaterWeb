import AppConfig from './config/app'

export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/share/index',
    'pages/mine/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#E53935',
    navigationBarTitleText: AppConfig.app.name,
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: "#000000",
    selectedColor: "#fe0000",
    borderStyle: "black",
    list: [{
      pagePath: "pages/home/index",
      text: AppConfig.navigation.home
    },{
      pagePath: "pages/recommend/index",
      text: AppConfig.navigation.recommend
    },{
      pagePath: "pages/selector/index",
      text: AppConfig.navigation.selector
    }]
  }
})