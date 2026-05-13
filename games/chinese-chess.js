// chinese-chess.js — 中国象棋游戏
// Canvas 渲染 + 交互 + GameEngine 注册
(function () {
  // ============================================
  // 棋子编码
  // ============================================
  var PIECES = {
    K: { name: '帅', red: true },
    k: { name: '将', red: false },
    A: { name: '仕', red: true },
    a: { name: '士', red: false },
    B: { name: '相', red: true },
    b: { name: '象', red: false },
    N: { name: '馬', red: true },
    n: { name: '馬', red: false },
    R: { name: '車', red: true },
    r: { name: '車', red: false },
    C: { name: '炮', red: true },
    c: { name: '砲', red: false },
    P: { name: '兵', red: true },
    p: { name: '卒', red: false }
  };

  // ============================================
  // 初始局面 (FEN-like 10x9 数组, row 0 = 黑方底线)
  // ============================================
  var INITIAL_BOARD = [
    ['r','n','b','a','k','a','b','n','r'],
    [null,null,null,null,null,null,null,null,null],
    [null,'c',null,null,null,null,null,'c',null],
    ['p',null,'p',null,'p',null,'p',null,'p'],
    [null,null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null,null],
    ['P',null,'P',null,'P',null,'P',null,'P'],
    [null,'C',null,null,null,null,null,'C',null],
    [null,null,null,null,null,null,null,null,null],
    ['R','N','B','A','K','A','B','N','R']
  ];

  // ============================================
  // 工具函数
  // ============================================
  function isRed(p) { return p && p === p.toUpperCase(); }
  function isBlack(p) { return p && p === p.toLowerCase(); }
  function cloneBoard(board) { return board.map(function(r) { return r.slice(); }); }
  function inBounds(row, col) { return row >= 0 && row < 10 && col >= 0 && col < 9; }

  // ============================================
  // 走法生成
  // ============================================

  // 获取 (row,col) 处棋子的合法走法（不含将军检测）
  function rawMoves(board, row, col) {
    var piece = board[row][col];
    if (!piece) return [];
    var moves = [];
    var red = isRed(piece);

    switch (piece.toUpperCase()) {
      case 'K': addKingMoves(moves, board, row, col, red); break;
      case 'A': addAdvisorMoves(moves, board, row, col, red); break;
      case 'B': addBishopMoves(moves, board, row, col, red); break;
      case 'N': addKnightMoves(moves, board, row, col); break;
      case 'R': addRookMoves(moves, board, row, col); break;
      case 'C': addCannonMoves(moves, board, row, col); break;
      case 'P': addPawnMoves(moves, board, row, col, red); break;
    }
    return moves;
  }

  function addKingMoves(moves, board, row, col, red) {
    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    var rowMin = red ? 7 : 0;
    var rowMax = red ? 9 : 2;
    var colMin = 3, colMax = 5;
    for (var i = 0; i < dirs.length; i++) {
      var nr = row + dirs[i][0], nc = col + dirs[i][1];
      if (nr >= rowMin && nr <= rowMax && nc >= colMin && nc <= colMax) {
        var t = board[nr][nc];
        if (!t || isRed(t) !== red) moves.push({toRow:nr, toCol:nc});
      }
    }
  }

  function addAdvisorMoves(moves, board, row, col, red) {
    var dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    var rowMin = red ? 7 : 0;
    var rowMax = red ? 9 : 2;
    var colMin = 3, colMax = 5;
    for (var i = 0; i < dirs.length; i++) {
      var nr = row + dirs[i][0], nc = col + dirs[i][1];
      if (nr >= rowMin && nr <= rowMax && nc >= colMin && nc <= colMax) {
        var t = board[nr][nc];
        if (!t || isRed(t) !== red) moves.push({toRow:nr, toCol:nc});
      }
    }
  }

  function addBishopMoves(moves, board, row, col, red) {
    var dirs = [[-2,-2],[-2,2],[2,-2],[2,2]];
    var eyes = [[-1,-1],[-1,1],[1,-1],[1,1]];
    var rowMin = red ? 5 : 0;
    var rowMax = red ? 9 : 4;
    for (var i = 0; i < dirs.length; i++) {
      var nr = row + dirs[i][0], nc = col + dirs[i][1];
      var er = row + eyes[i][0], ec = col + eyes[i][1];
      if (nr >= rowMin && nr <= rowMax && nc >= 0 && nc < 9 && !board[er][ec]) {
        var t = board[nr][nc];
        if (!t || isRed(t) !== red) moves.push({toRow:nr, toCol:nc});
      }
    }
  }

  function addKnightMoves(moves, board, row, col) {
    var red = isRed(board[row][col]);
    // [legRow, legCol, targetRow, targetCol]
    var steps = [
      [-1,0,-2,-1],[-1,0,-2,1],[1,0,2,-1],[1,0,2,1],
      [0,-1,-1,-2],[0,-1,1,-2],[0,1,-1,2],[0,1,1,2]
    ];
    for (var i = 0; i < steps.length; i++) {
      var lr = row + steps[i][0], lc = col + steps[i][1];
      var nr = row + steps[i][2], nc = col + steps[i][3];
      if (board[lr] && board[lr][lc]) continue; // 蹩马脚
      if (inBounds(nr, nc)) {
        var t = board[nr][nc];
        if (!t || isRed(t) !== red) moves.push({toRow:nr, toCol:nc});
      }
    }
  }

  function addRookMoves(moves, board, row, col) {
    var red = isRed(board[row][col]);
    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var i = 0; i < dirs.length; i++) {
      var nr = row, nc = col;
      while (true) {
        nr += dirs[i][0]; nc += dirs[i][1];
        if (!inBounds(nr, nc)) break;
        var t = board[nr][nc];
        if (!t) { moves.push({toRow:nr, toCol:nc}); continue; }
        if (isRed(t) !== red) moves.push({toRow:nr, toCol:nc});
        break;
      }
    }
  }

  function addCannonMoves(moves, board, row, col) {
    var red = isRed(board[row][col]);
    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var i = 0; i < dirs.length; i++) {
      var nr = row, nc = col, foundPlatform = false;
      while (true) {
        nr += dirs[i][0]; nc += dirs[i][1];
        if (!inBounds(nr, nc)) break;
        var t = board[nr][nc];
        if (!foundPlatform) {
          if (!t) { moves.push({toRow:nr, toCol:nc}); continue; }
          foundPlatform = true; // 炮架
        } else {
          if (t && isRed(t) !== red) { moves.push({toRow:nr, toCol:nc}); break; }
          if (t) break;
        }
      }
    }
  }

  function addPawnMoves(moves, board, row, col, red) {
    var dir;
    var crossedRiver;
    if (red) {
      dir = -1;
      crossedRiver = row <= 4; // 红兵过河后才可左右
    } else {
      dir = 1;
      crossedRiver = row >= 5; // 黑卒过河后才可左右
    }
    // 向前
    var nr = row + dir, nc = col;
    if (inBounds(nr, nc)) {
      var t = board[nr][nc];
      if (!t || isRed(t) !== red) moves.push({toRow:nr, toCol:nc});
    }
    // 过河后可以左右
    if (crossedRiver) {
      if (inBounds(row, col-1)) {
        t = board[row][col-1];
        if (!t || isRed(t) !== red) moves.push({toRow:row, toCol:col-1});
      }
      if (inBounds(row, col+1)) {
        t = board[row][col+1];
        if (!t || isRed(t) !== red) moves.push({toRow:row, toCol:col+1});
      }
    }
  }

  // ============================================
  // 将军检测
  // ============================================

  // 判断红方或黑方是否在被将
  function isInCheck(board, red) {
    var kingRow, kingCol;
    var king = red ? 'K' : 'k';
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        if (board[r][c] === king) { kingRow = r; kingCol = c; }
      }
    }
    if (kingRow === undefined) return true; // 将被吃掉了
    return isSquareAttacked(board, kingRow, kingCol, red);
  }

  // 某格是否被对方攻击
  function isSquareAttacked(board, row, col, myRed) {
    var opponentRed = !myRed;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (!p || isRed(p) !== opponentRed) continue;
        var moves = rawMoves(board, r, c);
        for (var i = 0; i < moves.length; i++) {
          if (moves[i].toRow === row && moves[i].toCol === col) return true;
        }
      }
    }
    // 将帅对面检测
    return kingsAreFacing(board);
  }

  // 将帅对面
  function kingsAreFacing(board) {
    var rkR, rkC, bkR, bkC;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        if (board[r][c] === 'K') { rkR = r; rkC = c; }
        if (board[r][c] === 'k') { bkR = r; bkC = c; }
      }
    }
    if (rkC !== bkC) return false;
    if (rkR === undefined || bkR === undefined) return false;
    var minR = Math.min(rkR, bkR), maxR = Math.max(rkR, bkR);
    for (var r = minR + 1; r < maxR; r++) {
      if (board[r][rkC] !== null) return false;
    }
    return true;
  }

  // ============================================
  // 合法走法 = rawMoves - 走后自己被将的走法
  // ============================================
  function legalMoves(board, row, col) {
    var piece = board[row][col];
    if (!piece) return [];
    var red = isRed(piece);
    var moves = rawMoves(board, row, col);
    return moves.filter(function (m) {
      var newBoard = cloneBoard(board);
      newBoard[m.toRow][m.toCol] = piece;
      newBoard[row][col] = null;
      return !isInCheck(newBoard, red) && !kingsAreFacing(newBoard);
    });
  }

  // 是否有合法走法
  function hasLegalMoves(board, red) {
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        if (board[r][c] && isRed(board[r][c]) === red) {
          if (legalMoves(board, r, c).length > 0) return true;
        }
      }
    }
    return false;
  }

  // ============================================
  // 局面 FEN 编码（用于重复检测）
  // ============================================
  function boardToFEN(board, redTurn) {
    var parts = [];
    for (var r = 0; r < 10; r++) {
      var empty = 0, rowStr = '';
      for (var c = 0; c < 9; c++) {
        if (board[r][c]) {
          if (empty) { rowStr += empty; empty = 0; }
          rowStr += board[r][c];
        } else { empty++; }
      }
      if (empty) rowStr += empty;
      parts.push(rowStr);
    }
    return parts.join('/') + ' ' + (redTurn ? 'w' : 'b');
  }

  // ============================================
  // 游戏类
  // ============================================
  function ChineseChessGame() {
    this._state = null;
    this._container = null;
    this._canvas = null;
  }

  ChineseChessGame.prototype.init = function (container, config) {
    this._container = container;
    this._config = config || {};
  };

  ChineseChessGame.prototype.start = function () {
    var self = this;
    this._state = {
      board: cloneBoard(INITIAL_BOARD),
      redTurn: true,
      selectedRow: -1,
      selectedCol: -1,
      legalMoves: [],
      moveHistory: [],
      captured: { red: [], black: [] },
      gameOver: false,
      winner: null,
      positionHistory: {},
      flipped: false // 是否翻转棋盘
    };
    this._render();
  };

  ChineseChessGame.prototype._render = function () {
    var state = this._state;
    var container = this._container;
    if (!container) return;

    var self = this;
    var turnLabel = state.redTurn ? '红方走棋' : '黑方走棋';
    var turnColor = state.redTurn ? '#e74c3c' : '#333';

    var html = '<div class="game-hud">' +
      '<span class="game-hud-item" style="color:' + turnColor + ';font-weight:700;">' + turnLabel + '</span>' +
      '<span class="game-hud-item">步数: ' + state.moveHistory.length + '</span>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="window._ccUndo()">悔棋</button>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="window._ccNewGame()">新局</button>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="window._ccFlip()">翻转棋盘</button>' +
      '</div>' +
      '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">' +
        '<div class="cc-captured-area" id="ccBlackCaptured">' +
          '<div style="font-size:12px;color:#666;text-align:center;">黑方已吃子</div>' +
          '<div id="ccBlackCapturedPieces" class="cc-captured-pieces"></div>' +
        '</div>' +
        '<canvas id="ccCanvas" class="cc-canvas"></canvas>' +
        '<div class="cc-captured-area" id="ccRedCaptured">' +
          '<div style="font-size:12px;color:#e74c3c;text-align:center;">红方已吃子</div>' +
          '<div id="ccRedCapturedPieces" class="cc-captured-pieces"></div>' +
        '</div>' +
      '</div>';

    if (state.gameOver) {
      html += '<div class="game-overlay" onclick="event.stopPropagation()">' +
        '<div class="game-complete">' +
          '<div style="font-size:48px;margin-bottom:8px;">' + (state.winner ? '🏆' : '🤝') + '</div>' +
          '<h3 style="margin:0 0 12px 0;">' + (state.winner ? state.winner + '获胜！' : '和棋！') + '</h3>' +
          '<div class="game-complete-stats">' +
            '<div class="game-stat"><span class="game-stat-val">' + state.moveHistory.length + '</span><span class="game-stat-label">总步数</span></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">' +
            '<button class="btn btn-primary" onclick="window._ccNewGame()">再来一局</button>' +
            '<button class="btn btn-secondary" onclick="var el=document.querySelector(\'.game-overlay\');if(el)el.remove();">关闭</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML = html;

    // Expose game controls
    window._ccUndo = function () { self._undo(); };
    window._ccNewGame = function () { self.destroy(); self.start(); };
    window._ccFlip = function () { self._flip(); };

    // Render canvas
    this._canvas = document.getElementById('ccCanvas');
    if (this._canvas) {
      this._canvas.addEventListener('click', function (e) { self._handleClick(e); });
      this._drawCanvas();
    }
    this._updateCapturedUI();

    if (state.gameOver) { this._submitScore(); }
  };

  // ============================================
  // Canvas 绘制
  // ============================================
  ChineseChessGame.prototype._drawCanvas = function () {
    var canvas = this._canvas;
    if (!canvas) return;
    var state = this._state;
    var self = this;

    // 根据容器宽度设置 canvas 大小
    var containerWidth = this._container.clientWidth;
    var maxW = Math.min(containerWidth - 20, 520);
    var size = Math.max(maxW, 280);
    var padding = 28;
    var cellSize = (size - padding * 2) / 8;
    var boardW = cellSize * 8;
    var boardH = cellSize * 9;
    var canvasW = boardW + padding * 2;
    var canvasH = boardH + padding * 2;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    canvas.style.maxWidth = '100%';

    var ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 棋盘外框
    ctx.strokeStyle = '#5c3a1e';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padding - 4, padding - 4, boardW + 8, boardH + 8);

    // 棋盘线
    ctx.strokeStyle = '#3a2210';
    ctx.lineWidth = 1;
    for (var r = 0; r <= 9; r++) {
      var y = padding + r * cellSize;
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(padding + boardW, y); ctx.stroke();
    }
    for (var c = 0; c <= 8; c++) {
      var x = padding + c * cellSize;
      if (c === 0 || c === 8) {
        ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, padding + boardH); ctx.stroke();
      } else {
        // 上半部分
        ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, padding + 4 * cellSize); ctx.stroke();
        // 下半部分
        ctx.beginPath(); ctx.moveTo(x, padding + 5 * cellSize); ctx.lineTo(x, padding + boardH); ctx.stroke();
      }
    }

    // 九宫格斜线
    ctx.strokeStyle = '#3a2210';
    ctx.lineWidth = 0.8;
    var drawPalaceDiagonals = function (topRow) {
      var x1 = padding + 3 * cellSize, x2 = padding + 5 * cellSize;
      var y1 = padding + topRow * cellSize, y2 = padding + (topRow + 2) * cellSize;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y1); ctx.lineTo(x1, y2); ctx.stroke();
    };
    drawPalaceDiagonals(0); // 黑方
    drawPalaceDiagonals(7); // 红方

    // 楚河汉界
    ctx.fillStyle = '#3a2210';
    ctx.font = 'bold ' + Math.max(cellSize * 0.55, 12) + 'px "KaiTi","楷体",serif';
    ctx.textAlign = 'center';
    var riverY = padding + 4.5 * cellSize;
    ctx.fillText('楚  河', padding + boardW * 0.25, riverY);
    ctx.fillText('汉  界', padding + boardW * 0.75, riverY);

    // 绘制棋子
    var pieceRadius = cellSize * 0.42;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = state.board[r][c];
        if (!p) continue;

        var displayR = state.flipped ? 9 - r : r;
        var displayC = state.flipped ? 8 - c : c;

        var x = padding + displayC * cellSize;
        var y = padding + displayR * cellSize;
        var info = PIECES[p];

        // 是否选中
        var isSelected = (r === state.selectedRow && c === state.selectedCol);

        // 外圈
        ctx.beginPath();
        ctx.arc(x, y, pieceRadius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#ffe066' : '#fdf5e6';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#e6a800' : '#8b6914';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // 内圈
        ctx.beginPath();
        ctx.arc(x, y, pieceRadius * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected ? '#d4940a' : '#8b6914';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 文字
        ctx.fillStyle = info.red ? '#c0392b' : '#1a1a2e';
        ctx.font = 'bold ' + Math.max(parseInt(pieceRadius * 1.3), 13) + 'px "KaiTi","楷体","SimSun","宋体",serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(info.name, x, y + 1);
      }
    }

    // 走法提示
    ctx.fillStyle = 'rgba(0,150,0,0.3)';
    for (var i = 0; i < state.legalMoves.length; i++) {
      var m = state.legalMoves[i];
      var dr = state.flipped ? 9 - m.toRow : m.toRow;
      var dc = state.flipped ? 8 - m.toCol : m.toCol;
      var mx = padding + dc * cellSize;
      var my = padding + dr * cellSize;
      var target = state.board[m.toRow][m.toCol];
      if (target) {
        // 吃子目标：虚线圈
        ctx.beginPath();
        ctx.arc(mx, my, pieceRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,0,0,0.5)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        // 空位：圆点
        ctx.beginPath();
        ctx.arc(mx, my, cellSize * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // ============================================
  // 交互处理
  // ============================================
  ChineseChessGame.prototype._handleClick = function (e) {
    var state = this._state;
    if (!state || state.gameOver) return;

    var canvas = this._canvas;
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var cx = (e.clientX - rect.left) * scaleX;
    var cy = (e.clientY - rect.top) * scaleY;

    var padding = 28;
    var cellSize = (canvas.width - padding * 2) / 8;

    var displayCol = Math.round((cx - padding) / cellSize);
    var displayRow = Math.round((cy - padding) / cellSize);

    if (displayRow < 0 || displayRow > 9 || displayCol < 0 || displayCol > 8) return;

    var row = state.flipped ? 9 - displayRow : displayRow;
    var col = state.flipped ? 8 - displayCol : displayCol;

    var piece = state.board[row][col];

    // 已有选中棋子时，尝试走子或切换选中
    if (state.selectedRow >= 0) {
      // 优先检查：点击了合法目标格 → 走子（包括吃子）
      for (var i = 0; i < state.legalMoves.length; i++) {
        var m = state.legalMoves[i];
        if (m.toRow === row && m.toCol === col) {
          this._makeMove(state.selectedRow, state.selectedCol, row, col);
          return;
        }
      }
      // 点击了自己的另一个棋子 → 切换选中
      if (piece && isRed(piece) === state.redTurn) {
        state.selectedRow = row;
        state.selectedCol = col;
        state.legalMoves = legalMoves(state.board, row, col);
        this._drawCanvas();
        return;
      }
      // 点击了其他地方 → 取消选中
      state.selectedRow = -1;
      state.selectedCol = -1;
      state.legalMoves = [];
      this._drawCanvas();
      return;
    }

    // 选择棋子
    if (piece && isRed(piece) === state.redTurn) {
      state.selectedRow = row;
      state.selectedCol = col;
      state.legalMoves = legalMoves(state.board, row, col);
      this._drawCanvas();
    }
  };

  // 执行走子
  ChineseChessGame.prototype._makeMove = function (fr, fc, tr, tc) {
    var state = this._state;
    var piece = state.board[fr][fc];
    var captured = state.board[tr][tc];

    // 保存走法（用于悔棋）
    state.moveHistory.push({
      fromRow: fr, fromCol: fc,
      toRow: tr, toCol: tc,
      piece: piece,
      captured: captured
    });

    // 执行
    state.board[tr][tc] = piece;
    state.board[fr][fc] = null;

    // 记录吃子
    if (captured) {
      if (isRed(captured)) state.captured.red.push(captured);
      else state.captured.black.push(captured);
    }

    // 切换回合
    state.redTurn = !state.redTurn;
    state.selectedRow = -1;
    state.selectedCol = -1;
    state.legalMoves = [];

    // 重复局面检测
    var fen = boardToFEN(state.board, state.redTurn);
    state.positionHistory[fen] = (state.positionHistory[fen] || 0) + 1;

    // 检查游戏结束
    var opponentRed = state.redTurn;
    if (!hasLegalMoves(state.board, opponentRed)) {
      state.gameOver = true;
      if (isInCheck(state.board, opponentRed)) {
        state.winner = opponentRed ? '黑方' : '红方'; // 被将死的输
      } else {
        state.winner = opponentRed ? '黑方' : '红方'; // 困毙输
      }
    }
    // 三次重复 → 和棋
    if (state.positionHistory[fen] >= 3) {
      state.gameOver = true;
      state.winner = null;
    }

    this._render();
  };

  ChineseChessGame.prototype._undo = function () {
    var state = this._state;
    if (!state || state.gameOver) return;
    if (state.moveHistory.length === 0) return;

    var last = state.moveHistory.pop();
    state.board[last.fromRow][last.fromCol] = last.piece;
    state.board[last.toRow][last.toCol] = last.captured;

    // 恢复吃子记录
    if (last.captured) {
      if (isRed(last.captured)) state.captured.red.pop();
      else state.captured.black.pop();
    }

    state.redTurn = !state.redTurn;
    state.selectedRow = -1;
    state.selectedCol = -1;
    state.legalMoves = [];
    this._render();
  };

  ChineseChessGame.prototype._flip = function () {
    this._state.flipped = !this._state.flipped;
    this._drawCanvas();
  };

  ChineseChessGame.prototype._updateCapturedUI = function () {
    var state = this._state;
    var redEl = document.getElementById('ccRedCapturedPieces');
    var blackEl = document.getElementById('ccBlackCapturedPieces');
    if (redEl) {
      redEl.innerHTML = state.captured.black.length === 0 ? '<span style="color:#ccc;">无</span>' :
        state.captured.black.map(function (p) { return '<span style="color:#c0392b;font-size:18px;font-weight:bold;">' + PIECES[p].name + '</span>'; }).join(' ');
    }
    if (blackEl) {
      blackEl.innerHTML = state.captured.red.length === 0 ? '<span style="color:#ccc;">无</span>' :
        state.captured.red.map(function (p) { return '<span style="color:#1a1a2e;font-size:18px;font-weight:bold;">' + PIECES[p].name + '</span>'; }).join(' ');
    }
  };

  ChineseChessGame.prototype._submitScore = function () {
    var state = this._state;
    if (!this._config.onScoreSubmit) return;

    var isRedWin = state.winner === '红方';
    var isBlackWin = state.winner === '黑方';
    var isDraw = !state.winner;

    // pass-and-play 模式下，两人都是同一登录用户
    var user = this._config.currentUser;
    var userName = (user && user.username) ? user.username : 'unknown';
    var moves = state.moveHistory.length;
    var score = isDraw ? 50 : (100 + Math.max(0, 50 - moves));

    this._config.onScoreSubmit({
      score: score,
      user_name: userName,
      extra_data: {
        moves: moves,
        winner: state.winner || 'draw',
        is_draw: isDraw
      }
    });

    var xpAmount = isDraw ? 10 : 20;
    window.GameEngine.awardXP(xpAmount, isDraw ? 'game_chess_draw' : 'game_chess_win');
  };

  ChineseChessGame.prototype.getScore = function () {
    var state = this._state;
    if (!state) return 0;
    var moves = state.moveHistory.length;
    if (!state.winner) return 50; // and
    return 100 + Math.max(0, 50 - moves);
  };

  ChineseChessGame.prototype.destroy = function () {
    this._state = null;
    this._container = null;
    this._canvas = null;
    window._ccUndo = null;
    window._ccNewGame = null;
    window._ccFlip = null;
  };

  // 注册到 GameEngine
  window.GameEngine.registerGame('chineseChess', new ChineseChessGame());
})();
