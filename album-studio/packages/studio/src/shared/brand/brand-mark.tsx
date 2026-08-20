const logoUrl = new URL('../../assets/branding/album-studio-logo.png', import.meta.url).href

export const BRAND_NAME = '咔宝'
export const BRAND_SLOGAN = '咔宝——翻阅时光记忆。'

const variants = {
  default: { className: 'size-10 shrink-0', pixels: 40 },
  compact: { className: 'hidden size-8 shrink-0 sm:block', pixels: 32 }
} as const

interface BrandMarkProps {
  alt: string
  variant?: keyof typeof variants
}

export function BrandMark({ alt, variant = 'default' }: BrandMarkProps): React.JSX.Element {
  const { className, pixels } = variants[variant]

  return (
    <img
      src={logoUrl}
      alt={alt}
      width={pixels}
      height={pixels}
      className={className}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  )
}
