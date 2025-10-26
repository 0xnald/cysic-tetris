/*
cysic-tetris - single-file React App (App.jsx)

How to use:
1. Create a Vite React app:
   npm create vite@latest cysic-tetris -- --template react
   cd cysic-tetris
   npm install

2. Replace src/App.jsx with the contents of this file (copy from canvas).
   Also create src/index.css and ensure src/main.jsx imports './index.css' (Vite default).

3. Put your Cysic logo at: public/cysic-logo.png
   (or change the <img src> path in the header to point to your logo)

4. Run locally:
   npm run dev

5. Git + GitHub + Vercel:
   git init
   git add .
   git commit -m "Initial cysic-tetris"
   # create a GitHub repo, then:
   git remote add origin git@github.com:YOURNAME/cysic-tetris.git
   git push -u origin main

   Then connect GitHub repo to Vercel and deploy, or use Vercel CLI:
   npm i -g vercel
   vercel login
   vercel --prod

Notes: this single-file app includes styles, game logic, sound (WebAudio), and responsive UI.
Customize colors in the :root CSS variables below to match Cysic brand.

Controls:
  Left/Right Arrow or A/D: move
  Up Arrow or W: rotate
  Down Arrow or S: soft drop
  Space: hard drop
  P: pause
  M: mute/unmute

Enjoy!
*/

import React, { useEffect, useRef, useState } from 'react';
import './index.css';

// -----------------------------
// CONFIG: Cysic colors — edit to match brand
// -----------------------------
const CYSIC_COLORS = {
  '--cysic-bg': '#0b1020',
  '--cysic-panel': '#0f1724',
  '--cysic-accent': '#7c3aed',
  '--cysic-accent-2': '#06b6d4',
  '--cysic-text': '#e6eef8',
};

// Tetromino shapes and colors
const TETROMINOES = {
  I: { shape: [[1,1,1,1]], color: '#06b6d4' },
  J: { shape: [[1,0,0],[1,1,1]], color: '#3b82f6' },
  L: { shape: [[0,0,1],[1,1,1]], color: '#fb923c' },
  O: { shape: [[1,1],[1,1]], color: '#f59e0b' },
  S: { shape: [[0,1,1],[1,1,0]], color: '#10b981' },
  T: { shape: [[0,1,0],[1,1,1]], color: '#7c3aed' },
  Z: { shape: [[1,1,0],[0,1,1]], color: '#ef4444' },
};

const TET_KEYS = Object.keys(TETROMINOES);
const COLS = 10;
const ROWS = 20;
const START_POS = { x: 3, y: 0 };

// Utilities
function makeEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotateMatrix(matrix) {
  const N = matrix.length;
  const res = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      res[c][N - 1 - r] = matrix[r][c];
    }
  }
  return res;
}

function padShape(shape) {
  // normalize to square matrix
  const h = shape.length;
  const w = shape[0].length;
  const n = Math.max(h, w);
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r][c] = shape[r][c];
  return out;
}

function randomTetromino() {
  const key = TET_KEYS[Math.floor(Math.random()*TET_KEYS.length)];
  const base = TETROMINOES[key];
  return { key, shape: padShape(base.shape), color: base.color };
}

// WebAudio simple sound generator
function createBeep(frequency=440, time=0.08, volume=0.08) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = frequency;
    g.gain.value = volume;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time);
    setTimeout(()=>{o.stop(); ctx.close();}, (time+0.05)*1000);
  } catch(e) {
    // ignore
  }
}

