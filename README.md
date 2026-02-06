# Simple Chess

A complete chess game built with vanilla HTML, CSS, and JavaScript — no frameworks, no build tools. Opens directly in a browser.

**[Play it online](https://michaeljfazio.github.io/simple-chess/)**

## Features

- **Two-player mode** — play against a friend on the same device
- **vs Computer mode** — three difficulty levels (Easy, Medium, Hard)
- **Full chess rules** — castling, en passant, pawn promotion, check/checkmate/stalemate
- **Draw detection** — fifty-move rule, threefold repetition, insufficient material
- **Drag-and-drop** and **click-to-move** interaction
- **Animated pieces** with CSS transitions
- **Move highlights** — selected square, legal moves, last move, check indicator
- **Side panel** — move history in algebraic notation, captured pieces display
- **Board flip** — view from either side
- **Responsive layout** — works on desktop and mobile

## Getting Started

ES modules require a local HTTP server. Any of these work:

```bash
# Python
python3 -m http.server

# Node
npx serve

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Project Structure

```
├── index.html          Shell page
├── css/styles.css      Styling, layout, animations
└── js/
    ├── pieces.js       Inline SVG piece definitions
    ├── game.js         Chess engine (board, move generation, rules)
    ├── ai.js           Computer player (minimax + alpha-beta pruning)
    ├── ui.js           SVG rendering, drag-and-drop, panels
    └── app.js          Main controller, mode selection, game flow
```

## Chess Engine

- `Int8Array[64]` board representation (index 0 = a8, 63 = h1)
- Pseudo-legal move generation with legality filtering
- Validated against perft results: depth 1–4 all correct (20 → 400 → 8,902 → 197,281)

## AI

- Minimax search with alpha-beta pruning
- Quiescence search to avoid horizon effect
- Piece-square tables for positional evaluation
- Move ordering (MVV-LVA for captures, promotions first)
- Difficulty levels: Easy (depth 2), Medium (depth 3), Hard (depth 4)

## License

MIT
