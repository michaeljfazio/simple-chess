// Chess engine — Int8Array[64] board, full rules, move generation
// Board: index 0 = a8, 7 = h8, 56 = a1, 63 = h1
// Pieces: P=1, N=2, B=3, R=4, Q=5, K=6; negative = black

export const EMPTY = 0, P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const WHITE = 1, BLACK = -1;

const PIECE_CHARS = '.PNBRQKpnbrqk';

export function sq(file, rank) { return (7 - rank) * 8 + file; }
export function fileOf(s) { return s & 7; }
export function rankOf(s) { return 7 - (s >> 3); }
export function sqName(s) { return 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1); }

const BISHOP_DIRS = [-9, -7, 7, 9];
const ROOK_DIRS = [-8, -1, 1, 8];
const QUEEN_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];
const KNIGHT_OFFSETS = [-17, -15, -10, -6, 6, 10, 15, 17];
const KING_OFFSETS = [-9, -8, -7, -1, 1, 7, 8, 9];

export const FLAG_NORMAL = 0;
export const FLAG_DOUBLE_PUSH = 1;
export const FLAG_EP_CAPTURE = 2;
export const FLAG_CASTLE_K = 3;
export const FLAG_CASTLE_Q = 4;
export const FLAG_PROMO_N = 5;
export const FLAG_PROMO_B = 6;
export const FLAG_PROMO_R = 7;
export const FLAG_PROMO_Q = 8;

export function isPromotion(flag) { return flag >= FLAG_PROMO_N; }
export function promopiece(flag) { return flag - 3; }

export class Move {
  constructor(from, to, flag = FLAG_NORMAL) {
    this.from = from;
    this.to = to;
    this.flag = flag;
    this.captured = EMPTY;
  }
}

export class Game {
  constructor() {
    this.board = new Int8Array(64);
    this.turn = WHITE;
    this.castling = [true, true, true, true]; // wK, wQ, bK, bQ
    this.epSquare = -1;
    this.halfMoveClock = 0;
    this.fullMoveNumber = 1;
    this.history = [];
    this.positionHistory = [];
    this.moveList = [];
    this.reset();
  }

  reset() {
    this.board.fill(EMPTY);
    const back = [R, N, B, Q, K, B, N, R];
    for (let f = 0; f < 8; f++) {
      this.board[sq(f, 7)] = -back[f];
      this.board[sq(f, 6)] = -P;
      this.board[sq(f, 1)] = P;
      this.board[sq(f, 0)] = back[f];
    }
    this.turn = WHITE;
    this.castling = [true, true, true, true];
    this.epSquare = -1;
    this.halfMoveClock = 0;
    this.fullMoveNumber = 1;
    this.history = [];
    this.positionHistory = [];
    this.moveList = [];
    this.positionHistory.push(this.positionKey());
  }

  pieceAt(s) { return this.board[s]; }
  colorOf(s) { const p = this.board[s]; return p > 0 ? WHITE : p < 0 ? BLACK : 0; }

