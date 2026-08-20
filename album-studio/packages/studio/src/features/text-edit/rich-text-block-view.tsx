import {
  RICH_TEXT_FORMAT_BITS,
  type AlbumTextNode,
  type RichTextDocument,
  type RichTextWritingMode
} from '@album-studio/common'
import { richTextFontFamilyToCss } from './rich-text-fonts'
import { richTextFontSizeToCqw } from './rich-text-metrics'
import { RICH_TEXT_WRITING_STYLES, richTextAlignmentToCss } from './rich-text-writing'

function textNodeStyle(node: AlbumTextNode, pageWidthMm: number): React.CSSProperties {
  return {
    color: node.color,
    fontFamily: richTextFontFamilyToCss(node.fontFamily),
    fontSize: `${richTextFontSizeToCqw(node.fontSize, pageWidthMm)}cqw`,
    fontWeight: node.format & RICH_TEXT_FORMAT_BITS.bold ? 700 : 400,
    fontStyle: node.format & RICH_TEXT_FORMAT_BITS.italic ? 'italic' : 'normal',
    textDecorationLine: node.format & RICH_TEXT_FORMAT_BITS.underline ? 'underline' : 'none'
  }
}

function TextChildren({
  children,
  pageWidthMm
}: {
  children: AlbumTextNode[]
  pageWidthMm: number
}): React.JSX.Element {
  if (children.length === 0) return <br />
  return (
    <>
      {children.map((node, index) => (
        <span key={index} style={textNodeStyle(node, pageWidthMm)}>
          {node.text}
        </span>
      ))}
    </>
  )
}

export function RichTextBlockView({
  document,
  pageWidthMm,
  writingMode = 'horizontal'
}: {
  document: RichTextDocument
  pageWidthMm: number
  writingMode?: RichTextWritingMode
}): React.JSX.Element {
  return (
    <div
      className="album-rich-text-block"
      data-rich-text-version={document.version}
      data-writing-mode={writingMode}
      style={RICH_TEXT_WRITING_STYLES[writingMode]}
    >
      {document.root.children.map((node, index) => {
        if (node.type === 'paragraph') {
          return (
            <p
              className="album-rich-text-paragraph"
              key={index}
              style={{
                textAlign: richTextAlignmentToCss(writingMode, node.align),
                lineHeight: node.lineHeight
              }}
            >
              <TextChildren pageWidthMm={pageWidthMm}>{node.children}</TextChildren>
            </p>
          )
        }

        const children = node.children.map((item, itemIndex) => (
          <li key={itemIndex} value={node.listType === 'number' ? item.value : undefined}>
            <TextChildren pageWidthMm={pageWidthMm}>{item.children}</TextChildren>
          </li>
        ))
        const style = {
          textAlign: richTextAlignmentToCss(writingMode, node.align),
          lineHeight: node.lineHeight
        }
        return node.listType === 'bullet' ? (
          <ul className="album-rich-text-list" key={index} style={style}>
            {children}
          </ul>
        ) : (
          <ol className="album-rich-text-list" key={index} start={node.start} style={style}>
            {children}
          </ol>
        )
      })}
    </div>
  )
}
