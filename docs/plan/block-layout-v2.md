# Everything is a Block 排版升级方案

> 状态：已完成
>
> 建立日期：2026-08-16
>
> 实施目录：`album-studio/`

## 1. 一句话决策

将相册文档重建为统一的 Block 画布：图片、富文本、Icon、贴纸以及封面和页面上的独立文字都进入同一个有序 Block 图层；右侧面板同时提供页面布局、项目素材、组件来源和当前 Block 编辑；页面尺寸在新建项目时选择，并贯穿画布、预览、图片管线和 PDF。

## 2. 已确认产品决定

| 主题         | 决定                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| 设计哲学     | Everything is a Block；Block 是拖动、缩放、旋转、图层和编辑的基本单元    |
| Block 类型   | `ImageBlock`、`RichTextBlock`、`DecorationBlock`                         |
| 文字范围     | 封面标题、副标题、日期和页面文字全部迁为 `RichTextBlock`                 |
| 图片说明     | 继续作为 `ImageBlock` 的内部内容，因为它依附于图片，不是独立排版对象     |
| 默认尺寸     | A4 横向，297 × 210 mm                                                    |
| 可选尺寸     | 12 × 12 英寸正方形；16:9，13.333 × 7.5 英寸                              |
| 尺寸变更     | 仅新建项目时选择；项目创建后不提供改尺寸入口                             |
| 页面布局     | 同时排列图片与富文本 Block；Icon/贴纸保持为额外装饰，不参与布局          |
| 整页模板     | 本轮不实现，保留为未来可以创建内容与装饰的独立能力                       |
| 富文本范围   | 字体、字号、颜色、粗体、斜体、下划线、对齐、行距、项目符号和编号列表     |
| 富文本非目标 | 链接、表格、嵌入媒体、代码块、协作批注和任意 HTML                        |
| 装饰模型     | Icon 与贴纸统一为 `DecorationBlock`；Icon 可改颜色，贴纸使用内置预设图片 |
| 装饰替换     | 已选装饰时保留位置、尺寸、旋转和图层，只替换内容；未选中时在画布中央创建 |
| 素材归属     | 素材库属于当前项目；文件和文件夹导入后平铺，不建立虚拟文件夹树           |
| 旧项目       | 不迁移、不兼容当前 image-only schema；新格式成为唯一权威格式             |

## 3. 可见结果与验收标准

完成后，用户应当能够：

1. 新建项目时在 A4 横向、12 寸正方形和 16:9 之间选择，未操作时使用 A4 横向。
2. 始终在同一工作区看到页面列表、画布和右侧面板，不再为了打开素材库而离开画布。
3. 从项目素材库拖一张图片到画布的目标位置，也能通过点击操作把图片放到画布中央。
4. 从组件库添加文字、Icon 或贴纸，并像图片一样拖动、缩放、旋转、调整层级、复制和删除。
5. 选中文字后在右侧完成简单富文本编辑，并实时看到画布、页面缩略图和预览更新。
6. 选中贴纸后点击另一贴纸，原 Block 不跳位、不改变大小和图层，只替换图案。
7. 应用页面布局时同时重排匹配的图片和文字，已有贴纸/Icon 的几何保持不变。
8. 保存并重新打开项目后，三类 Block 的内容、几何、图层和样式保持一致。
9. 编辑画布、页面缩略图、整册预览、浏览器打印和桌面 PDF 呈现同一结果，PDF 物理尺寸与项目预设一致。

## 4. 领域模型

### 4.1 统一 Block 集合

内容页和封面页都使用同一个有序 `blocks[]`。数组顺序就是跨类型图层顺序，不按图片、文字和装饰拆分多个数组。

```ts
type AlbumPage = {
  id: string;
  kind: "cover" | "content";
  layoutId: PageLayoutId | null;
  blocks: Block[];
};

type Block = ImageBlock | RichTextBlock | DecorationBlock;

type BlockBase = {
  id: string;
  transform: BlockTransform;
};

type BlockTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};
```

