# Docker Compose 기반 MySQL 전환 가이드

## 목적과 범위

현재 백엔드는 `main.py`에서 프로젝트 루트의 `tetris.db` SQLite 파일을 직접 사용한다. 이를 Docker Compose로 실행하는 MySQL로 바꾸되, 기존 API 경로와 응답 형식은 유지한다.

- 대상 데이터: `users`, `game_records`
- 유지 대상 API: 회원가입, 로그인, 내 정보, 리더보드, 게임 기록 저장
- 권장 MySQL 버전: `mysql:8.4` (LTS)
- 개발 실행 방식: `docker compose up --build`

> MySQL 컨테이너의 데이터는 named volume에 보관한다. 컨테이너를 다시 만들어도 데이터는 유지되지만, `docker compose down -v`를 실행하면 삭제된다.

## 1. 추가·변경할 파일

| 파일 | 작업 |
| --- | --- |
| `compose.yaml` | MySQL과 FastAPI 서비스, 볼륨, 헬스체크 정의 |
| `Dockerfile` | FastAPI 애플리케이션 컨테이너 이미지 정의 |
| `.dockerignore` | 가상환경, 캐시, `tetris.db`, 비밀 파일을 이미지에서 제외 |
| `.env.example` | 필요한 환경 변수의 이름만 공유 |
| `requirements.txt` | MySQL 드라이버 추가 (예: `PyMySQL`) |
| `main.py` | SQLite 연결/SQL/예외/타입 의존성을 MySQL 방식으로 교체 |
| `scripts/migrate_sqlite_to_mysql.py` | 필요 시 기존 SQLite 기록을 한 번 이전하는 도구 |
| `README.md` | Docker Compose 실행법과 환경 변수 문서화 |
| `__tests__/` | MySQL 통합 테스트 및 초기화 검증 추가 |

`.env`에는 실제 비밀번호와 `TETRIS_SECRET_KEY`를 두고 Git에 올리지 않는다. `.gitignore`에 `.env`, `tetris.db`, 백업 파일을 추가한다.

## 2. 환경 변수 설계

애플리케이션은 SQLite 경로 대신 아래 값을 사용한다. 컨테이너 내부에서는 DB 호스트를 서비스 이름인 `db`로 지정한다.

```dotenv
# .env.example -- 실제 값은 .env에 저장
MYSQL_DATABASE=tetris
MYSQL_USER=tetris_app
MYSQL_PASSWORD=change-me-app-password
MYSQL_ROOT_PASSWORD=change-me-root-password
MYSQL_HOST=db
MYSQL_PORT=3306
TETRIS_SECRET_KEY=change-me-long-random-secret
```

프로덕션에서는 `.env` 대신 배포 환경의 Secret 관리 기능을 사용한다. 루트 계정은 스키마 초기화나 긴급 점검에만 사용하고, 애플리케이션은 `MYSQL_USER` 권한으로 접속한다.

## 3. Docker Compose 구성

`compose.yaml`에는 다음 요소가 필요하다.

```yaml
services:
  db:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    ports:
      - "3306:3306" # 로컬 DB 도구가 필요 없으면 제거 가능
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h localhost -uroot -p$${MYSQL_ROOT_PASSWORD} --silent"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 20s

  web:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      MYSQL_HOST: db
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  mysql-data:
```

`web` 서비스는 `uvicorn main:app --host 0.0.0.0 --port 8000`으로 실행한다. `depends_on` 헬스체크는 시작 순서를 개선하지만 네트워크 지연을 완전히 막지는 못하므로, 애플리케이션의 DB 연결도 제한 횟수만큼 재시도하도록 구현한다.

## 4. 백엔드 코드 전환

### 4-1. 드라이버와 연결 관리

`requirements.txt`에 `PyMySQL`을 추가하고, `main.py`에서 `sqlite3`을 제거한다. `database()` 컨텍스트 매니저는 다음 특성을 가져야 한다.

- `pymysql.connect()`에 host, port, user, password, database, `charset="utf8mb4"`, `autocommit=False`를 전달한다.
- `cursorclass=pymysql.cursors.DictCursor`를 사용해 기존의 `row["id"]`, `row["email"]` 접근을 유지한다.
- 예외 발생 시 `rollback()`, 정상 종료 시 `commit()`, 항상 `close()`를 수행한다.
- 시작 시 스키마 생성 전에 MySQL 연결을 재시도하고, 재시도 한도를 넘으면 명확한 로그와 함께 기동을 실패시킨다.

현재의 `sqlite3.Row`, `sqlite3.Connection` 타입 표기는 `Mapping[str, object]` 같은 DB-독립 타입으로 바꾸거나 PyMySQL 타입으로 교체한다.

### 4-2. SQL 문법과 예외

PyMySQL의 바인드 변수 표기는 `?`가 아니라 `%s`다. 따라서 `main.py`의 모든 쿼리를 변경해야 한다.

| 현재 SQLite 방식 | MySQL 방식 |
| --- | --- |
| `WHERE id = ?` | `WHERE id = %s` |
| `(... VALUES (?, ?))` | `(... VALUES (%s, %s))` |
| `sqlite3.IntegrityError` | `pymysql.err.IntegrityError` |
| `connection.execute(...)` | `with connection.cursor() as cursor: cursor.execute(...)` |
| `cursor.lastrowid` | `cursor.lastrowid` (유지 가능) |

