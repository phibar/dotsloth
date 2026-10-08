export interface DiffLine {
  text: string
  type: 'add' | 'remove' | 'same'
}

/** Line diff via longest common subsequence - plenty for a config file. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const lcs: number[][] = Array.from({length: a.length + 1}, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({text: a[i++], type: 'same'})
      j++
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] > lcs[i + 1][j])) {
      // On a tie the removal comes first, so a change reads "- old" then "+ new".
      lines.push({text: b[j++], type: 'add'})
    } else {
      lines.push({text: a[i++], type: 'remove'})
    }
  }

  return lines
}

/** Only the changed lines, with up to `context` unchanged lines around them. */
export function changedHunks(lines: DiffLine[], context = 2): Array<DiffLine | null> {
  const keep = lines.map((line, index) =>
    lines.slice(Math.max(0, index - context), index + context + 1).some((l) => l.type !== 'same'),
  )
  const out: Array<DiffLine | null> = []
  for (const [index, line] of lines.entries()) {
    if (keep[index]) out.push(line)
    else if (out.at(-1) !== null && out.length > 0) out.push(null) // a gap
  }

  return out.at(-1) === null ? out.slice(0, -1) : out
}