`BlockTransform` 继续使用页面归一化坐标。这样同一排版可以在不同显示缩放、缩略图和物理输出尺寸下复用。所有 Block ID 在整册范围内唯一，并共享每页 Block 数量上限、边界校验和图层命令。

### 4.2 ImageBlock

`ImageBlock` 继承现有图片能力，不重写图片管线：

```ts
type ImageBlock = BlockBase & {
  type: "image";
  assetId: string;
  crop: ImageCrop;
  effects: ImageEffects;
  mask: ImageMask;
  caption: ImageCaption;
};
```

- `assetId` 只能引用当前项目的 `assets[]`。
- 裁剪、滤镜、蒙版和图片说明仍属于图片本身。
- 原图继续保持不变，预览和打印衍生图继续可重建。

### 4.3 RichTextBlock

```ts
type RichTextBlock = BlockBase & {
  type: "rich-text";
  document: RichTextDocument;
};
```

`RichTextDocument` 是应用严格校验、带版本的 Lexical EditorState JSON 子集，只允许本轮确认的段落、列表和行内样式。`packages/common` 定义并校验其数据形状，但不依赖 React 或 Lexical 运行时，也不接受未经约束的 HTML。

建议的持久化能力：

- 段落和列表节点；列表仅支持项目符号与编号。
- 行内文本支持字体族、字号、颜色、粗体、斜体和下划线。
- 段落支持左、中、右对齐和行距。
- 字体先使用跨平台可预测的四组字体栈：宋体/衬线、黑体/无衬线、手写/楷体、等宽。
- 限制节点深度、节点数量和纯文本总长度，防止异常文档拖慢编辑与导出。

封面新建时通过普通 `RichTextBlock` 生成标题、副标题和日期，不再保留固定定位的 `title/subtitle/dateLabel` 渲染分支。页面文字同样使用普通 `RichTextBlock`，不再保留独立 `PageNote`。

### 4.4 DecorationBlock

```ts
type DecorationBlock = BlockBase & {
  type: "decoration";
  decoration: IconDecoration | StickerDecoration;
};

type IconDecoration = {
  kind: "icon";
  resourceId: IconResourceId;
  color: HexColor;
};

type StickerDecoration = {
  kind: "sticker";
  resourceId: StickerResourceId;
};
```

- Icon 和贴纸共用选中、几何、图层和替换命令。
- Icon 只从受控图标目录选择，并允许修改颜色。
- 贴纸是随应用交付的预设透明图片或矢量资源，不进入用户素材库。
- 文档只保存稳定的 `resourceId`，不保存任意路径、Base64 或组件名称。
- 实现维护显式的资源注册表，将持久化 ID 映射到实际图标组件或贴纸文件；不使用任意字符串动态导入。

### 4.5 页面尺寸

```ts
type PageSpec =
  | { presetId: "a4-landscape"; widthMm: 297; heightMm: 210 }
  | { presetId: "square-12"; widthMm: 304.8; heightMm: 304.8 }
  | { presetId: "widescreen-16-9"; widthMm: 338.67; heightMm: 190.5 };
```

- `a4-landscape` 是新建项目默认值。
- `PageSpec` 属于整册项目，所有页面共享同一尺寸。
- 项目创建后不提供更改尺寸的命令或界面。
- 画布宽高比、页面缩略图、预览、打印 CSS、桌面 PDF 和打印图片像素目标都读取 `document.pageSpec`，不再出现独立的 A4 常量。

### 4.6 新 schema 策略

- 建立新的 schema 版本，并删除当前 image-only 文档的兼容、迁移和 fallback 分支。
- 解析入口严格拒绝旧版 `elements/hero/PageNote` 结构和未知 Block 字段。
- 旧项目打开失败时明确提示“项目格式已更新，请新建项目”，不尝试猜测或隐式修补。
- 新格式落地后同步更新项目创建 IPC、desktop/web adapter、测试夹具和文档。

## 5. 页面布局与未来整页模板

本轮的“页面布局”只改变已有内容的几何，不创建、删除或改写内容：

```ts
type PageLayout = {
  id: PageLayoutId;
  name: string;
  supportedPageKinds: Array<"cover" | "content">;
  slots: Array<{
    accepts: "image" | "rich-text";
    transform: BlockTransform;
  }>;
};
```

