/* ---------- Ball colors (standard) ---------- */
const COLORS = {
  0: { name: 'Cue', solid: '#ffffff' },
  1: { name: 'Yellow', solid: '#f2c200' },
  2: { name: 'Blue', solid: '#1b56cf' },
  3: { name: 'Red', solid: '#d6362d' },
  4: { name: 'Purple', solid: '#642c90' },
  5: { name: 'Orange', solid: '#f07a00' },
  6: { name: 'Green', solid: '#1a8a61' },
  7: { name: 'Maroon', solid: '#8e2021' },
  8: { name: 'Black', solid: '#111111' },
};

const defaultTargetScore = 61;
const allBalls = Array.from({length:15}, (_,i)=>i+1);

/* ---------- State (mirrors Flutter app) ---------- */
let playerA = null;
let playerB = null;
let currentPlayer = null; // initials
let availableBalls = [];
let lastPocketedBall = null;
let lastPlayerToPocket = null;
let gamePhase = 'setup'; // setup, playing, gameOver
let winnerInitial = null;
let gameStatusMessage = '';

/* ---------- DOM refs ---------- */
const setupPanel = document.getElementById('setupPanel');
const gamePanel = document.getElementById('gamePanel');
const gridEl = document.getElementById('grid');
const startBtn = document.getElementById('startBtn');
const gameTypeSel = document.getElementById('gameType');
const handicapInputs = document.getElementById('handicapInputs');
const startStatus = document.getElementById('setupStatus');
const statusMessageEl = document.getElementById('statusMessage');
const availableCountEl = document.getElementById('availableCount');

const cardA = document.getElementById('cardA');
const cardB = document.getElementById('cardB');
const pAName = document.getElementById('pAName');
const pBName = document.getElementById('pBName');
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
const pAPocketed = document.getElementById('pAPocketed');
const pBPocketed = document.getElementById('pBPocketed');
const pANeeded = document.getElementById('pANeeded');
const pBNeeded = document.getElementById('pBNeeded');
const undoBtn = document.getElementById('undoBtn');

/* ---------- UI wiring ---------- */
gameTypeSel.addEventListener('change', (e)=>{
  if (e.target.value === 'handicap') handicapInputs.style.display = 'block';
  else handicapInputs.style.display = 'none';
});
startBtn.addEventListener('click', startGame);

/* ---------- Player constructor ---------- */
function Player(initials, targetScore){
  return {
    initials: initials.toUpperCase(),
    score: 0,
    pocketed: [],
    targetScore: targetScore
  };
}

/* ---------- Utilities (mirror Flutter) ---------- */
function calculateScore(pocketedArr){
  if (!pocketedArr || pocketedArr.length === 0) return 0;
  return pocketedArr.reduce((sum,v)=>sum+v,0);
}

function calculateSequentialNeededBalls(currentScore, targetScore, availableBallsSorted){
  let needed = [];
  let acc = currentScore;
  if (acc >= targetScore) return {balls:[], sum:0, projectedScore:acc};
  for (let ball of availableBallsSorted){
    needed.push(ball);
    acc += ball;
    if (acc >= targetScore) break;
  }
  let neededSum = needed.length === 0 ? 0 : needed.reduce((s,b)=>s+b,0);
  return {balls: needed, sum: neededSum, projectedScore: acc};
}

/* ---------- Drawing utilities (Canvas) ---------- */

