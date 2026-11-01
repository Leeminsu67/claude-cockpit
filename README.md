# claude-cockpit

Claude Code 화면 오른쪽 패널에 작업 진행판, 컨텍스트 사용량, 하위 에이전트, 바뀐 파일을 모아 보는 mod입니다.
[NovusEdge/glowup](https://github.com/NovusEdge/glowup) 1.2.0을 바탕으로, 진행판(Plan 탭), 한국어 질문 카드 검사, 이미지 미리보기, `/cockpit update`를 더했습니다.

mod는 Claude Code의 화면과 동작을 바꾸는 플러그인으로, Claude Code 2.1.287부터 쓸 수 있습니다.

## 설치

이 저장소는 비공개입니다. 설치하는 맥에서 GitHub 인증이 먼저 되어 있어야 합니다.
인증이 안 되어 있으면 설치 명령이 인증을 묻지 않고 실패합니다.

```bash
gh auth login        # GitHub 로그인 (SSH 키를 이미 쓰고 있다면 생략)
gh auth setup-git    # git이 gh 로그인을 쓰게 한다
```

예전에 설치한 것이 있으면 먼저 지웁니다. 같은 기능이 두 번 불러와지지 않게 하기 위해서입니다. 설치되어 있던 것만 지우면 됩니다.

```bash
claude plugin uninstall glowup@glowup                # 원래 glowup
claude plugin uninstall progress-board@claude-mods   # 예전 진행판 mod
claude plugin uninstall glowup@claude-mods           # 이 저장소의 예전 이름
```

그다음 Claude Code 입력창에서:

```
/plugin install cockpit --marketplace Leeminsu67/claude-cockpit
```

- 마켓플레이스를 추가할지 물으면 `y`를 누릅니다.
- 범위는 맨 위의 사용자(user) 범위를 고릅니다.
- 설치한 세션에서 바로 켜지고, 그 뒤로 여는 모든 세션에서도 켜집니다.
- 처음 켜면 상태줄을 대신 그릴지 묻습니다. 쓰던 상태줄을 그대로 두려면 "아니오"를 고릅니다.

터미널 셸에서 설치하려면:

```bash
claude plugin install cockpit --marketplace Leeminsu67/claude-cockpit
```

### 업데이트

```bash
claude plugin update cockpit@claude-cockpit
```

이어서 Claude Code 입력창에서 `/reload-plugins`를 실행하면 반영됩니다.

### 끄기·지우기

- 잠깐 끄기: `/plugin`에서 `cockpit`을 끕니다
- 지우기: `claude plugin uninstall cockpit@claude-cockpit`

## 기능

명령은 모두 `/cockpit`으로 시작합니다.

> glowup에서 가져온 도움말과 안내문에는 명령이 `/glowup ...`으로 적혀 있습니다. 입력할 때는 `/cockpit ...`으로 바꿔 씁니다.

| glowup에서 온 기능 | 하는 일 |
|---|---|
| 오른쪽 패널 | `Plan & context`, `Agents`, `Diff`, `Changes`, `Music` 탭으로 계획, 컨텍스트 사용량, 하위 에이전트, 바뀐 파일, 음악을 보여 줍니다 |
| 입력창 위 띠 | 연속 성공 횟수, 하위 에이전트, 사용량, 계획 진행을 한 줄로 보여 줍니다 |
| 펫 | 패널 아래에서 작업 상태에 따라 움직이고, 레벨이 오르면 옷이 풀립니다. 하트는 5시간 한도와 주간 한도 중 더 빠듯한 쪽의 남은 양입니다 |
| 테마·팩·상태줄 | `/cockpit theme`, `/cockpit pack`, `/cockpit statusline on` 등으로 바꿉니다 |

명령 전체는 [cockpit/docs/commands.md](cockpit/docs/commands.md)에 있습니다(`/glowup`을 `/cockpit`으로 바꿔 읽습니다).

아래 1~4는 이 저장소에서 더한 기능입니다.

### 1. 진행판 (Plan 탭)

Claude가 요청마다 목표와 작업 목록을 먼저 올리고, 하나씩 끝낼 때마다 무엇을 어떻게 했는지 한 줄 메모와 함께 완료 처리합니다. 오른쪽 패널의 Plan 탭에 이렇게 그려집니다.

```
╭ PLAN ───────────────────── 2/5 ╮
│ 진행판 mod 만들기              │
│ ████████░░░░░░░░  2/5 · 40%    │
│                                │
│ 예정 2                         │
│ · 4. 검사                      │
│ · 5. 보고                      │
│                                │
│ 진행 중 1                      │
│ ▶ 3. 패널 그리기               │
│                                │
│ 완료 2                         │
│ ✓ 1. 타입 확인                 │
│    패널 위치를 확인함          │
│ ✓ 2. 도구 등록                 │
│    progress 도구를 등록        │
╰────────────────────────────────╯
```

- 작업은 **예정 → 진행 중 → 완료**로 바뀝니다. 첫 작업은 올리자마자 진행 중이 되고, 하나를 완료하면 다음 예정 작업이 진행 중이 됩니다
- 질문 하나에 답하는 요청도 작업 1개로 올립니다
- 입력창 위 띠와 상태줄(`plan` 필드)의 진행 표시도 같이 채워집니다
- 새 목록을 올리면 Plan 탭으로 넘어갑니다. 처음 한 번만 넘어가게 하려면 `/config`에서 바꿉니다
- 하위 에이전트가 진행판을 고치려 하면 무시합니다. 그래서 메인 대화의 목록이 덮이지 않습니다
- Claude Code의 기본 할 일 도구(TaskCreate 등)는 최신 모델에서 꺼져 있습니다. 그래서 이 mod가 `progress` 도구(`mcp__cockpit__progress`)를 직접 등록해 씁니다

### 2. 한국어 질문 카드 검사

Claude가 질문 카드(AskUserQuestion)를 띄울 때 질문이나 선택지 설명에 한글이 하나도 없으면, 카드를 띄우지 않고 한국어로 다시 쓰게 돌려보냅니다.
선택지 이름은 `PostgreSQL`처럼 제품명일 수 있어서 검사하지 않습니다. `/config`에서 끌 수 있습니다.

### 3. 이미지 미리보기

입력창에 이미지를 붙여 넣으면 입력창 바로 위에 썸네일 카드가 뜹니다.

```
╭──────────────╮ ╭──────────────╮
│  [썸네일]    │ │  [썸네일]    │
│     #6       │ │     #7       │
╰──────────────╯ ╰──────────────╯
> 이거 봐 줘 [Image #6] [Image #7]
```

- 카드 아래 `#N`을 누르면(또는 Tab으로 옮겨 Enter) 오른쪽에 크게 보여 주고, Esc로 닫습니다
- 입력창에서 `[Image #N]`을 지우면 카드도 사라지고, 보내면 비워집니다
- 썸네일과 큰 미리보기 모두 원본 비율을 지킵니다

### 4. `/cockpit update`

바탕이 된 glowup(NovusEdge/glowup)의 최신 릴리스를 확인해, 이 저장소에 합쳐 둔 버전보다 새로우면 알려 줍니다. 명령을 입력할 때만 확인합니다.

```
glowup 새 버전 v1.3.0이 나왔습니다(지금 합친 버전 1.2.0). Claude에게 "glowup 새 버전 합쳐 줘"라고 하세요. 바뀐 내용: https://github.com/NovusEdge/glowup/releases/tag/v1.3.0
```

## 설정

`/config` 화면에서 `cockpit`으로 표시된 항목들입니다.

| 항목 | 값 | 기본값 |
|---|---|---|
| 한국어 질문 카드 검사 | 켜기/끄기 | 켜기 |
| 진행판 탭 열기 | 요청마다 / 처음 한 번 | 요청마다 |
| Theme, Pack, Spinner, Pet | 화면 모양 | classic, classic, pack, clawd |
| Speech bubbles | on / off / haiku (haiku는 사용량을 조금 씀) | on |
| Reduced motion | 움직임 줄이기 | 끄기 |
| Status line fields | 상태줄에 보일 항목 | activity,ctx,effort,5h,week |

패널 탭과 입력창 위 띠의 구성은 `/cockpit setup`으로 바꿉니다.

```
/cockpit setup tabs plan,agents,diff,changes   # Music 탭 빼기 (Plan 탭에는 컨텍스트 사용량도 있으니 남겨 둡니다)
/cockpit setup band none                        # 입력창 위 띠 끄기
```

## 필요한 환경

| 항목 | 조건 |
|---|---|
| Claude Code | 2.1.287 이상 (2.1.316에서 만들고 확인) |
| 화면 모드 | 전체 화면 모드(`"tui": "fullscreen"`). 오른쪽 패널은 터미널이 144칸 이상이면 저절로 열리고, 한 번 연 뒤로는 110칸부터 열립니다. 좁으면 `/cockpit pane`으로 엽니다 |
| 이미지 미리보기 | **Orca** 터미널. Orca의 에이전트 실행 기능으로 띄우면 그대로 되고, 셸에서 `claude`를 직접 실행하면 아래 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` 설정이 필요합니다 |

## 함께 켜면 좋은 설정

mod에 들어 있지 않은 설정이라 `~/.claude/settings.json`에 맥마다 한 번씩 넣습니다.

```json
{
  "env": {
    "CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1"
  },
  "language": "korean",
  "theme": "dark"
}
```

- `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`: 터미널 이름과 상관없이 그림을 켭니다. Orca 셸에서 `claude`를 직접 실행할 때 이미지 미리보기에 필요합니다. 그림을 못 그리는 터미널(VS Code 터미널, macOS 기본 터미널 등)에서도 켜지므로, 그런 곳에서 화면에 이상한 글자가 보이면 빼세요
- `language`: 모든 프로젝트에서 Claude가 한국어로 답합니다
- `theme`: 터미널 바탕이 어두우면 `dark`로 맞춥니다. 밝은 테마로 두면 오른쪽 패널 바탕이 흰색으로 나옵니다

## 한계

- mod 패널은 오른쪽 세로 패널과 입력창 위 두 자리만 쓸 수 있습니다. 화면 모서리에 떠 있는 작은 상자로는 만들 수 없습니다
- glowup에서 온 화면 글(탭 이름, `CONTEXT`, 도움말 등)은 원래대로 영어이고, 도움말 속 명령은 `/glowup`으로 적혀 있습니다
- 사용자 팩·펫·테마 폴더는 glowup과 같은 `~/.claude/glowup/`을 씁니다
- 권한 확인 창, 질문 카드의 `Other` 버튼처럼 Claude Code가 직접 그리는 화면은 한국어로 바꿀 수 없습니다
- 이미지 미리보기는 Orca 전용입니다
  - Claude Code가 입력 중인 이미지의 파일 위치를 mod에 알려 주지 않습니다
  - 그래서 Orca가 붙여 넣을 때마다 임시 폴더에 만드는 `orca-paste-*.png` 파일을 시각 순서로 짝짓습니다
  - PNG만 되고, 붙여 넣은 지 1분이 넘은 파일은 짝짓지 않습니다
  - Claude Code는 터미널 이름이 kitty나 Ghostty일 때만 그림을 켭니다. Orca는 여기에 해당하지 않아서 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`이 없으면 그림 대신 `#N` 글자가 나옵니다([함께 켜면 좋은 설정](#함께-켜면-좋은-설정))
- 그림 자체는 누를 수 없어서 아래의 `#N` 버튼으로 엽니다
- 보낸 메시지에는 지금처럼 `[Image #N]` 글자로만 남습니다

## glowup 새 버전 합치기

glowup 원본은 `upstream-glowup` 브랜치의 `glowup/` 폴더에 따로 둡니다. `main`의 `cockpit/` 폴더는 그 원본에 우리 변경을 얹은 상태입니다. 새 버전이 나오면 원본 브랜치만 새 버전으로 바꾼 뒤 `main`에 merge합니다. 3-way merge라서 우리 변경은 유지되고, 겹치는 곳만 충돌로 나옵니다. git이 `glowup/` → `cockpit/` 폴더 이름 바뀜을 알아서 따라갑니다.

```bash
cd <이 저장소>
V=v1.3.0   # 새 버전 태그

# 1) upstream-glowup 브랜치에 새 원본을 넣는다 (README용 그림 docs/assets는 뺀다)
git clone -q --depth 1 --branch $V https://github.com/NovusEdge/glowup.git /tmp/glowup-$V
git worktree add /tmp/upstream-wt upstream-glowup
rsync -a --delete --exclude .git --exclude docs/assets /tmp/glowup-$V/ /tmp/upstream-wt/glowup/
git -C /tmp/upstream-wt add -A
git -C /tmp/upstream-wt commit -m "glowup $V 원본 가져오기"
git worktree remove /tmp/upstream-wt

# 2) main에 합친다
git merge upstream-glowup
```

합친 뒤 확인할 것:

- 충돌은 우리가 고친 파일에서만 날 수 있습니다. 해당 줄에는 모두 `claude-mods` 주석이 붙어 있습니다
- 새로 생긴 파일이 `glowup/` 폴더에 따로 생겼으면 `cockpit/`으로 옮깁니다
- 새 테스트에 `plugin: 'glowup'`, `command: 'glowup'`이 있으면 `cockpit`으로 바꿉니다
- 아래 [개발](#개발)의 검사를 돌리고, `main`과 `upstream-glowup` 두 브랜치를 모두 push합니다

## 개발

mod를 고치는 맥에서는 설치하지 말고 이 저장소의 `cockpit` 폴더를 그대로 불러옵니다. `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/<사용자>/<이 저장소>/cockpit"
  }
}
```

- 마켓플레이스로도 설치하면 같은 mod가 두 번 불러와집니다. 둘 중 하나만 씁니다
- 이 설정은 Claude Code가 시작할 때만 읽습니다. 바꾼 뒤에는 새 세션을 엽니다
- 파일을 저장하면 실행 중인 세션에 자동으로 다시 적용됩니다
- 고친 뒤에는 아래로 검사합니다

```bash
claude plugin validate --strict cockpit   # 엔진이 거부할 내용이 있는지
claude plugin test cockpit                # 테스트 전체 (약 2분)
```

- **테스트**: glowup에서 온 테스트 중 10개는 Claude Code 2.1.316에서 원본 그대로 돌려도 실패합니다. 권한 대화상자 알림 6개, 펫·음악·금요일 표시 4개입니다. 우리 기능 테스트는 `cockpit/test/claude-mods.test.tsx`에 있습니다
- **타입 검사**: `cockpit/types/vendor`의 엔진 타입은 2.1.289 기준입니다. 우리 코드가 쓰는 새 기능(`isDeferred`, `prompt.change`)이 없어서, 타입 검사는 지금 엔진의 타입으로 합니다

우리가 바꾼 곳:

```
claude-cockpit/
├─ .claude-plugin/marketplace.json   이 저장소가 마켓플레이스라는 표시와 mod 목록
└─ cockpit/                          NovusEdge/glowup 1.2.0 원본 + 아래 변경
   ├─ hooks/board.tsx                진행판 도구·규칙, 한국어 질문 카드 검사     (새 파일)
   ├─ hooks/board-rows.ts            Plan 탭의 진행판 그리기                   (새 파일)
   ├─ hooks/images.tsx               이미지 미리보기                            (새 파일)
   ├─ hooks/upstream.ts              /cockpit update                            (새 파일)
   ├─ test/claude-mods.test.tsx      우리 기능 테스트                           (새 파일)
   ├─ hooks/register.tsx             위 기능 연결, Plan 탭 전환, 명령·패널 이름  (claude-mods 주석)
   ├─ hooks/events.ts, model.ts      계획 항목에 메모, 모델에 목표              (claude-mods 주석)
   ├─ hooks/pane.tsx                 Plan 탭에서 진행판 그리기 선택             (claude-mods 주석)
   ├─ types/state.d.ts               저장값 형식, 플러그인 이름                 (claude-mods 주석)
   ├─ test/*.ts                      저장 키·명령 이름을 cockpit으로
   └─ .claude-plugin/plugin.json     이름 cockpit, /config 항목 2개
```

## 출처와 라이선스

`cockpit/` 폴더는 [NovusEdge/glowup](https://github.com/NovusEdge/glowup)(Copyright (c) 2026 Aliasgar Khimani, MIT License)을 바탕으로 했습니다. 원본 라이선스는 [cockpit/LICENSE](cockpit/LICENSE)에 그대로 있습니다.
