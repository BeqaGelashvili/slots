const SYMBOLS = [
  { id: 'seven',   emoji: '7️⃣',  weight: 3,  payout3: 50, payout2: 3,  label: '7',    jackpot: true  },
  { id: 'diamond', emoji: '💎',  weight: 5,  payout3: 30, payout2: 2,  label: 'GEM'                  },
  { id: 'crown',   emoji: '👑',  weight: 6,  payout3: 20, payout2: 2,  label: 'CROWN'                },
  { id: 'bell',    emoji: '🔔',  weight: 8,  payout3: 15, payout2: 1,  label: 'BELL'                 },
  { id: 'bar',     emoji: '⭐',  weight: 9,  payout3: 10, payout2: 1, label: 'STAR'                   },
  { id: 'grape',   emoji: '🍇',  weight: 12, payout3: 8,  payout2: 0,  label: 'GRAPE'                },
  { id: 'watermelon',  emoji: '🍉', weight: 12, payout3: 7,payout2: 0, label: 'MELO'                },
  { id: 'lemon',   emoji: '🍋',  weight: 15, payout3: 5,  payout2: 0,  label: 'LEM'                  },
  { id: 'cherry',  emoji: '🍒',  weight: 18, payout3: 4,  payout2: 0,  label: 'CHRY'                 },
  { id: 'orange',  emoji: '🍊',  weight: 18, payout3: 4,  payout2: 0,  label: 'ORG'                  },
];

const POOL = [];
for (const sym of SYMBOLS) {
  for (let i = 0; i < sym.weight; i++) POOL.push(sym);
}

const NUM_REELS = 5;
const CELL_H = 73.33;
const VISIBLE = 3;
const CELLS_PER_REEL = 24;

let balance = parseInt(localStorage.getItem('nslots_balance') || '1000');
let bet = parseInt(localStorage.getItem('nslots_bet') || '10');
let isSpinning = false;
let jackpot = 25000;
let session = { spins: 0, wins: 0, totalWon: 0, bestWin: 0 };

const reelTracks = [];
const reelResults = []; 
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playTone(freq, duration, type='sine', volume=0.3, attack=0.01, decay=0.1) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
  } catch(e) {}
}

function playClick() { playTone(440, 0.06, 'square', 0.15); }
function playWin() {
  playTone(523, 0.12, 'triangle', 0.3);
  setTimeout(() => playTone(659, 0.12, 'triangle', 0.3), 120);
  setTimeout(() => playTone(784, 0.2, 'triangle', 0.35), 240);
  setTimeout(() => playTone(1047, 0.35, 'triangle', 0.4), 400);
}
function playJackpot() {
  const notes = [523,587,659,698,784,880,988,1047];
  notes.forEach((n, i) => setTimeout(() => playTone(n, 0.2, 'triangle', 0.35), i * 100));
}
function playLose() {
  playTone(220, 0.15, 'sawtooth', 0.2);
  setTimeout(() => playTone(180, 0.3, 'sawtooth', 0.15), 150);
}

let spinOscillator = null;
function startSpinSound() {
  try {
    const ctx = getAudioCtx();
    spinOscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    spinOscillator.connect(gain);
    gain.connect(ctx.destination);
    spinOscillator.type = 'sawtooth';
    spinOscillator.frequency.setValueAtTime(50, ctx.currentTime);
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    spinOscillator.start();
  } catch(e) {}
}
function stopSpinSound() {
  try {
    if (spinOscillator) { spinOscillator.stop(); spinOscillator = null; }
  } catch(e) {}
}


function buildReels() {
  for (let r = 0; r < NUM_REELS; r++) {
    const track = document.getElementById(`track${r}`);
    reelTracks.push(track);
    reelResults.push(Math.floor(CELLS_PER_REEL / 2));
    populateReel(r);
  }
}

function populateReel(r) {
  reelTracks[r].innerHTML = '';
  const symbols = [];
  for (let i = 0; i < CELLS_PER_REEL; i++) {
    symbols.push(POOL[Math.floor(Math.random() * POOL.length)]);
  }
  for (const sym of symbols) {
    const cell = document.createElement('div');
    cell.className = 'symbol-cell';
    cell.textContent = sym.emoji;
    cell.dataset.id = sym.id;
    reelTracks[r].appendChild(cell);
  }
  const startY = -(reelResults[r] - 1) * CELL_H;
  reelTracks[r].style.transform = `translateY(${startY}px)`;
}


