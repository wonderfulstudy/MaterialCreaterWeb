import type { UserConfigExport } from '@tarojs/cli';
export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {
    webpackChain(chain) {
      // 禁用SourceMap生成，解决加载超时问题
      chain.devtool(false);
    },
  },
  h5: {
    devServer: {
      open: false, //禁止自动打开浏览器
    },
    webpackChain(chain) {
      // 禁用SourceMap生成，解决加载超时问题
      chain.devtool(false);
    },
  },
} satisfies UserConfigExport<'webpack5'>;
