// claude-mods: /glowup update. 원래 glowup(NovusEdge/glowup)의 최신 릴리스를 확인해, 합쳐 둔 버전보다 새로우면 알린다.
// 사용자가 명령을 입력할 때만 확인한다(자동 확인 없음).
import type { Host } from './host.ts'

const REPO = 'NovusEdge/glowup'
// 합쳐 둔 glowup 원본 버전. 새 버전을 합치면 여기를 바꾼다. cockpit 자체 버전은 plugin.json에 따로 매긴다(2.0.0부터)
export const GLOWUP_BASE = '1.2.0'
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`

const parts = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map(n => Number.parseInt(n, 10) || 0)
/** a가 b보다 새 버전인지 (주.부.수 숫자만 비교) */
export function isNewer(a: string, b: string) {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!
  return false
}

export async function upstreamText(host: Pick<Host, 'fetchText'>): Promise<string> {
  const current = GLOWUP_BASE
  let tag: string
  try {
    const r = await host.fetchText(LATEST)
    if (!r.ok) return `glowup 새 버전을 확인하지 못했습니다(GitHub 응답 ${r.status}).`
    tag = String((JSON.parse(r.text) as { tag_name?: unknown }).tag_name ?? '')
    if (!tag) throw new Error('tag_name 없음')
  } catch (err) {
    return `glowup 새 버전을 확인하지 못했습니다(${err instanceof Error ? err.message : String(err)}).`
  }
  if (!isNewer(tag, current)) return `glowup은 최신입니다(합친 버전 ${current}, 최신 ${tag}).`
  return `glowup 새 버전 ${tag}이 나왔습니다(지금 합친 버전 ${current}). Claude에게 "glowup 새 버전 합쳐 줘"라고 하세요. 바뀐 내용: https://github.com/${REPO}/releases/tag/${tag}`
}
