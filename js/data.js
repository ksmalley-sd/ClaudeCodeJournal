/* ============================================================
   DATA.JS — singleton post data layer + schema constants
   Loaded first on every page. No ES modules (intentional).
   ============================================================ */

(function () {
  'use strict';

  /* ---- Schema constants ---- */
  window.PostSchema = {
    DIFFICULTIES: ['easy', 'medium', 'hard', 'legendary'],
    DIFFICULTY_LABELS: {
      easy:      'Easy',
      medium:    'Medium',
      hard:      'Hard',
      legendary: 'Legendary'
    },
    TAGS: [
      'Web App', 'CLI Tool', 'Automation', 'Game',
      'API', 'Utility', 'Data', 'AI/ML'
    ]
  };

  /* ---- Data singleton ---- */
  var _cache   = null;
  var _promise = null;

  window.PostData = {
    /**
     * Fetch all posts. Returns a Promise<Array>.
     * Subsequent calls return the cached result without re-fetching.
     */
    fetchAll: function () {
      if (_cache)   return Promise.resolve(_cache);
      if (_promise) return _promise;

      _promise = fetch('./posts.json')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' — could not load posts.json');
          return r.json();
        })
        .then(function (data) {
          _cache = (data.posts || []).slice().sort(function (a, b) {
            return b.day - a.day; // newest first by default
          });
          return _cache;
        })
        .catch(function (err) {
          _promise = null; // allow retry on next call
          throw err;
        });

      return _promise;
    },

    /** Return a single post by id. Resolves to null if not found. */
    getById: function (id) {
      return this.fetchAll().then(function (posts) {
        return posts.find(function (p) { return String(p.id) === String(id); }) || null;
      });
    },

    /** Return sorted array of all unique tags across all posts. */
    getAllTags: function () {
      return this.fetchAll().then(function (posts) {
        var tags = new Set();
        posts.forEach(function (p) {
          (p.tags || []).forEach(function (t) { tags.add(t); });
        });
        return Array.from(tags).sort();
      });
    },

    /** Return posts sorted by day ascending (for prev/next nav). */
    getAllSortedAsc: function () {
      return this.fetchAll().then(function (posts) {
        return posts.slice().sort(function (a, b) { return a.day - b.day; });
      });
    },

    /** Invalidate cache (used by admin after saving). */
    clearCache: function () {
      _cache   = null;
      _promise = null;
    }
  };

  /* ---- Shared utilities (available on window.PostUtils) ---- */
  window.PostUtils = {
    /** Escape HTML entities to prevent XSS. */
    escapeHTML: function (str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
    },

    /**
     * Format ISO date string to human-readable.
     * "2026-02-21" → "Feb 21, 2026"
     */
    formatDate: function (iso) {
      if (!iso) return '';
      try {
        var d = new Date(iso + 'T12:00:00Z'); // noon UTC avoids timezone shifts
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC'
        });
      } catch (e) {
        return iso;
      }
    },

    /** Zero-pad day number: 3 → "003" */
    padDay: function (n) {
      return String(n).padStart(3, '0');
    },

    /** Build a difficulty badge HTML string. */
    difficultyBadgeHTML: function (difficulty) {
      var label = (PostSchema.DIFFICULTY_LABELS[difficulty] || difficulty);
      return '<span class="card__difficulty">' + PostUtils.escapeHTML(label) + '</span>';
    },

    /** Build tag pill HTML strings. */
    tagsHTML: function (tags) {
      if (!tags || !tags.length) return '';
      return tags.map(function (t) {
        return '<span class="tag">' + PostUtils.escapeHTML(t) + '</span>';
      }).join('');
    }
  };

})();
