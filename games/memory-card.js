// memory-card.js — Memory Card Match game
// Uses photos as card faces. Flip pairs to match.
(function () {
  var DIFFICULTY = {
    easy:   { pairs: 3,  cols: 3, label: '简单' },
    normal: { pairs: 8,  cols: 4, label: '普通' },
    hard:   { pairs: 12, cols: 6, label: '困难' }
  };

  function MemoryGame() {
    this._state = null;
    this._timerId = null;
  }

  MemoryGame.prototype.init = function (container, config) {
    this.container = container;
    this.config = config || {};
    this._state = null;
    this._timerId = null;
  };

  MemoryGame.prototype.start = function () {
    var self = this;
    var cfg = this.config;
    var diff = DIFFICULTY[cfg.difficulty] || DIFFICULTY.normal;
    var photoUrls = cfg.photoUrls || [];

    // Build card pairs
    var pairs = [];
    for (var i = 0; i < diff.pairs; i++) {
      var url = photoUrls[i] || null;
      pairs.push({ id: i, url: url });
      pairs.push({ id: i, url: url });
    }

    // Shuffle
    for (var j = pairs.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = pairs[j]; pairs[j] = pairs[k]; pairs[k] = tmp;
    }

    this._state = {
      cards: pairs,
      flipped: [],
      matched: new Set(),
      moves: 0,
      startTime: Date.now(),
      difficulty: diff,
      locked: false
    };

    this._render();
    this._startTimer();
  };

  MemoryGame.prototype._render = function () {
    var state = this._state;
    var diff = state.difficulty;
    var container = this.container;
    var self = this;

    var html = '<div class="game-hud">' +
      '<span class="game-hud-item">难度: ' + diff.label + '</span>' +
      '<span class="game-hud-item" id="memMoves">步数: 0</span>' +
      '<span class="game-hud-item" id="memTimer">时间: 0:00</span>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="window._memoryRestart()">重新开始</button>' +
      '</div>' +
      '<div class="memory-grid" style="grid-template-columns:repeat(' + diff.cols + ', 1fr);">';

    for (var i = 0; i < state.cards.length; i++) {
      var card = state.cards[i];
      var isFlipped = state.flipped.indexOf(i) !== -1 || state.matched.has(i);
      var isMatched = state.matched.has(i);
      var faceContent;
      if (card.url) {
        faceContent = '<img src="' + card.url + '" class="memory-card-img" onerror="this.parentElement.classList.add(\'no-photo\');this.style.display=\'none\';" loading="lazy">';
      } else {
        faceContent = '<span class="memory-card-emoji">🖼️</span>';
      }
      html += '<div class="memory-card' + (isFlipped ? ' flipped' : '') + (isMatched ? ' matched' : '') + '" data-index="' + i + '" onclick="window._memoryFlip(' + i + ')">' +
        '<div class="memory-card-inner">' +
          '<div class="memory-card-front">' + faceContent + '</div>' +
          '<div class="memory-card-back">❓</div>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';

    // Difficulty selector at bottom
    html += '<div class="memory-difficulty">' +
      '<span style="font-size:13px;color:var(--text-muted);">难度：</span>' +
      Object.keys(DIFFICULTY).map(function (k) {
        var isActive = diff === DIFFICULTY[k];
        return '<button class="btn ' + (isActive ? 'btn-primary' : 'btn-secondary') + '" style="font-size:12px;padding:4px 12px;" onclick="window._memorySetDifficulty(\'' + k + '\')">' + DIFFICULTY[k].label + '</button>';
      }).join('') +
      '</div>';

    container.innerHTML = html;

    // Expose game control functions
    window._memoryFlip = function (index) { self._flip(index); };
    window._memoryRestart = function () { self.destroy(); self.start(); };
    window._memorySetDifficulty = function (d) { self.config.difficulty = d; self.destroy(); self.start(); };
  };

  MemoryGame.prototype._flip = function (index) {
    var state = this._state;
    if (!state || state.locked) return;
    if (state.flipped.indexOf(index) !== -1 || state.matched.has(index)) return;
    if (state.flipped.length >= 2) return;

    state.flipped.push(index);
    this._updateCardDOM(index, true);

    if (state.flipped.length === 2) {
      state.moves++;
      this._updateMovesDOM();
      var a = state.flipped[0];
      var b = state.flipped[1];
      var self = this;

      if (state.cards[a].id === state.cards[b].id) {
        // Match
        state.matched.add(a);
        state.matched.add(b);
        this._updateCardDOM(a, true);
        this._updateCardDOM(b, true);
        state.flipped = [];
        this._checkComplete();
      } else {
        // Mismatch
        state.locked = true;
        setTimeout(function () {
          state.flipped = [];
          self._updateCardDOM(a, false);
          self._updateCardDOM(b, false);
          state.locked = false;
        }, 600);
      }
    }
  };

  MemoryGame.prototype._updateCardDOM = function (index, flipped) {
    var card = this.container.querySelector('.memory-card[data-index="' + index + '"]');
    if (!card) return;
    if (flipped) {
      card.classList.add('flipped');
    } else {
      card.classList.remove('flipped');
    }
    if (this._state.matched.has(index)) {
      card.classList.add('matched');
    }
  };

  MemoryGame.prototype._updateMovesDOM = function () {
    var el = this.container.querySelector('#memMoves');
    if (el) el.textContent = '步数: ' + this._state.moves;
  };

  MemoryGame.prototype._startTimer = function () {
    var self = this;
    this._timerId = setInterval(function () {
      if (!self._state) return;
      var elapsed = Math.floor((Date.now() - self._state.startTime) / 1000);
      var el = self.container.querySelector('#memTimer');
      if (el) el.textContent = '时间: ' + window.GameEngine.formatTime(elapsed);
    }, 500);
  };

  MemoryGame.prototype._checkComplete = function () {
    var state = this._state;
    if (state.matched.size === state.cards.length) {
      clearInterval(this._timerId);
      var elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      var moves = state.moves;
      var diff = state.difficulty;

      // Calculate score: base on difficulty, bonus for low moves
      var baseScore = { easy: 100, normal: 200, hard: 350 }[this.config.difficulty] || 200;
      var optimalMoves = diff.pairs + 2;
      var moveBonus = Math.max(0, Math.floor((optimalMoves * 3 - moves) / optimalMoves * 50));
      var timePenalty = Math.max(0, Math.floor(elapsed / 10));
      var score = Math.max(0, baseScore + moveBonus - timePenalty);

      var self = this;
      setTimeout(function () {
        self._showComplete(elapsed, moves, score);
      }, 500);
    }
  };

  MemoryGame.prototype._showComplete = function (elapsed, moves, score) {
    var container = this.container;
    var self = this;

    container.innerHTML +=
      '<div class="game-overlay" onclick="event.stopPropagation()">' +
        '<div class="game-complete">' +
          '<div style="font-size:48px;margin-bottom:8px;">🎉</div>' +
          '<h3 style="margin:0 0 12px 0;">恭喜完成！</h3>' +
          '<div class="game-complete-stats">' +
            '<div class="game-stat"><span class="game-stat-val">' + moves + '</span><span class="game-stat-label">步数</span></div>' +
            '<div class="game-stat"><span class="game-stat-val">' + window.GameEngine.formatTime(elapsed) + '</span><span class="game-stat-label">用时</span></div>' +
            '<div class="game-stat"><span class="game-stat-val">' + score + '</span><span class="game-stat-label">得分</span></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">' +
            '<button class="btn btn-primary" onclick="window._memoryRestart()">再来一局</button>' +
            '<button class="btn btn-secondary" onclick="var el=document.querySelector(\'.game-overlay\');if(el)el.remove();">关闭</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Submit score
    if (this.config.onScoreSubmit) {
      var user = this.config.currentUser;
      var userName = (user && user.username) ? user.username : (typeof user === 'string' ? user : 'unknown');
      this.config.onScoreSubmit({
        score: score,
        user_name: userName,
        extra_data: { moves: moves, time_seconds: elapsed, difficulty: this.config.difficulty }
      });
    }

    // Award XP
    var xpAmount = { easy: 5, normal: 10, hard: 15 }[this.config.difficulty] || 10;
    window.GameEngine.awardXP(xpAmount, 'game_memory');
  };

  MemoryGame.prototype.getScore = function () {
    var state = this._state;
    if (!state) return 0;
    var elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    return Math.max(0, 200 - state.moves * 2 - Math.floor(elapsed / 5));
  };

  MemoryGame.prototype.destroy = function () {
    clearInterval(this._timerId);
    this._state = null;
    this._timerId = null;
    window._memoryFlip = null;
    window._memoryRestart = null;
    window._memorySetDifficulty = null;
  };

  window.GameEngine.registerGame('memoryCard', new MemoryGame());
})();
