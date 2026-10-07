/**
 * Shared YAML-frontmatter parsing for the sync and verify scripts.
 *
 * Handles the scalar subset upstream SKILL.md files use: double-quoted
 * (with \" and \\ escapes), single-quoted (with '' escape), and plain
 * single-line values. Multi-line or nested YAML is rejected loudly so a
 * future upstream change cannot silently mis-parse.
 */

/** Parse a YAML scalar: double-quoted, single-quoted, or plain. */
export function parseScalar (raw) {
  const value = raw.trim()
  if (value.startsWith('"')) {
    const closing = findClosingQuote(value, '"', '\\')
    if (closing === -1 || value.slice(closing + 1).trim() !== '') {
      throw new Error(`unterminated or trailing content after double-quoted scalar: ${JSON.stringify(raw)}`)
    }
    return value.slice(1, closing).replace(/\\(["\\])/g, '$1')
  }
  if (value.startsWith("'")) {
    const closing = findClosingQuote(value, "'", "'")
    if (closing === -1 || value.slice(closing + 1).trim() !== '') {
      throw new Error(`unterminated or trailing content after single-quoted scalar: ${JSON.stringify(raw)}`)
    }
    return value.slice(1, closing).replace(/''/g, "'")
  }
  return value
}

/** Index of the scalar's closing quote honoring the escape character, or -1. */
function findClosingQuote (value, quote, escape) {
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === escape && i + 1 < value.length) { i += 1; continue }
    if (value[i] === quote) return i
  }
  return -1
}

/**
 * Parse a SKILL.md's frontmatter block.
 * @param {string} raw full file text
 * @returns {{ data: Record<string, string>, body: string }}
 */
export function parseFrontmatter (raw) {
  const text = raw.replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) throw new Error('missing YAML frontmatter (must start with a --- fence)')
  const end = text.indexOf('\n---\n', 4)
  if (end === -1) throw new Error('unterminated YAML frontmatter (no closing --- fence)')
  const block = text.slice(4, end)
  const body = text.slice(end + 5)
  const data = {}
  for (const line of block.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (line.startsWith(' ') || line.startsWith('\t')) {
      throw new Error(`multi-line YAML values are not supported, offending line: ${JSON.stringify(line)}`)
    }
    const match = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line)
    if (!match) throw new Error(`unparseable frontmatter line: ${JSON.stringify(line)}`)
    data[match[1]] = parseScalar(match[2])
  }
  return { data, body }
}
