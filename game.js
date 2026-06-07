"use strict";

/* ============================================================
   Mensch ärgere dich nicht  —  mobile edition
   Board model:
   - 11x11 grid, classic cross shape.
   - 40-field main loop (PATH), 4 home cells per colour, 4 base cells.
   - A piece's position is stored as `dist`:
        -1        -> in base
        0 .. 39   -> on main track, cell = PATH[(start + dist) % 40]
        40 .. 43  -> home stretch cell home[dist - 40]
     A piece is "finished" once dist >= 40. You win when all 4 are home.
   ============================================================ */

const GRID = 11;

// 40 main-track cells in clockwise order, each [col, row] on the 11x11 grid.
const PATH = [
  [0,4],[1,4],[2,4],[3,4],[4,4],[4,3],[4,2],[4,1],[4,0],[5,0],
  [6,0],[6,1],[6,2],[6,3],[6,4],[7,4],[8,4],[9,4],[10,4],[10,5],
  [10,6],[9,6],[8,6],[7,6],[6,6],[6,7],[6,8],[6,9],[6,10],[5,10],
  [4,10],[4,9],[4,8],[4,7],[4,6],[3,6],[2,6],[1,6],[0,6],[0,5]
];

const PLAYERS = [
  { name: "Rot",  color: "red",
    start: 0,
    base: [[1,1],[2,1],[1,2],[2,2]],
    home: [[1,5],[2,5],[3,5],[4,5]] },
  { name: "Grün", color: "green",
    start: 10,
    base: [[8,1],[9,1],[8,2],[9,2]],
    home: [[5,1],[5,2],[5,3],[5,4]] },
  { name: "Gelb", color: "yellow",
    start: 20,
    base: [[8,8],[9,8],[8,9],[9,9]],
    home: [[9,5],[8,5],[7,5],[6,5]] },
  { name: "Blau", color: "blue",
    start: 30,
    base: [[1,8],[2,8],[1,9],[2,9]],
    home: [[5,9],[5,8],[5,7],[5,6]] }
];

const PIECES_PER = 4;
const CELL_PCT = 100 / GRID;

/* ---------------- State ---------------- */
const state = {
  active: [true, false, false, false], // which colours are in the game
  human:  [true, false, false, false], // human vs computer
  pieces: [],   // pieces[pi] = [{dist}, ...]
  current: 0,
  dice: 0,
  phase: "idle", // 'roll' | 'move' | 'idle' | 'over'
  rollsLeft: 1,
  legal: [],
  busy: false
};

/* ---------------- DOM ---------------- */
const board   = document.getElementById("board");
const statusEl = document.getElementById("status");
const rollBtn = document.getElementById("rollBtn");
const dieEl   = document.getElementById("die");
const toastEl = document.getElementById("toast");

/* ============================================================
   Board construction (static cells, built once)
   ============================================================ */
function place(el, x, y) {
  el.style.left = (x * CELL_PCT) + "%";
  el.style.top  = (y * CELL_PCT) + "%";
}

function buildBoard() {
  board.innerHTML = "";

  // main track
  PATH.forEach((c, i) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    // colour the four start fields
    const starter = PLAYERS.find(p => p.start === i);
    if (starter) cell.classList.add("start", starter.color);
    cell.innerHTML = '<span class="dot"></span>';
    place(cell, c[0], c[1]);
    board.appendChild(cell);
  });

  // home stretches + base circles
  PLAYERS.forEach(p => {
    p.home.forEach(c => {
      const cell = document.createElement("div");
      cell.className = "cell home " + p.color;
      cell.innerHTML = '<span class="dot"></span>';
      place(cell, c[0], c[1]);
      board.appendChild(cell);
    });
    p.base.forEach(c => {
      const cell = document.createElement("div");
      cell.className = "cell base " + p.color;
      cell.innerHTML = '<span class="dot"></span>';
      place(cell, c[0], c[1]);
      board.appendChild(cell);
    });
  });

  // decorative centre
  const center = document.createElement("div");
  center.className = "center";
  center.innerHTML =
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<polygon points="50,6 62,40 50,50" fill="#e23b3b"/>' +
    '<polygon points="94,50 60,62 50,50" fill="#f3c014"/>' +
    '<polygon points="50,94 38,60 50,50" fill="#2f7ddf"/>' +
    '<polygon points="6,50 40,38 50,50" fill="#2faf4f"/>' +
    '</svg>';
  board.appendChild(center);
}

