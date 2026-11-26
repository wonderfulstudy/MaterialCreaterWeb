import { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
import { setupWebPlatform } from './platform';
// 全局样式
import './app.scss';

// 应用启动最早处：把 Web 端传输/存储/反馈能力注入 @mc/core 共享业务层
setupWebPlatform();

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {});

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
