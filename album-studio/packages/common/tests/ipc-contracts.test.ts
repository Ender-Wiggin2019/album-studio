import {
  CreateProjectRequestSchema,
  EraseApplyRequestSchema,
  EraseApplyResultSchema,
  EraseDetectRequestSchema,
  EraseDetectResultSchema,
  ImportCandidateSchema,
  ImportCandidateSessionSchema,
  ImportCandidatesRequestSchema,
  PickImportCandidatesRequestSchema,
  ReleaseCandidatesRequestSchema
} from '../src'
import { describe, expect, it } from 'vitest'

describe('CreateProjectRequestSchema', () => {
  it.each([
    { presetId: 'a4-landscape', widthMm: 297, heightMm: 210 },
    { presetId: 'a4-portrait', widthMm: 210, heightMm: 297 },
    { presetId: 'square-12', widthMm: 304.8, heightMm: 304.8 },
    { presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 }
  ] as const)('accepts the $presetId page preset', (pageSpec) => {
    expect(
      CreateProjectRequestSchema.parse({
        title: '旅行手记',
        themeId: 'journal',
        pageSpec
      })
    ).toEqual({ title: '旅行手记', themeId: 'journal', pageSpec })
  })

  it('requires the caller to choose one authoritative page preset', () => {
    expect(() =>
      CreateProjectRequestSchema.parse({ title: '旅行手记', themeId: 'journal' })
    ).toThrow()
    expect(() =>
      CreateProjectRequestSchema.parse({
        title: '旅行手记',
        themeId: 'journal',
        pageSpec: { presetId: 'square-12', widthMm: 297, heightMm: 210 }
      })
    ).toThrow()
  })
})

describe('Erase IPC contracts', () => {
  const erase = {
    autoDetect: true,
    strokes: [
      { mode: 'add', size: 0.05, points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.55 }] }
    ]
  } as const

  it('validates detect request and result', () => {
    expect(EraseDetectRequestSchema.parse({ projectPath: 'p1', assetId: 'a1' })).toEqual({
      projectPath: 'p1',
      assetId: 'a1'
    })
    expect(EraseDetectRequestSchema.safeParse({ projectPath: 'p1' }).success).toBe(false)
    expect(
      EraseDetectResultSchema.parse({ maskBase64: 'iVBORw0KGgo=', width: 4000, height: 3000 })
    ).toEqual({ maskBase64: 'iVBORw0KGgo=', width: 4000, height: 3000 })
    expect(EraseDetectResultSchema.safeParse({ maskBase64: '', width: 1, height: 1 }).success).toBe(
      false
    )
    expect(EraseDetectResultSchema.safeParse({ maskBase64: 'x', width: 0, height: 1 }).success).toBe(
      false
    )
  })

  it('validates apply request with a strict erase payload', () => {
    expect(
      EraseApplyRequestSchema.parse({ projectPath: 'p1', assetId: 'a1', erase })
    ).toEqual({ projectPath: 'p1', assetId: 'a1', erase })
    expect(
      EraseApplyRequestSchema.safeParse({ projectPath: 'p1', assetId: 'a1' }).success
    ).toBe(false)
    expect(
      EraseApplyRequestSchema.safeParse({
        projectPath: 'p1',
        assetId: 'a1',
        erase: { ...erase, extra: 1 }
      }).success
    ).toBe(false)
  })

  it('validates apply result', () => {
    expect(EraseApplyResultSchema.parse({ eraseKey: 'a1b2c3', width: 4000, height: 3000 })).toEqual({
      eraseKey: 'a1b2c3',
      width: 4000,
      height: 3000
    })
    expect(EraseApplyResultSchema.safeParse({ eraseKey: '', width: 1, height: 1 }).success).toBe(
      false
    )
    expect(EraseApplyResultSchema.safeParse({ eraseKey: 'x'.repeat(65), width: 1, height: 1 }).success).toBe(
      false
    )
  })
})

describe('Import candidate IPC contracts', () => {
  it('validates a candidate with optional dimensions and a preview URL', () => {
    expect(
      ImportCandidateSchema.parse({
        id: 'candidate-1',
        fileName: '海边.jpg',
        byteSize: 2048,
        width: 1600,
        height: 1200,
        previewUrl: 'album-candidate://preview/candidate-1?v=1'
      })
    ).toEqual({
      id: 'candidate-1',
      fileName: '海边.jpg',
      byteSize: 2048,
      width: 1600,
      height: 1200,
      previewUrl: 'album-candidate://preview/candidate-1?v=1'
    })
    expect(
      ImportCandidateSchema.safeParse({
        id: 'candidate-1',
        fileName: 'x.jpg',
        byteSize: 0,
        previewUrl: 'blob:preview'
      }).success
    ).toBe(true)
    expect(
      ImportCandidateSchema.safeParse({ id: '', fileName: 'x.jpg', byteSize: 0 }).success
    ).toBe(false)
    expect(
      ImportCandidateSchema.safeParse({
        id: 'candidate-1',
        fileName: 'x.jpg',
        byteSize: 0,
        previewUrl: ''
      }).success
    ).toBe(false)
  })

  it('binds picked candidates to one explicit session', () => {
    expect(
      ImportCandidateSessionSchema.parse({
        id: 'session-a',
        candidates: [
          {
            id: 'candidate-1',
            fileName: '海边.jpg',
            byteSize: 2048,
            previewUrl: 'album-candidate://preview/session-a/candidate-1?v=1'
          }
        ]
      })
    ).toMatchObject({ id: 'session-a', candidates: [{ id: 'candidate-1' }] })
    expect(
      ImportCandidateSessionSchema.safeParse({ id: 'session-a', candidates: [] }).success
    ).toBe(false)
  })

  it('validates pick/import/release requests strictly', () => {
    expect(
      PickImportCandidatesRequestSchema.parse({ projectPath: 'p1', source: 'folder' })
    ).toEqual({ projectPath: 'p1', source: 'folder' })
    expect(
      PickImportCandidatesRequestSchema.safeParse({ projectPath: 'p1' }).success
    ).toBe(false)
    expect(
      PickImportCandidatesRequestSchema.safeParse({ projectPath: 'p1', source: 'disk' }).success
    ).toBe(false)

    expect(
      ImportCandidatesRequestSchema.parse({
        projectPath: 'p1',
        sessionId: 'session-a',
        candidateIds: ['candidate-1']
      })
    ).toEqual({ projectPath: 'p1', sessionId: 'session-a', candidateIds: ['candidate-1'] })
    expect(
      ImportCandidatesRequestSchema.safeParse({
        projectPath: 'p1',
        sessionId: 'session-a',
        candidateIds: ['']
      }).success
    ).toBe(false)
    expect(
      ImportCandidatesRequestSchema.safeParse({
        projectPath: 'p1',
        sessionId: 'session-a',
        candidateIds: []
      }).success
    ).toBe(false)

    expect(ReleaseCandidatesRequestSchema.parse({ sessionId: 'session-a' })).toEqual({
      sessionId: 'session-a'
    })
    expect(ReleaseCandidatesRequestSchema.safeParse({ sessionId: '' }).success).toBe(false)
  })
})
