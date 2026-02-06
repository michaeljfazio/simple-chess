// AI — minimax + alpha-beta pruning + quiescence search
import { EMPTY, P, N, B, R, Q, K, WHITE, BLACK, fileOf, rankOf, isPromotion } from './game.js';

// Material values
const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 20000];

// Piece-square tables (from white's perspective, index 0 = a8)
// Accessed as PST[piece][square] for white; for black, mirror vertically

const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const PST_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];

const PST_QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

const PST_KING_MG = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];

const PST_KING_EG = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

const PST = [null, PST_PAWN, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MG];

function mirror(sq) {
  // Flip vertically: row 0 <-> row 7
  return (7 - (sq >> 3)) * 8 + (sq & 7);
}

export class AI {
  constructor(game, depth = 3) {
    this.game = game;
    this.depth = depth;
    this.nodes = 0;
  }

  setDifficulty(level) {
    switch (level) {
      case 'easy': this.depth = 2; break;
      case 'medium': this.depth = 3; break;
      case 'hard': this.depth = 4; break;
    }
  }

  evaluate() {
    const game = this.game;
    let score = 0;
    let totalMaterial = 0;

    // First pass: count total material for endgame detection
    for (let s = 0; s < 64; s++) {
      const p = game.board[s];
      if (p === EMPTY) continue;
      const type = Math.abs(p);
      if (type !== K) totalMaterial += PIECE_VALUE[type];
    }

    const isEndgame = totalMaterial < 2600; // roughly when queens are off

    for (let s = 0; s < 64; s++) {
      const p = game.board[s];
      if (p === EMPTY) continue;
      const type = Math.abs(p);
      const color = p > 0 ? 1 : -1;
      let val = PIECE_VALUE[type];

      // Piece-square table
      if (type === K) {
        const pst = isEndgame ? PST_KING_EG : PST_KING_MG;
        val += pst[color === 1 ? mirror(s) : s];
      } else {
        val += PST[type][color === 1 ? mirror(s) : s];
      }

      score += val * color;
    }

    return score * (game.turn === WHITE ? 1 : -1);
  }

  getBestMove(callback) {
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      this.nodes = 0;
      const moves = this.game.generateLegalMoves();
      if (moves.length === 0) { callback(null); return; }

      this.orderMoves(moves);
      let bestScore = -Infinity;
      let bestMove = moves[0];

      for (const move of moves) {
        this.game.makeMove(move);
        const score = -this.alphaBeta(-Infinity, Infinity, this.depth - 1);
        this.game.undoMove();

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }

      callback(bestMove);
    }, 100);
  }

  alphaBeta(alpha, beta, depth) {
    this.nodes++;

    if (depth <= 0) {
      return this.quiescence(alpha, beta);
    }

    const moves = this.game.generateLegalMoves();
    if (moves.length === 0) {
      if (this.game.isInCheck(this.game.turn)) {
        return -100000 + (this.depth - depth); // checkmate (prefer faster)
      }
      return 0; // stalemate
    }

    this.orderMoves(moves);

    for (const move of moves) {
      this.game.makeMove(move);
      const score = -this.alphaBeta(-beta, -alpha, depth - 1);
      this.game.undoMove();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  quiescence(alpha, beta) {
    this.nodes++;
    const standPat = this.evaluate();
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const moves = this.game.generateLegalMoves();
    const captures = moves.filter(m =>
      m.captured !== EMPTY || this.game.board[m.to] !== EMPTY ||
      m.flag === 2 || isPromotion(m.flag)
    );

    // For quiescence, generate captures by making and unmaking to set .captured
    const qMoves = [];
    for (const move of moves) {
      this.game.makeMove(move);
      const cap = this.game.history[this.game.history.length - 1].captured;
      this.game.undoMove();
      if (cap !== EMPTY || isPromotion(move.flag)) {
        qMoves.push(move);
      }
    }

    this.orderMoves(qMoves);

    for (const move of qMoves) {
      this.game.makeMove(move);
      const score = -this.quiescence(-beta, -alpha);
      this.game.undoMove();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  orderMoves(moves) {
    const game = this.game;
    for (const move of moves) {
      move._score = 0;
      // Captures: MVV-LVA
      const victim = game.board[move.to];
      if (victim !== EMPTY) {
        move._score = PIECE_VALUE[Math.abs(victim)] * 10 - PIECE_VALUE[Math.abs(game.board[move.from])];
      }
      // Promotions
      if (isPromotion(move.flag)) {
        move._score += 800;
      }
    }
    moves.sort((a, b) => b._score - a._score);
  }
}
