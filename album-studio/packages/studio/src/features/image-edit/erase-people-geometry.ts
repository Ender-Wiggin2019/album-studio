/**
 * 计算照片在画布舞台内（扣除四周 7% 留白）完整可见时的显示尺寸，
 * 保持照片宽高比不变（contain）。舞台过小时返回 null。
 */
export function fitErasePhotoSize(
  photoRatio: number,
  availWidth: number,
  availHeight: number
): { width: number; height: number } | null {
  if (!Number.isFinite(photoRatio) || photoRatio <= 0 || availWidth < 1 || availHeight < 1) {
    return null
  }
  let width = availWidth
  let height = width / photoRatio
  if (height > availHeight) {
    height = availHeight
    width = height * photoRatio
  }
  return { width, height }
}
