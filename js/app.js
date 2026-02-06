// Main controller — mode selection, game flow, move handling
import { Game, WHITE, BLACK, EMPTY, P, N, B, R, Q, K, FLAG_EP_CAPTURE,
         FLAG_CASTLE_K, FLAG_CASTLE_Q, isPromotion } from './game.js';
import { AI } from './ai.js';
import { UI } from './ui.js';

const PIECE_ORDER = [Q, R, B, N, P];

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.game = null;
    this.ai = null;
    this.ui = null;
    this.mode = null; // 'human' or 'computer'
    this.difficulty = 'medium';
    this.playerColor = WHITE;
    this.capturedByWhite = []; // pieces white has captured (black pieces)
    this.capturedByBlack = []; // pieces black has captured (white pieces)
    this.showModeSelection();
  }

  showModeSelection() {
    this.root.innerHTML = `
      <div class="mode-screen">
        <h1>Chess<span>Game</span></h1>
        <a class="github-link" href="https://github.com/michaeljfazio/simple-chess" target="_blank" rel="noopener">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          Source Code
        </a>
        <div class="mode-cards">
          <div class="mode-card" id="mode-human">
            <div class="icon">&#9812;&#9818;</div>
            <h2>Two Players</h2>
            <p>Play against a friend on the same device</p>
          </div>
          <div class="mode-card" id="mode-computer">
            <div class="icon">&#9812;&#128187;</div>
            <h2>vs Computer</h2>
            <p>Challenge the AI opponent</p>
            <div class="difficulty-select" id="diff-select">
              <button class="diff-btn" data-diff="easy">Easy</button>
              <button class="diff-btn active" data-diff="medium">Medium</button>
              <button class="diff-btn" data-diff="hard">Hard</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mode-human').addEventListener('click', (e) => {
      if (e.target.closest('.difficulty-select')) return;
      this.startGame('human');
    });

    document.getElementById('mode-computer').addEventListener('click', (e) => {
      if (e.target.closest('.difficulty-select')) return;
      this.startGame('computer');
    });

    document.getElementById('diff-select').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.difficulty = btn.dataset.diff;
    });
  }

  startGame(mode) {
    this.mode = mode;
    this.game = new Game();
    this.capturedByWhite = [];
    this.capturedByBlack = [];
    this.playerColor = WHITE;

    this.ui = new UI(this.root, this.game, (move) => this.handleMove(move));

    if (mode === 'computer') {
      this.ai = new AI(this.game, 3);
      this.ai.setDifficulty(this.difficulty);
      this.ui.setPlayerNames('You', `Computer (${this.difficulty})`);
    } else {
      this.ai = null;
      this.ui.setPlayerNames('White', 'Black');
    }

    this.ui.setNewGameCallback(() => this.showModeSelection());
    this.ui.render();
  }

  async handleMove(move) {
    const wasCapture = this.game.board[move.to] !== EMPTY || move.flag === FLAG_EP_CAPTURE;
    const captureSq = move.flag === FLAG_EP_CAPTURE
      ? move.to + (this.game.turn === WHITE ? 8 : -8)
      : move.to;
    const capturedPiece = move.flag === FLAG_EP_CAPTURE
      ? this.game.board[captureSq]
      : this.game.board[move.to];

    // Animate the move
    await this.ui.animateMove(move);

    if (wasCapture) {
      this.ui.animateCapture(move.to);
      if (capturedPiece !== EMPTY) {
        if (capturedPiece < 0) {
          this.capturedByWhite.push(capturedPiece);
        } else {
          this.capturedByBlack.push(capturedPiece);
        }
        this.sortCaptures();
      }
    }

    // Execute the move
    const algebraic = this.game.executeMove(move);
    this.ui.lastMove = move;

    // Update UI
    this.ui.render();
    this.ui.updateCapturedPieces(this.capturedByWhite, this.capturedByBlack);

    // Update move history
    const moveCount = this.game.moveList.length;
    const moveNum = Math.ceil(moveCount / 2);
    if (moveCount % 2 === 1) {
      this.ui.addMoveToHistory(moveNum, algebraic, null);
    } else {
      this.ui.addMoveToHistory(moveNum, null, algebraic);
    }

    // Check game over
    if (this.game.isGameOver()) {
      this.handleGameOver();
      return;
    }

    // Computer's turn
    if (this.mode === 'computer' && this.game.turn !== this.playerColor) {
      this.ui.locked = true;
      this.ui.showThinking(this.game.turn, true);
      this.ai.getBestMove((aiMove) => {
        this.ui.showThinking(this.game.turn, false);
        this.ui.locked = false;
        if (aiMove) {
          this.handleMove(aiMove);
        }
      });
    }
  }

  sortCaptures() {
    const order = p => {
      const idx = PIECE_ORDER.indexOf(Math.abs(p));
      return idx >= 0 ? idx : 99;
    };
    this.capturedByWhite.sort((a, b) => order(a) - order(b));
    this.capturedByBlack.sort((a, b) => order(a) - order(b));
  }

  handleGameOver() {
    const result = this.game.getGameResult();
    let title = 'Game Over';

    if (result.includes('checkmate')) {
      title = result.includes('White') ? 'White Wins!' : 'Black Wins!';
    } else {
      title = 'Draw';
    }

    this.ui.showGameOver(title, result, () => this.showModeSelection());
  }
}

// Start the app
new App();
