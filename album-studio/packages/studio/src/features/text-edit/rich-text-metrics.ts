const MILLIMETERS_PER_INCH = 25.4
const POINTS_PER_INCH = 72

export function richTextFontSizeToCqw(fontSizePt: number, pageWidthMm: number): number {
  return (fontSizePt * MILLIMETERS_PER_INCH * 100) / (POINTS_PER_INCH * pageWidthMm)
}
