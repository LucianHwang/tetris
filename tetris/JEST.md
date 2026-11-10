# Jest 프론트엔드 유닛 테스트 가이드

이 프로젝트는 현재 HTML/CSS/바닐라 JavaScript로 구성된 정적 테트리스 게임입니다. Jest는 Node.js에서 게임 규칙을 빠르게 검증하고, `jsdom` 환경으로 버튼·텍스트 같은 DOM 동작도 검증할 수 있습니다.

> 현재 `script.js`는 화면 요소 조회, 캔버스, 게임 상태, 게임 규칙이 하나의 전역 스크립트에 섞여 있어 그대로는 유닛 테스트하기 어렵습니다. 가장 효과적인 방법은 **게임 규칙을 DOM 없는 모듈로 분리**하고 그 모듈을 우선 테스트하는 것입니다.

## 1. 사전 확인

Node.js와 npm이 설치되어 있는지 확인합니다.

```bash
node --version
npm --version
```

Jest 30 기준으로 지원되는 Node.js 버전인지 확인한 뒤 진행합니다. 이 프로젝트에는 아직 `package.json`이 없으므로, 프로젝트 최상단에서 npm 프로젝트를 초기화합니다.

```bash
npm init -y
```

## 2. Jest 설치

게임 규칙만 테스트하는 경우에도 Jest를 설치합니다. DOM을 포함한 프론트엔드 동작도 테스트할 예정이므로 `jest-environment-jsdom`도 함께 설치합니다.

```bash
npm install --save-dev jest jest-environment-jsdom
```

설치 후 생성되는 `node_modules/`는 Git에 올리지 않습니다. `.gitignore` 파일에 아래 항목을 추가합니다.

```gitignore
node_modules/
coverage/
```

`package.json`의 `scripts`는 다음처럼 설정합니다.

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

## 3. Jest 설정

프로젝트 최상단에 `jest.config.js`를 만듭니다.

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['game.js'],
  coverageDirectory: 'coverage'
};
```

순수 게임 규칙 테스트에는 DOM이 필요 없으므로 `node` 환경을 사용합니다. DOM 테스트 파일만 필요한 경우 파일 첫 줄에 다음 주석을 추가하면 됩니다.

```js
/** @jest-environment jsdom */
```

전체 테스트를 `jsdom`으로 실행하고 싶다면 설정의 `testEnvironment` 값을 `'jsdom'`으로 변경합니다. 캔버스 API는 jsdom에서 완전하게 구현되지 않으므로, 그릴 필요가 없는 규칙 테스트에서는 캔버스 대신 데이터(보드 배열, 블록 좌표, 점수)를 검증합니다.

## 4. 테스트 가능한 구조로 분리하기

권장 파일 구조입니다.

```text
tetris/
├── index.html
├── style.css
├── script.js              # DOM 이벤트, 그리기, 화면 업데이트
├── game.js                # 순수 게임 규칙과 상태 계산
├── __tests__/
│   └── game.test.js
├── jest.config.js
└── package.json
```

`script.js`에서 테스트할 핵심 로직을 `game.js`로 옮깁니다. 예를 들면 아래 항목들입니다.

- `createBoard`, `shuffle`, `collides`
- 회전 행렬 계산
- 완성 행 제거와 점수 계산
- 레벨·낙하 속도 계산

`game.js`는 브라우저 API(`document`, `canvas`, `localStorage`, `requestAnimationFrame`)를 직접 호출하지 않게 만듭니다. CommonJS를 쓴다면 마지막에 필요한 함수만 내보냅니다.

```js
// game.js
const COLS = 10;
const ROWS = 20;
const SCORE_TABLE = [0, 100, 300, 500, 800];

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function dropInterval(level) {
  return Math.max(120, 850 - (level - 1) * 70);
}

