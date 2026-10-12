# README 图片维护

图片必须来自本版本的演示服务，不得读取或展示个人数据库。总览图须包含完整趋势、图例与排行；分享图必须使用产品下载按钮导出的原始 PNG，不截取缩小的预览。

## 重拍与发布

在仓库根目录准备捕获脚本，然后启动演示服务：

```bash
npm run images:prepare
node ./bin/ccswitch-pulse.js --demo --port 3468 --no-open
```

在另一个终端运行：

```bash
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s readme-images open http://127.0.0.1:3468 --headed
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s readme-images run-code --filename=output/playwright/readme/capture-prepared.js
```

逐张检查 `output/playwright/readme/` 下的 14 张候选图：中英文 × 深浅主题的总览、报告、分享图，以及中英文日期选择示例。确认无加载态、裁切、文字重叠、错误和个人数据后执行：

```bash
npm run images:publish
npm run check:readme-images
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s readme-images close
```

发布脚本先验证全部候选，再更新 README 引用、写入图片清单并移除旧图。文件名包含内容哈希，避免继续引用同名旧资源；不要手动覆盖发布文件。

## 自动验收

CI 校验两份 README 的图片引用、14 个变体、PNG 尺寸、内容哈希、程序版本，以及界面、演示数据和捕获脚本的指纹。上述源文件变动后必须重拍，旧图片不能继续通过检查。

此检查不替代视觉验收。发布版本必须等待 macOS、Linux、Windows 的同一提交 CI 全部成功；失败截图、视频和 trace 由 CI 保留 7 天，便于定位环境差异。
