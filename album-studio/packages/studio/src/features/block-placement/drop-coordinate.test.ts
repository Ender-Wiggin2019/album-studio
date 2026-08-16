import { describe, expect, it } from 'vitest'
import {
  buildAddBlockCommand,
  buildDroppedBlockCommand,
  clientPointToNormalizedPagePoint,
  transformCenteredAt
} from './drop-coordinate'
import type { BlockPlacementPayload } from './payload'

const PAYLOADS = {
  asset: { kind: 'asset', assetId: 'asset-1' },
  text: { kind: 'rich-text' },
  icon: { kind: 'icon', resourceId: 'heart' },
  sticker: { kind: 'sticker', resourceId: 'travel-tag' }
} as const satisfies Record<string, BlockPlacementPayload>

describe('block placement coordinates', () => {
  it.each([
    [
      { left: 20, top: 40, width: 500, height: 300 },
      { x: 395, y: 115 }
    ],
    [
      { left: 20, top: 40, width: 900, height: 540 },
      { x: 695, y: 175 }
    ],
    [
      { left: 20, top: 40, width: 1_500, height: 900 },
      { x: 1_145, y: 265 }
    ]
  ] as const)(
    'maps the same page point at 50/90/150%% visual scale without another zoom division',
    (pageRect, clientPoint) => {
      expect(clientPointToNormalizedPagePoint(clientPoint, pageRect)).toEqual({ x: 0.75, y: 0.25 })
    }
  )

  it('centers each Block type at the point and clamps it inside the page', () => {
    const centeredAsset = transformCenteredAt(PAYLOADS.asset, { x: 0.5, y: 0.5 })
    expect(centeredAsset.x).toBeCloseTo(0.29)
    expect(centeredAsset.y).toBeCloseTo(0.225)
    expect(centeredAsset).toMatchObject({ width: 0.42, height: 0.55, rotationDeg: 0 })
    expect(transformCenteredAt(PAYLOADS.text, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.28,
      rotationDeg: 0
    })
    expect(transformCenteredAt(PAYLOADS.sticker, { x: 1, y: 1 })).toEqual({
      x: 0.84,
      y: 0.76,
      width: 0.16,
      height: 0.24,
      rotationDeg: 0
    })
  })

  it('builds all click and drag additions through the same add-block command seam', () => {
    expect(buildAddBlockCommand('page-1', PAYLOADS.asset)).toMatchObject({
      type: 'add-block',
      pageId: 'page-1',
      block: { type: 'image', assetId: 'asset-1' }
    })
    expect(buildAddBlockCommand('page-1', PAYLOADS.text)).toMatchObject({
      block: { type: 'rich-text' }
    })
    expect(buildAddBlockCommand('page-1', PAYLOADS.icon)).toMatchObject({
      block: {
        type: 'decoration',
        decoration: { kind: 'icon', resourceId: 'heart', color: '#a84835' }
      }
    })
    expect(buildAddBlockCommand('page-1', PAYLOADS.sticker)).toMatchObject({
      block: {
        type: 'decoration',
        decoration: { kind: 'sticker', resourceId: 'travel-tag' }
      }
    })
  })

  it('does not build a command for canceled, outside, or malformed drops', () => {
    const valid = {
      canceled: false,
      sourceData: PAYLOADS.asset,
      targetData: { kind: 'album-page', pageId: 'page-1' },
      targetRect: { left: 100, top: 50, width: 800, height: 450 },
      clientPoint: { x: 500, y: 275 }
    } as const

    expect(buildDroppedBlockCommand({ ...valid, canceled: true })).toBeNull()
    expect(buildDroppedBlockCommand({ ...valid, targetData: null })).toBeNull()
    expect(buildDroppedBlockCommand({ ...valid, targetRect: null })).toBeNull()
    expect(
      buildDroppedBlockCommand({
        ...valid,
        sourceData: { kind: 'asset', assetId: 'asset-1', label: '不应进入 payload' }
      })
    ).toBeNull()
    const command = buildDroppedBlockCommand(valid)
    expect(command).toMatchObject({
      type: 'add-block',
      pageId: 'page-1',
      block: { type: 'image' }
    })
    if (!command || command.type !== 'add-block') throw new Error('未生成 add-block 命令')
    if (!command.block.transform) throw new Error('add-block 命令未生成 transform')
    expect(command.block.transform.x).toBeCloseTo(0.29)
    expect(command.block.transform.y).toBeCloseTo(0.225)
  })
})
