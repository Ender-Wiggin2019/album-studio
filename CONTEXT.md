# 电子相册领域词汇

- **相册项目（Album Project）**：一个可独立保存、复制和打开的相册工作目录。桌面 adapter 使用 `.album-project/`，浏览器 adapter 使用 OPFS；二者承载同一种相册文档与素材语义。
- **相册文档（Album Document）**：项目中唯一权威的结构数据，包含页面、图片元素、主题和导出设置，不包含绝对路径、Base64 或可重建派生图。
- **素材（Asset）**：导入后不可变的原始图片，以 SHA-256 内容指纹识别；同一素材可以被多个图片元素引用。
- **图片元素（Image Element）**：素材在某一页面上的独立放置，拥有自己的几何变换、裁剪、滤镜、蒙版和说明；数组顺序表示图层顺序。
- **页面模板（Page Template）**：一次性写入图片元素几何的起始排版。用户自由变换后，页面不再声称仍匹配该模板。
- **工作室（Studio）**：项目首页、素材库、自由画布、图片编辑、预览和导出组成的共享 React 应用。
- **平台能力（Studio Platform）**：工作室用来创建/保存项目、导入/读取素材和导出的窄 interface。Electron 与浏览器分别提供 adapter。
- **派生图（Derivative）**：由不可变原图生成的 thumbnail、preview 或 print 缓存；路径由内容指纹、用途和管线版本推导，缺失时可以重建。
- **编辑命令（Album Command）**：对相册文档的一次原子修改，也是 revision、自动保存和撤销/重做的提交单位。
- **项目保存会话（Project Save Session）**：共享工作室中唯一拥有 debounce、保存顺序、latest revision、失败归属和 `flush()` 的 module；返回、导出和关闭不再自行编排保存。