应用规则：

1. 按当前页面中 ImageBlock、RichTextBlock 各自的图层顺序，稳定映射到同类型 slot。
2. 只有当前图片数和文字数与布局要求一致时才能应用；不匹配时显示所需数量，而不是自动删除或生成内容。
3. 一次布局应用只产生一个命令、一个 revision 和一个 undo 项。
4. DecorationBlock 完全不参与匹配，应用布局前后其内容、几何和图层位置保持不变。
5. 图片或文字 Block 后续被移动、缩放、旋转、添加或删除时清空 `layoutId`；只修改装饰不清空 `layoutId`。
6. 布局缩略图真实展示图片槽与文字槽的差异，不用同一种色块伪装两类内容。

未来的“整页模板”可以创建预设文字、图片槽、贴纸和主题装饰，属于内容生成能力，与本轮只重排现有 Block 的页面布局分开设计。

## 6. 工作区信息架构

### 6.1 宽屏

```text
┌ 返回  项目名 · 已保存        撤销/重做        预览  导出 ┐
├────────────┬──────────────────────────────┬────────────────┤
│ 页面       │            画布              │ 布局 素材 组件 │
│ 封面       │                              │ [Block 编辑]*  │
│ 第 1 页    │      拖动 / 缩放 / 旋转       │                │
│ 第 2 页    │                              │ 当前面板内容   │
│ + 添加页   │                              │                │
└────────────┴──────────────────────────────┴────────────────┘
                                              * 选中时出现
```

- `>= 1280px` 保持左侧页面栏、中央画布、右侧约 360px 面板同时可见。
- 画布仍是面积最大的主任务；右侧面板是素材托盘和上下文编辑器，不成为第二个页面。
- 顶栏删除“素材库 / 排版”工作区模式，只保留项目、历史、预览和导出等全局动作。

### 6.2 中窄窗口

- `960–1279px`：页面栏缩窄，右侧内容通过现有 Sheet 打开；画布不卸载，拖入改用点击放置作为可靠替代。
- `< 960px`：页面栏保持底部胶片条，右侧面板使用全高 Sheet。
- 宽屏右栏和窄屏 Sheet 复用同一个 `RightPanel` 组件与状态，不复制素材库、组件库或 Block 编辑界面。

### 6.3 视觉方向

产品主题是“相册装帧工作台”，不是通用后台面板。应用外壳继续保持中性冷灰，主题色只进入页面内容。

| Token      | 代表色    | 用途                       |
| ---------- | --------- | -------------------------- |
| 工作台深灰 | `#252A31` | 画布周围，强调纸张边界     |
| 工具条深灰 | `#20242A` | 画布工具栏                 |
| 纸外壳     | `#F7F8FA` | 应用背景                   |
| 面板纸白   | `#FCFCFD` | 左右面板和浮层             |
| 冷灰边界   | `#D8DCE2` | 分栏、输入框和分组         |
| 选中蓝     | `#356FC6` | 选中 Block、焦点和活动 Tab |

实现仍通过现有 shadcn 语义 token，不把这些颜色散落成组件内硬编码。界面字体继续使用系统中文无衬线；相册内容才提供四组可选字体。记忆点是“右侧装帧托盘”：用户选择来源或选中 Block 时，面板内容改变，但纸张画布始终留在原位。

## 7. 右侧面板状态与交互

### 7.1 Tab 模型

常驻 Tab：

1. `页面布局`：布局缩略图、当前页面信息和整册主题。
2. `素材库`：项目图片、导入、搜索、排序、批量放置。
3. `组件库`：添加文字、Icon 和贴纸。

条件 Tab：

4. `Block 编辑`：只有选中 Block 时出现，并根据类型显示不同内容。

状态规则：

- 选中任意 Block 时显示并自动进入 `Block 编辑`。
- 用户可以在保持选中的情况下切回任一常驻 Tab。
- 清空选择或切换页面时隐藏 `Block 编辑`，恢复用户上次使用的常驻 Tab。
- 再次点击画布上的已选 Block 时回到 `Block 编辑`。
- Store 使用 `selectedBlockId` 与 `lastPersistentPanelTab`，不再用图片专用 `selectedElementId` 或把素材库当成工作区 mode。

