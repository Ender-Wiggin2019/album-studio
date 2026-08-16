import {
  RICH_TEXT_FORMAT_BITS,
  type AlbumTextNode,
  type RichTextDocument,
  type RichTextFontFamily
} from '@album-studio/common'

const RICH_TEXT_FONT_FAMILY_CSS: Readonly<Record<RichTextFontFamily, string>> = Object.freeze({
  sans: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  serif: "'Songti SC', 'STSong', 'SimSun', serif",
  handwritten: "'Kaiti SC', 'STKaiti', 'KaiTi', serif",
  mono: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', monospace"
})

function textNodeStyle(node: AlbumTextNode): React.CSSProperties {
  return {
    color: node.color,
    fontFamily: RICH_TEXT_FONT_FAMILY_CSS[node.fontFamily],
    fontSize: `${node.fontSize / 11.22}cqw`,
    fontWeight: node.format & RICH_TEXT_FORMAT_BITS.bold ? 700 : 400,
    fontStyle: node.format & RICH_TEXT_FORMAT_BITS.italic ? 'italic' : 'normal',
    textDecorationLine: node.format & RICH_TEXT_FORMAT_BITS.underline ? 'underline' : 'none'
  }
}

function TextChildren({ children }: { children: AlbumTextNode[] }): React.JSX.Element {
  if (children.length === 0) return <br />
  return (
    <>
      {children.map((node, index) => (
        <span key={index} style={textNodeStyle(node)}>
          {node.text}
        </span>
      ))}
    </>
  )
}

export function RichTextBlockView({ document }: { document: RichTextDocument }): React.JSX.Element {
  return (
    <div className="album-rich-text-block" data-rich-text-version={document.version}>
      {document.root.children.map((node, index) => {
        if (node.type === 'paragraph') {
          return (
            <p
              className="album-rich-text-paragraph"
              key={index}
              style={{ textAlign: node.align, lineHeight: node.lineHeight }}
            >
              <TextChildren>{node.children}</TextChildren>
            </p>
          )
        }

        const children = node.children.map((item, itemIndex) => (
          <li key={itemIndex} value={node.listType === 'number' ? item.value : undefined}>
            <TextChildren>{item.children}</TextChildren>
          </li>
        ))
        const style = { textAlign: node.align, lineHeight: node.lineHeight }
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