/* ============================================================
   Geometry helpers
   ============================================================ */
function pieceCoord(pi, piece, idx) {
  const P = PLAYERS[pi];
  const d = piece.dist;
  if (d < 0) return P.base[idx];
  if (d <= 39) return PATH[(P.start + d) % 40];
  return P.home[d - 40];
}

// find which piece (if any) sits on a given coord
function occupant(coord) {
  for (let pi = 0; pi < 4; pi++) {
    if (!state.active[pi]) continue;
    const arr = state.pieces[pi];
    for (let idx = 0; idx < arr.length; idx++) {
      const c = pieceCoord(pi, arr[idx], idx);
      if (c[0] === coord[0] && c[1] === coord[1]) return { pi, idx };
    }
  }
  return null;
}

function allInBase(pi) {
  return state.pieces[pi].every(p => p.dist < 0);
}
function hasWon(pi) {
  return state.pieces[pi].every(p => p.dist >= 40);
}

/* ============================================================
   Move generation
   ============================================================ */
function legalMoves(pi, value) {
  const P = PLAYERS[pi];
  const moves = [];
  state.pieces[pi].forEach((pc, idx) => {
    if (pc.dist < 0) {
      // leaving base requires a 6
      if (value === 6) {
        const coord = PATH[P.start];
        const occ = occupant(coord);
        if (occ && occ.pi === pi) return; // own piece blocks the start
        moves.push({ idx, newDist: 0, captures: occ && occ.pi !== pi ? occ : null });
      }
      return;
    }
    const newDist = pc.dist + value;
    if (newDist > 43) return; // would overshoot home — not allowed
    const coord = newDist <= 39 ? PATH[(P.start + newDist) % 40] : P.home[newDist - 40];
    const occ = occupant(coord);
    if (occ && occ.pi === pi) return; // cannot land on own piece
    if (newDist >= 40) {
      // cannot jump over an own piece already parked in the home stretch
      for (let d = Math.max(40, pc.dist + 1); d < newDist; d++) {
        const o = occupant(P.home[d - 40]);
        if (o && o.pi === pi) return;
      }
    }
    moves.push({ idx, newDist, captures: occ && occ.pi !== pi ? occ : null });
  });
  return moves;
}

function applyMove(pi, mv) {
  if (mv.captures) {
    state.pieces[mv.captures.pi][mv.captures.idx].dist = -1; // sent home
  }
  state.pieces[pi][mv.idx].dist = mv.newDist;
}

/* ============================================================
   Rendering of pieces (rebuilt each render)
   ============================================================ */
function render() {
  // remove old pieces
  board.querySelectorAll(".piece").forEach(n => n.remove());

  for (let pi = 0; pi < 4; pi++) {
    if (!state.active[pi]) continue;
    const arr = state.pieces[pi];
    if (!arr) continue;
    const P = PLAYERS[pi];
    arr.forEach((pc, idx) => {
      const el = document.createElement("div");
      el.className = "piece " + P.color;
      const coord = pieceCoord(pi, pc, idx);
      // centre of the cell
      el.style.left = ((coord[0] + 0.5) * CELL_PCT) + "%";
      el.style.top  = ((coord[1] + 0.5) * CELL_PCT) + "%";

      const isHumanTurn = state.phase === "move" &&
                          pi === state.current &&
                          state.human[pi];
      const mv = isHumanTurn ? state.legal.find(m => m.idx === idx) : null;
      if (mv) {
        el.classList.add("movable");
        el.addEventListener("click", () => onPieceTap(idx));
      }
      board.appendChild(el);
    });
  }
}

/* ============================================================
   Die rendering
   ============================================================ */