实现优先使用项目现有 Nova/Radix shadcn 原语；需要新增的基础原语是 `Tabs`，窄屏继续使用现有 `Sheet`。Tabs 的 trigger、焦点和键盘切换遵循组件原生语义。

### 7.2 页面布局 Tab

- 展示与当前图片数、文字数匹配的布局，并明确显示所需数量。
- 用真实图片槽和文字槽预览区分内容角色。
- 保留主题选择，但主题只改变相册页面，不改变应用外壳。
- 页面没有可参与布局的 Block 时显示“先添加图片或文字”的行动提示。

### 7.3 素材库 Tab

- 权威数据仍是当前 `document.assets`，关闭项目后不保留素材选择。
- 面板顶部提供“添加图片”和“添加文件夹”；文件夹导入后平铺。
- 保留搜索、按文件名/导入时间排序、缺失素材重连、导入进度和失败详情。
- 紧凑双列网格适配 360px 面板；文件名截断但可通过 Tooltip 查看完整值。
- 单张素材支持拖到画布或点击放到中央。
- 保留现有多选和“添加到当前页 / 自动创建新页”作为次级批量流程，不强迫批量操作使用拖拽。

### 7.4 组件库 Tab

- 顶部提供“添加文字”入口；拖入画布时创建 RichTextBlock，点击时在中央创建。
- Icon 与贴纸分组浏览，支持搜索或简单分类；不把贴纸混入项目素材。
- 图标使用应用维护的受控 Lucide 注册表；贴纸使用共享静态资源注册表。
- 点击资源时：若当前选中同类 DecorationBlock，则执行替换；否则创建新 DecorationBlock。

### 7.5 Block 编辑 Tab

| Block 类型             | 编辑内容                                            |
| ---------------------- | --------------------------------------------------- |
| ImageBlock             | 复用现有图片属性、图层、复制/删除和照片深度编辑入口 |
| RichTextBlock          | 富文本工具条、编辑区、图层、复制/删除               |
| DecorationBlock / Icon | 组件目录的替换模式、颜色、图层、复制/删除           |
| DecorationBlock / 贴纸 | 组件目录的替换模式、图层、复制/删除                 |

图片深度编辑仍可进入现有独占工作区，返回后恢复图片 Block 选中状态和右侧编辑 Tab。

## 8. 拖拽与画布变换

### 8.1 两层交互职责

拖拽来源到画布和画布内变换是两种不同问题：

- 来源拖入：使用新版 `@dnd-kit/react` 管理素材/组件的 drag source、drop target、拖拽预览和键盘替代路径。
- 已放置 Block：继续使用 `react-moveable` 管理拖动、八向缩放、旋转、吸附和参考线。

不要用列表排序模型替换 Moveable，也不要让两个库同时控制同一个已放置 Block。

### 8.2 Drop 语义

1. drag payload 只携带来源类型和稳定 ID，不携带文件路径或完整资源对象。
2. drop 时读取当前页面 DOMRect 和画布 zoom，将指针坐标转换为归一化页面坐标。
3. 新 Block 以 drop 点为中心，使用类型对应的可见默认尺寸，并约束在页面内。
4. 一次 drop 只提交一个 add-block 命令和一个 undo 项。
5. drop 到画布外不修改文档；拖拽取消不产生 history。
6. 点击放置和键盘操作与拖拽产生同一种命令，确保无鼠标用户和窄窗口仍能完成任务。

### 8.3 通用 Moveable

- `BlockView` 提供统一的 DOM target 和选中边界；类型渲染器只负责内容。
- Moveable target、guidelines 和选择器从图片专用 data attribute 改为 Block ID。
- 变换期间仍只预览 DOM；结束时提交一次通用 `set-block-transform`。
- 默认保持现有页面边界、吸附、键盘微移和一次手势一次 undo 规则。

## 9. 富文本编辑

### 9.1 编辑器边界

