/* ============================================================
   ADMIN.JS — auth, form logic, JSON generate/download
   Depends on data.js being loaded first.
   ============================================================ */

(function () {
  'use strict';

  /* ---- Config ---- */
  var ADMIN_PASSWORD = 'claude-builds-2026'; // change this to whatever you like

  /* ---- State ---- */
  var _loadedPosts = []; // current posts.json data, fetched after login
  var _editingId   = null; // null = new post, string = editing existing

  /* ============================================================
     AUTH
  ============================================================ */
  function init() {
    if (sessionStorage.getItem('admin_auth') === 'ok') {
      loadAdminUI();
    } else {
      showLoginGate();
    }
  }

  function showLoginGate() {
    document.getElementById('admin-gate').style.display = 'flex';
    document.getElementById('admin-ui').style.display  = 'none';

    var form   = document.getElementById('login-form');
    var pwdIn  = document.getElementById('login-pwd');
    var errEl  = document.getElementById('login-error');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (pwdIn.value === ADMIN_PASSWORD) {
        sessionStorage.setItem('admin_auth', 'ok');
        document.getElementById('admin-gate').style.display = 'none';
        loadAdminUI();
      } else {
        errEl.textContent = 'Incorrect password.';
        pwdIn.value = '';
        pwdIn.focus();
      }
    });
  }

  /* ============================================================
     LOAD ADMIN UI (after successful auth)
  ============================================================ */
  function loadAdminUI() {
    document.getElementById('admin-ui').style.display = 'block';

    // Fetch existing posts so we can auto-increment day and enable editing
    PostData.fetchAll()
      .then(function (posts) {
        _loadedPosts = posts.slice().sort(function (a, b) { return a.day - b.day; });
        updateMeta();
        buildEditList();
        setModeNew(); // default to "New Post" mode
      })
      .catch(function () {
        // posts.json may not exist yet on first run — that's fine
        _loadedPosts = [];
        updateMeta();
        setModeNew();
      });

    // Tab switching
    document.getElementById('tab-new').addEventListener('click', setModeNew);
    document.getElementById('tab-edit').addEventListener('click', setModeEdit);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function () {
      sessionStorage.removeItem('admin_auth');
      window.location.reload();
    });

    // Form submit
    document.getElementById('post-form').addEventListener('submit', function (e) {
      e.preventDefault();
      handleGenerate();
    });

    // Screenshot preview on path input
    document.getElementById('f-screenshot').addEventListener('input', function () {
      updateScreenshotPreview(this.value.trim());
    });
  }

  function updateMeta() {
    var metaEl = document.getElementById('admin-meta');
    if (metaEl) {
      metaEl.textContent = _loadedPosts.length + ' post' + (_loadedPosts.length !== 1 ? 's' : '') + ' loaded';
    }
  }

  /* ============================================================
     MODE: NEW POST
  ============================================================ */
  function setModeNew() {
    _editingId = null;
    setActiveTab('tab-new');
    document.getElementById('edit-list-section').style.display = 'none';
    document.getElementById('form-section').style.display = 'block';
    document.getElementById('form-title').textContent = 'New Post';

    resetForm();
    prefillDefaults();
    hidePreview();
    hideErrors();
  }

  function prefillDefaults() {
    // Auto-increment day
    var nextDay = _loadedPosts.length > 0
      ? Math.max.apply(null, _loadedPosts.map(function (p) { return p.day || 0; })) + 1
      : 1;

    document.getElementById('f-day').value  = nextDay;
    document.getElementById('f-id').value   = 'day-' + padDay(nextDay);
    document.getElementById('f-date').value = todayISO();

    // Auto-suggest screenshot filename
    document.getElementById('f-screenshot').value = 'screenshots/day-' + padDay(nextDay) + '.png';

    // Default difficulty = medium
    var medRadio = document.querySelector('.diff-option[data-diff="medium"] input');
    if (medRadio) medRadio.checked = true;
  }

  /* Auto-update ID when day changes */
  document.addEventListener('DOMContentLoaded', function () {
    var dayIn = document.getElementById('f-day');
    if (dayIn) {
      dayIn.addEventListener('input', function () {
        var n = parseInt(this.value, 10);
        if (!isNaN(n) && n > 0) {
          document.getElementById('f-id').value = 'day-' + padDay(n);
          if (!_editingId) { // only auto-suggest on new post
            document.getElementById('f-screenshot').value = 'screenshots/day-' + padDay(n) + '.png';
          }
        }
      });
    }
    init();
  });

  /* ============================================================
     MODE: EDIT EXISTING
  ============================================================ */
  function setModeEdit() {
    setActiveTab('tab-edit');
    document.getElementById('form-section').style.display = 'none';

    var section = document.getElementById('edit-list-section');
    section.style.display = 'block';

    buildEditList();
  }

  function buildEditList() {
    var container = document.getElementById('edit-list');
    if (!container) return;

    if (_loadedPosts.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:var(--space-xl)">No posts yet. Create your first one!</p>';
      return;
    }

    var sorted = _loadedPosts.slice().sort(function (a, b) { return b.day - a.day; });
    container.innerHTML = sorted.map(function (post) {
      var esc = PostUtils.escapeHTML;
      var diff = post.difficulty || 'medium';
      var diffLabel = PostSchema.DIFFICULTY_LABELS[diff] || diff;
      return [
        '<div class="edit-list__item" data-id="' + esc(post.id) + '" role="button" tabindex="0"',
        '     aria-label="Edit Day ' + post.day + ': ' + esc(post.title) + '">',
        '  <span class="edit-list__day">DAY ' + padDay(post.day) + '</span>',
        '  <span class="edit-list__title">' + esc(post.title) + '</span>',
        '  <span class="edit-list__diff edit-list__diff--' + diff + '">' + esc(diffLabel) + '</span>',
        '</div>'
      ].join('\n');
    }).join('\n');

    container.addEventListener('click', function (e) {
      var item = e.target.closest('.edit-list__item');
      if (!item) return;
      loadPostIntoForm(item.dataset.id);
    });

    container.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var item = e.target.closest('.edit-list__item');
        if (item) loadPostIntoForm(item.dataset.id);
      }
    });
  }

  function loadPostIntoForm(id) {
    var post = _loadedPosts.find(function (p) { return p.id === id; });
    if (!post) return;

    _editingId = id;
    document.getElementById('edit-list-section').style.display = 'none';
    document.getElementById('form-section').style.display = 'block';
    document.getElementById('form-title').textContent = 'Editing: Day ' + padDay(post.day);

    resetForm();
    hidePreview();
    hideErrors();

    // Populate fields
    document.getElementById('f-id').value         = post.id || '';
    document.getElementById('f-day').value         = post.day || '';
    document.getElementById('f-date').value        = post.date || '';
    document.getElementById('f-title').value       = post.title || '';
    document.getElementById('f-screenshot').value  = post.screenshot || '';
    document.getElementById('f-time').value        = post.timeSpent || '';
    document.getElementById('f-link').value        = post.link || '';
    document.getElementById('f-built').value       = post.whatIBuilt || '';
    document.getElementById('f-went').value        = post.howItWent || '';
    document.getElementById('f-learned').value     = post.whatILearned || '';
    document.getElementById('f-challenge').value   = post.biggestChallenge || '';

    // Difficulty
    var diffRadio = document.querySelector('.diff-option[data-diff="' + (post.difficulty || 'medium') + '"] input');
    if (diffRadio) diffRadio.checked = true;

    // Tags — preset checkboxes
    document.querySelectorAll('.tag-checkbox input').forEach(function (cb) {
      cb.checked = (post.tags || []).indexOf(cb.value) !== -1;
    });

    // Custom tags
    var presetTags = PostSchema.TAGS;
    var customTags = (post.tags || []).filter(function (t) { return presetTags.indexOf(t) === -1; });
    document.getElementById('f-custom-tags').value = customTags.join(', ');

    updateScreenshotPreview(post.screenshot || '');
  }

  /* ============================================================
     FORM UTILITIES
  ============================================================ */
  function resetForm() {
    document.getElementById('post-form').reset();
    document.getElementById('screenshot-preview').style.display = 'none';
  }

  function setActiveTab(id) {
    ['tab-new', 'tab-edit'].forEach(function (tabId) {
      document.getElementById(tabId).classList.toggle('active', tabId === id);
    });
  }

  function updateScreenshotPreview(path) {
    var preview = document.getElementById('screenshot-preview');
    var img     = document.getElementById('screenshot-img');
    if (!path) { preview.style.display = 'none'; return; }
    img.src = path;
    img.onerror = function () { preview.style.display = 'none'; };
    img.onload  = function () { preview.style.display = 'block'; };
  }

  /* ============================================================
     FORM COLLECTION & VALIDATION
  ============================================================ */
  function collectFormData() {
    var esc = PostUtils.escapeHTML; // not needed for data object, just for safety reminder

    // Preset tags
    var tags = [];
    document.querySelectorAll('.tag-checkbox input:checked').forEach(function (cb) {
      tags.push(cb.value);
    });

    // Custom tags
    var customRaw = document.getElementById('f-custom-tags').value.trim();
    if (customRaw) {
      customRaw.split(',').forEach(function (t) {
        var trimmed = t.trim();
        if (trimmed && tags.indexOf(trimmed) === -1) tags.push(trimmed);
      });
    }

    // Difficulty
    var diffRadio = document.querySelector('.diff-option input:checked');
    var difficulty = diffRadio ? diffRadio.value : 'medium';

    var link = document.getElementById('f-link').value.trim();

    return {
      id:               document.getElementById('f-id').value.trim(),
      day:              parseInt(document.getElementById('f-day').value, 10),
      date:             document.getElementById('f-date').value.trim(),
      title:            document.getElementById('f-title').value.trim(),
      screenshot:       document.getElementById('f-screenshot').value.trim(),
      timeSpent:        document.getElementById('f-time').value.trim(),
      difficulty:       difficulty,
      tags:             tags,
      whatIBuilt:       document.getElementById('f-built').value.trim(),
      howItWent:        document.getElementById('f-went').value.trim(),
      whatILearned:     document.getElementById('f-learned').value.trim(),
      biggestChallenge: document.getElementById('f-challenge').value.trim(),
      link:             link
    };
  }

  function validatePost(post) {
    var errors = [];
    if (!post.id)               errors.push('Post ID is missing.');
    if (!post.day || post.day < 1) errors.push('Day number must be a positive integer.');
    if (!post.date)             errors.push('Date is required.');
    if (!post.title)            errors.push('Title is required.');
    if (!post.difficulty)       errors.push('Difficulty is required.');
    if (!post.whatIBuilt)       errors.push('"What I Built" is required.');
    if (!post.howItWent)        errors.push('"How It Went" is required.');
    if (!post.whatILearned)     errors.push('"What I Learned" is required.');
    if (!post.biggestChallenge) errors.push('"Biggest Challenge" is required.');
    if (post.link && !/^https?:\/\//i.test(post.link)) {
      errors.push('Link must start with http:// or https://');
    }
    if (PostSchema.DIFFICULTIES.indexOf(post.difficulty) === -1) {
      errors.push('Invalid difficulty value.');
    }
    return errors;
  }

  /* ============================================================
     GENERATE + DOWNLOAD
  ============================================================ */
  function handleGenerate() {
    hideErrors();
    hidePreview();

    var post   = collectFormData();
    var errors = validatePost(post);

    if (errors.length) {
      showErrors(errors);
      return;
    }

    // Upsert into posts array
    var allPosts = _loadedPosts.slice();
    var idx = allPosts.findIndex(function (p) { return p.id === post.id; });
    if (idx !== -1) {
      allPosts[idx] = post; // edit
    } else {
      allPosts.push(post);  // new
    }

    // Sort ascending by day
    allPosts.sort(function (a, b) { return a.day - b.day; });

    // Check for posts without screenshots
    var noScreenshot = allPosts.filter(function (p) { return !p.screenshot; });
    if (noScreenshot.length > 0) {
      showWarning(noScreenshot.length + ' post(s) have no screenshot. Add images to /screenshots/ before committing.');
    } else {
      hideWarning();
    }

    var output = {
      meta: {
        version:     1,
        lastUpdated: todayISO(),
        totalPosts:  allPosts.length
      },
      posts: allPosts
    };

    var jsonStr = JSON.stringify(output, null, 2);
    showPreview(jsonStr);
    showToast('JSON ready — download and replace posts.json!');
  }

  function showPreview(jsonStr) {
    var section  = document.getElementById('json-preview');
    var textarea = document.getElementById('json-output');
    var dlBtn    = document.getElementById('download-btn');

    textarea.value = jsonStr;
    section.classList.add('visible');

    // Wire download button
    dlBtn.onclick = function () {
      var blob = new Blob([jsonStr], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'posts.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hidePreview() {
    document.getElementById('json-preview').classList.remove('visible');
  }

  /* ============================================================
     ERROR / WARNING DISPLAY
  ============================================================ */
  function showErrors(errors) {
    var el = document.getElementById('form-errors');
    var ul = el.querySelector('ul');
    ul.innerHTML = errors.map(function (e) {
      return '<li>' + PostUtils.escapeHTML(e) + '</li>';
    }).join('');
    el.classList.add('visible');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideErrors() {
    document.getElementById('form-errors').classList.remove('visible');
  }

  function showWarning(msg) {
    var el = document.getElementById('admin-warning');
    el.textContent = '⚠ ' + msg;
    el.classList.add('visible');
  }

  function hideWarning() {
    document.getElementById('admin-warning').classList.remove('visible');
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 3500);
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  function padDay(n) {
    return String(n).padStart(3, '0');
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

})();
