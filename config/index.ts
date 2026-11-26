import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import devConfig from './dev';
import prodConfig from './prod';

/**
 * 读取构建期变量：真实环境变量 > .env.local > .env。
 * Taro 只会把 TARO_APP_ 前缀的变量注入构建，OCR 模型地址这类变量需要自己读。
 */
function readBuildEnv(key: string): string {
  const fromProcess = process.env[key]
  if (fromProcess) {
    return fromProcess
  }
  for (const file of ['.env.local', '.env']) {
    const filePath = resolve(__dirname, '..', file)
    if (!existsSync(filePath)) {
      continue
    }
    const line = readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .find((item) => item.trim().startsWith(`${key}=`))
    if (line) {
      return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return ''
}

/**
 * 构建期要用的地址来自前后端共享的唯一真值 MaterialCreaterServer/config/app.config.json
 * （与 src/config 的 "@app-config" 别名指向同一份文件，不复制、不生成副本）。
 * 这里用 readFileSync 而不是别名：本文件在 Node 里由 Taro 直接执行，不经过 webpack 的别名解析。
 */
const APP_CONFIG_PATH = resolve(__dirname, '..', '..', 'MaterialCreaterServer', 'config', 'app.config.json')

/**
 * 三端共享业务层 @mc/core 的源码在 App 仓里（MaterialCreaterApp/packages/core），
 * 落在 sourceRoot 之外，必须显式加入 babel 编译白名单，否则 TS 语法不会被转译。
 * 与 tsconfig.json 的 "@mc/core/*" 别名指向同一目录。
 */
const CORE_SRC_PATH = resolve(__dirname, '..', '..', 'MaterialCreaterApp', 'packages', 'core', 'src')

/**
 * Taro 的 script 规则（babel-loader）只 include sourceDir；@mc/core 在仓库之外，
 * 必须把它的目录补进同一条规则的 include，否则 TS 语法不会被转译
 * （webpack 报 "no loaders are configured to process this file"）。
 */
function applyCoreCompile(chain: any): void {
  chain.module.rule('script').include.add(CORE_SRC_PATH)
  // core 在仓库之外，它引用的裸模块（@babel/runtime 助手等）向上找不到 node_modules，
  // 必须把本项目的 node_modules 显式加进解析根，否则打包报 Module not found。
  chain.resolve.modules.clear().add('node_modules').add(resolve(__dirname, '..', 'node_modules'))
}

interface BuildAppConfig {
  api: { lotteryProxyBaseUrl: string }
  ocr: { modelUrl: string }
}

function readAppConfig(): BuildAppConfig {
  return JSON.parse(readFileSync(APP_CONFIG_PATH, 'utf8')) as BuildAppConfig
}

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const appConfig = readAppConfig()
  const outputRoot = process.env.TARO_OUTPUT_DIR || 'dist'
  // PP-OCRv6 tiny 识别模型：src/ocr_model 或根目录 ocr_model，模型文件存在哪个用哪个。
  // 默认不随包分发（走 OCR_MODEL_URL 运行时下载），此时不参与 copy，避免构建报错。
  const OCR_MODEL_FILE = 'PP-OCRv6_tiny.onnx'
  const ocrModelDir = ['src/ocr_model', 'ocr_model'].find((dir) =>
    existsSync(`${dir}/${OCR_MODEL_FILE}`),
  )
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'taro_template',
    date: '2025-12-10',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot,
    plugins: ['@tarojs/plugin-html'],
    defineConstants: {
      // 模型下载地址：构建环境注入 > .env.local > .env > 真值 ocr.modelUrl
      // （签名临时链接不写进仓库，所以真值里只留缺省值）
      __OCR_MODEL_URL__: JSON.stringify(readBuildEnv('OCR_MODEL_URL') || appConfig.ocr.modelUrl),
      // 开奖数据代理根地址（API.r1）：构建环境注入 > .env.local > .env > 真值 api.lotteryProxyBaseUrl
      __API_BASE__: JSON.stringify(readBuildEnv('API_BASE') || appConfig.api.lotteryProxyBaseUrl),
    },
    copy: {
      patterns: ocrModelDir
        ? [
            // 字典 txt 只用于生成 src/services/ocr/dict.ts，不需要打进代码包
            { from: ocrModelDir, to: `${outputRoot}/ocr_model`, ignore: ['**/*.txt'] },
          ]
        : [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false, // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
    },
    mini: {
      miniCssExtractPluginOption: {
        ignoreOrder: true,
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['nut-'],
          },
        },
        cssModules: {
          enable: true, // 开启 CSS Modules
          config: {
            namingPattern: 'module', // 仅 *.module.scss 生效
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        applyCoreCompile(chain);
        // OCR 模型由 copy 插件拷进代码包，属于静态资源而非入口产物，
        // 用 webpack 默认的 244KiB 阈值检查它会刷出一串无意义的性能提示
        chain.performance.assetFilter((asset: string) => !/\.onnx$/i.test(asset));
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: true, // 开启 CSS Modules
          config: {
            namingPattern: 'module', // 仅 *.module.scss 生效
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['body'],
            baseFontSize: 37.5,
            unitPrecision: 5,
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        applyCoreCompile(chain);
        // 同上：onnx 模型不是首屏资源，不参与体积提示
        chain.performance.assetFilter((asset: string) => !/\.onnx$/i.test(asset));
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: true,
        },
      },
    },
  };
  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig);
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig);
});
