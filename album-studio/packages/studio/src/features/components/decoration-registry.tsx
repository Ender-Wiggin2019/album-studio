import type { IconResourceId, StickerResourceId } from '@album-studio/common'
import {
  CakeIcon,
  CalendarDaysIcon,
  CameraIcon,
  Flower2Icon,
  GiftIcon,
  HeartIcon,
  MapPinIcon,
  MusicIcon,
  PawPrintIcon,
  PlaneIcon,
  SparklesIcon,
  StarIcon,
  type LucideIcon
} from 'lucide-react'

export type IconDecorationResource = Readonly<{
  label: string
  Icon: LucideIcon
}>

export type StickerDecorationResource = Readonly<{
  label: string
  source: string
}>

export const ICON_DECORATION_REGISTRY = Object.freeze({
  heart: { label: '爱心', Icon: HeartIcon },
  star: { label: '星星', Icon: StarIcon },
  camera: { label: '相机', Icon: CameraIcon },
  'map-pin': { label: '地点', Icon: MapPinIcon },
  plane: { label: '飞机', Icon: PlaneIcon },
  gift: { label: '礼物', Icon: GiftIcon },
  cake: { label: '蛋糕', Icon: CakeIcon },
  'calendar-days': { label: '日历', Icon: CalendarDaysIcon },
  music: { label: '音乐', Icon: MusicIcon },
  'flower-2': { label: '花朵', Icon: Flower2Icon },
  'paw-print': { label: '爪印', Icon: PawPrintIcon },
  sparkles: { label: '闪光', Icon: SparklesIcon }
} satisfies Record<IconResourceId, IconDecorationResource>)

export const STICKER_DECORATION_REGISTRY = Object.freeze({
  'washi-tape': {
    label: '和纸胶带',
    source: new URL('./stickers/washi-tape.svg', import.meta.url).href
  },
  'instant-photo': {
    label: '拍立得',
    source: new URL('./stickers/instant-photo.svg', import.meta.url).href
  },
  'postage-stamp': {
    label: '邮票',
    source: new URL('./stickers/postage-stamp.svg', import.meta.url).href
  },
  'botanical-sprig': {
    label: '植物枝叶',
    source: new URL('./stickers/botanical-sprig.svg', import.meta.url).href
  },
  starburst: {
    label: '放射星',
    source: new URL('./stickers/starburst.svg', import.meta.url).href
  },
  'travel-tag': {
    label: '旅行吊牌',
    source: new URL('./stickers/travel-tag.svg', import.meta.url).href
  }
} satisfies Record<StickerResourceId, StickerDecorationResource>)
