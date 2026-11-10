(function (globalScope) {
  const COLS = 10;
  const ROWS = 20;
  const SCORE_TABLE = [0, 100, 300, 500, 800];
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
  };

  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function rotateShape(shape) {
    return shape[0].map((_, column) => shape.map(row => row[column]).reverse());
  }

  function collides(board, piece, offsetX, offsetY) {
    return piece.shape.some((row, y) => row.some((cell, x) => {
      if (!cell) return false;
      const boardX = piece.x + x + offsetX;
      const boardY = piece.y + y + offsetY;
      return boardX < 0 || boardX >= COLS || boardY >= ROWS || (boardY >= 0 && board[boardY][boardX]);
    }));
  }

  function clearCompletedLines(board) {
    const remainingRows = board.filter(row => !row.every(Boolean));
    const cleared = ROWS - remainingRows.length;
    const emptyRows = Array.from({ length: cleared }, () => Array(COLS).fill(null));
    return { board: [...emptyRows, ...remainingRows], cleared };
  }

  function dropInterval(level) {
    return Math.max(120, 850 - (level - 1) * 70);
  }

  const api = { COLS, ROWS, SCORE_TABLE, SHAPES, createBoard, shuffle, rotateShape, collides, clearCompletedLines, dropInterval };
  globalScope.TetrisGame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window === 'undefined' ? globalThis : window));