- 使用 Lexical 的 React 绑定提供编辑行为和工具条，但只启用已确认的简单能力。
- Lexical 只存在于 `packages/studio`；`packages/common` 只认识经过严格 Zod 校验的 `RichTextDocument` JSON 结构。
- 编辑器适配层负责序列化/恢复受限的 Lexical EditorState，并拒绝未知节点、marks 和过深结构。
- 只在用户选中 RichTextBlock 时懒加载编辑器；普通画布、缩略图、预览和打印不挂载完整编辑器实例。
- `RichTextBlockView` 使用轻量只读渲染器展示同一个 RichTextDocument，保证所有输出复用同一内容语义。

### 9.2 实时预览与历史

- 输入先进入当前 TextBlock 的临时 draft，画布立即读取 draft 预览。
- 短暂停顿、失焦、切换页面、预览、导出、返回首页和关闭项目前，将 draft 合并为一个 `update-rich-text` 命令。
- 连续输入需要合并 history，不能每个按键产生一个 revision 和 undo 项。
- 自动保存的 `flush()` 必须先提交待处理文本，再保存最新文档，避免快速关闭丢字。
- 撤销文本编辑后，右侧编辑器和画布同时回到同一版本。

## 10. 命令与状态

建议用通用命令替换图片专用的几何和图层命令：

- `add-block`
- `set-block-transform`
- `move-block-layer`
- `duplicate-block`
- `delete-block`
- `update-image-edit`
- `update-rich-text`
- `replace-decoration`
- `set-icon-color`
- `apply-page-layout`

命令不变量：

- 所有持久化修改只通过 `executeAlbumCommand`。
- 一次用户意图对应一个 revision、一个 history entry 和一组可逆 Immer patches。
- 通用命令可作用于三类 Block；类型专用命令必须拒绝错误目标。
- 替换 DecorationBlock 只改 `decoration` 内容，保持 `id/transform` 和数组位置。
- 应用布局只改图片和富文本 transform，必须证明装饰 patches 为空。

共享 UI 状态继续不写入 AlbumDocument：

- 当前页面、当前 Block、右栏 Tab、富文本 draft、素材多选、画布 zoom 和 Sheet 开关属于会话状态。
- `AlbumDocument` 只保存能够影响重开、预览和导出的产品数据。

## 11. 统一渲染链

```text
AlbumPageView
└── blocks.map(BlockView)
    ├── ImageBlockView
    ├── RichTextBlockView
    └── DecorationBlockView

同一 AlbumPageView
├── 编辑画布
├── 页面缩略图
├── 整册预览
├── 浏览器打印
└── 桌面 PDF
```

- `BlockView` 统一应用 transform、图层、选择标识和缺失状态。
- 类型 View 不复制页面几何，不读取工作区 mode，也不直接访问平台文件系统。
- 图片仍通过 `AssetImage/useAssetSource` 获取来源。
- Icon/贴纸从只读资源注册表获取，桌面和 Web 共享同一资源。
- 富文本只读渲染器同时用于画布、缩略图、预览和打印。

## 12. 页面尺寸贯穿路径

页面尺寸不是新建弹窗的局部选项，必须贯穿以下链路：

1. `packages/common`：PageSpec preset、严格 schema、create input 和尺寸工具。
2. 项目创建契约：common IPC、desktop adapter、browser adapter 和新建项目 Dialog。
3. Studio：`AlbumPageView` 动态宽高比、画布工具栏尺寸文案、页面缩略图和预览。
4. 图片请求：将 Block 占页面比例与真实 PageSpec 一起用于 print 派生图目标，删除 A4 专用常量和注释。
5. 桌面 PDF：使用实际毫米宽高生成 PDF 页面，不再传固定 `A4`。
6. 浏览器打印：按当前项目生成对应的 `@page size` 和 print page 毫米尺寸。
7. 测试：读取导出 PDF 的 MediaBox，分别断言三种尺寸，而不是只检查文件存在。

## 13. 代码所有权与预计改动面

