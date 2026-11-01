// claude-mods: 우리가 더한 기능(진행판, 한국어 질문 카드 검사, 이미지 미리보기, /glowup update) 검사
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { fakeFs } from './kit.ts'
import { BOARD_SPEC } from '../hooks/board.tsx'
import { fit, pair, tags } from '../hooks/images.tsx'
import { isNewer, upstreamText } from '../hooks/upstream.ts'

const TOOL = 'mcp__cockpit__progress'
const PANE = { plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'glowup', props: { title: 'glowup', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const

type On = Parameters<typeof fakeFs>[0]
function boot(on: On) {
  fakeFs(on)
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never) // 엔진 대신 답한다
}
let n = 0
const progress = ($: Parameters<TestBody>[0], input: Record<string, unknown>) =>
  $.tool.call({ tool: TOOL, tool_use_id: `p${++n}`, ...input } as never) as Promise<{ result?: unknown; deny?: string }>

test('진행판: 예정·진행 중·완료로 나뉘어 Plan 탭에 그려지고 완료하면 다음 작업이 진행 중이 된다', { timeoutMs: 20000 }, async ($, on) => {
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  expect((await progress($, { goal: '검사', tasks: ['가', '나', '다'] })).result).toBe('예정 2 · 진행 중 1 · 완료 0 (0%)')
  expect((await progress($, { done: 1, note: '이렇게 했다' })).result).toBe('예정 1 · 진행 중 1 · 완료 1 (33%)')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^검사$/ })).toBeDefined()
  expect(await ui.find({ text: / 1\/3 · 33%/ })).toBeDefined()
  expect(await ui.find({ text: /^예정 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^진행 중 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^완료 1$/ })).toBeDefined()
  expect(await ui.find({ text: /▶ 2\. / })).toBeDefined()
  expect(await ui.find({ text: /이렇게 했다/ })).toBeDefined()
  expect(await ui.find({ text: /No task list yet/ })).toBeUndefined()
  await ui.unmount()
})

test('진행판 규칙은 도구 설명에도 들어 있다(시스템 프롬프트 단계가 건너뛰어져도 전달되게)', () => {
  expect(BOARD_SPEC.description).toContain('모든 요청에서 다른 도구를 쓰거나 답하기 전에')
  expect(BOARD_SPEC.description.length).toBeLessThan(4096) // 모델에 전달되는 도구 설명 한도
})

test('진행판: start로 순서를 건너뛰고, 없는 번호와 계획 없는 완료는 거부한다', async ($, on) => {
  boot(on)
  expect((await progress($, { done: 1, note: 'x' })).deny).toMatch(/계획이 없습니다/)
  await progress($, { goal: '검사', tasks: ['가', '나', '다'] })
  expect((await progress($, { start: 3 })).result).toBe('예정 1 · 진행 중 2 · 완료 0 (0%)')
  expect((await progress($, { done: 1, note: '끝' })).result).toBe('예정 1 · 진행 중 1 · 완료 1 (33%)')
  expect((await progress($, { done: 4, note: 'x' })).deny).toMatch(/1~3/)
})

test('진행판: 하위 에이전트의 호출은 목록을 바꾸지 않는다', { timeoutMs: 20000 }, async ($, on) => {
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await progress($, { goal: '메인', tasks: ['가'] })
  await progress($, { agentId: 'sub', goal: '하위', tasks: ['나'] })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^메인$/ })).toBeDefined()
  expect(await ui.find({ text: /하위/ })).toBeUndefined()
  await ui.unmount()
})

test('진행판 탭 열기 기본값(요청마다): 다른 탭을 보고 있어도 새 계획이 오면 Plan 탭으로 넘어간다', { timeoutMs: 20000 }, async ($, on) => {
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await progress($, { goal: '첫 요청', tasks: ['가'] })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ text: /첫 요청/ })).toBeUndefined()
  await progress($, { goal: '둘째 요청', tasks: ['나'] })
  await ui.redraw()
  expect(await ui.find({ text: /둘째 요청/ })).toBeDefined()
  await ui.unmount()
})

test('진행판 탭 열기 "처음 한 번": 두 번째 계획부터는 탭을 바꾸지 않는다', { timeoutMs: 20000, options: { planTab: '처음 한 번' } }, async ($, on) => {
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await progress($, { goal: '첫 요청', tasks: ['가'] })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  await progress($, { goal: '둘째 요청', tasks: ['나'] })
  await ui.redraw()
  expect(await ui.find({ text: /둘째 요청/ })).toBeUndefined()
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ text: /둘째 요청/ })).toBeDefined()
  await ui.unmount()
})

