# Block Drop

FastAPI와 SQLite를 사용해 이메일 회원가입, 로그인, 게임 기록 및 전체 최고점수 기능을 제공하는 테트리스입니다.

## 실행

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

브라우저에서 `http://127.0.0.1:8000`을 열어 회원가입 또는 로그인 후 플레이하세요. `index.html`을 파일로 직접 열면 API가 없으므로 인증과 기록 저장은 작동하지 않습니다.

게임 기록은 프로젝트 루트의 `tetris.db` SQLite 파일에 저장됩니다. 운영 환경에서는 `TETRIS_SECRET_KEY` 환경 변수를 반드시 설정하세요.