| 层级                                       | 主要职责                                                      |
| ------------------------------------------ | ------------------------------------------------------------- |
| `packages/common/src/album/`               | Block union、RichTextDocument、PageSpec、创建逻辑、布局和命令 |
| `packages/common/src/ipc/`                 | 项目创建尺寸输入和严格契约                                    |
| `packages/studio/src/app/`                 | selectedBlock、右栏状态、文本 draft 提交与保存 flush          |
| `packages/studio/src/features/canvas/`     | BlockView、三类渲染器、通用 Moveable 和 drop 坐标             |
| `packages/studio/src/features/assets/`     | 紧凑项目素材面板与 drag source                                |
| `packages/studio/src/features/components/` | 文字、Icon、贴纸目录和资源注册表                              |
| `packages/studio/src/features/text-edit/`  | Lexical adapter、工具条、draft 与只读渲染                     |
| `packages/studio/src/features/inspector/`  | RightPanel、条件 Block 编辑和图片 Inspector 复用              |
| `packages/studio/src/pages/`               | 新建项目尺寸选择、工作区组合和顶栏简化                        |
| `apps/desktop/`                            | 创建 IPC、动态打印图片尺寸和自定义 PDF 页面尺寸               |
| `apps/web/`                                | 创建 adapter、OPFS 新格式和动态浏览器打印样式                 |

共享能力只在 `packages/common` 和 `packages/studio` 实现一次；desktop/web 只补各自平台能力，不复制 Block 规则或右栏 UI。

## 14. 第三方组件与依赖策略

- 保留现有 `react-moveable` 和 `react-easy-crop`，分别继续负责 Block 几何与图片框内裁剪。
- 新增新版 `@dnd-kit/react` 到 `@album-studio/studio`，只负责素材/组件到画布的创建拖拽；不采用官方已归入 legacy 的 `@dnd-kit/core`。
- 新增 Lexical 的核心与 React 绑定到 `@album-studio/studio`，只在富文本编辑时加载；所有 `lexical` / `@lexical/*` 包锁定为同一版本。
- 新增 shadcn `Tabs` 原语前，使用项目 npm runner 查询组件文档和 diff；保持现有 Nova、Radix、Lucide 和 Tailwind v4 配置。
- 新依赖实现前必须再次核对官方维护状态、许可证、React 19/Vite/Electron/浏览器兼容性和 bundle 变化，并把准确版本写入 lockfile，不在方案中猜版本号。
- `react-moveable` 继续复用当前已验证的集成，但记录其上游维护和 React 19 声明不足的风险；RichTextBlock 进入编辑态时只允许从边框/手柄移动，避免 `contenteditable` 选区与外层拖动冲突。
- 不引入 Fabric、Konva 或第二套 Canvas 渲染，不引入 react-beautiful-dnd，也不为简单富文本加入全套文档协作框架。

官方核对依据：