  positionKey() {
    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[sq(f, r)];
        if (p === EMPTY) { empty++; continue; }
        if (empty) { fen += empty; empty = 0; }
        const abs = Math.abs(p);
        const c = PIECE_CHARS[abs];
        fen += p > 0 ? c.toUpperCase() : c.toLowerCase();
      }
      if (empty) fen += empty;
      if (r > 0) fen += '/';
    }
    fen += this.turn === WHITE ? ' w ' : ' b ';
    let c = '';
    if (this.castling[0]) c += 'K';
    if (this.castling[1]) c += 'Q';
    if (this.castling[2]) c += 'k';
    if (this.castling[3]) c += 'q';
    fen += c || '-';
    fen += ' ' + (this.epSquare >= 0 ? sqName(this.epSquare) : '-');
    return fen;
  }

  toFEN() {
    return this.positionKey() + ' ' + this.halfMoveClock + ' ' + this.fullMoveNumber;
  }

  // --- Move Generation ---

  generatePseudoLegalMoves() {
    const moves = [];
    const color = this.turn;
    for (let s = 0; s < 64; s++) {
      const p = this.board[s];
      if (p === EMPTY || (p > 0 ? WHITE : BLACK) !== color) continue;
      const type = Math.abs(p);
      switch (type) {
        case P: this._genPawnMoves(s, color, moves); break;
        case N: this._genKnightMoves(s, color, moves); break;
        case B: this._genSliderMoves(s, color, BISHOP_DIRS, moves); break;
        case R: this._genSliderMoves(s, color, ROOK_DIRS, moves); break;
        case Q: this._genSliderMoves(s, color, QUEEN_DIRS, moves); break;
        case K: this._genKingMoves(s, color, moves); break;
      }
    }
    return moves;
  }

  _genPawnMoves(s, color, moves) {
    const dir = color === WHITE ? -8 : 8;
    const startRank = color === WHITE ? 1 : 6;
    const promoRank = color === WHITE ? 7 : 0;
    const file = fileOf(s);
    const rank = rankOf(s);

    const fwd = s + dir;
    if (fwd >= 0 && fwd < 64 && this.board[fwd] === EMPTY) {
      if (rankOf(fwd) === promoRank) {
        moves.push(new Move(s, fwd, FLAG_PROMO_Q));
        moves.push(new Move(s, fwd, FLAG_PROMO_R));
        moves.push(new Move(s, fwd, FLAG_PROMO_B));
        moves.push(new Move(s, fwd, FLAG_PROMO_N));
      } else {
        moves.push(new Move(s, fwd, FLAG_NORMAL));
        if (rank === startRank) {
          const fwd2 = s + dir * 2;
          if (this.board[fwd2] === EMPTY) {
            moves.push(new Move(s, fwd2, FLAG_DOUBLE_PUSH));
          }
        }
      }
    }

    for (const df of [-1, 1]) {
      const cf = file + df;
      if (cf < 0 || cf > 7) continue;
      const target = s + dir + df;
      if (target < 0 || target >= 64) continue;
      const tp = this.board[target];
      if (tp !== EMPTY && (tp > 0 ? WHITE : BLACK) !== color) {
        if (rankOf(target) === promoRank) {
          moves.push(new Move(s, target, FLAG_PROMO_Q));
          moves.push(new Move(s, target, FLAG_PROMO_R));
          moves.push(new Move(s, target, FLAG_PROMO_B));
          moves.push(new Move(s, target, FLAG_PROMO_N));
        } else {
          moves.push(new Move(s, target, FLAG_NORMAL));
        }
      }
      if (target === this.epSquare) {
        moves.push(new Move(s, target, FLAG_EP_CAPTURE));
      }
    }
  }

  _genKnightMoves(s, color, moves) {
    const file = fileOf(s), rank = rankOf(s);
    for (const off of KNIGHT_OFFSETS) {
      const t = s + off;
      if (t < 0 || t >= 64) continue;
      const tf = fileOf(t), tr = rankOf(t);
      const fd = Math.abs(tf - file), rd = Math.abs(tr - rank);
      if (!((fd === 1 && rd === 2) || (fd === 2 && rd === 1))) continue;
      const tp = this.board[t];
      if (tp === EMPTY || (tp > 0 ? WHITE : BLACK) !== color) {
        moves.push(new Move(s, t, FLAG_NORMAL));
      }
    }
  }

  _genSliderMoves(s, color, dirs, moves) {
    for (const dir of dirs) {
      let cs = s;
      for (let i = 0; i < 7; i++) {
        const prevFile = fileOf(cs);
        cs += dir;
        if (cs < 0 || cs >= 64) break;
        const cf = fileOf(cs);
        if (Math.abs(cf - prevFile) > 1) break;
        const tp = this.board[cs];
        if (tp === EMPTY) {
          moves.push(new Move(s, cs, FLAG_NORMAL));
        } else {
          if ((tp > 0 ? WHITE : BLACK) !== color) {
            moves.push(new Move(s, cs, FLAG_NORMAL));
          }
          break;
        }
      }
    }
  }

  _genKingMoves(s, color, moves) {
    const file = fileOf(s), rank = rankOf(s);
    for (const off of KING_OFFSETS) {
      const t = s + off;
      if (t < 0 || t >= 64) continue;
      const tf = fileOf(t), tr = rankOf(t);
      if (Math.abs(tf - file) > 1 || Math.abs(tr - rank) > 1) continue;
      const tp = this.board[t];
      if (tp === EMPTY || (tp > 0 ? WHITE : BLACK) !== color) {
        moves.push(new Move(s, t, FLAG_NORMAL));
      }
    }

    const baseRank = color === WHITE ? 0 : 7;
    const kSq = sq(4, baseRank);
    if (s !== kSq) return;

    const ksIdx = color === WHITE ? 0 : 2;
    if (this.castling[ksIdx]) {
      if (this.board[sq(5, baseRank)] === EMPTY &&
          this.board[sq(6, baseRank)] === EMPTY &&
          !this.isSquareAttacked(sq(4, baseRank), -color) &&
          !this.isSquareAttacked(sq(5, baseRank), -color) &&
          !this.isSquareAttacked(sq(6, baseRank), -color)) {
        moves.push(new Move(kSq, sq(6, baseRank), FLAG_CASTLE_K));
      }
    }

    if (this.castling[ksIdx + 1]) {
      if (this.board[sq(3, baseRank)] === EMPTY &&
          this.board[sq(2, baseRank)] === EMPTY &&
          this.board[sq(1, baseRank)] === EMPTY &&
          !this.isSquareAttacked(sq(4, baseRank), -color) &&
          !this.isSquareAttacked(sq(3, baseRank), -color) &&
          !this.isSquareAttacked(sq(2, baseRank), -color)) {
        moves.push(new Move(kSq, sq(2, baseRank), FLAG_CASTLE_Q));
      }
    }
  }

  isSquareAttacked(s, byColor) {
    const file = fileOf(s), rank = rankOf(s);

    // Pawn attacks — look for enemy pawns that could attack this square
    const pawnDir = byColor === WHITE ? 8 : -8; // direction pawns come FROM
    for (const df of [-1, 1]) {
      const from = s + pawnDir + df;
      if (from < 0 || from >= 64) continue;
      if (Math.abs(fileOf(from) - file) !== 1) continue;
      if (this.board[from] === P * byColor) return true;
    }

    for (const off of KNIGHT_OFFSETS) {
      const from = s + off;
      if (from < 0 || from >= 64) continue;
      const ff = fileOf(from);
      const fd = Math.abs(ff - file), rd = Math.abs(rankOf(from) - rank);
      if (!((fd === 1 && rd === 2) || (fd === 2 && rd === 1))) continue;
      if (this.board[from] === N * byColor) return true;
    }

    for (const off of KING_OFFSETS) {
      const from = s + off;
      if (from < 0 || from >= 64) continue;
      if (Math.abs(fileOf(from) - file) > 1 || Math.abs(rankOf(from) - rank) > 1) continue;
      if (this.board[from] === K * byColor) return true;
    }

    for (const dir of BISHOP_DIRS) {
      let cs = s;
      for (let i = 0; i < 7; i++) {
        const pf = fileOf(cs);
        cs += dir;
        if (cs < 0 || cs >= 64) break;
        if (Math.abs(fileOf(cs) - pf) > 1) break;
        const p = this.board[cs];
        if (p === EMPTY) continue;
        if (p === B * byColor || p === Q * byColor) return true;
        break;
      }
    }

    for (const dir of ROOK_DIRS) {
      let cs = s;
      for (let i = 0; i < 7; i++) {
        const pf = fileOf(cs);
        cs += dir;
        if (cs < 0 || cs >= 64) break;
        if (Math.abs(fileOf(cs) - pf) > 1) break;
        const p = this.board[cs];
        if (p === EMPTY) continue;
        if (p === R * byColor || p === Q * byColor) return true;
        break;
      }
    }

    return false;
  }

  findKing(color) {
    const k = K * color;
    for (let s = 0; s < 64; s++) {
      if (this.board[s] === k) return s;
    }
    return -1;
  }

  isInCheck(color) {
    const kSq = this.findKing(color);
    return kSq >= 0 && this.isSquareAttacked(kSq, -color);
  }

  generateLegalMoves() {
    const pseudo = this.generatePseudoLegalMoves();
    const legal = [];
    for (const move of pseudo) {
      this.makeMove(move);
      if (!this.isInCheck(-this.turn)) {
        legal.push(move);
      }
      this.undoMove();
    }
    return legal;
  }

  // --- Make / Undo Move ---

  makeMove(move) {
    const state = {
      castling: [...this.castling],
      epSquare: this.epSquare,
      halfMoveClock: this.halfMoveClock,
      captured: EMPTY,
      move: move,
    };

    const piece = this.board[move.from];
    const color = piece > 0 ? WHITE : BLACK;
    const type = Math.abs(piece);
    let captured = this.board[move.to];

    if (move.flag === FLAG_EP_CAPTURE) {
      const capturedSq = move.to + (color === WHITE ? 8 : -8);
      captured = this.board[capturedSq];
      this.board[capturedSq] = EMPTY;
    }

    state.captured = captured;
    move.captured = captured;

    this.board[move.to] = piece;
    this.board[move.from] = EMPTY;

    if (isPromotion(move.flag)) {
      this.board[move.to] = promopiece(move.flag) * color;
    }

    if (move.flag === FLAG_CASTLE_K) {
      const baseRank = color === WHITE ? 0 : 7;
      this.board[sq(5, baseRank)] = R * color;
      this.board[sq(7, baseRank)] = EMPTY;
    } else if (move.flag === FLAG_CASTLE_Q) {
      const baseRank = color === WHITE ? 0 : 7;
      this.board[sq(3, baseRank)] = R * color;
      this.board[sq(0, baseRank)] = EMPTY;
    }

    if (move.flag === FLAG_DOUBLE_PUSH) {
      this.epSquare = move.from + (color === WHITE ? -8 : 8);
    } else {
      this.epSquare = -1;
    }

    if (type === K) {
      if (color === WHITE) { this.castling[0] = false; this.castling[1] = false; }
      else { this.castling[2] = false; this.castling[3] = false; }
    }
    if (move.from === sq(7, 0) || move.to === sq(7, 0)) this.castling[0] = false;
    if (move.from === sq(0, 0) || move.to === sq(0, 0)) this.castling[1] = false;
    if (move.from === sq(7, 7) || move.to === sq(7, 7)) this.castling[2] = false;
    if (move.from === sq(0, 7) || move.to === sq(0, 7)) this.castling[3] = false;

    if (type === P || captured !== EMPTY) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    if (color === BLACK) this.fullMoveNumber++;

    this.turn = -this.turn;
    this.history.push(state);
  }

  undoMove() {
    if (this.history.length === 0) return;
    const state = this.history.pop();
    this.turn = -this.turn;
    const color = this.turn;
    const move = state.move;

    if (isPromotion(move.flag)) {
      this.board[move.to] = P * color;
    }

    this.board[move.from] = this.board[move.to];
    this.board[move.to] = EMPTY;

    if (move.flag === FLAG_EP_CAPTURE) {
      const capturedSq = move.to + (color === WHITE ? 8 : -8);
      this.board[capturedSq] = state.captured;
    } else if (state.captured !== EMPTY) {
      this.board[move.to] = state.captured;
    }

    if (move.flag === FLAG_CASTLE_K) {
      const baseRank = color === WHITE ? 0 : 7;
      this.board[sq(7, baseRank)] = R * color;
      this.board[sq(5, baseRank)] = EMPTY;
    } else if (move.flag === FLAG_CASTLE_Q) {
      const baseRank = color === WHITE ? 0 : 7;
      this.board[sq(0, baseRank)] = R * color;
      this.board[sq(3, baseRank)] = EMPTY;
    }

    this.castling = state.castling;
    this.epSquare = state.epSquare;
    this.halfMoveClock = state.halfMoveClock;
    if (color === BLACK) this.fullMoveNumber--;
  }

  // --- Game End Detection ---

  isCheckmate() {
    return this.generateLegalMoves().length === 0 && this.isInCheck(this.turn);
  }

  isStalemate() {
    return this.generateLegalMoves().length === 0 && !this.isInCheck(this.turn);
  }

  isDraw() {
    return this.isStalemate() || this.isFiftyMoveRule() || this.isThreefoldRepetition() || this.isInsufficientMaterial();
  }

  isFiftyMoveRule() {
    return this.halfMoveClock >= 100;
  }

  isThreefoldRepetition() {
    const current = this.positionKey();
    let count = 0;
    for (const pos of this.positionHistory) {
      if (pos === current) count++;
      if (count >= 3) return true;
    }
    return false;
  }

  isInsufficientMaterial() {
    const pieces = { w: [], b: [] };
    for (let s = 0; s < 64; s++) {
      const p = this.board[s];
      if (p === EMPTY) continue;
      const side = p > 0 ? 'w' : 'b';
      pieces[side].push({ type: Math.abs(p), sq: s });
    }
    const wc = pieces.w.length, bc = pieces.b.length;
    if (wc === 1 && bc === 1) return true;
    if (wc === 1 && bc === 2) {
      const o = pieces.b.find(p => p.type !== K);
      if (o && (o.type === B || o.type === N)) return true;
    }
    if (bc === 1 && wc === 2) {
      const o = pieces.w.find(p => p.type !== K);
      if (o && (o.type === B || o.type === N)) return true;
    }
    if (wc === 2 && bc === 2) {
      const wb = pieces.w.find(p => p.type === B);
      const bb = pieces.b.find(p => p.type === B);
      if (wb && bb) {
        const wbC = (fileOf(wb.sq) + rankOf(wb.sq)) % 2;
        const bbC = (fileOf(bb.sq) + rankOf(bb.sq)) % 2;
        if (wbC === bbC) return true;
      }
    }
    return false;
  }

  isGameOver() {
    return this.isCheckmate() || this.isDraw();
  }

  getGameResult() {
    if (this.isCheckmate()) {
      return this.turn === WHITE ? 'Black wins by checkmate' : 'White wins by checkmate';
    }
    if (this.isStalemate()) return 'Draw by stalemate';
    if (this.isFiftyMoveRule()) return 'Draw by fifty-move rule';
    if (this.isThreefoldRepetition()) return 'Draw by threefold repetition';
    if (this.isInsufficientMaterial()) return 'Draw by insufficient material';
    return null;
  }

  // --- Algebraic Notation ---

  moveToAlgebraic(move) {
    const piece = this.board[move.from];
    const type = Math.abs(piece);

    if (move.flag === FLAG_CASTLE_K) return 'O-O';
    if (move.flag === FLAG_CASTLE_Q) return 'O-O-O';

    let notation = '';

    if (type !== P) {
      notation += '.PNBRQK'[type];
      const others = this.generateLegalMoves().filter(m =>
        m.to === move.to && m.from !== move.from &&
        Math.abs(this.board[m.from]) === type
      );
      if (others.length > 0) {
        const sameFile = others.some(m => fileOf(m.from) === fileOf(move.from));
        const sameRank = others.some(m => rankOf(m.from) === rankOf(move.from));
        if (!sameFile) {
          notation += 'abcdefgh'[fileOf(move.from)];
        } else if (!sameRank) {
          notation += (rankOf(move.from) + 1);
        } else {
          notation += sqName(move.from);
        }
      }
    }

    const isCapture = this.board[move.to] !== EMPTY || move.flag === FLAG_EP_CAPTURE;
    if (isCapture) {
      if (type === P) notation += 'abcdefgh'[fileOf(move.from)];
      notation += 'x';
    }

    notation += sqName(move.to);

    if (isPromotion(move.flag)) {
      notation += '=' + '.PNBRQK'[promopiece(move.flag)];
    }

    this.makeMove(move);
    if (this.isInCheck(this.turn)) {
      notation += this.generateLegalMoves().length === 0 ? '#' : '+';
    }
    this.undoMove();

    return notation;
  }

  executeMove(move) {
    const algebraic = this.moveToAlgebraic(move);
    this.makeMove(move);
    this.positionHistory.push(this.positionKey());
    this.moveList.push(algebraic);
    return algebraic;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const moves = this.generateLegalMoves();
    let nodes = 0;
    for (const move of moves) {
      this.makeMove(move);
      nodes += this.perft(depth - 1);
      this.undoMove();
    }
    return nodes;
  }
}
