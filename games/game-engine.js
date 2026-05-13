// game-engine.js — Shared mini-game engine
// Provides: game registry, score persistence, leaderboard, XP bridge
(function () {
  var GE = {
    games: {},
    xpBridge: null,
    supabaseClient: null,
    _scriptBase: 'games/'
  };

  GE.registerGame = function (name, factory) {
    GE.games[name] = factory;
  };

  GE.ensureGame = function (name) {
    if (GE.games[name]) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = GE._scriptBase + name + '.js?v=1';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Failed to load game: ' + name)); };
      document.head.appendChild(script);
    });
  };

  GE.submitScore = async function (gameName, scoreData) {
    var supabase = GE.supabaseClient;
    if (!supabase) { console.warn('[GameEngine] No supabase client'); return null; }
    var user = scoreData.user_name || 'unknown';
    var row = {
      game_name: gameName,
      user_name: user,
      score: scoreData.score || 0,
      extra_data: scoreData.extra_data || {}
    };
    var result = await supabase.from('game_scores').insert(row);
    if (result.error) { console.warn('[GameEngine] Score insert failed:', result.error); }
    return result;
  };

  GE.getLeaderboard = async function (gameName, limit) {
    var supabase = GE.supabaseClient;
    if (!supabase) return [];
    limit = limit || 10;
    var result = await supabase.from('game_scores')
      .select('*')
      .eq('game_name', gameName)
      .order('score', { ascending: false })
      .order('played_at', { ascending: true })
      .limit(limit);
    if (result.error) { console.warn('[GameEngine] Leaderboard query failed:', result.error); return []; }
    return result.data || [];
  };

  GE.formatTime = function (seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  GE.awardXP = function (amount, reason) {
    if (GE.xpBridge) {
      GE.xpBridge(amount, reason || 'game');
    }
  };

  window.GameEngine = GE;
})();