function pickSymbol() {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

function spin() {
  if (isSpinning) return;
  const betVal = parseInt(document.getElementById('betInput').value);
  if (isNaN(betVal) || betVal < 1) { showMessage('INVALID BET', 'info'); return; }
  if (betVal > balance) { showMessage('INSUFFICIENT FUNDS', 'lose'); return; }

  playClick();
  bet = betVal;
  balance -= bet;
  jackpot += Math.floor(bet * 0.02);
  updateDisplay();
  setControlsEnabled(false);
  isSpinning = true;
  session.spins++;
  updateSessionStats();

  const results = [];
  for (let r = 0; r < NUM_REELS; r++) {
    results.push(pickSymbol());
  }

  const finalCenterIdx = 12;

  for (let r = 0; r < NUM_REELS; r++) {
    reelTracks[r].innerHTML = '';
    const cells = [];
    for (let i = 0; i < CELLS_PER_REEL; i++) {
      if (i === finalCenterIdx) {
        cells.push(results[r]);
      } else {
        cells.push(POOL[Math.floor(Math.random() * POOL.length)]);
      }
    }
    for (const sym of cells) {
      const cell = document.createElement('div');
      cell.className = 'symbol-cell';
      cell.textContent = sym.emoji;
      cell.dataset.id = sym.id;
      reelTracks[r].appendChild(cell);
    }
    reelResults[r] = finalCenterIdx;
  }

  startSpinSound();

  const spinPromises = [];
  for (let r = 0; r < NUM_REELS; r++) {
    spinPromises.push(animateReel(r, r));
  }

  Promise.all(spinPromises).then(() => {
    stopSpinSound();
    evaluateResult(results);
  });
}

function animateReel(reelIdx, stopOrder) {
  return new Promise(resolve => {
    const track = reelTracks[reelIdx];
    const targetRow = reelResults[reelIdx];
    const targetY = -(targetRow - 1) * CELL_H;

    const totalSpinTime = 1400 + stopOrder * 550;
    const startTime = performance.now();

    const spinDistance = CELL_H * (45 + reelIdx * 10);

    track.style.filter = 'blur(2px)';

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function frame(now) {
      let elapsed = now - startTime;
      let t = Math.min(elapsed / totalSpinTime, 1);

      let currentY;

      if (t < 0.78) {
        const fast = t / 0.78;
        const move = spinDistance * fast;
        currentY = -(move % (CELL_H * CELLS_PER_REEL));

      } else {
        const stopT = (t - 0.78) / 0.22;

        const currentSpin = -(spinDistance % (CELL_H * CELLS_PER_REEL));

        const overshoot = targetY - 18;

        if (stopT < 0.7) {
          const p = easeOutQuart(stopT / 0.7);
          currentY = currentSpin + (overshoot - currentSpin) * p;
        } else {
          const p = (stopT - 0.7) / 0.3;
          currentY = overshoot + (targetY - overshoot) * easeOutQuart(p);
        }
      }

      track.style.transform = `translateY(${currentY}px)`;

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        track.style.transform = `translateY(${targetY}px)`;
        track.style.filter = 'blur(0px)';

        const cells = track.querySelectorAll('.symbol-cell');
        cells.forEach((c, i) => {
          c.classList.toggle('center', i === targetRow);
        });

        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

function evaluateResult(results) {
  const ids = results.map(s => s.id);
  const payline = document.getElementById('payline');
  const winOverlay = document.getElementById('winOverlay');

  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  const maxMatch = Math.max(...Object.values(counts));
  const topId = Object.keys(counts).find(k => counts[k] === maxMatch);
  const sym = SYMBOLS.find(s => s.id === topId);

  let winAmount = 0;
  let msgType = 'lose';
  let msgText = '';

  if (maxMatch === NUM_REELS) {
    if (sym.jackpot) {
      winAmount = jackpot;
      jackpot = 25000;
      msgText = '🎰 JACKPOT!!! 🎰';
      msgType = 'jackpot';
      playJackpot();
      triggerConfetti(200);
      document.getElementById('machineWrap').classList.add('shake');
      setTimeout(() => document.getElementById('machineWrap').classList.remove('shake'), 700);
    } else {
      winAmount = bet * sym.payout3 * 2;
      msgText = `BIG WIN! × ${sym.payout3 * 2}`;
      msgType = 'jackpot';
      playJackpot();
      triggerConfetti(100);
      document.getElementById('machineWrap').classList.add('shake');
      setTimeout(() => document.getElementById('machineWrap').classList.remove('shake'), 600);
    }
  } else if (maxMatch === 4) {
    winAmount = bet * sym.payout3 * 1.5;
    msgText = `GREAT WIN! ×${(sym.payout3 * 1.5).toFixed(0)}`;
    msgType = 'win';
    playWin();
    triggerConfetti(60);
  } else if (maxMatch === 3) {
    winAmount = bet * sym.payout3;
    msgText = `WIN! ×${sym.payout3}`;
    msgType = 'win';
    playWin();
    triggerConfetti(30);
  } else if (maxMatch === 2 && sym.payout2 > 0) {
    winAmount = bet * sym.payout2;
    msgText = `SMALL WIN ×${sym.payout2}`;
    msgType = 'win';
    playTone(523, 0.15, 'triangle', 0.3);
  } else {
    winAmount = 0;
    msgText = 'NO LUCK THIS TIME';
    msgType = 'lose';
    playLose();
  }

  if (winAmount > 0) {
    balance += winAmount;
    session.wins++;
    session.totalWon += winAmount;
    if (winAmount > session.bestWin) session.bestWin = winAmount;

    for (let r = 0; r < NUM_REELS; r++) {
      if (results[r].id === topId) {
        const cells = reelTracks[r].querySelectorAll('.symbol-cell');
        if (cells[reelResults[r]]) cells[reelResults[r]].classList.add('winner');
      }
    }

    payline.classList.add('active');
    winOverlay.classList.add('show');
    setTimeout(() => {
      payline.classList.remove('active');
      winOverlay.classList.remove('show');
    }, 2000);

    document.getElementById('lastWinDisplay').textContent = `$${winAmount.toLocaleString()}`;
    document.getElementById('lastWinDisplay').className = 'stat-value green';
  } else {
    document.getElementById('lastWinDisplay').textContent = '$0';
    document.getElementById('lastWinDisplay').className = 'stat-value red';
  }

  if (balance <= 0) {
    balance = 1000;
    showMessage('BALANCE RESET TO $1,000', 'info');
    setTimeout(() => showMessage(msgText, msgType), 2000);
  } else {
    showMessage(msgText, msgType);
  }

  updateDisplay();
  updateSessionStats();
  saveState();

  setTimeout(() => {
    isSpinning = false;
    setControlsEnabled(true);
    document.querySelectorAll('.symbol-cell.winner').forEach(c => c.classList.remove('winner'));
  }, 600);
}


function showMessage(text, type) {
  const el = document.getElementById('msgText');
  el.className = 'message-text';
  el.textContent = text;
  void el.offsetWidth;
  el.className = `message-text show ${type}`;
}

function updateDisplay() {
  document.getElementById('balanceDisplay').textContent = `$${balance.toLocaleString()}`;
  document.getElementById('jackpotAmt').textContent = `$${jackpot.toLocaleString()}`;
}

function updateSessionStats() {
  document.getElementById('sessSpins').textContent = session.spins;
  document.getElementById('sessWins').textContent = session.wins;
  document.getElementById('sessTotalWon').textContent = `$${session.totalWon.toLocaleString()}`;
  document.getElementById('sessBestWin').textContent = `$${session.bestWin.toLocaleString()}`;
}

function setControlsEnabled(enabled) {
  const ids = ['betInput', 'betMinus', 'betPlus', 'maxBetBtn', 'spinBtn'];
  ids.forEach(id => document.getElementById(id).disabled = !enabled);
  document.querySelectorAll('.chip').forEach(c => c.disabled = !enabled);
  if (!enabled) {
    document.getElementById('spinBtn').textContent = 'S P I N N I N G . . .';
  } else {
    document.getElementById('spinBtn').textContent = 'S P I N';
  }
}

function adjustBet(delta) {
  const input = document.getElementById('betInput');
  let v = parseInt(input.value) || 0;
  v = Math.max(1, Math.min(balance, v + delta));
  input.value = v;
  updateChipHighlight(v);
  bet = v;
}

function setBet(amount) {
  if (amount > balance) amount = balance;
  document.getElementById('betInput').value = amount;
  updateChipHighlight(amount);
  bet = amount;
}

function maxBet() {
  const maxVal = Math.min(balance, 1000);
  document.getElementById('betInput').value = maxVal;
  updateChipHighlight(maxVal);
  bet = maxVal;
}

function updateChipHighlight(val) {
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.bet) === val);
  });
}

function saveState() {
  localStorage.setItem('nslots_balance', balance);
  localStorage.setItem('nslots_bet', bet);
}

const BULB_COLORS = ['on-gold','on-red','on-green','on-purple','on-cyan'];
const NUM_BULBS = 28;

function buildLights() {
  const strip = document.getElementById('lightsStrip');
  for (let i = 0; i < NUM_BULBS; i++) {
    const b = document.createElement('div');
    b.className = 'bulb';
    strip.appendChild(b);
  }
}

let lightOffset = 0;
function animateLights() {
  const bulbs = document.querySelectorAll('.bulb');
  bulbs.forEach((b, i) => {
    const phase = (i + lightOffset) % BULB_COLORS.length;
    b.className = `bulb ${phase === 0 ? BULB_COLORS[Math.floor(i / 4) % BULB_COLORS.length] : ''}`;
  });
  lightOffset = (lightOffset + 1) % NUM_BULBS;
}
setInterval(animateLights, 180);

function lightFrenzy() {
  let count = 0;
  const frenzy = setInterval(() => {
    const bulbs = document.querySelectorAll('.bulb');
    bulbs.forEach(b => {
      b.className = `bulb ${BULB_COLORS[Math.floor(Math.random() * BULB_COLORS.length)]}`;
    });
    if (++count > 15) clearInterval(frenzy);
  }, 80);
}


function triggerConfetti(count) {
  lightFrenzy();
  const container = document.getElementById('confettiContainer');
  const colors = ['#FFD700','#FF2244','#00FF88','#BB44FF','#00E5FF','#FF6600'];

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      top: -10px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      transform: rotate(${Math.random() * 360}deg);
      opacity: 1;
      width: ${4 + Math.random() * 8}px;
      height: ${4 + Math.random() * 8}px;
    `;
    container.appendChild(piece);

    const duration = 1500 + Math.random() * 1500;
    const delay = Math.random() * 600;
    const xDrift = (Math.random() - 0.5) * 200;
    const yFall = 600 + Math.random() * 400;
    const rotation = Math.random() * 720;

    piece.animate([
      { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${xDrift}px, ${yFall}px) rotate(${rotation}deg)`, opacity: 0 }
    ], { duration, delay, fill: 'forwards', easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' })
      .onfinish = () => piece.remove();
  }
}

function buildPayoutTable() {
  const grid = document.getElementById('payoutGrid');
  for (const sym of SYMBOLS) {
    const item = document.createElement('div');
    item.className = 'payout-item';
    const isRare = sym.jackpot;
    item.innerHTML = `
      <span class="payout-sym">${sym.emoji}</span>
      <span class="payout-mult ${isRare ? 'special' : ''}">×${sym.payout3}</span>
    `;
    grid.appendChild(item);
  }
}

document.getElementById('betInput').addEventListener('input', function() {
  let v = parseInt(this.value);
  if (isNaN(v) || v < 1) v = 1;
  if (v > balance) v = balance;
  this.value = v;
  updateChipHighlight(v);
});

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !isSpinning) { e.preventDefault(); spin(); }
});


function init() {
  buildLights();
  buildReels();
  buildPayoutTable();
  document.getElementById('betInput').value = Math.min(bet, balance);
  updateChipHighlight(bet);
  updateDisplay();
  updateSessionStats();
  showMessage('PRESS SPIN OR SPACE TO PLAY', 'info');
}

init();
