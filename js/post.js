/* ============================================================
   POST.JS — single post detail page
   Depends on data.js being loaded first.
   ============================================================ */

(function () {
  'use strict';

  var esc       = PostUtils.escapeHTML;
  var formatDate = PostUtils.formatDate;
  var padDay    = PostUtils.padDay;

  /* ============================================================
     INIT
  ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    var params = new URLSearchParams(window.location.search);
    var postId = params.get('id');

    if (!postId) {
      window.location.href = 'index.html';
      return;
    }

    // Fetch the target post and all posts (for prev/next) in parallel
    Promise.all([
      PostData.getById(postId),
      PostData.getAllSortedAsc()
    ])
    .then(function (results) {
      var post = results[0];
      var allPosts = results[1];

      if (!post) {
        showNotFound(postId);
        return;
      }

      renderPost(post);
      renderPrevNext(post, allPosts);
      updatePageMeta(post);
    })
    .catch(function (err) {
      showError(err);
    });
  });

  /* ============================================================
     RENDER FULL POST
  ============================================================ */
  function renderPost(post) {
    var detail = document.getElementById('post-detail');
    if (!detail) return;

    var diff = post.difficulty || 'medium';
    var diffLabel = PostSchema.DIFFICULTY_LABELS[diff] || diff;

    /* ---- Screenshot or placeholder ---- */
    var screenshotHTML;
    if (post.screenshot && post.screenshot.trim()) {
      screenshotHTML = [
        '<img class="post-detail__screenshot"',
        '     src="' + esc(post.screenshot) + '"',
        '     alt="Screenshot of ' + esc(post.title) + '"',
        '     onerror="this.className=\'post-detail__screenshot--placeholder\';',
        '              this.outerHTML=\'<div class=&quot;post-detail__screenshot--placeholder&quot;>NO SCREENSHOT</div>\'"',
        '>'
      ].join(' ');
    } else {
      screenshotHTML = '<div class="post-detail__screenshot--placeholder">NO SCREENSHOT</div>';
    }

    /* ---- Try it button ---- */
    var tryItHTML = '';
    if (post.link && post.link.trim()) {
      tryItHTML = [
        '<a href="' + esc(post.link) + '" target="_blank" rel="noopener noreferrer"',
        '   class="btn btn--accent" style="margin-top:var(--space-md)">',
        '  Try It →',
        '</a>'
      ].join('\n');
    }

    detail.className = 'post-detail card--' + diff;
    detail.innerHTML = [
      /* Back link */
      '<div class="post-detail__back">',
      '  <a class="back-link" href="index.html">← All Builds</a>',
      '</div>',

      /* Header */
      '<header class="post-detail__header">',
      '  <div class="post-detail__eyebrow">',
      '    <span class="post-detail__day">DAY ' + padDay(post.day || 0) + '</span>',
      '    <span class="post-detail__diff-badge">' + esc(diffLabel) + '</span>',
      '  </div>',
      '  <h1 class="post-detail__title">' + esc(post.title) + '</h1>',
      '  <div class="post-detail__meta">',
      '    <span>' + formatDate(post.date) + '</span>',
      '    <span>·</span>',
      '    <span>' + esc(post.timeSpent || '—') + '</span>',
      '  </div>',
      '  <div class="post-detail__tags">' + PostUtils.tagsHTML(post.tags) + '</div>',
      '</header>',

      /* Screenshot */
      '<div class="post-detail__screenshot-wrap">',
      '  ' + screenshotHTML,
      '</div>',

      /* Body — two columns */
      '<div class="post-detail__body">',

      /* Main content column */
      '  <div class="post-detail__content">',

      '    <div class="content-section">',
      '      <p class="section-label">// What I Built</p>',
      '      <p>' + esc(post.whatIBuilt || '') + '</p>',
      '    </div>',

      '    <div class="content-section">',
      '      <p class="section-label">// How It Went</p>',
      '      <p>' + esc(post.howItWent || '') + '</p>',
      '    </div>',

      '    <div class="content-section">',
      '      <p class="section-label">// What I Learned</p>',
      '      <p>' + esc(post.whatILearned || '') + '</p>',
      '    </div>',

      '    <div class="content-section">',
      '      <p class="section-label">// Biggest Challenge</p>',
      '      <p>' + esc(post.biggestChallenge || '') + '</p>',
      '    </div>',

      tryItHTML,

      '  </div>',

      /* Sidebar */
      '  <aside class="post-detail__sidebar">',

      '    <div class="stat-item">',
      '      <span class="stat-item__label">Day</span>',
      '      <span class="stat-item__value" style="font-family:var(--font-mono);font-size:1.4rem;font-weight:800;color:var(--accent)">',
      '        #' + padDay(post.day || 0),
      '      </span>',
      '    </div>',

      '    <div class="stat-item">',
      '      <span class="stat-item__label">Date</span>',
      '      <span class="stat-item__value">' + esc(formatDate(post.date)) + '</span>',
      '    </div>',

      '    <div class="stat-item">',
      '      <span class="stat-item__label">Time Spent</span>',
      '      <span class="stat-item__value">' + esc(post.timeSpent || '—') + '</span>',
      '    </div>',

      '    <div class="stat-item stat-item--difficulty card--' + diff + '">',
      '      <span class="stat-item__label">Difficulty</span>',
      '      <span class="stat-item__value">' + esc(diffLabel) + '</span>',
      '    </div>',

      '  </aside>',

      '</div>', /* end body */

      /* Prev/Next — populated by renderPrevNext() */
      '<div id="post-nav" class="post-nav"></div>'

    ].join('\n');
  }

  /* ============================================================
     PREV / NEXT NAVIGATION
  ============================================================ */
  function renderPrevNext(currentPost, allPosts) {
    var navEl = document.getElementById('post-nav');
    if (!navEl) return;

    var idx = allPosts.findIndex(function (p) { return p.id === currentPost.id; });
    var prev = idx > 0               ? allPosts[idx - 1] : null;
    var next = idx < allPosts.length - 1 ? allPosts[idx + 1] : null;

    if (!prev && !next) {
      navEl.style.display = 'none';
      return;
    }

    var html = '';

    if (prev) {
      html += [
        '<a class="post-nav__item" href="post.html?id=' + esc(prev.id) + '">',
        '  <span class="post-nav__label">← Previous</span>',
        '  <span class="post-nav__title">Day ' + padDay(prev.day) + ': ' + esc(prev.title) + '</span>',
        '</a>'
      ].join('\n');
    } else {
      html += '<div></div>'; // empty cell to keep grid alignment
    }

    if (next) {
      html += [
        '<a class="post-nav__item post-nav__item--next" href="post.html?id=' + esc(next.id) + '">',
        '  <span class="post-nav__label">Next →</span>',
        '  <span class="post-nav__title">Day ' + padDay(next.day) + ': ' + esc(next.title) + '</span>',
        '</a>'
      ].join('\n');
    } else {
      html += '<div></div>';
    }

    navEl.innerHTML = html;
  }

  /* ============================================================
     PAGE META (title + OG tags for sharing)
  ============================================================ */
  function updatePageMeta(post) {
    document.title = 'Day ' + post.day + ': ' + post.title + ' — Claude Code Journal';

    var ogTitle = document.querySelector('meta[property="og:title"]');
    var ogDesc  = document.querySelector('meta[property="og:description"]');
    var ogImg   = document.querySelector('meta[property="og:image"]');

    if (ogTitle) ogTitle.setAttribute('content', 'Day ' + post.day + ': ' + post.title);
    if (ogDesc)  ogDesc.setAttribute('content', post.whatIBuilt || '');
    if (ogImg && post.screenshot)  ogImg.setAttribute('content', post.screenshot);
  }

  /* ============================================================
     ERROR STATES
  ============================================================ */
  function showNotFound(id) {
    var main = document.querySelector('.site-main');
    main.innerHTML = [
      '<div class="post-detail" style="text-align:center;padding:var(--space-2xl)">',
      '  <h1 style="font-size:4rem;color:var(--text-muted);margin-bottom:var(--space-md)">404</h1>',
      '  <p>Post <code style="color:var(--accent)">' + PostUtils.escapeHTML(id) + '</code> not found.</p>',
      '  <a href="index.html" class="btn btn--ghost" style="margin-top:var(--space-lg)">← Back to All Builds</a>',
      '</div>'
    ].join('');
  }

  function showError(err) {
    var main = document.querySelector('.site-main');
    main.innerHTML = [
      '<div class="post-detail" style="text-align:center;padding:var(--space-2xl)">',
      '  <p>Something went wrong loading this post.</p>',
      '  <small style="color:var(--text-muted)">' + PostUtils.escapeHTML(err && err.message || '') + '</small>',
      '  <a href="index.html" class="btn btn--ghost" style="margin-top:var(--space-lg)">← Back to All Builds</a>',
      '</div>'
    ].join('');
  }

})();
