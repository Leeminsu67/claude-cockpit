# claude-mods

Claude Code를 내 작업 방식에 맞게 바꾸는 mod 모음입니다.
mod는 Claude Code의 화면과 동작을 바꾸는 플러그인으로, Claude Code 2.1.287부터 쓸 수 있습니다.

| mod | 하는 일 |
|---|---|
| [progress-board](#progress-board) | 작업 진행판, 한국어 질문 카드 검사, 붙여 넣은 이미지 미리보기 |

## 설치

이 저장소는 비공개입니다. 설치하는 맥에서 GitHub 인증이 먼저 되어 있어야 합니다.
설치 명령은 인증을 묻지 않고 실패만 하기 때문입니다.

```bash
gh auth login        # GitHub 로그인 (SSH 키를 이미 쓰고 있다면 생략)
gh auth setup-git    # git이 gh 로그인을 쓰게 한다
```

그다음 Claude Code 입력창에서:

```
/plugin install progress-board --marketplace Leeminsu67/claude-mods
```

마켓플레이스를 추가할지 물으면 `y`, 범위는 맨 위의 사용자(user) 범위를 고릅니다.
설치한 세션에서 바로 켜지고, 그 뒤로 여는 모든 세션에서 켜집니다.

터미널 셸에서 설치하려면:

```bash
claude plugin install progress-board --marketplace Leeminsu67/claude-mods
```

### 업데이트

```bash
claude plugin update progress-board@claude-mods
```

이어서 Claude Code 입력창에서 `/reload-plugins`를 실행하면 반영됩니다.

### 끄기·지우기

- 잠깐 끄기: `/plugin`에서 `progress-board`를 끕니다
- 지우기: `claude plugin uninstall progress-board@claude-mods`

## progress-board

### 1. 진행판

화면 오른쪽에 작업 목록을 띄웁니다. Claude가 요청마다 목표와 작업 목록을 먼저 올리고, 하나씩 끝낼 때마다 무엇을 어떻게 했는지 한 줄 메모와 함께 완료 처리합니다.

```
진행판 mod 만들기
████████░░░░░░░░░░░  2/5 · 40%

예정 2
· 4. 검사
· 5. 보고
진행 중 1
▶ 3. 패널 그리기
완료 2
✓ 1. 타입 확인
   패널 위치는 오른쪽 세로 패널만 가능함을 확인
✓ 2. 도구 등록
   progress 도구를 세션 시작 때 등록
```

- 작업은 **예정 → 진행 중 → 완료**로 바뀝니다. 첫 작업은 올리자마자 진행 중이 되고, 하나를 완료하면 다음 예정 작업이 진행 중이 됩니다
- 질문 하나에 답하는 요청도 작업 1개로 올립니다
- 하위 에이전트가 진행판을 고치려 하면 무시해서, 메인 대화의 목록이 덮이지 않습니다
- Claude Code의 기본 할 일 도구(TaskCreate 등)는 최신 모델에서 꺼져 있어서, 이 mod가 `progress` 도구를 직접 등록해 씁니다

### 2. 한국어 질문 카드 검사

Claude가 질문 카드(AskUserQuestion)를 띄울 때 질문이나 선택지 설명에 한글이 하나도 없으면, 카드를 띄우지 않고 한국어로 다시 쓰게 돌려보냅니다.
선택지 이름은 검사하지 않습니다. `PostgreSQL`처럼 제품명일 수 있어서입니다.

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

## 필요한 환경

| 항목 | 조건 |
|---|---|
| Claude Code | 2.1.287 이상 (2.1.316에서 만들고 확인) |
| 화면 모드 | 전체 화면 모드(`"tui": "fullscreen"`). 진행판은 터미널이 144칸 이상이면 저절로 열리고, 한 번 연 뒤로는 110칸부터 열립니다 |
| 이미지 미리보기 | 그림을 그릴 수 있는 터미널(kitty, Ghostty, iTerm2 3.5 이상, Orca에서 확인)과 **Orca의 이미지 붙여 넣기** |

## 함께 켜면 좋은 설정

mod에 들어 있지 않으니 `~/.claude/settings.json`에 맥마다 한 번씩 넣습니다.

```json
{
  "language": "korean",
  "theme": "dark"
}
```

- `language`: 모든 프로젝트에서 Claude가 한국어로 답합니다
- `theme`: 터미널 바탕이 어두우면 `dark`로 맞춥니다. 밝은 테마로 두면 오른쪽 패널 바탕이 흰색으로 나옵니다

## 한계

- 진행판은 화면 모서리에 떠 있는 작은 상자로 만들 수 없습니다. mod 패널은 오른쪽 세로 패널과 입력창 위, 두 자리만 쓸 수 있습니다
- 다른 mod도 오른쪽 패널을 쓰면(예: glowup) 탭으로 나뉘어 한 번에 하나만 보입니다
- 권한 확인 창, 질문 카드의 `Other` 버튼처럼 Claude Code가 직접 그리는 화면은 한국어로 바꿀 수 없습니다
- 이미지 미리보기는 Orca 전용입니다. Claude Code가 입력 중인 이미지의 파일 위치를 mod에 알려 주지 않아서, Orca가 붙여 넣을 때마다 임시 폴더에 만드는 `orca-paste-*.png` 파일을 시각 순서로 짝짓습니다. PNG만 되고, 붙여 넣은 지 1분이 넘은 파일은 짝짓지 않습니다
- 그림 자체는 누를 수 없어서 아래의 `#N` 버튼으로 엽니다
- 보낸 메시지에는 지금처럼 `[Image #N]` 글자로만 남습니다

## 개발

mod를 고치는 맥에서는 설치하지 말고 이 저장소 폴더를 그대로 불러옵니다. `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/<사용자>/.claude/mods/progress-board"
  }
}
```

- 마켓플레이스로도 설치하면 같은 mod가 두 번 불러와지니 둘 중 하나만 씁니다
- 파일을 저장하면 실행 중인 세션에 자동으로 다시 적용됩니다
- 고친 뒤 검사:

```bash
claude plugin validate progress-board   # 엔진이 거부할 내용이 있는지
claude plugin test progress-board       # hooks/register.test.tsx
```

```
claude-mods/
├─ .claude-plugin/marketplace.json   이 저장소가 마켓플레이스라는 표시와 mod 목록
└─ progress-board/
   ├─ .claude-plugin/plugin.json     mod 이름·버전·설명
   ├─ hooks/register.tsx             진행판, 진행판 도구, 질문 카드 검사
   ├─ hooks/images.tsx               이미지 미리보기
   ├─ hooks/register.test.tsx        검사
   └─ types/index.d.ts               mod가 저장하는 값의 형식
```
