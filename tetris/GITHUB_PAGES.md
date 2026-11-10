# GitHub Pages 배포 가이드

이 프로젝트는 `index.html`, `style.css`, `script.js`만 사용하는 정적 사이트이므로 빌드나 별도 서버 없이 GitHub Pages에 바로 배포할 수 있습니다.

배포 주소는 다음과 같습니다.

```text
https://lucianhwang.github.io/tetris/
```

## 1. GitHub에서 저장소 만들기

1. GitHub 계정 `LucianHwang`으로 로그인합니다.
2. [새 저장소 만들기](https://github.com/new)에서 아래처럼 입력합니다.
   - Repository name: `tetris`
   - Public: 선택
   - `Add a README file` 등 초기화 옵션: 선택하지 않음
3. **Create repository**를 누릅니다.

## 2. SSH 인증 확인

터미널에서 SSH 인증이 되는지 확인합니다.

```bash
ssh -T git@github.com
```

성공하면 `Hi LucianHwang!`를 포함한 인증 성공 메시지가 나옵니다. 처음 연결할 때 호스트 확인 질문이 나오면 `yes`를 입력합니다.

인증에 실패했다면 GitHub에 SSH 키를 등록해야 합니다.

```bash
# 이미 키가 있는지 확인
ls -al ~/.ssh

# 키가 없을 때 새 키 생성 (이메일 주소는 본인 GitHub 이메일로 변경)
ssh-keygen -t ed25519 -C "your_email@example.com"

# 공개 키 복사 (macOS)
pbcopy < ~/.ssh/id_ed25519.pub
```

그다음 GitHub의 **Settings → SSH and GPG keys → New SSH key**에서 복사한 공개 키를 등록한 뒤, 다시 `ssh -T git@github.com`을 실행합니다.

## 3. 현재 프로젝트를 GitHub로 올리기

프로젝트 폴더에서 다음 명령을 순서대로 실행합니다.

```bash
git init
git add index.html style.css script.js GITHUB_PAGES.md
git commit -m "Initial Tetris game"
git branch -M main
git remote add origin git@github.com:LucianHwang/tetris.git
git push -u origin main
```

이후 수정 사항을 배포하려면 다음만 반복하면 됩니다.

```bash
git add .
git commit -m "Describe your change"
git push
```

> 이미 `origin` 원격 저장소가 등록되어 있다면 `git remote add origin ...` 대신 아래 명령으로 주소를 바꿉니다.
>
> ```bash
> git remote set-url origin git@github.com:LucianHwang/tetris.git
> ```

## 4. GitHub Pages 켜기

1. GitHub 저장소 `LucianHwang/tetris`를 엽니다.
2. **Settings → Pages**로 이동합니다.
3. **Build and deployment**의 Source에서 **Deploy from a branch**를 선택합니다.
4. Branch를 `main`, 폴더를 `/(root)`로 선택하고 **Save**를 누릅니다.
5. 배포가 완료될 때까지 잠시 기다린 뒤 페이지 상단에 표시되는 주소를 엽니다.

`index.html`이 저장소 최상단에 있으므로 `main` 브랜치의 `/(root)`를 선택해야 합니다.

## 5. 배포 확인

아래 주소에서 게임이 열리고 시작 버튼, 키보드 조작, 모바일 터치 버튼이 정상 동작하는지 확인합니다.

```text
https://lucianhwang.github.io/tetris/
```

처음 배포하거나 푸시한 뒤 반영되기까지 1~몇 분 정도 걸릴 수 있습니다. 변경이 보이지 않으면 브라우저를 강력 새로고침하거나 GitHub 저장소의 **Actions** 탭에서 Pages 배포 상태를 확인합니다.

## 문제 해결

- `Permission denied (publickey)`: SSH 키가 GitHub 계정에 등록되어 있는지, `ssh -T git@github.com`이 성공하는지 확인합니다.
- `remote origin already exists`: 위의 `git remote set-url origin ...` 명령을 사용합니다.
- 페이지가 404: Pages 설정에서 브랜치가 `main`, 폴더가 `/(root)`인지와 `index.html`이 저장소 최상단에 있는지를 확인합니다.
- CSS/JS가 적용되지 않음: 파일 경로를 상대 경로(`style.css`, `script.js`)로 유지하고, 대소문자가 파일명과 정확히 일치하는지 확인합니다.