/*
  drawBallOnCanvas(canvas, n)
   - draws realistic billiard ball similar to Flutter CustomPainter:
     - white base for stripe balls and cue; colored radial gradient for solids
     - stripe drawn with rounded rect masked by circle
     - white number circle + number text
     - gloss highlight (rotated ellipse)
     - subtle floor shadow
*/
function drawBallOnCanvas(canvas, n, sizePx) {
  const ctx = canvas.getContext('2d');
  const dpi = window.devicePixelRatio || 1;
  const w = sizePx;
  const h = sizePx;
  canvas.width = Math.round(w * dpi);
  canvas.height = Math.round(h * dpi);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpi,0,0,dpi,0,0); // scale for DPI
  ctx.clearRect(0,0,w,h);

  const cx = w/2;
  const cy = h/2;
  const radius = Math.min(w,h)/2 - 0.5;

  const isCue = (n === 0);
  const isStripe = (n >= 9 && n <= 15);
  const isSolid = (n >=1 && n <= 8);

  // Helper to get the base color hex
  function baseColor(num){
    const mapping = {9:1,10:2,11:3,12:4,13:5,14:6,15:7};
    const mapped = mapping[num] || num;
    return COLORS[mapped]?.solid || '#888';
  }
  const primary = baseColor(n);

  // Draw subtle floor shadow ellipse below
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius*0.7, radius*0.55, Math.max(3, radius*0.12), 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.restore();

  // Draw main sphere (with radial gradient)
  ctx.save();
  // Create radial gradient similar to flutter radial grad centered slightly top-left
  const grad = ctx.createRadialGradient(cx - radius*0.35, cy - radius*0.35, radius*0.05, cx, cy, radius);
  if (isCue) {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#dfe7ea');
    grad.addColorStop(1, '#cfd7db');
  } else if (isSolid) {
    // darker shades for depth
    grad.addColorStop(0, tinyTint(primary, 0)); // original
    grad.addColorStop(0.6, tinyTint(primary, -0.12));
    grad.addColorStop(1, tinyTint(primary, -0.28));
  } else {
    // stripe ball: draw white base and stripe later
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#f2f2f2');
    grad.addColorStop(1, '#e0e0e0');
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.fillStyle = grad;
  ctx.fill();
  // subtle rim highlight
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
  ctx.restore();

  // If stripe ball, draw the colored stripe band masked to circle
  if (isStripe) {
    ctx.save();
    // clip to circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.clip();

    // stripe rect with rounded ends: we'll draw as rounded rectangle (large rx)
    const stripeH = radius * 0.9; // adjust stripe height relative to radius
    const stripeW = radius * 2.2;
    const stripeX = cx - stripeW/2;
    const stripeY = cy - stripeH/2;

    // draw rounded rect using path
    const rx = stripeH*0.5;
    roundRect(ctx, stripeX, stripeY, stripeW, stripeH, rx);
    ctx.fillStyle = primary;
    ctx.fill();

    // top and bottom caps cutouts (the HTML sample had white caps — emulate by overlaying white caps)
    // draw white caps to preserve the white above and below stripe (like the SVG approach)
    ctx.beginPath();
    roundRect(ctx, stripeX, stripeY - stripeH*1.2, stripeW, stripeH*0.6, rx);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, stripeX, stripeY + stripeH*1.2 - stripeH*0.6, stripeW, stripeH*0.6, rx);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
    // add a mild darkening overlay at edges to blend stripe
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.clip();
    const overlay = ctx.createRadialGradient(cx - radius*0.35, cy - radius*0.35, radius*0.1, cx, cy, radius);
    overlay.addColorStop(0, 'rgba(0,0,0,0)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = overlay;
    ctx.fillRect(cx - radius, cy - radius, radius*2, radius*2);
    ctx.restore();
  } else if (isSolid) {
    // for solid balls, add a slight dark edge radial overlay for realism
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.clip();
    const overlay = ctx.createRadialGradient(cx, cy, radius*0.4, cx, cy, radius);
    overlay.addColorStop(0, 'rgba(0,0,0,0)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = overlay;
    ctx.fillRect(cx - radius, cy - radius, radius*2, radius*2);
    ctx.restore();
  }

  // Number circle (skip for cue ball)
  if (!isCue) {
    ctx.save();
    const numR = radius * 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy + radius*0.04, numR, 0, Math.PI*2); // slightly lower like the SVG (cy+something)
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.stroke();

    // number text
    const txt = String(n);
    ctx.fillStyle = (n === 8) ? '#000000' : '#000000';
    // dynamic font size
    ctx.font = `bold ${Math.round(numR*1.05)}px system-ui, -apple-system, "Segoe UI", Roboto`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx, cy + radius*0.06);
    ctx.restore();
  } else {
    // cue ball small marking? In your examples cue had no number.
  }

  // Gloss highlight (rotated ellipse)
  ctx.save();
  ctx.beginPath();
  // transform to rotate gloss ellipse
  ctx.translate(cx, cy);
  ctx.rotate(-20 * Math.PI/180);
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#ffffff';
  ctx.ellipse(-radius*0.12, -radius*0.34, radius*0.32, radius*0.2, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // final subtle shadow line for rim (tiny)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

/* small helper: rounded rectangle path */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h/2, w/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* tiny tint helper: takes '#rrggbb' and returns tinted hex; amt negative darkens, positive lightens (fraction) */
function tinyTint(hex, amt) {
  const c = hex.replace('#','');
  const n = parseInt(c,16);
  let r = (n>>16) + Math.round(amt*255);
  let g = ((n>>8)&0xff) + Math.round(amt*255);
  let b = (n&0xff) + Math.round(amt*255);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
}

/* ---------- Game logic functions (port of your Flutter code) ---------- */

function startGame(){
  const aInit = document.getElementById('playerAInit').value.trim();
  const bInit = document.getElementById('playerBInit').value.trim();
  const gameType = document.getElementById('gameType').value;
  const tAInput = document.getElementById('targetA')?.value;
  const tBInput = document.getElementById('targetB')?.value;

  if (!aInit || !bInit) { startStatus.textContent = 'Player initials cannot be empty.'; return; }
  if (aInit.toUpperCase() === bInit.toUpperCase()) { startStatus.textContent = 'Player initials must be different.'; return; }

  let targetA = defaultTargetScore;
  let targetB = defaultTargetScore;

  if (gameType === 'handicap') {
    const parsedA = parseInt(tAInput,10);
    const parsedB = parseInt(tBInput,10);
    if (isNaN(parsedA) || isNaN(parsedB)) { startStatus.textContent = 'Enter valid numeric target scores for Handicap.'; return; }
    if (parsedA <= 0 || parsedB <= 0) { startStatus.textContent = 'Target scores must be positive.'; return; }
    if (parsedA + parsedB !== 120) { startStatus.textContent = 'Handicap target scores must sum to 120.'; return; }
    targetA = parsedA; targetB = parsedB;
  }

  playerA = Player(aInit, targetA);
  playerB = Player(bInit, targetB);
  availableBalls = [...allBalls];
  currentPlayer = playerA.initials;
  gamePhase = 'playing';
  winnerInitial = null;
  lastPocketedBall = null;
  lastPlayerToPocket = null;
  gameStatusMessage = `${playerA.initials}'s turn.`;
  startStatus.textContent = '';
  showGamePanel();
  refreshUI();
}

function showGamePanel(){
  setupPanel.style.display = 'none';
  gamePanel.style.display = 'block';
}

/* Set active player by clicking player card (mirrors Flutter _handlePlayerTap) */
function setActive(initials){
  if (gamePhase !== 'playing') return;
  currentPlayer = initials;
  gameStatusMessage = `${currentPlayer} is now the active player.`;
  refreshUI();
}

/* Render the grid of available balls (each ball a canvas for crisp painting) */
function renderBalls() {
  gridEl.innerHTML = '';
  const order = [...availableBalls].sort((a,b)=>a-b);
  availableCountEl.textContent = order.length;
  for (let n of order) {
    const holder = document.createElement('figure');
    holder.className = 'ball-wrap';
    holder.style.width = 'var(--ball-size)';
    holder.style.height = 'var(--ball-size)';
    holder.style.margin = '0';
    holder.style.cursor = (gamePhase === 'playing') ? 'pointer' : 'default';

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.dataset.ball = n;
    // draw
    drawBallOnCanvas(canvas, n, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ball-size')) || 110);
    // click handler
    canvas.addEventListener('click', (e) => {
      e.preventDefault();
      handleBallTap(n);
    }, false);

    const cap = document.createElement('figcaption');
    cap.className = 'label';
    cap.textContent = `#${n}`;

    holder.appendChild(canvas);
    holder.appendChild(cap);
    gridEl.appendChild(holder);
  }
}

/* Get player object by initials */
function getPlayerByInitial(initial){
  if (playerA && playerA.initials === initial) return playerA;
  if (playerB && playerB.initials === initial) return playerB;
  return null;
}

/* Handle pocketing a ball (mirror of _handleBallTap) */
function handleBallTap(ballNumber){
  if (gamePhase !== 'playing' || !currentPlayer) return;
  const player = getPlayerByInitial(currentPlayer);
  if (!player) return;

  // Store for undo
  lastPocketedBall = ballNumber;
  lastPlayerToPocket = currentPlayer;

  // Add ball to pocketed
  player.pocketed.push(ballNumber);
  player.score = calculateScore(player.pocketed);

  // Remove from available balls
  availableBalls = availableBalls.filter(b => b !== ballNumber);

  gameStatusMessage = `Ball ${ballNumber} pocketed by ${currentPlayer} (+${ballNumber} pts).`;

  // Check for winner
  let isNowGameOver = false;
  if (player.score >= player.targetScore) {
    winnerInitial = player.initials;
    gamePhase = 'gameOver';
    gameStatusMessage = `Game Over! Winner: ${winnerInitial}`;
    isNowGameOver = true;
    showGameOverDialog();
  } else if (availableBalls.length === 0 && !winnerInitial) {
    gamePhase = 'gameOver';
    if (playerA.score > playerB.score) winnerInitial = playerA.initials;
    else if (playerB.score > playerA.score) winnerInitial = playerB.initials;
    else winnerInitial = 'TIE';
    gameStatusMessage = `Game Over! No balls left. ${winnerInitial === 'TIE' ? "It's a TIE!" : 'Winner by score: ' + winnerInitial}`;
    isNowGameOver = true;
    showGameOverDialog();
  }

  // Keep the pocketing player as active player (no swap)
  if (!isNowGameOver) {
    currentPlayer = player.initials;
  }

  refreshUI();
}


/* Undo last pocket (mirror of _undoLastPocket) */
function undoLast(){
  if (gamePhase !== 'playing') return;
  if (lastPocketedBall === null || lastPlayerToPocket === null) return;

  const toRestore = lastPocketedBall;
  const playerInitial = lastPlayerToPocket;
  const player = getPlayerByInitial(playerInitial);
  if (!player) return;

  const wasGameOver = (gamePhase === 'gameOver');
  const scoreBeforeUndo = player.score;

  // Reverse action
  player.pocketed.pop(toRestore);
  player.score = calculateScore(player.pocketed);
  // Put ball back into availableBalls and sort
  availableBalls.push(toRestore);
  availableBalls.sort((a,b)=>a-b);

  gameStatusMessage = `Undo: Ball ${toRestore} returned to table (from ${playerInitial}).`;

  if (player.score < player.targetScore && scoreBeforeUndo >= player.targetScore) {
    if (winnerInitial === playerInitial) {
      gamePhase = 'playing';
      winnerInitial = null;
    }
  }

  if (wasGameOver && winnerInitial != null) {
    if (availableBalls.length >= 1) {
      gamePhase = 'playing';
      winnerInitial = null;
    }
  }

  // clear undo state
  lastPocketedBall = null;
  lastPlayerToPocket = null;

  currentPlayer = player.initials;
  refreshUI();
}

/* Reset game (mirror of _resetGame) */
function resetGame(){
  playerA = null; playerB = null; currentPlayer = null;
  availableBalls = [];
  lastPocketedBall = null; lastPlayerToPocket = null;
  gamePhase = 'setup'; winnerInitial = null; gameStatusMessage = '';
  setupPanel.style.display = 'block';
  gamePanel.style.display = 'none';
  document.getElementById('setupStatus').textContent = '';
  closeGameOverDialog();
  refreshUI();
}

/* Game Over dialog UI */
function showGameOverDialog(){
  const dlgRoot = document.getElementById('gameOverDialog');
  dlgRoot.innerHTML = '';
  dlgRoot.style.display = 'grid';
  dlgRoot.className = 'dialog';

  const box = document.createElement('div');
  box.className = 'box';

  const title = document.createElement('div');
  title.style.fontWeight = '800';
  title.style.marginBottom = '8px';
  title.textContent = 'Game Over!';

  const content = document.createElement('div');
  content.style.whiteSpace = 'pre-wrap';
  let contText = gameStatusMessage + '\n';
  if (winnerInitial && winnerInitial !== 'TIE') {
    const winner = (playerA && playerA.initials === winnerInitial) ? playerA : playerB;
    contText += `${winner.initials} Score: ${winner.score}\nPocketed: ${Array.from(winner.pocketed).sort((a,b)=>a-b).join(', ') || 'None'}`;
  } else if (winnerInitial === 'TIE') {
    contText += `${playerA.initials} Score: ${playerA.score}\n${playerB.initials} Score: ${playerB.score}`;
  }
  content.textContent = contText;

  const actions = document.createElement('div');
  actions.className = 'controls-row';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => { closeGameOverDialog(); };

  const newBtn = document.createElement('button');
  newBtn.textContent = 'New Game';
  newBtn.onclick = () => { closeGameOverDialog(); resetGame(); };

  const rematchBtn = document.createElement('button');
  rematchBtn.textContent = 'Rematch';
  rematchBtn.onclick = () => {
    closeGameOverDialog();
    rematchGame();
  };

  actions.append(closeBtn, newBtn, rematchBtn);
  box.append(title, content, actions);
  dlgRoot.append(box);
}

// Rematch function: keeps players and targets
function rematchGame(){
  if (!playerA || !playerB) return;
  // Reset player states
  playerA.score = 0;
  playerA.pocketed = [];
  playerB.score = 0;
  playerB.pocketed = [];

  availableBalls = [...allBalls];
  currentPlayer = playerA.initials;
  gamePhase = 'playing';
  winnerInitial = null;
  lastPocketedBall = null;
  lastPlayerToPocket = null;
  gameStatusMessage = `${playerA.initials}'s turn.`;
  refreshUI();
}


/* Close dialog */
function closeGameOverDialog(){
  const dlgRoot = document.getElementById('gameOverDialog');
  dlgRoot.innerHTML = '';
  dlgRoot.style.display = 'none';
}

/* Refresh UI (mirrors refreshUI in earlier port) */
function refreshUI(){
  if (playerA && playerB) {
    pAName.textContent = `Player ${playerA.initials}`;
    pBName.textContent = `Player ${playerB.initials}`;
    scoreAEl.textContent = `${playerA.score}`;
    scoreBEl.textContent = `${playerB.score}`;
    pAPocketed.innerHTML = `Pocketed (${playerA.pocketed.size}): ${renderBallSetAsImages(playerA.pocketed)}`;
    pBPocketed.innerHTML = `Pocketed (${playerB.pocketed.size}): ${renderBallSetAsImages(playerB.pocketed)}`;

    // active styling
    cardA.classList.toggle('player-active', currentPlayer === playerA.initials && gamePhase === 'playing');
    cardB.classList.toggle('player-active', currentPlayer === playerB.initials && gamePhase === 'playing');
    document.getElementById('activeA').textContent = (currentPlayer === playerA.initials && gamePhase === 'playing') ? '(ACTIVE)' : '';
    document.getElementById('activeB').textContent = (currentPlayer === playerB.initials && gamePhase === 'playing') ? '(ACTIVE)' : '';

    // needed balls
    const availSorted = [...availableBalls].sort((a,b)=>a-b);
    const needA = calculateSequentialNeededBalls(playerA.score, playerA.targetScore, availSorted);
    const needB = calculateSequentialNeededBalls(playerB.score, playerB.targetScore, availSorted);
    pANeeded.innerHTML = renderNeeded(needA, playerA);
    pBNeeded.innerHTML = renderNeeded(needB, playerB);

    statusMessageEl.textContent = gameStatusMessage;
    undoBtn.disabled = !(lastPocketedBall !== null && lastPlayerToPocket !== null && gamePhase === 'playing');

    renderBalls();
  } else {
    // nothing - in setup
    availableCountEl.textContent = availableBalls.length;
  }
}
function numberToTagalog(n) {
  const words = ["isa","dalawa","tatlo","apat","lima","anim","pito","walo","siyam","sampu","labing-isa","labing-dalawa","labing-tatlo","labing-apat","labing-lima"];
  return words[n-1] || n;
}
/* Render needed balls small previews (use small canvases to match visuals) */

function renderNeeded(needed, player) {
  if (player.score >= player.targetScore) 
      return `<div style="color: #d6b0ff;">Balls Needed: Target Reached!</div>`;
  if (!needed.balls || needed.balls.length === 0) 
      return `<div style="color:#ffb0b0;">Balls Needed: Cannot reach target with remaining balls.</div>`;
  
  const projected = needed.projectedScore;

  // --- Needed Balls ---
  const neededPieces = needed.balls.map(b => {
    const c = document.createElement('canvas');
    drawBallOnCanvas(c, b, 28);
    return `<img src="${c.toDataURL()}" style="width:28px;height:28px;margin-right:6px;border-radius:50%;">`;
  }).join('');

  // --- Bad Number sequences ---
  const targetMinusOne = player.targetScore - 1;
  const availSorted = [...availableBalls].sort((a,b)=>a-b);
  const badSequences = [];

  // Generate all sequential subsets
  for (let start = 0; start < availSorted.length; start++) {
    let acc = player.score;
    let seq = [];
    for (let i = start; i < availSorted.length; i++) {
      seq.push(availSorted[i]);
      acc += availSorted[i];
      if (acc === targetMinusOne) {
        badSequences.push([...seq]);
        break;
      } else if (acc > targetMinusOne) break; // overshoot, stop this sequence
    }
  }

  // Limit to first 5 sequences
  const displayedSequences = badSequences.slice(0, 5);
  let badHtml = '';
  if (displayedSequences.length > 0) {
    displayedSequences.forEach(seq => {
      const seqPieces = seq.map(b => {
        const c = document.createElement('canvas');
        drawBallOnCanvas(c, b, 28);
        return `<img src="${c.toDataURL()}" style="width:28px;height:28px;margin-right:6px;border-radius:50%;">`;
      }).join('');
      badHtml += `<div style="margin-top:4px;">${seqPieces}</div>`;
    });
    badHtml = `<div style="margin-top:8px;color:#ff6666;font-weight:600;">Bad Number Sequences:</div>${badHtml}`;
  }

  // --- Compose combined section ---
  let html = `<div>
      <div><strong>${projected}</strong> ka sa <strong>${numberToTagalog(needed.balls.length)}</strong></div>
      <div style="margin-top:6px;">${neededPieces}</div>
      ${badHtml}
  </div>`;

  return html;
}

/* ---------- Initialization ---------- */
(function init(){
  // preload UI
  availableBalls = [...allBalls];
  refreshUI();

  // Allow Enter to start
  document.getElementById('playerAInit').addEventListener('keydown', (e)=>{ if (e.key === 'Enter') startBtn.click(); });
  document.getElementById('playerBInit').addEventListener('keydown', (e)=>{ if (e.key === 'Enter') startBtn.click(); });

  // responsive: re-render balls on resize (to respect css var)
  window.addEventListener('resize', ()=> {
    // re-draw canvases with new logical size derived from CSS var
    if (gamePhase === 'playing') refreshUI();
  });
})();

const targetAInput = document.getElementById('targetA');
const targetBInput = document.getElementById('targetB');
const totalHandicap = 120;

// Allow temporary empty input; only adjust paired field if number is valid
targetAInput.addEventListener('input', () => {
  const val = targetAInput.value.trim();
  if (val === '') {
    targetBInput.value = '';
    return;
  }
  let a = parseInt(val, 10);
  if (isNaN(a)) return; // don't do anything if not a number yet
  if (a < 1) a = 1;
  if (a >= totalHandicap) a = totalHandicap - 1;
  targetAInput.value = a;
  targetBInput.value = totalHandicap - a;
});

targetBInput.addEventListener('input', () => {
  const val = targetBInput.value.trim();
  if (val === '') {
    targetAInput.value = '';
    return;
  }
  let b = parseInt(val, 10);
  if (isNaN(b)) return;
  if (b < 1) b = 1;
  if (b >= totalHandicap) b = totalHandicap - 1;
  targetBInput.value = b;
  targetAInput.value = totalHandicap - b;
});

function renderBallSetAsImages(ballArr) {
  if (!ballArr || ballArr.length === 0) return 'None';
  const pieces = ballArr.map(b => {
    const c = document.createElement('canvas');
    drawBallOnCanvas(c, b, 28);
    return `<img src="${c.toDataURL()}" style="width:28px;height:28px;margin-right:6px;border-radius:50%;">`;
  }).join('');
  return pieces;
}

