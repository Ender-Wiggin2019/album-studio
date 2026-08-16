import { z } from 'zod'
import { ImageCropSchema, type ImageCrop } from './schema'

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

function rotatedBoundingSize(size: PixelSize, rotationDeg: number): PixelSize {
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
 * Maps react-easy-crop's croppedAreaPercentages back to one positioned DOM image.
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
