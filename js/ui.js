// UI — SVG rendering, drag-and-drop, animations, panels
import PIECES from './pieces.js';
import { EMPTY, P, N, B, R, Q, K, WHITE, BLACK, fileOf, rankOf, sqName, sq,
         FLAG_EP_CAPTURE, FLAG_CASTLE_K, FLAG_CASTLE_Q, isPromotion, promopiece } from './game.js';

const PIECE_KEYS = { 1:'P', 2:'N', 3:'B', 4:'R', 5:'Q', 6:'K',
                    '-1':'p','-2':'n','-3':'b','-4':'r','-5':'q','-6':'k' };

const SVG_NS = 'http://www.w3.org/2000/svg';

export class UI {
  constructor(container, game, onMove) {
    this.container = container;
    this.game = game;
    this.onMove = onMove; // callback: (from, to, promoFlag?) => void
    this.sqSize = 80;
    this.flipped = false;

    this.selectedSq = -1;
    this.legalMoves = [];
    this.lastMove = null;
    this.dragPiece = null;
    this.dragFromSq = -1;
    this.locked = false; // prevent interaction during AI turn

    this.build();
  }

  build() {
    this.container.innerHTML = '';

    // Game container
    this.gameEl = document.createElement('div');
    this.gameEl.className = 'game-container';
    this.container.appendChild(this.gameEl);

    // Board wrapper
    this.boardWrapper = document.createElement('div');
    this.boardWrapper.className = 'board-wrapper';
    this.gameEl.appendChild(this.boardWrapper);

    this.buildBoard();
    this.buildSidePanel();
    this.buildFooter();
    this.buildPromotionDialog();
    this.buildGameOverDialog();
    this.render();
  }

  buildBoard() {
    const size = this.sqSize * 8;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('class', 'board-svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    this.boardSvg = svg;

    // Squares layer
    this.squaresLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(this.squaresLayer);

    // Highlights layer
    this.highlightsLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(this.highlightsLayer);

    // Move indicators layer
    this.indicatorsLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(this.indicatorsLayer);

    // Pieces layer
    this.piecesLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(this.piecesLayer);

    // Coordinates layer
    this.coordsLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(this.coordsLayer);

    // Draw squares
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const isLight = (r + f) % 2 === 0;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', f * this.sqSize);
        rect.setAttribute('y', r * this.sqSize);
        rect.setAttribute('width', this.sqSize);
        rect.setAttribute('height', this.sqSize);
        rect.setAttribute('class', `square ${isLight ? 'square-light' : 'square-dark'}`);
        rect.dataset.viewRow = r;
        rect.dataset.viewCol = f;
        this.squaresLayer.appendChild(rect);
      }
    }

    // Coordinates
    this.drawCoords();

    // Events
    svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    svg.addEventListener('pointerup', (e) => this.onPointerUp(e));

