# ADR 0006：统一 Block 自由画布与非破坏图片管线

- 状态：已接受
- 日期：2026-08-15
- 更新日期：2026-08-16

## 决策

项目使用全新且唯一的 `AlbumDocument` v2，不保留原始参考项目的 JSON/HTML importer、早期 image-only manifest、`PhotoSlot` 或 legacy 布局分支。

封面和内容页都保存单一有序 `Block[]`，图片、富文本、Icon 和贴纸共享选择、几何、图层、复制、删除与撤销语义。数组元素严格区分 `ImageBlock`、`RichTextBlock` 和 `DecorationBlock`。其中 ImageBlock 分别保存：

- 页面归一化的 x/y/width/height 与元素旋转；
- 基于原图百分比区域的裁剪及框内翻转；
- 非破坏性 effects、蒙版和说明。

页面布局只按类型重排已有 ImageBlock 与 RichTextBlock；用户自由移动、缩放或旋转参与布局的 Block 后清除布局标识，DecorationBlock 不受布局影响。项目 PageSpec 在创建时从三个物理尺寸中选择。编辑、缩略图、预览和 PDF 继续使用同一个 DOM Block 渲染链。

素材和组件来源投放使用 dnd-kit，已放置 Block 的自由变换使用 `react-moveable`，框内裁剪使用 `react-easy-crop`。桌面素材管线使用 `sharp`，浏览器派生图使用 `pica`。不引入 Fabric/Konva，也不生成一套与 DOM/PDF 分离的画布渲染。

## 原因与后果

固定照片位和 crop/scale 双重状态无法表达 Slides 式编辑，也无法稳定恢复裁剪。单一 Block 模型让跨类型几何、图层和测试集中在相册文档模块，同时保留图片编辑的专属深度；一次编辑命令对应一次 revision 和一个 undo patch，拖拽过程中不复制完整项目。

代价是早期 `.album-project` 不再兼容。用户已明确授权全新格式，因此不增加迁移 interface 或长期 fallback。