값을 문자열 결합으로 SQL에 넣지 말고, 반드시 `%s` 파라미터 바인딩을 사용한다.

### 4-3. 스키마 초기화

SQLite 전용 문법인 `COLLATE NOCASE`와 `executescript()`를 제거한다. MySQL 연결 문자셋과 정렬 규칙을 명시하고 각 `CREATE` 문을 순서대로 실행한다.

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS game_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  score INT UNSIGNED NOT NULL,
  lines INT UNSIGNED NOT NULL,
  level TINYINT UNSIGNED NOT NULL,
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_game_records_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  KEY idx_game_records_score (score DESC, played_at ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Pydantic 입력 검증이 이미 음수와 상한을 막으므로 애플리케이션 규칙은 유지된다. DB 수준의 `CHECK` 제약도 추가할 수 있지만, MySQL 8.4에서 실제 적용되는지 통합 테스트로 확인해야 한다. 이메일은 현재 애플리케이션이 소문자로 정규화하므로, 대소문자 비구분 unique 정렬 규칙과 함께 중복 가입을 일관되게 막을 수 있다.

초기 `CREATE TABLE IF NOT EXISTS`는 작은 프로젝트에는 충분하다. 이후 스키마 변경이 누적되면 시작 시 임의 SQL을 실행하는 방식 대신 버전 관리되는 마이그레이션 도구(예: Alembic)를 도입한다.

## 5. 기존 SQLite 데이터 이전

기존 기록을 보존해야 한다면 전환 전에 SQLite DB 파일을 복사해 백업하고, 새 MySQL에 이전한다.

1. 서비스를 중지하거나 쓰기 요청을 막아 데이터가 추가되지 않게 한다.
2. `tetris.db`를 읽기 전용 백업으로 복사한다.
3. MySQL 스키마를 먼저 생성한다.
4. 이전 스크립트에서 SQLite의 `users`를 ID 순서대로 MySQL에 insert한다.
5. `game_records`를 같은 `user_id`로 insert한다. FK가 있으므로 사용자보다 먼저 넣으면 안 된다.
6. 사용자 수, 게임 기록 수, 최고 점수와 리더보드 결과를 양쪽 DB에서 비교한다.
7. 확인 뒤 API의 DB 설정을 MySQL로 전환한다. 문제가 생기면 SQLite 백업과 기존 설정으로 되돌린다.

이전 스크립트는 한 트랜잭션으로 처리하고, `INSERT` 파라미터 바인딩 및 배치 삽입을 사용한다. 재실행 가능하도록 대상이 비어 있는지 검사하거나, 명시적인 `--truncate-target` 옵션을 제공한다. 비밀번호 해시는 이미 문자열로 저장되어 있으므로 변환하지 않는다.

## 6. 검증 항목

### 자동 검증

- `docker compose config`로 Compose 변수와 문법을 검사한다.
- `docker compose up --build` 뒤 `db`가 `healthy`, `web`이 정상 기동하는지 확인한다.
- 기존 Jest 게임 로직 테스트가 통과하는지 확인한다.
- 별도 FastAPI API 테스트에서 회원가입, 중복 이메일(409), 로그인, 인증 실패(401), 게임 저장, 리더보드를 확인한다.
- 테스트 전용 MySQL DB를 사용해 FK, unique 제약, 트랜잭션 rollback, 재기동 후 데이터 유지(named volume)를 확인한다.

### 수동 검증

1. `http://127.0.0.1:8000`에서 가입·로그인한다.
2. 게임을 한 판 종료하여 기록을 저장하고 최고 점수가 갱신되는지 확인한다.
3. `docker compose restart web` 이후도 로그인 사용자와 기록이 남아 있는지 확인한다.
4. `docker compose down` 후 다시 올려도 데이터가 남는지 확인한다. (`-v` 옵션은 사용하지 않는다.)
5. 모바일/데스크톱의 게임 UI 및 기존 키보드 조작이 API 전환 후에도 그대로 동작하는지 확인한다.

## 7. 실행·운영 명령

```bash
# 최초 실행: .env.example을 복사한 뒤 실제 비밀번호를 .env에 입력
cp .env.example .env
docker compose up --build

# 상태와 로그 확인
docker compose ps
docker compose logs -f web

# 컨테이너만 중지 (MySQL 데이터 볼륨 유지)
docker compose down

# MySQL 데이터까지 삭제 — 로컬 개발 DB를 완전히 초기화할 때만 사용
docker compose down -v
```

배포 전에는 DB 포트 `3306`을 외부에 노출하지 않고, 애플리케이션 네트워크에서만 접근 가능하게 한다. 정기 백업은 컨테이너 밖의 안전한 저장소에 `mysqldump` 결과를 보관하고, 복구 절차도 별도로 점검한다.

## 권장 구현 순서

1. `.env.example`, `.gitignore`, `Dockerfile`, `.dockerignore`, `compose.yaml`을 추가한다.
2. 드라이버 의존성과 `main.py`의 연결 관리·SQL·예외 처리를 MySQL로 전환한다.
3. 빈 MySQL에서 스키마 생성, API, 화면 저장 흐름을 검증한다.
4. 기존 `tetris.db`가 있다면 백업·이전·건수 비교를 수행한다.
5. 통합 테스트와 README를 갱신하고, 비밀 정보·DB 데이터가 Git에 포함되지 않았는지 검토한다.