const PIP_MAP = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};
function drawDie(value) {
  const layer = dieEl.querySelector(".pip-layer");
  layer.innerHTML = "";
  const on = new Set(PIP_MAP[value] || []);
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    if (on.has(i)) {
      const pip = document.createElement("div");
      pip.className = "pip";
      cell.appendChild(pip);
    }
    layer.appendChild(cell);
  }
}

/* ============================================================
   UI helpers
   ============================================================ */
function setStatus(html) { statusEl.innerHTML = html; }

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1300);
}

function playerTag(pi) {
  const P = PLAYERS[pi];
  return `<b style="color:var(--p-${P.color})">${P.name}</b>`;
}

function setRollEnabled(on) {
  rollBtn.disabled = !on;
  dieEl.style.cursor = on ? "pointer" : "default";
}

/* ============================================================
   Turn flow
   ============================================================ */
function startGame() {
  state.pieces = PLAYERS.map(() => Array.from({ length: PIECES_PER }, () => ({ dist: -1 })));
  // first active player begins
  state.current = state.active.findIndex(Boolean);
  state.phase = "idle";
  state.dice = 0;
  drawDie(6);
  render();
  beginTurn();
}

function beginTurn() {
  if (countActive() < 1) return;
  const pi = state.current;
  state.phase = "roll";
  state.legal = [];
  state.rollsLeft = allInBase(pi) ? 3 : 1;
  render();

  if (state.human[pi]) {
    setStatus(`${playerTag(pi)} ist am Zug – würfle!`);
    setRollEnabled(true);
  } else {
    setStatus(`${playerTag(pi)} (Computer) denkt nach…`);
    setRollEnabled(false);
    setTimeout(doRoll, 650);
  }
}

function countActive() {
  return state.active.filter(Boolean).length;
}

function nextPlayer() {
  let n = state.current;
  for (let k = 0; k < 4; k++) {
    n = (n + 1) % 4;
    if (state.active[n]) { state.current = n; return; }
  }
}

function doRoll() {
  if (state.phase !== "roll" || state.busy) return;
  state.busy = true;
  setRollEnabled(false);

  dieEl.classList.remove("rolling");
  void dieEl.offsetWidth; // restart animation
  dieEl.classList.add("rolling");

  // quick visual tumble
  let ticks = 0;
  const tumble = setInterval(() => {
    drawDie(1 + Math.floor(Math.random() * 6));
    if (++ticks >= 6) {
      clearInterval(tumble);
      finishRoll();
    }
  }, 60);
}

function finishRoll() {
  const value = 1 + Math.floor(Math.random() * 6);
  state.dice = value;
  drawDie(value);

  const pi = state.current;
  const moves = legalMoves(pi, value);
  state.legal = moves;
  state.busy = false;

  if (moves.length === 0) {
    // no move possible
    if (allInBase(pi) && value !== 6 && state.rollsLeft > 1) {
      state.rollsLeft--;
      setStatus(`${playerTag(pi)} würfelt eine ${value}. Nochmal versuchen…`);
      if (state.human[pi]) setRollEnabled(true);
      else setTimeout(doRoll, 650);
      return;
    }
    setStatus(`${playerTag(pi)} würfelt eine ${value} – kein Zug möglich.`);
    setTimeout(endTurn, 850);
    return;
  }

  state.phase = "move";
  render();

  if (!state.human[pi]) {
    setStatus(`${playerTag(pi)} würfelt eine ${value}.`);
    setTimeout(() => doMove(pickAIMove(pi, moves)), 600);
  } else if (moves.length === 1) {
    // only one option — play it automatically
    setStatus(`${playerTag(pi)} würfelt eine ${value}.`);
    setTimeout(() => doMove(moves[0]), 350);
  } else {
    setStatus(`${playerTag(pi)} würfelt eine ${value} – wähle eine Figur.`);
  }
}

function onPieceTap(idx) {
  if (state.phase !== "move" || state.busy) return;
  const mv = state.legal.find(m => m.idx === idx);
  if (mv) doMove(mv);
}

