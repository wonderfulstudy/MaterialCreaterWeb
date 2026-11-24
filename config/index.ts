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

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
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
      // 模型下载地址由构建环境注入，避免把带签名的临时链接提交到仓库
      __OCR_MODEL_URL__: JSON.stringify(readBuildEnv('OCR_MODEL_URL')),
      // 开奖数据代理根地址（API.r1）：.env 的 API_BASE，未配置时连本地代理进程
      __API_BASE__: JSON.stringify(readBuildEnv('API_BASE') || 'http://localhost:8081'),
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
