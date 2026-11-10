const { COLS, ROWS, SCORE_TABLE, SHAPES, createBoard, shuffle, rotateShape, collides: doesCollide, clearCompletedLines, dropInterval } = TetrisGame;
const BLOCK_SIZE = 30;
const COLORS = {
  I: '#55dff5', J: '#6387ff', L: '#ffad5d', O: '#ffe36c',
  S: '#72e59b', T: '#bd7cff', Z: '#ff7189'
};

const boardCanvas = document.querySelector('#game-board');
const boardContext = boardCanvas.getContext('2d');
const nextCanvas = document.querySelector('#next-piece');
const nextContext = nextCanvas.getContext('2d');
const overlay = document.querySelector('#game-overlay');
const statusText = document.querySelector('#game-status');
const scoreText = document.querySelector('#score');
const bestScoreText = document.querySelector('#best-score');
const levelText = document.querySelector('#level');
const linesText = document.querySelector('#lines');
const startButton = document.querySelector('#start-button');
const pauseButton = document.querySelector('#pause-button');
const restartButton = document.querySelector('#restart-button');
const levelDownButton = document.querySelector('#level-down');
const levelUpButton = document.querySelector('#level-up');
const authForm = document.querySelector('#auth-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const registerButton = document.querySelector('#register-button');
const logoutButton = document.querySelector('#logout-button');
const accountStatus = document.querySelector('#account-status');

let board = [];
let currentPiece;
let nextPiece;
let bag = [];
let score = 0;
let lines = 0;
let level = 1;
let selectedLevel = 1;
let bestScore = 0;
let authToken = localStorage.getItem('block-drop-token');
let currentUser = null;
let isPlaying = false;
let isPaused = false;
let animationFrame;
let lastDropTime = 0;

function randomPiece() {
  if (!bag.length) bag = shuffle(Object.keys(SHAPES));
  const type = bag.pop();
  return { type, shape: SHAPES[type].map(row => [...row]), x: 0, y: 0 };
}

function placeAtSpawn(piece) {
  piece.x = Math.floor((COLS - piece.shape[0].length) / 2);
  piece.y = -1;
  return piece;
}

function startGame() {
  if (!currentUser) {
    accountStatus.textContent = '게임을 시작하려면 로그인 또는 회원가입이 필요합니다.';
    return;
  }
  cancelAnimationFrame(animationFrame);
  board = createBoard();
  score = 0;
  lines = 0;
  level = selectedLevel;
  bag = [];
  currentPiece = placeAtSpawn(randomPiece());
  nextPiece = randomPiece();
  isPlaying = true;
  isPaused = false;
  lastDropTime = performance.now();
  overlay.hidden = true;
  statusText.textContent = '게임 진행 중';
  startButton.textContent = '새 게임';
  pauseButton.disabled = false;
  pauseButton.textContent = '일시정지';
  updateInterface();
  draw();
  animationFrame = requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  if (!isPlaying || isPaused) return;
  if (timestamp - lastDropTime >= dropInterval(level)) {
    movePiece(0, 1);
    lastDropTime = timestamp;
  }
  draw();
  animationFrame = requestAnimationFrame(gameLoop);
}

function adjustLevel(amount) {
  const minimumLevel = isPlaying ? selectedLevel + Math.floor(lines / 10) : 1;
  level = Math.max(minimumLevel, Math.min(11, level + amount));
  if (!isPlaying) selectedLevel = level;
  lastDropTime = performance.now();
  updateInterface();
}

function movePiece(moveX, moveY) {
  if (!isPlaying || isPaused) return false;
  if (!collides(currentPiece, moveX, moveY)) {
    currentPiece.x += moveX;
    currentPiece.y += moveY;
    draw();
    return true;
  }
  if (moveY) lockPiece();
  return false;
}

function rotatePiece() {
  if (!isPlaying || isPaused) return;
  const rotated = rotateShape(currentPiece.shape);
  const originalShape = currentPiece.shape;
  currentPiece.shape = rotated;
  for (const offset of [0, -1, 1, -2, 2]) {
    if (!collides(currentPiece, offset, 0)) {
      currentPiece.x += offset;
      draw();
      return;
    }
  }
  currentPiece.shape = originalShape;
}

function hardDrop() {
  if (!isPlaying || isPaused) return;
  let distance = 0;
  while (!collides(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    distance += 1;
  }
  score += distance * 2;
  lockPiece();
}

function collides(piece, offsetX, offsetY) {
  return doesCollide(board, piece, offsetX, offsetY);
}

function lockPiece() {
  currentPiece.shape.forEach((row, y) => row.forEach((cell, x) => {
    const boardY = currentPiece.y + y;
    if (cell && boardY >= 0) board[boardY][currentPiece.x + x] = currentPiece.type;
  }));
  clearLines();
  currentPiece = placeAtSpawn(nextPiece);
  nextPiece = randomPiece();
  if (collides(currentPiece, 0, 0)) endGame();
  updateInterface();
  draw();
}

function clearLines() {
  let cleared = 0;
  const result = clearCompletedLines(board);
  board = result.board;
  cleared = result.cleared;
  if (!cleared) return;
  lines += cleared;
  score += SCORE_TABLE[cleared] * level;
  level = Math.max(level, selectedLevel + Math.floor(lines / 10));
}

function endGame() {
  isPlaying = false;
  cancelAnimationFrame(animationFrame);
  updateInterface();
  statusText.textContent = '게임 오버';
  pauseButton.disabled = true;
  overlay.innerHTML = '<strong>GAME OVER</strong><span>다시 시작 버튼으로 한 번 더 도전하세요</span>';
  overlay.hidden = false;
  saveGameRecord();
}

function togglePause() {
  if (!isPlaying) return;
  isPaused = !isPaused;
  pauseButton.textContent = isPaused ? '계속하기' : '일시정지';
  statusText.textContent = isPaused ? '일시정지됨' : '게임 진행 중';
  if (isPaused) {
    overlay.innerHTML = '<strong>PAUSED</strong><span>계속하기 버튼 또는 P 키를 누르세요</span>';
    overlay.hidden = false;
    cancelAnimationFrame(animationFrame);
  } else {
    overlay.hidden = true;
    lastDropTime = performance.now();
    animationFrame = requestAnimationFrame(gameLoop);
  }
}

function updateInterface() {
  scoreText.textContent = String(score).padStart(6, '0');
  bestScoreText.textContent = String(bestScore).padStart(6, '0');
  levelText.textContent = String(level).padStart(2, '0');
  linesText.textContent = String(lines).padStart(2, '0');
  const minimumLevel = isPlaying ? selectedLevel + Math.floor(lines / 10) : 1;
  levelDownButton.disabled = level <= minimumLevel;
  levelUpButton.disabled = level >= 11;
}

async function requestApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || '서버 요청에 실패했습니다.');
  return data;
}

