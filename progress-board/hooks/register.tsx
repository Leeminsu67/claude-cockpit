import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Plan, Status, Task } from '../types'
import { registerImages } from './images'

const PANE = 'progress'
const TOOL = 'mcp__progress-board__progress'
// 저장 모양을 바꾸면 태그도 바꾼다. 예전 버전이 남긴 값은 버리고 null로 읽는다
const plan = atom({ plugin: 'progress-board', key: 'plan' } as const, null as Plan | null, { shape: 'plan-2' })

const RULE = `## 진행판
사용자 화면 오른쪽에 진행판 패널이 떠 있다. 모든 요청에서 다른 도구를 쓰거나 답하기 전에 ${TOOL} 도구로 goal(요청을 한 줄로 요약)과 tasks(작업 목록)를 먼저 올린다. 질문에 답만 하는 요청도 작업 1개로 올린다.
작업은 예정 → 진행 중 → 완료로 바뀐다. 첫 작업은 올리자마자 진행 중이 되고, done(번호)과 note(무엇을 어떻게 했는지 한 줄)로 완료하면 다음 예정 작업이 진행 중이 된다. 순서를 건너뛸 때만 start(번호)로 진행 중을 직접 정한다. 계획이 바뀌면 tasks를 다시 올린다. 글은 한국어로 쓴다.`

type Input = { goal?: string; tasks?: string[]; start?: number; done?: number; note?: string }

const LABEL: Record<Status, string> = { todo: '예정', doing: '진행 중', done: '완료' }
const setStatus = (tasks: Task[], n: number, status: Status, note?: string) =>
  tasks.map((t, i) => (i === n - 1 ? { ...t, status, ...(note !== undefined && { note }) } : t))
// 진행 중이 하나도 없으면 첫 예정 작업을 진행 중으로 올린다
const advance = (tasks: Task[]) => {
  const next = tasks.findIndex(t => t.status === 'todo')
  return tasks.some(t => t.status === 'doing') || next < 0 ? tasks : setStatus(tasks, next + 1, 'doing')
}

// 질문 카드: 선택지 이름은 제품명(PostgreSQL 등)일 수 있어 빼고, 질문과 선택지 설명만 본다
const HANGUL = /[가-힣]/
type Question = { question: string; options: { description: string }[] }
const notKorean = (questions: Question[]) =>
  questions.flatMap(q => [q.question, ...q.options.map(o => o.description)]).find(t => t && !HANGUL.test(t))

const count = (p: Plan) => {
  const of = (s: Status) => p.tasks.filter(t => t.status === s).length
  const done = of('done')
  return { todo: of('todo'), doing: of('doing'), done, total: p.tasks.length, percent: Math.round((done * 100) / p.tasks.length) }
}

export const register: Register = on => {
  registerImages(on)

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'progress',
      isDeferred: false,
      description:
        '사용자 화면 오른쪽의 진행판 패널을 갱신한다. 요청을 시작할 때 goal과 tasks로 계획을 올리고, 작업을 하나 끝낼 때마다 done과 note로 완료 처리한다. 작업은 예정, 진행 중, 완료로 보인다.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: '요청을 한 줄로 요약한 목표. tasks와 함께 보낸다' },
          tasks: { type: 'array', items: { type: 'string' }, minItems: 1, description: '작업 제목 목록. 보내면 새 계획으로 바뀌고 첫 작업이 진행 중이 된다' },
          start: { type: 'integer', minimum: 1, description: '순서를 건너뛸 때만: 진행 중으로 바꿀 작업 번호 (1부터)' },
          done: { type: 'integer', minimum: 1, description: '방금 끝낸 작업 번호 (1부터). 다음 예정 작업이 자동으로 진행 중이 된다' },
          note: { type: 'string', description: 'done과 함께 보낸다. 무엇을 어떻게 했는지 한 줄' },
        },
      },
    })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes(TOOL)) return composed
    return { sections: [...composed.sections, { id: 'progress-board:rule', text: RULE, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    const english = notKorean(e.questions)
    return english ? { deny: `질문과 선택지 설명은 한국어로 다시 써서 물어보세요. 한국어가 아닌 부분: "${english}"` } : next(e)
  }).catch(($, e, next) => next(e)) // 검사가 실패해도 질문은 막지 않는다

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // 하위 에이전트가 메인 대화의 목록을 덮지 않게 한다
    if (e.agentId) return { result: '진행판은 메인 대화만 갱신합니다. 이 호출은 무시했습니다.' }

    const { goal, tasks, start, done, note } = e as Input
    let error: string | undefined
    const next = await update($, plan, p => {
      error = undefined
      if (tasks?.length) p = { goal: goal ?? '', tasks: advance(tasks.map(title => ({ title, status: 'todo' as const }))) }
      if (start === undefined && done === undefined) return p
      if (!p) {
        error = '계획이 없습니다. 먼저 goal과 tasks를 올리세요.'
        return p
      }
      const bad = [start, done].find(n => n !== undefined && (!Number.isInteger(n) || n < 1 || n > p!.tasks.length))
      if (bad !== undefined) {
        error = `작업 번호는 1~${p.tasks.length} 사이여야 합니다.`
        return p
      }
      let t = p.tasks
      if (start !== undefined) t = setStatus(t, start, 'doing')
      if (done !== undefined) t = advance(setStatus(t, done, 'done', note))
      return { ...p, tasks: t }
    })
    if (error) return { deny: error }
    if (!next) return { deny: 'goal과 tasks로 계획을 먼저 올리세요.' }

    if (tasks?.length) void $.ui.open({ id: PANE, title: '진행판', columns: 36 })
    const c = count(next)
    return { result: `예정 ${c.todo} · 진행 중 ${c.doing} · 완료 ${c.done} (${c.percent}%)` }
  }).catch(() => ({ deny: '진행판을 갱신하지 못했습니다.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const p = await read($, plan)
    if (!p) return <Text dimColor>아직 작업이 없습니다.</Text>

    const c = count(p)
    const label = ` ${c.done}/${c.total} · ${c.percent}%`
    const width = Math.max(4, e.props.bodyColumns - label.length)
    const filled = Math.round((width * c.done) / c.total)
    const numbered = p.tasks.map((t, i) => ({ ...t, n: i + 1 }))
    // 사용자가 정한 순서: 예정 → 진행 중 → 완료. 빈 칸은 그리지 않는다
    const section = (s: Status) => {
      const rows = numbered.filter(t => t.status === s)
      if (!rows.length) return null
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text weight="bold" color={s === 'done' ? 'success' : s === 'doing' ? 'warning' : 'subtle'}>
            {LABEL[s]} {rows.length}
          </Text>
          {rows.map(t =>
            s === 'done' ? (
              <Box flexDirection="column">
                <Text color="success">✓ {t.n}. {t.title}</Text>
                {t.note ? <Text dimColor>{'   ' + t.note}</Text> : null}
              </Box>
            ) : s === 'doing' ? (
              <Text weight="bold">▶ {t.n}. {t.title}</Text>
            ) : (
              <Text dimColor>· {t.n}. {t.title}</Text>
            ),
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text weight="bold">{p.goal}</Text>
        <Box flexDirection="row">
          <Text color="success">{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
          <Text>{label}</Text>
        </Box>
        {section('todo')}
        {section('doing')}
        {section('done')}
      </Box>
    )
  })
}