module.exports = { COLS, ROWS, SCORE_TABLE, createBoard, dropInterval };
```

> 브라우저에서 이 모듈을 사용하려면 이후 `script.js`와 `game.js`를 ES 모듈(`export`/`import`) 방식으로 함께 전환하거나, 브라우저용 전역 객체를 별도로 노출하는 구조를 정해야 합니다. 테스트 도입 첫 단계에서는 게임 규칙 분리와 테스트 추가를 먼저 하고, 실제 브라우저 로딩 방식까지 바꾸는 작업은 별도 변경으로 진행하는 편이 안전합니다.

## 5. 첫 테스트 작성

`__tests__/game.test.js`를 만들고 다음 테스트부터 추가합니다.

```js
const { COLS, ROWS, createBoard, dropInterval } = require('../game');

describe('보드 생성', () => {
  test('10열 × 20행의 빈 보드를 만든다', () => {
    const board = createBoard();

    expect(board).toHaveLength(ROWS);
    expect(board.every((row) => row.length === COLS)).toBe(true);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  test('행마다 서로 다른 배열을 만든다', () => {
    const board = createBoard();
    board[0][0] = 'T';

    expect(board[1][0]).toBeNull();
  });
});

describe('낙하 속도', () => {
  test('레벨이 높아질수록 빨라지고 최솟값은 120ms다', () => {
    expect(dropInterval(1)).toBe(850);
    expect(dropInterval(2)).toBe(780);
    expect(dropInterval(99)).toBe(120);
  });
});
```

현재 구현에 맞춰 우선순위가 높은 테스트는 다음과 같습니다.

1. `collides`: 좌우 벽, 바닥, 고정 블록, 보드 위쪽(`y < 0`) 충돌 판정
2. `rotatePiece`: 회전 성공과 벽 근처 보정, 회전 불가 시 원상 복구
3. `clearLines`: 1·2·3·4줄 삭제, 빈 행 보충, 점수·라인·레벨 갱신
4. `randomPiece`: 한 묶음(7-bag)에 7종 블록이 정확히 한 번씩 포함되는지
5. `hardDrop`: 이동 거리당 점수와 블록 고정 여부

## 6. 테스트 실행

```bash
# 한 번 실행
npm test

# 파일 저장 시 관련 테스트 재실행
npm run test:watch

# 커버리지 보고서 생성
npm run test:coverage
```

커버리지 실행 뒤 HTML 보고서는 `coverage/lcov-report/index.html`에서 열 수 있습니다. 커버리지 수치 자체보다 충돌, 행 삭제, 점수 계산처럼 실패 시 게임에 직접 영향을 주는 규칙을 먼저 보호하는 것이 좋습니다.

특정 테스트 파일 또는 이름만 실행할 수도 있습니다.

```bash
npx jest __tests__/game.test.js
npx jest -t "보드 생성"
```

## 7. DOM 테스트 예시

버튼 문구나 점수 표시처럼 화면 동작을 검증할 때는 jsdom을 사용합니다. 이 경우 HTML을 `document.body.innerHTML`에 준비하고, 캔버스가 필요하면 `getContext`를 모킹합니다.

```js
/** @jest-environment jsdom */

test('시작 버튼이 존재한다', () => {
  document.body.innerHTML = '<button id="start-button">시작</button>';

  expect(document.querySelector('#start-button').textContent).toBe('시작');
});
```

실제 `script.js`를 DOM 테스트에서 불러오려면 `HTMLCanvasElement.prototype.getContext`, `requestAnimationFrame`, `localStorage` 등의 브라우저 API를 테스트용으로 준비해야 합니다. 따라서 DOM 테스트는 순수 규칙 테스트가 안정화된 뒤에 추가하는 것을 권장합니다.

## 참고 자료

- [Jest 공식 시작 안내](https://jestjs.io/docs/getting-started): 설치, `test` 스크립트, 기본 테스트 작성법
- [Jest 공식 설정 문서](https://jestjs.io/docs/configuration): `jest.config.js`, 테스트 파일 탐색, `node`/`jsdom` 환경 설정