const ask = ($: Parameters<TestBody>[0], question: string, description: string) =>
  $.tool.call({
    tool: 'AskUserQuestion',
    tool_use_id: `q${++n}`,
    questions: [{ question, header: 'DB', multiSelect: false, options: [{ label: 'PostgreSQL', description }, { label: 'SQLite', description: '파일 하나로 끝난다' }] }],
  } as never) as Promise<{ deny?: string }>

test('한국어 질문 카드 검사: 영어 질문 카드는 막고 한국어 질문 카드는 통과시킨다', async ($, on) => {
  boot(on)
  expect((await ask($, 'Which database?', '가장 많이 쓴다')).deny).toMatch(/Which database\?/)
  expect((await ask($, '어떤 DB를 쓸까요?', 'Most popular')).deny).toMatch(/Most popular/)
  expect((await ask($, '어떤 DB를 쓸까요?', '가장 많이 쓴다')).deny).toBeUndefined()
})

test('한국어 질문 카드 검사를 끄면 영어 질문도 통과한다', { options: { koreanQuestions: false } }, async ($, on) => {
  boot(on)
  expect((await ask($, 'Which database?', 'Most popular')).deny).toBeUndefined()
})

test('이미지 미리보기: 붙여 넣은 순서대로 짝짓고 비율을 지켜 줄인다', () => {
  expect(tags('가 [Image #6] 나 [Image #7]')).toEqual([6, 7])
  expect(pair([7, 6], [{ path: '/t/b.png', at: 2 }, { path: '/t/a.png', at: 1 }])).toEqual([[6, '/t/a.png'], [7, '/t/b.png']])
  // 파일이 모자라면 가장 최근 번호에 가장 최근 파일을 준다
  expect(pair([6, 7], [{ path: '/t/b.png', at: 2 }])).toEqual([[7, '/t/b.png']])
  // 1600×1000 이미지를 14칸×5줄 안에: 세로가 먼저 찬다
  expect(fit({ path: '', width: 1600, height: 1000 }, 14, 5)).toEqual({ columns: 14, rows: 4 })
  expect(fit({ path: '', width: 1000, height: 1000 }, 40, 10)).toEqual({ columns: 20, rows: 10 })
})

test('이미지 미리보기: 입력창 위에 썸네일과 #N 버튼을 그리고 아래 것을 지우지 않는다', async ($, on) => {
  on('ui.panes', async () => ({ value: [] })) // glowup 띠가 묻는다
  on('state.get', (_, e) => {
    const key = (e as { key: string }).key
    const value = key === 'draft' ? [7] : key === 'images' ? { 7: { path: '/t/a.png', width: 1600, height: 1000 } } : undefined
    return { value: { value, version: 1 } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>엔진</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'cockpit',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })
  expect((await ui.find({ type: 'Image' }))?.props?.alt).toBe('#7')
  expect((await ui.find({ key: 'image-7' }))?.text).toBe('#7')
  expect((await ui.find({ type: 'Text', text: '엔진' }))?.text).toBe('엔진')
  await ui.unmount()
})

test('/glowup update: 원래 glowup의 최신 릴리스와 합친 버전을 비교해 알린다', async () => {
  expect(isNewer('v1.3.0', '1.2.0')).toBe(true)
  expect(isNewer('v1.2.0', '1.2.0')).toBe(false)
  expect(isNewer('v1.10.0', '1.9.9')).toBe(true)
  expect(isNewer('v1.1.9', '1.2.0')).toBe(false)

  const host = (r: { ok: boolean; status: number; text: string } | Error) => ({
    fetchText: async () => { if (r instanceof Error) throw r; return r },
  })
  const newer = await upstreamText(host({ ok: true, status: 200, text: JSON.stringify({ tag_name: 'v1.3.0' }) }))
  expect(newer).toMatch(/새 버전 v1\.3\.0이 나왔습니다\(지금 합친 버전 1\.2\.0\)/)
  expect(newer).toMatch(/releases\/tag\/v1\.3\.0/)
  expect(await upstreamText(host({ ok: true, status: 200, text: JSON.stringify({ tag_name: 'v1.2.0' }) }))).toMatch(/최신입니다/)
  expect(await upstreamText(host({ ok: false, status: 403, text: '' }))).toMatch(/GitHub 응답 403/)
  expect(await upstreamText(host(new Error('timed out after 10 s')))).toMatch(/확인하지 못했습니다\(timed out/)
})