function doMove(mv) {
  if (state.busy) return;
  state.busy = true;
  const pi = state.current;
  const captured = mv.captures;

  applyMove(pi, mv);
  state.phase = "animate";
  state.legal = [];
  render();

  if (captured) {
    setTimeout(() => toast(`${PLAYERS[pi].name} schlägt ${PLAYERS[captured.pi].name}! 😈`), 150);
  }

  setTimeout(() => {
    state.busy = false;
    if (hasWon(pi)) { winGame(pi); return; }
    // rolling a 6 grants another turn
    if (state.dice === 6) {
      state.phase = "roll";
      state.rollsLeft = 1;
      render();
      if (state.human[pi]) {
        setStatus(`${playerTag(pi)} hat eine 6 – nochmal würfeln!`);
        setRollEnabled(true);
      } else {
        setStatus(`${playerTag(pi)} hat eine 6 – nochmal!`);
        setTimeout(doRoll, 600);
      }
    } else {
      endTurn();
    }
  }, 360);
}

function endTurn() {
  if (state.phase === "over") return;
  nextPlayer();
  beginTurn();
}

function winGame(pi) {
  state.phase = "over";
  render();
  const P = PLAYERS[pi];
  document.getElementById("winTitle").textContent = "🏆 " + P.name + " gewinnt!";
  document.getElementById("winText").innerHTML =
    `${playerTag(pi)} hat alle Figuren ins Ziel gebracht. Glückwunsch!`;
  document.getElementById("winScreen").classList.remove("hidden");
}

/* ============================================================
   Simple computer opponent
   ============================================================ */
function pickAIMove(pi, moves) {
  let best = null, bestScore = -Infinity;
  for (const mv of moves) {
    const pc = state.pieces[pi][mv.idx];
    let score = 0;
    if (mv.captures) score += 1000 + mv.newDist;        // capturing is great
    if (mv.newDist >= 40) score += 600 + mv.newDist;     // reaching home
    if (pc.dist < 0) score += 300;                       // get a piece out
    score += mv.newDist;                                  // otherwise advance
    // a tiny bit of randomness to avoid robotic ties
    score += Math.random();
    if (score > bestScore) { bestScore = score; best = mv; }
  }
  return best;
}

/* ============================================================
   Setup screen
   ============================================================ */
function buildSetup() {
  const wrap = document.getElementById("playerChoices");
  wrap.innerHTML = "";
  const modes = ["human", "cpu", "off"];
  const labels = { human: "Mensch", cpu: "Computer", off: "Aus" };
  // default modes
  const cfg = ["human", "cpu", "cpu", "cpu"];

  PLAYERS.forEach((P, i) => {
    const row = document.createElement("div");
    row.className = "choice";
    row.innerHTML =
      `<span class="swatch ${P.color}"></span>` +
      `<span class="label">${P.name}</span>` +
      `<span class="mode ${cfg[i]}">${labels[cfg[i]]}</span>`;
    const modeEl = row.querySelector(".mode");
    row.addEventListener("click", () => {
      let m = modes.indexOf(cfg[i]);
      m = (m + 1) % modes.length;
      cfg[i] = modes[m];
      modeEl.className = "mode " + cfg[i];
      modeEl.textContent = labels[cfg[i]];
    });
    wrap.appendChild(row);
  });

  document.getElementById("startBtn").onclick = () => {
    const active = cfg.map(m => m !== "off");
    const human  = cfg.map(m => m === "human");
    if (active.filter(Boolean).length < 2) {
      toast("Mindestens 2 Spieler nötig!");
      return;
    }
    state.active = active;
    state.human = human;
    document.getElementById("setup").classList.add("hidden");
    document.getElementById("winScreen").classList.add("hidden");
    startGame();
  };
}

/* ============================================================
   Wiring
   ============================================================ */
function onRollClick() {
  const pi = state.current;
  if (state.phase === "roll" && state.human[pi]) doRoll();
}

rollBtn.addEventListener("click", onRollClick);
dieEl.addEventListener("click", onRollClick);
dieEl.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRollClick(); }
});

document.getElementById("menuBtn").addEventListener("click", () => {
  state.phase = "idle";
  document.getElementById("winScreen").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
});
document.getElementById("againBtn").addEventListener("click", () => {
  document.getElementById("winScreen").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
});

// init
buildBoard();
buildSetup();
drawDie(6);
render();
