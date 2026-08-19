# 消除人物（AI 修补）模型文件

本目录存放消除人物功能所需的 ONNX 模型（合计约 60MB），由 electron-builder 打进安装包，
**不进入版本库**。打包脚本会自动准备模型；本地开发首次克隆或模型缺失时可手动运行：

```bash
npm run download:models
```

| 文件                       | 来源                                                                                         | 体积   | 许可       |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------ | ---------- |
| `lama_512_int8.onnx`       | https://hf-mirror.com/g-ronimo/lama （`lama_512_int8.onnx`）                                 | ~59MB  | Apache-2.0 |
| `selfie_segmentation.onnx` | https://hf-mirror.com/onnx-community/mediapipe_selfie_segmentation-web （`onnx/model.onnx`） | ~0.5MB | Apache-2.0 |

下载清单固定到上游模型仓库的 commit，并同时校验文件大小和 SHA-256。文件先写入同目录临时文件，
只有校验通过后才原子替换最终文件；中断或镜像异常不会留下可被打包的半文件。