function updateAccountInterface(message) {
  const isLoggedIn = Boolean(currentUser);
  authForm.hidden = isLoggedIn;
  logoutButton.hidden = !isLoggedIn;
  startButton.disabled = !isLoggedIn;
  restartButton.disabled = !isLoggedIn;
  accountStatus.textContent = isLoggedIn
    ? (message || `${currentUser.email}님, 플레이 기록이 저장됩니다.`)
    : (message || '로그인하면 게임 기록이 저장됩니다.');
}

function applyAuth(data, message) {
  authToken = data.token;
  currentUser = data.user;
  localStorage.setItem('block-drop-token', authToken);
  passwordInput.value = '';
  updateAccountInterface(message);
}

async function authenticate(endpoint) {
  if (!authForm.reportValidity()) return;
  const label = endpoint === 'register' ? '회원가입' : '로그인';
  accountStatus.textContent = `${label} 중…`;
  try {
    const data = await requestApi(`/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
    });
    applyAuth(data, endpoint === 'register' ? '회원가입 완료! 이제 게임을 시작할 수 있습니다.' : '로그인 완료! 행운을 빕니다.');
  } catch (error) {
    updateAccountInterface(error.message);
  }
}

async function refreshLeaderboard() {
  try {
    const data = await requestApi('/api/leaderboard');
    bestScore = data.score || 0;
    updateInterface();
  } catch (_) {
    bestScore = 0;
    updateInterface();
  }
}

async function saveGameRecord() {
  if (!currentUser) return;
  try {
    const result = await requestApi('/api/games', {
      method: 'POST',
      body: JSON.stringify({ score, lines, level })
    });
    bestScore = result.leaderboard.score || 0;
    updateInterface();
    if (score === bestScore) accountStatus.textContent = '축하합니다! 현재 전체 최고점수입니다.';
  } catch (error) {
    accountStatus.textContent = `기록 저장 실패: ${error.message}`;
  }
}

async function restoreSession() {
  if (!authToken) {
    updateAccountInterface();
    return;
  }
  try {
    currentUser = await requestApi('/api/auth/me');
    updateAccountInterface();
  } catch (_) {
    authToken = null;
    localStorage.removeItem('block-drop-token');
    updateAccountInterface('세션이 만료되었습니다. 다시 로그인하세요.');
  }
}

function draw() {
  boardContext.fillStyle = '#101522';
  boardContext.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  drawGrid();
  board.forEach((row, y) => row.forEach((type, x) => {
    if (type) drawBlock(boardContext, x, y, COLORS[type]);
  }));
  if (currentPiece) drawPiece(boardContext, currentPiece, BLOCK_SIZE);
  drawNextPiece();
}

function drawGrid() {
  boardContext.strokeStyle = 'rgba(177, 194, 245, .08)';
  boardContext.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 1) {
    boardContext.beginPath();
    boardContext.moveTo(x * BLOCK_SIZE + .5, 0);
    boardContext.lineTo(x * BLOCK_SIZE + .5, ROWS * BLOCK_SIZE);
    boardContext.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    boardContext.beginPath();
    boardContext.moveTo(0, y * BLOCK_SIZE + .5);
    boardContext.lineTo(COLS * BLOCK_SIZE, y * BLOCK_SIZE + .5);
    boardContext.stroke();
  }
}

function drawPiece(context, piece, size) {
  piece.shape.forEach((row, y) => row.forEach((cell, x) => {
    if (cell && piece.y + y >= 0) drawBlock(context, piece.x + x, piece.y + y, COLORS[piece.type], size);
  }));
}

function drawBlock(context, x, y, color, size = BLOCK_SIZE) {
  const gap = Math.max(1, size / 15);
  context.fillStyle = color;
  context.fillRect(x * size + gap, y * size + gap, size - gap * 2, size - gap * 2);
  context.fillStyle = 'rgba(255, 255, 255, .22)';
  context.fillRect(x * size + gap * 2, y * size + gap * 2, size - gap * 4, Math.max(2, size / 9));
}

function drawNextPiece() {
  nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;
  const size = 24;
  const width = nextPiece.shape[0].length * size;
  const height = nextPiece.shape.length * size;
  nextPiece.shape.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) drawBlock(nextContext, x + (120 - width) / size / 2, y + (120 - height) / size / 2, COLORS[nextPiece.type], size);
  }));
}

function performAction(action) {
  if (!isPlaying || isPaused) return;
  if (action === 'left') movePiece(-1, 0);
  if (action === 'right') movePiece(1, 0);
  if (action === 'down') {
    if (movePiece(0, 1)) score += 1;
    updateInterface();
  }
  if (action === 'rotate') rotatePiece();
  if (action === 'drop') hardDrop();
}

document.addEventListener('keydown', event => {
  const keyActions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' };
  if (event.key.toLowerCase() === 'p') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (keyActions[event.key]) {
    event.preventDefault();
    performAction(keyActions[event.key]);
  }
});

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', togglePause);
levelDownButton.addEventListener('click', () => adjustLevel(-1));
levelUpButton.addEventListener('click', () => adjustLevel(1));
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => performAction(button.dataset.action));
});
authForm.addEventListener('submit', event => {
  event.preventDefault();
  authenticate('login');
});
registerButton.addEventListener('click', () => authenticate('register'));
logoutButton.addEventListener('click', () => {
  if (isPlaying) endGame();
  authToken = null;
  currentUser = null;
  localStorage.removeItem('block-drop-token');
  updateAccountInterface('로그아웃되었습니다.');
});

board = createBoard();
updateInterface();
draw();
updateAccountInterface();
refreshLeaderboard();
restoreSession();
