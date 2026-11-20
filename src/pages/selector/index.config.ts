import AppConfig from '@/config/app'

export default definePageConfig({
  navigationBarTitleText: AppConfig.navigation.selector,
  navigationBarBackgroundColor: '#F2F2F5',
  navigationBarTextStyle: 'black',
  backgroundColor: '#F5F6F7',
  disableScroll: true,
})