// -----------------------------
// React App
// -----------------------------
export default function App(){
  // apply cysic colors to document root
  useEffect(()=>{
    const root = document.documentElement.style;
    Object.entries(CYSIC_COLORS).forEach(([k,v])=>root.setProperty(k,v));
  },[]);

  const [board, setBoard] = useState(()=>makeEmptyBoard());
  const [current, setCurrent] = useState(()=> ({ ...randomTetromino(), pos: {...START_POS} }));
  const [next, setNext] = useState(()=>randomTetromino());
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [running, setRunning] = useState(true);
  const [mute, setMute] = useState(false);
  const dropIntervalRef = useRef(null);
  const speed = Math.max(200, 1000 - (level-1)*70);

  // collision
  function collides(board, shape, pos){
    const n = shape.length;
    for (let r=0;r<n;r++){
      for (let c=0;c<n;c++){
        if (!shape[r][c]) continue;
        const x = pos.x + c;
        const y = pos.y + r;
        if (x<0 || x>=COLS || y>=ROWS) return true;
        if (y>=0 && board[y][x]) return true;
      }
    }
    return false;
  }

  function merge(board, shape, pos, color){
    const newB = board.map(row=>row.slice());
    const n = shape.length;
    for (let r=0;r<n;r++){
      for (let c=0;c<n;c++){
        if (!shape[r][c]) continue;
        const x = pos.x + c;
        const y = pos.y + r;
        if (y>=0 && y<ROWS && x>=0 && x<COLS) newB[y][x] = color;
      }
    }
    return newB;
  }

  function clearLines(board){
    const newB = board.filter(row => row.some(cell=>!cell));
    const cleared = ROWS - newB.length;
    while (newB.length < ROWS) newB.unshift(Array(COLS).fill(null));
    return { board: newB, cleared };
  }

  function spawnNext(){
    setCurrent({ ...next, pos: {...START_POS} });
    setNext(randomTetromino());
  }

  function lockPiece(){
    setBoard(prev=>{
      const merged = merge(prev, current.shape, current.pos, current.color);
      const { board: clearedBoard, cleared } = clearLines(merged);
      if (cleared>0){
        if (!mute) createBeep(880, 0.12, 0.08);
        setScore(s => s + [0,40,100,300,1200][cleared] * level);
        setLines(l => l + cleared);
        setLevel(lv => Math.floor((lines+cleared)/10) + 1);
      }
      return clearedBoard;
    });
    spawnNext();
  }

  // tick drop
  useEffect(()=>{
    if (!running) return;
    function tick(){
      setCurrent(cur => {
        const nextPos = { x: cur.pos.x, y: cur.pos.y + 1 };
        if (collides(board, cur.shape, nextPos)){
          // lock
          lockPiece();
          // check game over
          if (cur.pos.y <= 0){
            setRunning(false);
            if (!mute) createBeep(120, 0.5, 0.15);
          }
          return cur;
        }
        return {...cur, pos: nextPos};
      });
    }
    dropIntervalRef.current = setInterval(tick, speed);
    return ()=>clearInterval(dropIntervalRef.current);
  }, [board, running, speed, current?.pos?.y, level, mute]);

  // controls
  useEffect(()=>{
    function onKey(e){
      if (!running) return;
      if (['ArrowLeft','a','A'].includes(e.key)) move(-1);
      if (['ArrowRight','d','D'].includes(e.key)) move(1);
      if (['ArrowUp','w','W'].includes(e.key)) rotate();
      if (['ArrowDown','s','S'].includes(e.key)) softDrop();
      if (e.code==='Space') hardDrop();
      if (e.key==='p' || e.key==='P') setRunning(r=>!r);
      if (e.key==='m' || e.key==='M') setMute(m=>!m);
    }
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  }, [current, board, running, mute]);

  function move(dir){
    setCurrent(cur=>{
      const next = {...cur, pos:{x:cur.pos.x+dir,y:cur.pos.y}};
      if (!collides(board, cur.shape, next.pos)){
        if (!mute) createBeep(440,0.03,0.02);
        return next;
      }
      return cur;
    });
  }

  function rotate(){
    setCurrent(cur=>{
      const rotated = rotateMatrix(cur.shape);
      const candidate = {...cur, shape: rotated};
      // simple wall kicks
      const kicks = [0, -1, 1, -2, 2];
      for (let k of kicks){
        const pos = { x: cur.pos.x + k, y: cur.pos.y };
        if (!collides(board, rotated, pos)){
          if (!mute) createBeep(660,0.04,0.03);
          return {...cur, shape: rotated, pos};
        }
      }
      return cur;
    });
  }

  function softDrop(){
    setCurrent(cur=>{
      const nextPos = { x: cur.pos.x, y: cur.pos.y+1 };
      if (!collides(board, cur.shape, nextPos)){
        if (!mute) createBeep(520,0.02,0.01);
        return {...cur, pos: nextPos};
      }
      return cur;
    });
  }

  function hardDrop(){
    setCurrent(cur=>{
      let y = cur.pos.y;
      while (!collides(board, cur.shape, {x:cur.pos.x, y: y+1})) y++;
      const landed = {...cur, pos:{x:cur.pos.x, y}};
      setBoard(prev=>merge(prev, landed.shape, landed.pos, landed.color));
      const { board: clearedBoard, cleared } = clearLines(merge(board, landed.shape, landed.pos, landed.color));
      if (cleared>0){
        if (!mute) createBeep(880, 0.12, 0.08);
        setScore(s => s + [0,40,100,300,1200][cleared] * level);
        setLines(l => l + cleared);
        setLevel(lv => Math.floor((lines+cleared)/10) + 1);
      }
      spawnNext();
      if (!mute) createBeep(980, 0.06, 0.09);
      return landed;
    });
  }

  function resetGame(){
    setBoard(makeEmptyBoard());
    setCurrent({...randomTetromino(), pos: {...START_POS}});
    setNext(randomTetromino());
    setScore(0); setLevel(1); setLines(0); setRunning(true);
  }

  // render helpers
  const displayBoard = merge(board, current.shape, current.pos, current.color);

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="brand">
          <img src="/cysic-logo.png" alt="cysic logo" className="logo" onError={(e)=>{e.target.style.display='none'}} />
          <h1>cysic Tetris</h1>
        </div>
        <div className="controls">
          <button onClick={()=>setRunning(r=>!r)}>{running? 'Pause':'Resume'}</button>
          <button onClick={()=>setMute(m=>!m)}>{mute? 'Unmute':'Mute'}</button>
          <button onClick={resetGame}>Restart</button>
        </div>
      </header>

      <main className="main-grid">
        <section className="board-wrap">
          <div className="board">
            {displayBoard.map((row,y)=> (
              <div className="row" key={y}>
                {row.map((cell,x)=> (
                  <div key={x} className={`cell ${cell? 'filled':''}`} style={cell? {background:cell}: {}} />
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside className="side-panel">
          <div className="stat">
            <div className="label">Score</div>
            <div className="value">{score}</div>
          </div>
          <div className="stat">
            <div className="label">Level</div>
            <div className="value">{level}</div>
          </div>
          <div className="stat">
            <div className="label">Lines</div>
            <div className="value">{lines}</div>
          </div>

          <div className="next">
            <div className="label">Next</div>
            <div className="preview">
              {next.shape.map((r,ri)=> (
                <div className="prow" key={ri}>
                  {r.map((c,ci)=> (
                    <div key={ci} className={`pcell ${c? 'filled':''}`} style={c? {background: next.color}: {}} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="help">
            <div>Controls</div>
            <ul>
              <li>← / → : move</li>
              <li>↑ : rotate</li>
              <li>↓ : soft drop</li>
              <li>Space : hard drop</li>
              <li>P : pause, M : mute</li>
            </ul>
          </div>

        </aside>
      </main>

      <footer className="footer">Built for the cysic community • v1.0 • Press M to mute • gSat 💛</footer>
    </div>
  );
}

