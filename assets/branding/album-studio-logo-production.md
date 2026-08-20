# 咔宝核心 Logo：A2 生产记录

- 最终选择：A2 小相册头像 · 黄绿。
- 方向理由：以圆角闭合相册、粗书脊和简单笑脸表达“轻松整理并成册”。
- 编辑参考：`logo-concepts/2026-08-19/a2-album-avatar-butter.png`。
- 正式母版：`album-studio-logo-master.png`。
- 母版属性：1254 × 1254，RGB，不透明，SHA-256 `9a6154a2a780b7fb0cdadce70329a3ba607fe414d860ecad57d6d924cc88a9cb`。
- 配色映射：水绿封面 `#59D8C3`；深李紫书脊、眼睛和嘴 `#4A285D`；奶油黄背景 `#FFD95A`。
- 生成路径：Codex ImageGen 图片编辑；运行时未暴露具体模型标识。
- 约束交付模式：主提示词内自然语言 `Constraints`，没有独立 negative prompt 参数。

## 正式编辑提示词

```text
Use case: logo-brand
Asset type: final production master logo and desktop application icon
Input image: Image 1 is the user-approved A2 mascot and the edit target.

Make exactly one production-finish correction while preserving the A2 mascot identity, front-facing closed-album geometry, proportions, placement, two eyes, one mouth, rounded silhouette, and three-color relationship.

Required correction:
- Make the entire backdrop a truly uniform, fully opaque flat butter yellow #FFD95A, edge-to-edge in all four square corners, with no vignette, spotlight, texture, or background gradient.
- Keep the front cover aqua #59D8C3 and the right spine plus facial marks deep plum #4A285D.
- Reduce the visible aqua and plum gradients to only 8–12% extremely subtle internal tonal softness so the first read is a clean Flat-first logo.
- Preserve clear safe area around the mascot for macOS, Windows, and Linux icon masking while keeping the mascot large and readable at 32 × 32.
- Keep the mascot upright and unmistakably a cute closed photo album; preserve the broad right-side spine as the single album-defining feature.

Color limit: exactly three semantic colors in the complete artwork: aqua #59D8C3, deep plum #4A285D, and butter yellow #FFD95A. Related barely perceptible tonal variants inside the mascot may remain within those families.

Constraints: no text, watermark, border, frame, card, App-icon mask, transparency, extra subject, scenery, limbs, props, photo-window illustration, pages, labels, decorative marks, sharp tips, fragile lines, external cast shadow, glossy hotspot, dramatic bevel, deep occlusion, extrusion, clay, plastic, plush, toy, photorealistic material, or strong 3D rendering. Do not rotate, tilt, crop, redesign, or change the mascot's expression. Normal square outer corners.
```

## 检查结果

- 32 × 32：两眼、一嘴、水绿封面和右侧李紫书脊均可辨识。
- 语义颜色、主体数量、圆角重轮廓、直立方向和安全边距符合选定 A2 身份。
- 背景不透明且覆盖四角，但模型仍留下轻微明暗变化，并非数学意义上的单一 `#FFD95A`；封面与书脊也保留轻微内部色调变化。按技能规则不做静默像素修补，作为已知偏差保留。
- 构图仍接近居中，而不是严格从右下角生长；用户明确选择 A2 后，以保持候选身份优先。

## 派生资产

- `album-studio/apps/desktop/build/icon.png`：1024 × 1024 Electron 构建源。
- `album-studio/apps/desktop/resources/icon.png`：512 × 512 Electron 运行时窗口与 Dock 图标。
- `album-studio/apps/desktop/build/icon.icns`：macOS 构建图标。
- `album-studio/apps/desktop/build/icon.ico`：Windows 7 档尺寸构建图标。
- `album-studio/packages/studio/src/assets/branding/album-studio-logo.png`：256 × 256 Web/Electron 共享页面品牌资产。
