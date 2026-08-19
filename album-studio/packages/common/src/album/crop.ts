import { z } from 'zod'
import {
  ImageCropSchema,
  type BlockTransform,
  type CropArea,
  type ImageCrop
} from './schema'

export const PixelSizeSchema = z
  .object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  })
  .strict()
export type PixelSize = z.infer<typeof PixelSizeSchema>

export type CropStyle = Readonly<{
  position: 'absolute'
  left: string
  top: string
  width: string
  height: string
  maxWidth: 'none'
  transform: string
  transformOrigin: 'center center'
}>

export function rotatedBoundingSize(size: PixelSize, rotationDeg: number): PixelSize {
  const radians = (rotationDeg * Math.PI) / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  return {
    width: cosine * size.width + sine * size.height,
    height: sine * size.width + cosine * size.height
  }
}

function pixels(value: number): string {
  return `${Math.round(value * 10_000) / 10_000}px`
}

/**
 * Maps the crop area percentages back to one positioned DOM image.
 * The caller supplies the image's natural size and the element viewport size.
 */
export function computeCropStyle(
  cropInput: ImageCrop,
  sourceSizeInput: PixelSize,
  viewportSizeInput: PixelSize
): CropStyle {
  const crop = ImageCropSchema.parse(cropInput)
  const sourceSize = PixelSizeSchema.parse(sourceSizeInput)
  const viewportSize = PixelSizeSchema.parse(viewportSizeInput)
  const boundingSize = rotatedBoundingSize(sourceSize, crop.rotationDeg)
  const croppedWidth = boundingSize.width * (crop.area.width / 100)
  const croppedHeight = boundingSize.height * (crop.area.height / 100)
  const scale = Math.max(viewportSize.width / croppedWidth, viewportSize.height / croppedHeight)

  const cropCenterOffsetX = ((crop.area.x + crop.area.width / 2) / 100 - 0.5) * boundingSize.width
  const cropCenterOffsetY = ((crop.area.y + crop.area.height / 2) / 100 - 0.5) * boundingSize.height
  const imageCenterX = viewportSize.width / 2 - cropCenterOffsetX * scale
  const imageCenterY = viewportSize.height / 2 - cropCenterOffsetY * scale
  const renderedWidth = sourceSize.width * scale
  const renderedHeight = sourceSize.height * scale

  return {
    position: 'absolute',
    left: pixels(imageCenterX - renderedWidth / 2),
    top: pixels(imageCenterY - renderedHeight / 2),
    width: pixels(renderedWidth),
    height: pixels(renderedHeight),
    maxWidth: 'none',
    transform: `rotate(${crop.rotationDeg}deg) scaleX(${crop.flipX ? -1 : 1}) scaleY(${crop.flipY ? -1 : 1})`,
    transformOrigin: 'center center'
  }
}

const FULL_IMAGE_EPSILON = 1e-6

function isUnrotatedFullImage(area: Readonly<CropArea>, rotationDeg: number): boolean {
  return (
    Math.abs(area.width - 100) <= FULL_IMAGE_EPSILON &&
    Math.abs(area.height - 100) <= FULL_IMAGE_EPSILON &&
    rotationDeg === 0
  )
}

/**
 * 让画布 Block 的形状跟随裁剪区域：保持中心与面积，把宽高比改成裁剪区域
 * （旋转后包围盒空间里的像素宽高比）对应的页面坐标比例，必要时收缩到页面内。
 *
 * - 未裁剪的完整原图（100% × 100% 且未旋转）跳过调整，避免改变模板/默认相框形状。
 * - 结果保证仍在页面内（x + width ≤ 1、y + height ≤ 1）且尺寸为正。
 */
export function fitBlockTransformToCrop(input: {
  transform: Readonly<BlockTransform>
  pageWidthMm: number
  pageHeightMm: number
  assetWidth: number
  assetHeight: number
  rotationDeg: number
  area: Readonly<CropArea>
}): BlockTransform {
  const { transform, pageWidthMm, pageHeightMm, assetWidth, assetHeight } = input
  if (isUnrotatedFullImage(input.area, input.rotationDeg)) return { ...transform }

  const bounding = rotatedBoundingSize({ width: assetWidth, height: assetHeight }, input.rotationDeg)
  const cropRatio = (bounding.width * input.area.width) / (bounding.height * input.area.height)
  // Block 视觉宽高比 = (width × pageW) / (height × pageH)，令其等于裁剪区域宽高比
  const pageCoordRatio = cropRatio * (pageHeightMm / pageWidthMm)

  const centerX = transform.x + transform.width / 2
  const centerY = transform.y + transform.height / 2
  const area = transform.width * transform.height
  let width = Math.sqrt(area * pageCoordRatio)
  let height = Math.sqrt(area / pageCoordRatio)

  const maxWidth = 2 * Math.min(centerX, 1 - centerX)
  const maxHeight = 2 * Math.min(centerY, 1 - centerY)
  if (pageCoordRatio >= maxWidth / maxHeight) {
    if (width > maxWidth) {
      width = maxWidth
      height = maxWidth / pageCoordRatio
    }
  } else if (height > maxHeight) {
    height = maxHeight
    width = maxHeight * pageCoordRatio
  }

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    rotationDeg: transform.rotationDeg
  }
}