    this.boardWrapper.appendChild(svg);
  }

  drawCoords() {
    this.coordsLayer.innerHTML = '';
    const files = this.flipped ? 'hgfedcba' : 'abcdefgh';
    const ranks = this.flipped ? '12345678' : '87654321';

    for (let i = 0; i < 8; i++) {
      // File labels (bottom)
      const ft = document.createElementNS(SVG_NS, 'text');
      ft.setAttribute('x', i * this.sqSize + this.sqSize - 4);
      ft.setAttribute('y', 8 * this.sqSize - 3);
      ft.setAttribute('text-anchor', 'end');
      ft.setAttribute('class', `coord-text ${(7 + i) % 2 === 0 ? 'coord-light' : 'coord-dark'}`);
      ft.textContent = files[i];
      this.coordsLayer.appendChild(ft);

      // Rank labels (left)
      const rt = document.createElementNS(SVG_NS, 'text');
      rt.setAttribute('x', 3);
      rt.setAttribute('y', i * this.sqSize + 14);
      rt.setAttribute('class', `coord-text ${i % 2 === 0 ? 'coord-light' : 'coord-dark'}`);
      rt.textContent = ranks[i];
      this.coordsLayer.appendChild(rt);
    }
  }

  viewToSquare(viewRow, viewCol) {
    const file = this.flipped ? 7 - viewCol : viewCol;
    const rank = this.flipped ? viewRow : 7 - viewRow;
    return sq(file, rank);
  }

  squareToView(s) {
    const file = fileOf(s);
    const rank = rankOf(s);
    const viewCol = this.flipped ? 7 - file : file;
    const viewRow = this.flipped ? rank : 7 - rank;
    return { x: viewCol * this.sqSize, y: viewRow * this.sqSize };
  }

  getSqFromEvent(e) {
    const svg = this.boardSvg;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    const viewCol = Math.floor(svgP.x / this.sqSize);
    const viewRow = Math.floor(svgP.y / this.sqSize);
    if (viewCol < 0 || viewCol > 7 || viewRow < 0 || viewRow > 7) return -1;
    return this.viewToSquare(viewRow, viewCol);
  }

  // --- Rendering ---

  render() {
    this.renderPieces();
    this.renderHighlights();
    this.updatePlayerIndicators();
  }

  renderPieces() {
    this.piecesLayer.innerHTML = '';
    this.pieceElements = {};

    for (let s = 0; s < 64; s++) {
      const p = this.game.board[s];
      if (p === EMPTY) continue;
      this.createPieceElement(s, p);
    }
  }

  createPieceElement(s, piece) {
    const key = PIECE_KEYS[piece];
    if (!key || !PIECES[key]) return;

    const { x, y } = this.squareToView(s);
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'piece-group');
    g.setAttribute('transform', `translate(${x}, ${y})`);
    g.dataset.square = s;

    const inner = document.createElementNS(SVG_NS, 'svg');
    inner.setAttribute('viewBox', '0 0 45 45');
    inner.setAttribute('width', this.sqSize);
    inner.setAttribute('height', this.sqSize);
    inner.innerHTML = PIECES[key];

    g.appendChild(inner);
    this.piecesLayer.appendChild(g);
    this.pieceElements[s] = g;
    return g;
  }

  renderHighlights() {
    this.highlightsLayer.innerHTML = '';
    this.indicatorsLayer.innerHTML = '';

    // Last move
    if (this.lastMove) {
      this.addHighlight(this.lastMove.from, 'highlight-last highlight-last-from');
      this.addHighlight(this.lastMove.to, 'highlight-last highlight-last-to');
    }

    // Selected square
    if (this.selectedSq >= 0) {
      this.addHighlight(this.selectedSq, 'highlight-selected');

      // Legal move indicators
      for (const move of this.legalMoves) {
        if (move.from !== this.selectedSq) continue;
        const { x, y } = this.squareToView(move.to);
        const cx = x + this.sqSize / 2;
        const cy = y + this.sqSize / 2;
        const target = this.game.board[move.to];

        if (target !== EMPTY || move.flag === FLAG_EP_CAPTURE) {
          // Capture indicator — corner triangles as a ring
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('cx', cx);
          circle.setAttribute('cy', cy);
          circle.setAttribute('r', this.sqSize * 0.46);
          circle.setAttribute('class', 'capture-ring');
          this.indicatorsLayer.appendChild(circle);
        } else {
          // Move dot
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('cx', cx);
          circle.setAttribute('cy', cy);
          circle.setAttribute('r', this.sqSize * 0.15);
          circle.setAttribute('class', 'move-dot');
          this.indicatorsLayer.appendChild(circle);
        }
      }
    }

    // Check highlight
    if (this.game.isInCheck(this.game.turn)) {
      const kSq = this.game.findKing(this.game.turn);
      if (kSq >= 0) {
        const { x, y } = this.squareToView(kSq);
        const cx = x + this.sqSize / 2;
        const cy = y + this.sqSize / 2;
        const r = this.sqSize * 0.5;

        const defs = document.createElementNS(SVG_NS, 'defs');
        const grad = document.createElementNS(SVG_NS, 'radialGradient');
        grad.id = 'check-grad';
        const s1 = document.createElementNS(SVG_NS, 'stop');
        s1.setAttribute('offset', '0%');
        s1.setAttribute('stop-color', 'rgba(233, 69, 96, 0.9)');
        const s2 = document.createElementNS(SVG_NS, 'stop');
        s2.setAttribute('offset', '50%');
        s2.setAttribute('stop-color', 'rgba(233, 69, 96, 0.4)');
        const s3 = document.createElementNS(SVG_NS, 'stop');
        s3.setAttribute('offset', '100%');
        s3.setAttribute('stop-color', 'transparent');
        grad.appendChild(s1);
        grad.appendChild(s2);
        grad.appendChild(s3);
        defs.appendChild(grad);
        this.highlightsLayer.appendChild(defs);

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        circle.setAttribute('fill', 'url(#check-grad)');
        circle.setAttribute('class', 'check-highlight active');
        this.highlightsLayer.appendChild(circle);
      }
    }
  }

  addHighlight(s, className) {
    const { x, y } = this.squareToView(s);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', this.sqSize);
    rect.setAttribute('height', this.sqSize);
    rect.setAttribute('class', className);
    this.highlightsLayer.appendChild(rect);
  }

  // --- Interaction ---

  onPointerDown(e) {
    e.preventDefault();
    if (this.locked) return;
    const s = this.getSqFromEvent(e);
    if (s < 0) return;

    const piece = this.game.board[s];
    const color = piece > 0 ? WHITE : piece < 0 ? BLACK : 0;

    // Click on own piece — select it
    if (piece !== EMPTY && color === this.game.turn) {
      this.selectedSq = s;
      this.legalMoves = this.game.generateLegalMoves();
      this.renderHighlights();

      // Start drag
      const el = this.pieceElements[s];
      if (el) {
        this.dragPiece = el;
        this.dragFromSq = s;
        el.classList.add('dragging');
        el.style.zIndex = 100;
        this.boardSvg.setPointerCapture(e.pointerId);

        // Move piece to cursor position
        const svgPt = this.getSvgPoint(e);
        const dx = svgPt.x - this.sqSize / 2;
        const dy = svgPt.y - this.sqSize / 2;
        el.setAttribute('transform', `translate(${dx}, ${dy})`);
      }
      return;
    }

    // Click on target square while piece is selected — try to move
    if (this.selectedSq >= 0) {
      this.tryMove(this.selectedSq, s);
    }
  }

  onPointerMove(e) {
    if (!this.dragPiece) return;
    e.preventDefault();
    const svgPt = this.getSvgPoint(e);
    const dx = svgPt.x - this.sqSize / 2;
    const dy = svgPt.y - this.sqSize / 2;
    this.dragPiece.setAttribute('transform', `translate(${dx}, ${dy})`);
  }

  onPointerUp(e) {
    if (!this.dragPiece) return;
    e.preventDefault();

    const s = this.getSqFromEvent(e);
    this.dragPiece.classList.remove('dragging');
    this.dragPiece.style.zIndex = '';
    this.boardSvg.releasePointerCapture(e.pointerId);

    if (s >= 0 && s !== this.dragFromSq) {
      this.tryMove(this.dragFromSq, s);
    } else {
      // Snap back
      const { x, y } = this.squareToView(this.dragFromSq);
      this.dragPiece.setAttribute('transform', `translate(${x}, ${y})`);
    }

    this.dragPiece = null;
    this.dragFromSq = -1;
  }

  getSvgPoint(e) {
    const pt = this.boardSvg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(this.boardSvg.getScreenCTM().inverse());
  }

  tryMove(from, to) {
    const moves = this.legalMoves.filter(m => m.from === from && m.to === to);
    if (moves.length === 0) {
      this.selectedSq = -1;
      this.renderHighlights();
      // If clicked on own piece, select it instead
      const piece = this.game.board[to];
      if (piece !== EMPTY && (piece > 0 ? WHITE : BLACK) === this.game.turn) {
        this.selectedSq = to;
        this.renderHighlights();
      }
      this.snapPieceBack(from);
      return;
    }

    // Check if promotion
    const promoMoves = moves.filter(m => isPromotion(m.flag));
    if (promoMoves.length > 0) {
      this.showPromotionDialog(from, to, promoMoves);
      return;
    }

    this.onMove(moves[0]);
  }

  snapPieceBack(s) {
    const el = this.pieceElements[s];
    if (el) {
      const { x, y } = this.squareToView(s);
      el.setAttribute('transform', `translate(${x}, ${y})`);
    }
  }

  // --- Animation ---

  animateMove(move) {
    return new Promise(resolve => {
      const el = this.pieceElements[move.from];
      if (!el) { resolve(); return; }

      const { x: toX, y: toY } = this.squareToView(move.to);
      el.classList.add('animating');
      el.setAttribute('transform', `translate(${toX}, ${toY})`);

      const onEnd = () => {
        el.classList.remove('animating');
        el.removeEventListener('transitionend', onEnd);
        resolve();
      };
      el.addEventListener('transitionend', onEnd);

      // Fallback
      setTimeout(() => {
        el.classList.remove('animating');
        resolve();
      }, 350);
    });
  }

  animateCapture(s) {
    const { x, y } = this.squareToView(s);
    const cx = x + this.sqSize / 2;
    const cy = y + this.sqSize / 2;

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '10');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'var(--accent)');
    circle.setAttribute('stroke-width', '4');
    circle.setAttribute('class', 'capture-effect active');
    this.piecesLayer.appendChild(circle);

    setTimeout(() => circle.remove(), 500);
  }

  // --- Promotion Dialog ---

  buildPromotionDialog() {
    this.promoOverlay = document.createElement('div');
    this.promoOverlay.className = 'promo-overlay';
    this.promoOverlay.innerHTML = `
      <div class="promo-dialog">
        <h3>Promote pawn to:</h3>
        <div class="promo-pieces"></div>
      </div>
    `;
    this.container.appendChild(this.promoOverlay);
  }

  showPromotionDialog(from, to, moves) {
    const color = this.game.turn;
    const piecesDiv = this.promoOverlay.querySelector('.promo-pieces');
    piecesDiv.innerHTML = '';

    const types = [Q, R, B, N];
    const keys = color === WHITE ? ['Q','R','B','N'] : ['q','r','b','n'];

    types.forEach((type, i) => {
      const btn = document.createElement('div');
      btn.className = 'promo-piece';
      btn.innerHTML = `<svg viewBox="0 0 45 45">${PIECES[keys[i]]}</svg>`;
      btn.addEventListener('click', () => {
        this.promoOverlay.classList.remove('active');
        const move = moves.find(m => promopiece(m.flag) === type);
        if (move) this.onMove(move);
      });
      piecesDiv.appendChild(btn);
    });

    this.promoOverlay.classList.add('active');
  }

  // --- Game Over Dialog ---

  buildGameOverDialog() {
    this.gameOverEl = document.createElement('div');
    this.gameOverEl.className = 'gameover-overlay';
    this.gameOverEl.innerHTML = `
      <div class="gameover-dialog">
        <h2 class="go-title"></h2>
        <p class="go-message"></p>
        <button class="go-btn">Play Again</button>
      </div>
    `;
    this.container.appendChild(this.gameOverEl);
  }

  showGameOver(title, message, onPlayAgain) {
    this.gameOverEl.querySelector('.go-title').textContent = title;
    this.gameOverEl.querySelector('.go-message').textContent = message;
    const btn = this.gameOverEl.querySelector('.go-btn');
    btn.onclick = () => {
      this.gameOverEl.classList.remove('active');
      onPlayAgain();
    };
    this.gameOverEl.classList.add('active');
  }

  // --- Side Panel ---

  buildSidePanel() {
    this.sidePanel = document.createElement('div');
    this.sidePanel.className = 'side-panel';

    // Black player (top)
    this.sidePanel.innerHTML = `
      <div class="panel-section">
        <div class="player-info">
          <div class="player-indicator black" id="ind-black">&#9818;</div>
          <div>
            <div class="player-name" id="name-black">Black</div>
            <div class="player-captures" id="captures-black"></div>
            <div class="thinking-indicator" id="thinking-black">Thinking...</div>
          </div>
        </div>
      </div>
      <div class="panel-section move-history">
        <h3>Moves</h3>
        <div class="move-list" id="move-list"></div>
      </div>
      <div class="panel-section">
        <div class="player-info">
          <div class="player-indicator white" id="ind-white">&#9812;</div>
          <div>
            <div class="player-name" id="name-white">White</div>
            <div class="player-captures" id="captures-white"></div>
            <div class="thinking-indicator" id="thinking-white">Thinking...</div>
          </div>
        </div>
      </div>
      <div class="panel-section">
        <div class="game-controls">
          <button class="ctrl-btn" id="btn-flip">Flip Board</button>
          <button class="ctrl-btn" id="btn-new">New Game</button>
        </div>
      </div>
    `;

    this.gameEl.appendChild(this.sidePanel);

    document.getElementById('btn-flip').addEventListener('click', () => {
      this.flipped = !this.flipped;
      this.drawCoords();
      this.render();
    });
  }

  buildFooter() {
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      <a class="github-link" href="https://github.com/michaeljfazio/simple-chess" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Source Code
      </a>
    `;
    this.container.appendChild(footer);
  }

  setPlayerNames(whiteName, blackName) {
    document.getElementById('name-white').textContent = whiteName;
    document.getElementById('name-black').textContent = blackName;
  }

  updatePlayerIndicators() {
    const wInd = document.getElementById('ind-white');
    const bInd = document.getElementById('ind-black');
    if (wInd) wInd.classList.toggle('active', this.game.turn === WHITE);
    if (bInd) bInd.classList.toggle('active', this.game.turn === BLACK);
  }

  showThinking(color, visible) {
    const id = color === WHITE ? 'thinking-white' : 'thinking-black';
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', visible);
  }

  addMoveToHistory(moveNum, whiteMove, blackMove) {
    const list = document.getElementById('move-list');
    if (!list) return;

    // Build or update row
    let row = list.querySelector(`[data-move="${moveNum}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'move-row';
      row.dataset.move = moveNum;
      row.innerHTML = `<span class="move-number">${moveNum}.</span>`;
      list.appendChild(row);
    }

    if (whiteMove) {
      let wSpan = row.querySelector('.white-move');
      if (!wSpan) {
        wSpan = document.createElement('span');
        wSpan.className = 'move-text white-move';
        row.appendChild(wSpan);
      }
      wSpan.textContent = whiteMove;
    }

    if (blackMove) {
      let bSpan = row.querySelector('.black-move');
      if (!bSpan) {
        bSpan = document.createElement('span');
        bSpan.className = 'move-text black-move';
        row.appendChild(bSpan);
      }
      bSpan.textContent = blackMove;
    }

    list.scrollTop = list.scrollHeight;
  }

  updateCapturedPieces(whiteCaptures, blackCaptures) {
    const wEl = document.getElementById('captures-white');
    const bEl = document.getElementById('captures-black');
    if (wEl) wEl.innerHTML = this.renderCaptureIcons(whiteCaptures);
    if (bEl) bEl.innerHTML = this.renderCaptureIcons(blackCaptures);
  }

  renderCaptureIcons(captures) {
    return captures.map(p => {
      const key = PIECE_KEYS[p];
      if (!key || !PIECES[key]) return '';
      return `<svg viewBox="0 0 45 45" width="20" height="20">${PIECES[key]}</svg>`;
    }).join('');
  }

  clearMoveHistory() {
    const list = document.getElementById('move-list');
    if (list) list.innerHTML = '';
  }

  setNewGameCallback(cb) {
    const btn = document.getElementById('btn-new');
    if (btn) btn.addEventListener('click', cb);
  }
}
