import AppConfig from '@/config/app'

export default definePageConfig({
  navigationBarTitleText: AppConfig.navigation.home,
  enablePullDownRefresh: true,
  // 页面底色较浅，深色三点指示器才可见（覆盖 app 级 backgroundTextStyle）
  backgroundTextStyle: 'dark',
  backgroundColor: '#f5f6f7',
})