- [Lexical 官方仓库与 MIT 许可证](https://github.com/facebook/lexical)
- [Lexical EditorState 与 JSON 持久化](https://lexical.dev/docs/concepts/editor-state)
- [Lexical React 插件机制](https://lexical.dev/docs/react/create_plugin)
- [dnd-kit React 快速开始](https://dndkit.com/react/quickstart/)
- [dnd-kit 从 core 到新版 React API 的迁移说明](https://dndkit.com/react/guides/migration/)
- [dnd-kit 无障碍插件](https://dndkit.com/extend/plugins/accessibility/)
- [React Moveable 官方仓库](https://github.com/daybrush/moveable/tree/master/packages/react-moveable)

## 15. 分阶段实施计划

### 阶段 1：建立新文档模型

- [x] 新增 PageSpec presets、Block union、RichTextDocument 和资源 ID schema。
- [x] 让封面和内容页都只使用 `blocks[]`，删除固定封面文字、hero 和 PageNote。
- [x] 将图片专用 transform/layer/duplicate/delete 命令泛化为 Block 命令。
- [x] 新增文字、装饰、替换和混合布局命令。
- [x] 删除旧 schema 解析、夹具和兼容预期。

验证：common 测试覆盖三类 Block、跨类型 ID 唯一、素材引用、严格富文本、Decoration 资源、revision 和 undo/redo；明确拒绝旧文档。

### 阶段 2：统一 Block 渲染与画布交互

- [x] 建立 `BlockView` 与三类类型 View。
- [x] 将 Moveable、键盘、选择、图层和快捷键改成通用 Block 语义。
- [x] 将封面和页面固定文字改为普通 RichTextBlock 渲染。
- [x] 保证页面缩略图、预览和 PrintBook 继续复用 AlbumPageView。

验证：三类 Block 在编辑、缩略图、预览和打印 DOM 中几何一致；拖/缩/转一次动作一次 undo。

### 阶段 3：打通页面尺寸

- [x] 在新建项目 Dialog 使用三项 ToggleGroup，默认 A4 横向，并显示物理尺寸。
- [x] 同步 desktop/web 创建接口和项目存储。
- [x] 删除画布、CSS、图片管线和 PDF 中的 A4 硬编码。
- [x] 为三种尺寸生成正确比例与物理输出。

验证：三种项目画布比例正确；桌面 PDF MediaBox 和浏览器 print page 尺寸匹配 PageSpec；print 图片目标按真实页面尺寸计算。

### 阶段 4：重建右侧面板与项目素材拖入

- [x] 顶栏移除“素材库/排版”模式，建立三常驻 Tab 和条件 Block 编辑 Tab。
- [x] 将 AssetLibrary 重组为紧凑项目面板，保留导入、搜索、排序、失败和批量流程。
- [x] 接入 `DragDropProvider`、拖拽预览、画布 drop 和点击放置。
- [x] 宽屏/Sheet 复用一个 RightPanel。

验证：素材库不再卸载画布；drop 坐标在不同 zoom 下正确；无鼠标和窄窗口可用点击放置；素材不会跨项目泄漏。

### 阶段 5：富文本与装饰组件

- [x] 接入受限 Lexical 编辑器、转换器、工具条、draft 合并和 flush。
- [x] 建立 Icon/贴纸资源注册表、组件库和 DecorationBlockView。
- [x] 实现装饰替换保留几何/图层，以及 Icon 颜色编辑。
- [x] 对编辑器和组件目录做按需加载，记录 bundle 变化。

验证：全部确认的富文本格式保存重开一致；快速输入后立即关闭不丢字；贴纸替换只修改内容；资源在 desktop/web/print 中一致。

### 阶段 6：混合页面布局

- [x] 将布局从图片 transform 数组改为带 `accepts` 的 typed slots。
- [x] 更新布局缩略图、匹配条件、apply command 和 layoutId 清除规则。
- [x] 保护 DecorationBlock 不受布局影响。

验证：图片和文字按稳定顺序进入正确槽位；不匹配布局不可应用；装饰前后数据逐字段相同；整个布局一次撤销。

### 阶段 7：完整门禁

- [x] 更新 common、Studio、desktop 和 web 的 unit/component/integration 测试。
- [x] Web E2E 覆盖创建尺寸、三类 Block、拖入、富文本、替换、布局、刷新和打印。
- [x] Electron E2E 覆盖项目目录保存重开、文件夹导入、图片编辑和三种 PDF 尺寸。
- [x] 视觉检查 1440×900、1100×720、800×640，以及长中文、空态、导入失败和缺失资源。
- [x] 运行 `npm run check` 与 `npm run test:e2e:all`；原生打包仍由各目标系统证明。

## 16. 关键回归测试

1. `AlbumDocument` 只接受新 Block schema，旧 `elements/hero/PageNote` 文档被拒绝。
2. ImageBlock、RichTextBlock、DecorationBlock 共用一个有序数组，跨类型前移/后移和 undo 正确。
3. Decoration 替换前后的 `id/transform/arrayIndex` 完全一致。
4. 应用页面布局后图片和文字 transform 匹配 slot，装饰对象无 patch。
5. 连续文字输入只形成合并后的合理 history，保存 flush 不丢最后一次输入。
6. 素材从右栏 drop 到 50%、90%、150% zoom 的同一页面点，归一化位置误差在可接受范围内。
7. 页面切换和 Moveable control pointerdown 不误清选中 Block。
8. 画布、缩略图、预览和 PDF 的每个 Block 几何与富文本样式一致。
9. 三种 PageSpec 的编辑比例、打印图片目标和 PDF MediaBox 均正确。
10. 项目 A 的素材、选择和缺失状态不会出现在项目 B。

## 17. 风险与控制

| 风险                                    | 控制                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| 两套拖拽库事件冲突                      | dnd-kit 只控制外部来源，Moveable 只控制已放置 Block；用明确 data attribute 和 sensor 边界隔离 |
| zoom 导致 drop 偏移                     | 所有 drop 坐标从当前页面 DOMRect 转换为归一化坐标，并覆盖多 zoom E2E                          |
| 富文本每按键污染 history                | 使用 transient draft、合并提交与 flush-before-save                                            |
| 每个 TextBlock 挂完整编辑器导致性能下降 | 只为选中 Block 懒加载一个编辑器；其他场景使用轻量只读渲染                                     |
| 新尺寸只改画布但导出仍是 A4             | PageSpec 作为唯一事实源，PDF MediaBox 和图片像素目标加入回归测试                              |
| 布局误动贴纸                            | apply-page-layout 只接收图片/文字 Block，测试断言 Decoration 无 patch                         |
| 内置资源改名导致旧项目缺图              | 持久化稳定 resourceId，注册表只追加或显式版本化，不保存文件路径                               |
| 重建 schema 与现有工作树交叉            | 不写迁移器；按阶段删除旧字段与夹具，每阶段跑定向测试后再继续                                  |

## 18. 明确非目标

- 旧 image-only 项目迁移或兼容。
- 项目创建后的页面尺寸切换。
- A4 纵向、自定义毫米尺寸或每页不同尺寸。
- 素材库虚拟文件夹、标签、云同步或跨项目全局素材。
- 用户上传自定义贴纸、Icon 文件或字体文件。
- 链接、表格、媒体嵌入、多人协作等复杂富文本能力。
- 可以创建完整内容与装饰的整页模板。
- 重新实现图片裁剪、滤镜、项目存储或第二套 Canvas/PDF 渲染。

## 19. 完成定义

只有同时满足以下条件，功能实施才能标记完成：

- 文档数据只存在一个权威 Block 模型，没有遗留固定封面文字或图片专用图层分支。
- 三类 Block 在编辑、保存、重开、缩略图、预览和导出中行为一致。
- 三种页面尺寸从新建项目到最终 PDF 全链路一致，默认值确实是 A4 横向。
- 右侧三个常驻 Tab 与条件 Block 编辑 Tab 在宽屏和 Sheet 中共享同一实现。
- 素材保持项目维度，文件夹导入平铺，drag 与点击路径都可用。
- 混合布局只处理图片和文字，贴纸/Icon 不受影响。
- 定向测试、`npm run check`、Web E2E 和 Electron E2E 全部通过；Windows 原生结论只由 Windows 环境给出。

## 20. 实施结果

`AlbumDocument` 已升为严格 v2，PageSpec、三类 Block、typed layouts、通用命令和旧格式拒绝均由 common 统一负责。编辑画布、页面缩略图、整册预览、浏览器打印和桌面 PDF 复用同一 `AlbumPageView → BlockView` 渲染链；三种 PDF 的实际 MediaBox 已在 Electron E2E 中校验。

工作区已改为页面栏、持续存在的画布与共享 `RightPanel`。素材和组件支持点击或拖入，Decoration 替换保持几何与图层；受限 Lexical 编辑器和组件目录均按需加载，富文本与照片说明在失焦、切换、预览、导出、返回和关闭前都会提交。最终构建中组件目录为独立 4.85 kB chunk，Lexical 编辑器为独立 267.17 kB chunk。

最终本机门禁：common 37、Studio 62、desktop 32、启动逻辑 4 项测试通过；`npm run check`、Electron E2E 3/3、Web E2E 1/1 与 `npm run test:e2e:all` 通过。视觉验收覆盖 1440×900、1100×720、800×640、长中文、空素材、中文导入失败与缺失图片降级。Windows 原生打包和运行仍须由 Windows 主机或原生 CI 证明。
