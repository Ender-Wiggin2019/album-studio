# 消除人物（AI 修补）模型文件

本目录存放消除人物功能所需的 ONNX 模型（合计约 60MB），由 electron-builder 打进安装包，
**不进入版本库**。首次克隆仓库或模型缺失时，请运行下载脚本：

```bash
node scripts/download-models.mjs
```

| 文件 | 来源 | 体积 | 许可 |
| --- | --- | --- | --- |
| `lama_512_int8.onnx` | https://hf-mirror.com/g-ronimo/lama （`lama_512_int8.onnx`） | ~59MB | Apache-2.0 |
| `selfie_segmentation.onnx` | https://hf-mirror.com/onnx-community/mediapipe_selfie_segmentation-web （`onnx/model.onnx`） | ~0.5MB | Apache-2.0 |
