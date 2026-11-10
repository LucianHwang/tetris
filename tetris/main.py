"""Block Drop FastAPI backend and static web server.

Run with: uvicorn main:app --reload
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.environ.get("TETRIS_DATABASE_PATH", BASE_DIR / "tetris.db"))
# Set TETRIS_SECRET_KEY in production. The fallback is suitable only for local use.
SECRET_KEY = os.environ.get("TETRIS_SECRET_KEY", "block-drop-local-development-key")
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7

app = FastAPI(title="Block Drop API", version="1.0.0")


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_database() -> None:
    with database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS game_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                score INTEGER NOT NULL CHECK(score >= 0),
                lines INTEGER NOT NULL CHECK(lines >= 0),
                level INTEGER NOT NULL CHECK(level >= 1),
                played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_game_records_score
              ON game_records(score DESC, played_at ASC);
            """
        )


@app.on_event("startup")
def startup() -> None:
    initialize_database()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt_hex, digest_hex = encoded.split("$", 1)
        expected = bytes.fromhex(digest_hex)
        actual = bytes.fromhex(hash_password(password, bytes.fromhex(salt_hex)).split("$", 1)[1])
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_token(user_id: int) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
    signature = hmac.new(SECRET_KEY.encode(), encoded, hashlib.sha256).digest()
    return f"{encoded.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def decode_token(token: str) -> int:
    try:
        encoded, received_signature = token.split(".", 1)
        expected_signature = hmac.new(SECRET_KEY.encode(), encoded.encode(), hashlib.sha256).digest()
        padding = "=" * (-len(received_signature) % 4)
        signature = base64.urlsafe_b64decode(received_signature + padding)
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError
        payload_padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded + payload_padding))
        if not isinstance(payload.get("sub"), int) or payload.get("exp", 0) < time.time():
            raise ValueError
        return payload["sub"]
    except (ValueError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다.")


def current_user(authorization: Annotated[str | None, Header()] = None) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다.")
    user_id = decode_token(authorization.removeprefix("Bearer "))
    with database() as connection:
        user = connection.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 사용자입니다.")
    return user


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class GameRecordInput(BaseModel):
    score: int = Field(ge=0, le=9_999_999)
    lines: int = Field(ge=0, le=99_999)
    level: int = Field(ge=1, le=99)


def validate_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
        raise HTTPException(status_code=422, detail="올바른 이메일 주소를 입력하세요.")
    return cleaned


def auth_response(user: sqlite3.Row) -> dict:
    return {"token": create_token(user["id"]), "user": {"id": user["id"], "email": user["email"]}}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(credentials: Credentials):
    email = validate_email(credentials.email)
    try:
        with database() as connection:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, hash_password(credentials.password)),
            )
            user = connection.execute("SELECT id, email FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.")
    return auth_response(user)


@app.post("/api/auth/login")
def login(credentials: Credentials):
    email = validate_email(credentials.email)
    with database() as connection:
        user = connection.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    return auth_response(user)


@app.get("/api/auth/me")
def me(user: Annotated[sqlite3.Row, Depends(current_user)]):
    return {"id": user["id"], "email": user["email"]}


def leaderboard(connection: sqlite3.Connection) -> dict:
    best = connection.execute(
        """SELECT u.email, r.score FROM game_records r
           JOIN users u ON u.id = r.user_id
           ORDER BY r.score DESC, r.played_at ASC LIMIT 1"""
    ).fetchone()
    return {"score": best["score"] if best else 0, "email": best["email"] if best else None}


@app.get("/api/leaderboard")
def get_leaderboard():
    with database() as connection:
        return leaderboard(connection)


@app.post("/api/games", status_code=status.HTTP_201_CREATED)
def save_game(record: GameRecordInput, user: Annotated[sqlite3.Row, Depends(current_user)]):
    with database() as connection:
        connection.execute(
            "INSERT INTO game_records (user_id, score, lines, level) VALUES (?, ?, ?, ?)",
            (user["id"], record.score, record.lines, record.level),
        )
        return {"saved": True, "leaderboard": leaderboard(connection)}


@app.get("/")
def frontend():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/style.css")
def stylesheet():
    return FileResponse(BASE_DIR / "style.css", media_type="text/css")


@app.get("/game.js")
def game_script():
    return FileResponse(BASE_DIR / "game.js", media_type="application/javascript")


@app.get("/script.js")
def browser_script():
    return FileResponse(BASE_DIR / "script.js", media_type="application/javascript")
