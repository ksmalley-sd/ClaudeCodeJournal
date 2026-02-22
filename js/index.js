/* ============================================================
   INDEX.JS — blog listing grid, tag filtering
   Depends on data.js being loaded first.
   ============================================================ */

(function () {
  'use strict';

  var grid         = document.getElementById('posts-grid');
  var filterStrip  = document.getElementById('filter-strip');
  var streakEl     = document.getElementById('streak-count');

  var _allPosts    = [];
  var activeFilters = new Set(); // empty = show all

  /* ============================================================
     INIT
  ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    showLoadingState();
    PostData.fetchAll()
      .then(function (posts) {
        _allPosts = posts;

        // Update streak counter
        if (streakEl && posts.length > 0) {
          var maxDay = Math.max.apply(null, posts.map(function (p) { return p.day || 0; }));
          streakEl.textContent = maxDay;
        }

        // Build filters then render
        return PostData.getAllTags().then(function (tags) {
          buildFilters(tags, posts);
          renderGrid(_allPosts);
        });
      })
      .catch(function (err) {
        showErrorState(err);
      });
  });

  /* ============================================================
     RENDERING
  ============================================================ */
  function renderGrid(posts) {
    if (!posts || posts.length === 0) {
      showEmptyState();
      return;
    }
    grid.innerHTML = posts.map(buildCardHTML).join('');
  }

  function buildCardHTML(post) {
    var esc    = PostUtils.escapeHTML;
    var diff   = post.difficulty || 'medium';
    var dayStr = 'DAY ' + PostUtils.padDay(post.day || 0);

    var artHTML;
    if (post.screenshot && post.screenshot.trim()) {
      artHTML = [
        '<img',
        '  class="card__art"',
        '  src="' + esc(post.screenshot) + '"',
        '  alt="Screenshot of ' + esc(post.title) + '"',
        '  loading="lazy"',
        '  onerror="this.parentNode.replaceChild(buildNoScreenshot(),this)"',
        '>'
      ].join(' ');
    } else {
      artHTML = noScreenshotHTML();
    }

    return [
      '<a class="card card--' + diff + '" href="post.html?id=' + esc(post.id) + '"',
      '   aria-label="Day ' + (post.day || 0) + ': ' + esc(post.title) + '">',
      '  <div class="card__art-wrap">',
      '    ' + artHTML,
      '    <span class="card__badge">' + dayStr + '</span>',
      '    <span class="card__difficulty">' + esc(PostSchema.DIFFICULTY_LABELS[diff] || diff) + '</span>',
      '  </div>',
      '  <div class="card__body">',
      '    <h2 class="card__title">' + esc(post.title) + '</h2>',
      '    <p class="card__meta">',
      '      <span>' + PostUtils.formatDate(post.date) + '</span>',
      '      <span class="card__meta-sep">·</span>',
      '      <span>' + esc(post.timeSpent || '—') + '</span>',
      '    </p>',
      '    <div class="card__tags">' + PostUtils.tagsHTML(post.tags) + '</div>',
      '  </div>',
      '</a>'
    ].join('\n');
  }

  /* No-screenshot placeholder — also used as onerror handler */
  function noScreenshotHTML() {
    return [
      '<div class="card__art card__art--placeholder">',
      '  <svg width="32" height="32" fill="none" viewBox="0 0 24 24">',
      '    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.5"/>',
      '    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>',
      '    <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      '  </svg>',
      '  NO SCREENSHOT',
      '</div>'
    ].join('');
  }

  /* Exposed to inline onerror attribute */
  window.buildNoScreenshot = function () {
    var div = document.createElement('div');
    div.innerHTML = noScreenshotHTML();
    return div.firstElementChild;
  };

  /* ============================================================
     FILTER UI
  ============================================================ */
  function buildFilters(tags, posts) {
    if (!filterStrip || tags.length === 0) return;

    // Count posts per tag
    var counts = {};
    posts.forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        counts[t] = (counts[t] || 0) + 1;
      });
    });

    var html = [
      '<span class="filter-strip__label">Filter</span>',
      '<div class="filter-strip__sep"></div>',
      '<button class="filter-btn active" data-tag="all">',
      '  All <span class="count">' + posts.length + '</span>',
      '</button>'
    ];

    tags.forEach(function (tag) {
      html.push(
        '<button class="filter-btn" data-tag="' + PostUtils.escapeHTML(tag) + '">',
        '  ' + PostUtils.escapeHTML(tag) + ' <span class="count">' + (counts[tag] || 0) + '</span>',
        '</button>'
      );
    });

    filterStrip.innerHTML = html.join('\n');

    // Event listeners
    filterStrip.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;

      var tag = btn.dataset.tag;

      if (tag === 'all') {
        activeFilters.clear();
      } else {
        if (activeFilters.has(tag)) {
          activeFilters.delete(tag);
        } else {
          activeFilters.add(tag);
        }
      }

      updateFilterButtons();
      applyFilters();
    });
  }

  function updateFilterButtons() {
    var buttons = filterStrip.querySelectorAll('.filter-btn');
    buttons.forEach(function (btn) {
      var tag = btn.dataset.tag;
      if (tag === 'all') {
        btn.classList.toggle('active', activeFilters.size === 0);
      } else {
        btn.classList.toggle('active', activeFilters.has(tag));
      }
    });
  }

  function applyFilters() {
    var visible = activeFilters.size === 0
      ? _allPosts
      : _allPosts.filter(function (p) {
          return (p.tags || []).some(function (t) { return activeFilters.has(t); });
        });

    if (visible.length === 0) {
      grid.innerHTML = [
        '<div class="state-container">',
        '  <p>No posts match these filters.</p>',
        '  <button class="btn btn--ghost btn--sm" id="clear-filters">Clear filters</button>',
        '</div>'
      ].join('');
      document.getElementById('clear-filters').addEventListener('click', function () {
        activeFilters.clear();
        updateFilterButtons();
        renderGrid(_allPosts);
      });
    } else {
      renderGrid(visible);
    }
  }

  /* ============================================================
     STATES
  ============================================================ */
  function showLoadingState() {
    grid.innerHTML = [
      '<div class="state-container" aria-live="polite">',
      '  <div class="spinner"></div>',
      '  <p>Loading builds...</p>',
      '</div>'
    ].join('');
  }

  function showEmptyState() {
    grid.innerHTML = [
      '<div class="state-container">',
      '  <p>No posts yet. Time to start building!</p>',
      '  <a href="admin.html" class="btn btn--accent">Add First Post</a>',
      '</div>'
    ].join('');
  }

  function showErrorState(err) {
    var msg = err && err.message ? err.message : 'Unknown error';
    grid.innerHTML = [
      '<div class="state-container">',
      '  <p>Could not load posts.</p>',
      '  <small>This site must be served over HTTP (not opened as a local file).<br>',
      '  Try VS Code Live Server, or push to GitHub Pages.</small>',
      '  <small style="margin-top:8px;opacity:0.6">' + PostUtils.escapeHTML(msg) + '</small>',
      '</div>'
    ].join('');
  }

})();
