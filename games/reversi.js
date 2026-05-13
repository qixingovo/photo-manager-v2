// reversi.js — 黑白棋（奥赛罗）
// Canvas 渲染 + 交互 + GameEngine 注册
(function () {
  var SIZE = 8;
  var EMPTY = 0, BLACK = 1, WHITE = 2;

  // 8 个方向
  var DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  function enemy(player) { return player === BLACK ? WHITE : BLACK; }

  // 克隆棋盘
  function cloneBoard(b) { return b.map(function(r) { return r.slice(); }); }

  // 初始棋盘：中心 4 子交叉放置
  function initBoard() {
    var b = [];
    for (var r = 0; r < SIZE; r++) {
      b[r] = [];
      for (var c = 0; c < SIZE; c++) b[r][c] = EMPTY;
    }
    b[3][3] = WHITE; b[3][4] = BLACK;
    b[4][3] = BLACK; b[4][4] = WHITE;
    return b;
  }

  // 检查某个格子是否能落子（返回被夹的棋子列表）
  function getFlips(board, row, col, player) {
    if (board[row][col] !== EMPTY) return [];
    var opp = enemy(player);
    var allFlips = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var r = row + dr, c = col + dc;
      var flips = [];
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === opp) {
        flips.push({r: r, c: c});
        r += dr; c += dc;
      }
      if (flips.length > 0 && r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
        allFlips = allFlips.concat(flips);
      }
    }
    return allFlips;
  }

  // 获取所有合法落子点
  function getLegalMoves(board, player) {
    var moves = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var flips = getFlips(board, r, c, player);
        if (flips.length > 0) moves.push({row: r, col: c, flips: flips});
      }
    }
    return moves;
  }

  // 落子并翻转
  function makeMove(board, row, col, player) {
    var flips = getFlips(board, row, col, player);
    board[row][col] = player;
    for (var i = 0; i < flips.length; i++) {
      board[flips[i].r][flips[i].c] = player;
    }
    return flips.length;
  }

  // 计算分数
  function countPieces(board) {
    var b = 0, w = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === BLACK) b++;
        else if (board[r][c] === WHITE) w++;
      }
    }
    return { black: b, white: w };
  }

  // ============================================
  // 游戏类
  // ============================================
  function ReversiGame() {
    this._state = null;
    this._container = null;
    this._canvas = null;
  }

  ReversiGame.prototype.init = function (container, config) {
    this._container = container;
    this._config = config || {};
  };

  ReversiGame.prototype.start = function () {
    var self = this;
    this._state = {
      board: initBoard(),
      currentPlayer: BLACK,
      legalMoves: [],
      moveHistory: [],
      gameOver: false,
      skipped: false,
      passCount: 0
    };
    this._state.legalMoves = getLegalMoves(this._state.board, BLACK);
    this._render();
  };

  ReversiGame.prototype._render = function () {
    var state = this._state;
    var container = this._container;
    if (!container) return;

    var self = this;
    var counts = countPieces(state.board);
    var turnLabel = state.currentPlayer === BLACK ? '⚫ 黑棋走' : '⚪ 白棋走';
    var turnColor = state.currentPlayer === BLACK ? '#333' : '#888';
    var lastMove = state.moveHistory.length > 0 ? state.moveHistory[state.moveHistory.length - 1] : null;

    var html = '<div class="game-hud">' +
      '<span class="game-hud-item" style="color:' + turnColor + ';font-weight:700;">' + turnLabel + '</span>' +
      '<span class="game-hud-item">⚫ ' + counts.black + ' : ' + counts.white + ' ⚪</span>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="window._rvUndo()">悔棋</button>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="window._rvNewGame()">新局</button>' +
      '</div>' +
      '<canvas id="rvCanvas" class="cc-canvas"></canvas>';

    if (state.gameOver) {
      var resultText;
      if (counts.black > counts.white) resultText = '⚫ 黑棋获胜！';
      else if (counts.white > counts.black) resultText = '⚪ 白棋获胜！';
      else resultText = '🤝 平局！';
      html += '<div class="game-overlay" onclick="event.stopPropagation()">' +
        '<div class="game-complete">' +
          '<div style="font-size:48px;margin-bottom:8px;">' + (counts.black !== counts.white ? '🏆' : '🤝') + '</div>' +
          '<h3 style="margin:0 0 12px 0;">' + resultText + '</h3>' +
          '<div class="game-complete-stats">' +
            '<div class="game-stat"><span class="game-stat-val" style="color:#333;">' + counts.black + '</span><span class="game-stat-label">黑棋</span></div>' +
            '<div class="game-stat"><span class="game-stat-val" style="color:#aaa;">' + counts.white + '</span><span class="game-stat-label">白棋</span></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">' +
            '<button class="btn btn-primary" onclick="window._rvNewGame()">再来一局</button>' +
            '<button class="btn btn-secondary" onclick="var el=document.querySelector(\'.game-overlay\');if(el)el.remove();">关闭</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML = html;

    window._rvUndo = function () { self._undo(); };
    window._rvNewGame = function () { self.destroy(); self.start(); };

    this._canvas = document.getElementById('rvCanvas');
    if (this._canvas) {
      this._canvas.addEventListener('click', function (e) { self._handleClick(e); });
      this._drawCanvas();
    }

    if (state.gameOver) { this._submitScore(counts); }
  };

  // ============================================
  // Canvas 绘制
  // ============================================
  ReversiGame.prototype._drawCanvas = function () {
    var canvas = this._canvas;
    if (!canvas) return;
    var state = this._state;

    var containerWidth = this._container.clientWidth;
    var maxW = Math.min(containerWidth - 20, 480);
    var size = Math.max(maxW, 280);
    var cellSize = size / SIZE;
    var cw = cellSize * SIZE;
    canvas.width = cw;
    canvas.height = cw;
    canvas.style.width = cw + 'px';
    canvas.style.height = cw + 'px';
    canvas.style.maxWidth = '100%';

    var ctx = canvas.getContext('2d');

    // 棋盘背景
    ctx.fillStyle = '#4a7c59';
    ctx.fillRect(0, 0, cw, cw);

    // 网格线
    ctx.strokeStyle = '#2d5a3a';
    ctx.lineWidth = 1;
    for (var i = 0; i <= SIZE; i++) {
      var pos = i * cellSize;
      ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, cw); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(cw, pos); ctx.stroke();
    }

    // 坐标点（星位）
    var dots = [[2,2],[2,6],[6,2],[6,6]];
    ctx.fillStyle = '#2d5a3a';
    for (var d = 0; d < dots.length; d++) {
      ctx.beginPath();
      ctx.arc(dots[d][0] * cellSize, dots[d][1] * cellSize, cellSize * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    // 上一手标记
    var lastMove = null;
    if (state.moveHistory.length > 0) {
      lastMove = state.moveHistory[state.moveHistory.length - 1];
    }

    // 合法走法提示（半透明棋子）
    for (var i = 0; i < state.legalMoves.length; i++) {
      var m = state.legalMoves[i];
      var cx = m.col * cellSize + cellSize / 2;
      var cy = m.row * cellSize + cellSize / 2;
      var r = cellSize * 0.38;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = state.currentPlayer === BLACK ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)';
      ctx.fill();
    }

    // 绘制棋子
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (state.board[r][c] === EMPTY) continue;
        var x = c * cellSize + cellSize / 2;
        var y = r * cellSize + cellSize / 2;
        var radius = cellSize * 0.42;

        // 阴影
        ctx.beginPath();
        ctx.arc(x + 1, y + 1, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();

        // 棋子主体
        var grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
        if (state.board[r][c] === BLACK) {
          grad.addColorStop(0, '#555');
          grad.addColorStop(1, '#111');
        } else {
          grad.addColorStop(0, '#fff');
          grad.addColorStop(1, '#ccc');
        }
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = state.board[r][c] === BLACK ? '#000' : '#aaa';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 上一手标记（小黄点）
        if (lastMove && lastMove.row === r && lastMove.col === c) {
          ctx.beginPath();
          ctx.arc(x, y, radius * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = '#f5d142';
          ctx.fill();
        }
      }
    }
  };

  // ============================================
  // 交互
  // ============================================
  ReversiGame.prototype._handleClick = function (e) {
    var state = this._state;
    if (!state || state.gameOver) return;

    var canvas = this._canvas;
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var cx = (e.clientX - rect.left) * scaleX;
    var cy = (e.clientY - rect.top) * scaleY;

    var cellSize = canvas.width / SIZE;
    var col = Math.floor(cx / cellSize);
    var row = Math.floor(cy / cellSize);
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;

    // 检查是否为合法落子点
    for (var i = 0; i < state.legalMoves.length; i++) {
      var m = state.legalMoves[i];
      if (m.row === row && m.col === col) {
        this._doMove(row, col);
        return;
      }
    }
  };

  ReversiGame.prototype._doMove = function (row, col) {
    var state = this._state;
    var player = state.currentPlayer;

    state.moveHistory.push({
      row: row, col: col, player: player,
      boardBefore: cloneBoard(state.board)
    });

    makeMove(state.board, row, col, player);
    state.passCount = 0;

    // 切换回合
    state.currentPlayer = enemy(player);
    state.legalMoves = getLegalMoves(state.board, state.currentPlayer);

    // 对方无合法走法 → 跳过
    if (state.legalMoves.length === 0) {
      state.passCount++;
      state.currentPlayer = enemy(state.currentPlayer);
      state.legalMoves = getLegalMoves(state.board, state.currentPlayer);

      if (state.legalMoves.length === 0) {
        // 双方都无法走 → 游戏结束
        state.passCount++;
        state.gameOver = true;
      }
    }

    // 棋盘满 → 游戏结束
    var counts = countPieces(state.board);
    if (counts.black + counts.white === SIZE * SIZE) {
      state.gameOver = true;
    }

    this._render();
  };

  ReversiGame.prototype._undo = function () {
    var state = this._state;
    if (!state || state.gameOver) return;
    if (state.moveHistory.length === 0) return;

    var last = state.moveHistory.pop();
    state.board = last.boardBefore;
    state.currentPlayer = last.player;
    state.gameOver = false;
    state.passCount = 0;
    state.legalMoves = getLegalMoves(state.board, state.currentPlayer);
    this._render();
  };

  ReversiGame.prototype._submitScore = function (counts) {
    if (!this._config.onScoreSubmit) return;
    var user = this._config.currentUser;
    var userName = (user && user.username) ? user.username : 'unknown';
    var isDraw = counts.black === counts.white;
    var score = isDraw ? 50 : (100 + Math.max(0, 64 - (counts.black + counts.white)));

    this._config.onScoreSubmit({
      score: score,
      user_name: userName,
      extra_data: {
        black_count: counts.black,
        white_count: counts.white,
        is_draw: isDraw
      }
    });

    var xpAmount = isDraw ? 10 : 20;
    window.GameEngine.awardXP(xpAmount, isDraw ? 'game_reversi_draw' : 'game_reversi_win');
  };

  ReversiGame.prototype.getScore = function () {
    var state = this._state;
    if (!state) return 0;
    var counts = countPieces(state.board);
    return Math.max(counts.black, counts.white);
  };

  ReversiGame.prototype.destroy = function () {
    this._state = null;
    this._container = null;
    this._canvas = null;
    window._rvUndo = null;
    window._rvNewGame = null;
  };

  window.GameEngine.registerGame('reversi', new ReversiGame());
})();
