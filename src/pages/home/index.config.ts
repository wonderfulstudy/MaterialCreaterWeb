import AppConfig from '@/config/app'

export default definePageConfig({
  navigationBarTitleText: AppConfig.navigation.home,
  navigationStyle: 'custom',
  enablePullDownRefresh: true,
  // 页面底色较浅，深色三点指示器才可见（覆盖 app 级 backgroundTextStyle）
  backgroundTextStyle: 'dark',
  backgroundColor: '#E5E5EA',
})
