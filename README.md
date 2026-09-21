# 트윗 아카이버 설정 가이드 (GitHub 레포 "twitter" + Gist)

## 핵심 개념 먼저
- **레포 "twitter"**: 코드 저장소. 이 프로젝트 파일들을 백업/버전관리하고, GitHub Pages를 켜면 `webapp/archive.html`을 URL로 열 수 있게 해줌.
- **Gist**: 실제 트윗 데이터(`tweet-archive.json`)가 저장되는 곳. 레포와는 **완전히 별개**로 하나 더 만들어야 함. 레포에 올린다고 자동 생기지 않음.

즉 이번에 만드신 "twitter" 레포에는 **코드만** 올라가고, 데이터는 Gist에 올라갑니다.

## 1단계 — 레포에 코드 업로드
받으신 폴더(`extension/`, `webapp/`, 이 `README.md`)를 그대로 "twitter" 레포 루트에 push 하시면 됩니다.

```bash
cd twitter          # 로컬에 클론해둔 레포 폴더
# 압축 푼 extension/, webapp/, README.md 를 여기로 복사
git add .
git commit -m "트윗 아카이버 추가"
git push
```

## 2단계 — GitHub Pages 켜서 웹앱 호스팅 (선택이지만 추천)
1. 레포 "twitter" → Settings → Pages
2. Source를 "Deploy from a branch" → `main` 브랜치, 폴더는 `/ (root)` 선택 → Save
3. 몇 분 후 `https://<본인아이디>.github.io/twitter/webapp/archive.html` 로 접속 가능해짐
   - 이렇게 해두면 로컬 파일을 열 필요 없이 어느 기기에서든 이 URL로 바로 아카이브를 볼 수 있어요

## 3단계 — 데이터용 Gist 별도 생성 (필수)
1. GitHub 로그인 상태에서 https://github.com/settings/tokens 접속 → **Classic token** 발급
   - `gist` 권한만 체크 (Fine-grained token은 Gist API를 지원하지 않으니 꼭 Classic으로)
   - 토큰 값(`ghp_...`)은 다시 볼 수 없으니 복사해두기
2. https://gist.github.com 에서 새 Gist 생성
   - 파일 이름: `tweet-archive.json`
   - 내용: `{"items": []}`
   - **Secret gist**로 생성 (Public 아님)
   - 생성된 URL에서 ID만 복사 (`https://gist.github.com/아이디/이부분이ID`)

## 4단계 — 크롬 확장 프로그램 설치
1. `chrome://extensions` → 개발자 모드 켜기
2. "압축해제된 확장 프로그램을 로드합니다" → `extension` 폴더 선택
3. 확장 프로그램 아이콘 클릭 → 3단계에서 만든 토큰 + Gist ID 입력 → 저장

### (선택) 매번 입력하기 귀찮다면 — 로컬 자동 채움
`extension/local-config.js` 파일을 열어서 토큰/Gist ID를 채워두면, 이 컴퓨터에서 확장 프로그램을 새로
로드할 때 팝업에 자동으로 채워집니다. 이 파일은 `.gitignore`에 등록되어 있어서 git으로 push할 땐
자동 제외되지만, **GitHub 웹사이트에서 직접 드래그로 업로드하는 방식은 .gitignore가 적용되지 않으니
이 파일만큼은 절대 같이 올리지 마세요.**

## 5단계 — 웹앱에서도 같은 정보 입력
1. 2단계에서 켠 Pages URL(또는 로컬 `webapp/archive.html`)을 엽니다
2. 처음 열면 설정 모달이 뜸 → 같은 GitHub 토큰 + Gist ID 입력

## 사용 흐름
1. 트위터(x.com)에서 평소처럼 트윗 작성 (인용 트윗도 자동 캡처)
2. 마음에 드는 남의 트윗은 액션바에 생긴 "＋" 클릭
3. 아카이브 웹앱 열고 "새로고침" → 미분류에 새 트윗 확인
4. 폴더 선택 + 태그 입력 → "저장"

## 주의
- **Gist를 Public으로 만들지 마세요.** 트윗 내용이 아카이빙되는 저장소라 Secret으로 해야 안전합니다. (Secret이어도 링크를 아는 사람은 볼 수 있으니 완전 비공개는 아니지만, 검색/목록엔 노출 안 됨)
- 레포 "twitter"에 GitHub 토큰이나 Gist ID를 **커밋하지 마세요.** 팝업/웹앱 입력값은 로컬 저장소에만 저장되니 그대로 push해도 안전하지만, `extension/local-config.js`에 직접 채워넣은 값은 반드시 업로드에서 제외하세요.
- X가 내부 API 구조를 바꾸면 자동 캡처가 일시적으로 안 될 수 있어요. "＋" 수동 추가는 그것과 무관하게 계속 작동합니다.
