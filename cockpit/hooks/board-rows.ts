// claude-mods: 진행판 계획을 Plan 탭의 행으로 그린다.
// 순서는 사용자가 정한 예정 → 진행 중 → 완료이고, 빈 구역은 그리지 않는다.
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'
import { fit, visibleLength, type Seg } from './layout.tsx'
import { wrapBubble } from './bubbles.ts'

const SECTIONS = [['pending', '예정'], ['in_progress', '진행 중'], ['completed', '완료']] as const
const cells = (text: string) => visibleLength([{ text, color: '' }])

export function boardRows(m: Model, t: Theme, w: number, lead: string): Seg[][] {
  const c = t.colors
  // head 뒤에 text를 줄바꿈해 붙이고, 둘째 줄부터는 head 폭만큼 들여 쓴다
  const para = (head: Seg, text: string, color: string, bold: boolean, maxLines: number): Seg[][] =>
    wrapBubble(text, Math.max(8, w - cells(lead + head.text)), maxLines, cells).map((line, i) => [
      { text: lead, color: c.text },
      i ? { text: ' '.repeat(cells(head.text)), color } : head,
      { text: line, color, ...(bold && { bold }) },
    ])

  const total = m.plan.length
  const done = m.plan.filter(p => p.status === 'completed').length
  const label = ` ${done}/${total} · ${total ? Math.round((done * 100) / total) : 0}%`
  const bar = Math.max(4, w - cells(lead + label))
  const filled = total ? Math.round((bar * done) / total) : 0

  const rows: Seg[][] = []
  if (m.planGoal) rows.push(...para({ text: '', color: c.text }, m.planGoal, c.text, true, 2))
  rows.push([{ text: lead, color: c.text }, { text: '█'.repeat(filled), color: c.pass }, { text: '░'.repeat(bar - filled), color: c.faint }, { text: label, color: c.text }])

  const numbered = m.plan.map((p, i) => ({ ...p, n: i + 1 }))
  for (const [status, name] of SECTIONS) {
    const items = numbered.filter(p => p.status === status)
    if (!items.length) continue
    const color = status === 'completed' ? c.pass : status === 'in_progress' ? c.accent : c.dim
    rows.push([], [{ text: `${lead}${name} ${items.length}`, color, bold: true }])
    for (const p of items) {
      if (status === 'completed') {
        rows.push(...para({ text: `✓ ${p.n}. `, color: c.pass }, p.title, c.pass, false, 2))
        if (p.note) rows.push(...para({ text: '   ', color: c.dim }, p.note, c.dim, false, 3))
      } else if (status === 'in_progress') rows.push(...para({ text: `▶ ${p.n}. `, color: c.accent }, p.title, c.text, true, 2))
      else rows.push(...para({ text: `· ${p.n}. `, color: c.dim }, p.title, c.dim, false, 2))
    }
  }
  return rows.map(r => fit(r, w))
}
