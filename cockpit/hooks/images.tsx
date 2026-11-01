// claude-mods: 이미지 미리보기: 입력창 위에 붙여 넣은 이미지의 썸네일을 띄우고, #N 버튼을 누르면 오른쪽에 크게 보여 준다.
// 엔진은 입력 중인 이미지의 파일을 알려 주지 않는다. 그래서 Orca가 붙여 넣을 때마다 임시 폴더에 쓰는
// orca-paste-<밀리초>-<uuid>.png 파일을 새 [Image #N]과 붙여 넣은 순서대로 짝짓는다.
// ponytail: Orca 전용이다. 클립보드를 Claude Code가 직접 읽는 다른 터미널에서는 파일이 없어 썸네일이 안 뜬다
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

export type Img = { path: string; width?: number; height?: number }

const VIEW = 'image-view'
const PASTE = /^orca-paste-(\d+)-.*\.png$/
const TAG = /\[Image #(\d+)\]/g
const RECENT_MS = 60_000 // 이보다 오래된 파일은 이번 붙여 넣기로 보지 않는다

const images = atom({ plugin: 'cockpit', key: 'images' } as const, {} as Record<string, Img>)
const draft = atom({ plugin: 'cockpit', key: 'draft' } as const, [] as number[])
const viewing = atom({ plugin: 'cockpit', key: 'viewing' } as const, null as number | null)

export const tags = (text: string) => [...text.matchAll(TAG)].map(m => Number(m[1]))

/** 아직 짝이 없는 번호와 아직 안 쓴 파일을 붙여 넣은 순서대로, 가장 최근 것끼리 짝짓는다 */
export function pair(fresh: number[], files: { path: string; at: number }[]) {
  const n = Math.min(fresh.length, files.length)
  const nums = [...fresh].sort((a, b) => a - b).slice(fresh.length - n)
  const paths = [...files].sort((a, b) => a.at - b.at).slice(files.length - n)
  return nums.map((num, i) => [num, paths[i]!.path] as const)
}

/** 칸 안에 비율을 지켜 넣는다. 터미널 한 칸은 세로가 가로의 약 2배다 */
export function fit(img: Img, maxColumns: number, maxRows: number) {
  const ratio = img.width && img.height ? img.height / img.width : 10 / 16
  const columns = Math.max(1, Math.min(255, maxColumns, Math.round((maxRows * 2) / ratio)))
  const rows = Math.max(1, Math.min(255, maxRows, Math.round((columns * ratio) / 2)))
  return { columns, rows }
}

// PNG 머리(IHDR)의 가로·세로. 못 읽으면 비율 없이 둔다
async function pngSize($: EngineInterface, path: string): Promise<Partial<Img>> {
  try {
    const { base64 } = (await $.fs.read(path, { as: 'bytes' })) as { base64: string }
    const head = atob(base64.slice(0, 32))
    const u32 = (at: number) => ((head.charCodeAt(at) << 24) | (head.charCodeAt(at + 1) << 16) | (head.charCodeAt(at + 2) << 8) | head.charCodeAt(at + 3)) >>> 0
    return { width: u32(16), height: u32(20) }
  } catch {
    return {}
  }
}

let lastDraft: number[] = []

// 입력창 글이 바뀔 때: 지금 있는 [Image #N] 목록을 남기고, 새 번호는 최근 붙여 넣은 파일과 짝짓는다
async function track($: EngineInterface, text: string) {
  const nums = tags(text)
  if (nums.length !== lastDraft.length || nums.some((n, i) => n !== lastDraft[i])) {
    lastDraft = nums
    await update($, draft, () => nums)
  }
  const known = await read($, images)
  const fresh = nums.filter(n => !known[n])
  if (!fresh.length) return

  const dir = await $.env.get('TMPDIR')
  if (!dir) return
  const base = dir.endsWith('/') ? dir : dir + '/'
  const now = await $.clock.now()
  const used = new Set(Object.values(known).map(i => i.path))
  const files = (await $.fs.list(base)).flatMap(f => {
    const m = PASTE.exec(f.name)
    const at = m ? Number(m[1]) : 0
    return m && !used.has(base + f.name) && now - at < RECENT_MS ? [{ path: base + f.name, at }] : []
  })
  const added: Record<string, Img> = {}
  for (const [num, path] of pair(fresh, files)) added[num] = { path, ...(await pngSize($, path)) }
  if (Object.keys(added).length) await update($, images, m => ({ ...m, ...added }))
}

async function openView($: EngineInterface, n: number) {
  await update($, viewing, () => n)
  await $.ui.open({ id: VIEW, title: `이미지 #${n}`, focus: true, closeOnEscape: true, columns: 120 })
}

export function registerImages(on: On) {
  // 붙여 넣기·지우기·보내기 뒤 비우기는 prompt.change로, 손으로 지우는 것은 prompt.edit로 온다
  on('prompt.change', async ($, e, next) => {
    const r = await next(e)
    await track($, e.text)
    return r
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    void track($, e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end))
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const map = await read($, images)
    const shown = (await read($, draft)).filter(n => map[n])
    if (!shown.length) return next(e)

    const below = await next(e)
    const { Box, Button, Image } = $.ui.resolve(e)
    const thumb = Math.max(2, Math.min(5, e.props.maxRows - 4))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {shown.map(n => {
            const img = map[n]!
            return (
              <Box flexDirection="column" alignItems="center" borderStyle="round" paddingX={1}>
                <Image source={{ file: img.path, format: 'png' }} {...fit(img, 14, thumb)} alt={`#${n}`} />
                <Button key={`image-${n}`} plain onPress={() => openView($, n)}>
                  #{n}
                </Button>
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: VIEW }, async ($, e) => {
    const n = await read($, viewing)
    const img = n === null ? undefined : (await read($, images))[n]
    if (!img || e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{img ? img.path : '보여 줄 이미지가 없습니다.'}</Text>
    }
    const { Box, Text, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Image source={{ file: img.path, format: 'png' }} {...fit(img, e.props.bodyColumns, e.props.scroll.bodyRows - 1)} alt={`이미지 #${n}`} />
        <Text dimColor>Esc로 닫기</Text>
      </Box>
    )
  })
}
