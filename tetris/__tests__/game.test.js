const {
  COLS,
  ROWS,
  createBoard,
  clearCompletedLines,
  collides,
  dropInterval,
  rotateShape
} = require('../game');

describe('보드 생성', () => {
  test('10열 × 20행의 빈 보드를 만든다', () => {
    const board = createBoard();

    expect(board).toHaveLength(ROWS);
    expect(board.every(row => row.length === COLS)).toBe(true);
    expect(board.flat().every(cell => cell === null)).toBe(true);
  });

  test('행마다 서로 다른 배열을 만든다', () => {
    const board = createBoard();
    board[0][0] = 'T';

    expect(board[1][0]).toBeNull();
  });
});

describe('충돌 판정', () => {
  test('벽과 바닥 및 고정 블록을 충돌로 처리한다', () => {
    const board = createBoard();
    const piece = { shape: [[1]], x: 0, y: 0 };

    expect(collides(board, piece, -1, 0)).toBe(true);
    expect(collides(board, { ...piece, y: ROWS - 1 }, 0, 1)).toBe(true);
    board[1][0] = 'I';
    expect(collides(board, piece, 0, 1)).toBe(true);
  });

  test('보드 위쪽의 블록은 충돌로 처리하지 않는다', () => {
    const board = createBoard();
    const piece = { shape: [[1]], x: 4, y: -1 };

    expect(collides(board, piece, 0, 0)).toBe(false);
  });
});

describe('게임 규칙 계산', () => {
  test('완성 행을 제거하고 빈 행을 위쪽에 추가한다', () => {
    const board = createBoard();
    board[ROWS - 1].fill('T');
    board[ROWS - 2][0] = 'I';

    const result = clearCompletedLines(board);

    expect(result.cleared).toBe(1);
    expect(result.board).toHaveLength(ROWS);
    expect(result.board[0].every(cell => cell === null)).toBe(true);
    expect(result.board[ROWS - 1][0]).toBe('I');
  });

  test('회전된 행렬과 낙하 속도를 계산한다', () => {
    expect(rotateShape([[1, 0], [1, 1]])).toEqual([[1, 1], [1, 0]]);
    expect(dropInterval(1)).toBe(850);
    expect(dropInterval(2)).toBe(780);
    expect(dropInterval(99)).toBe(120);
  });
});
