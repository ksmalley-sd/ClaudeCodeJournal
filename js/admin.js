/* ============================================================
   ADMIN.JS v2 — auth, session state, localStorage draft,
                  GitHub API publish, form logic
   Depends on data.js being loaded first.
   ============================================================ */

(function () {
  'use strict';

  /* ---- Config ---- */
  var ADMIN_PASSWORD = 'claude-builds-2026'; // change to whatever you like

  /* ---- Storage keys ---- */
  var DRAFT_KEY = 'ccj_working_posts';
  var GH_KEY    = 'ccj_github_config';

  /* ---- Session state ---- */
  var _loadedPosts          = []; // current working set (all posts)
  var _editingId            = null;
  var _pendingScreenshotFile = null;
  var _dataLoadOk           = false; // false until posts.json fetched successfully

  /* ============================================================
     DRAFT PERSISTENCE
  ============================================================ */
  function saveWorkingDraft(outputObj) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(outputObj)); } catch(e) {}
  }

  function loadWorkingDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch(e) { return null; }
  }

  function clearWorkingDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch(e) {}
  }

  /* ============================================================
     GITHUB CONFIG
  ============================================================ */
  function getGithubConfig() {
    try { return JSON.parse(localStorage.getItem(GH_KEY)) || {}; } catch(e) { return {}; }
  }

  function saveGithubConfig(cfg) {
    try { localStorage.setItem(GH_KEY, JSON.stringify(cfg)); } catch(e) {}
  }

  function isGithubConfigured() {
    var cfg = getGithubConfig();
    return !!(cfg.owner && cfg.repo && cfg.token);
  }

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
    document.getElementById('admin-ui').style.display   = 'none';

    var form  = document.getElementById('login-form');
    var pwdIn = document.getElementById('login-pwd');
    var errEl = document.getElementById('login-error');

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
     LOAD ADMIN UI
  ============================================================ */
  function loadAdminUI() {
    document.getElementById('admin-ui').style.display = 'block';

    // Init GitHub setup panel
    renderGithubSetup();

    // Fetch existing posts
    PostData.fetchAll()
      .then(function (posts) {
        _loadedPosts = posts.slice().sort(function (a, b) { return a.day - b.day; });
        _dataLoadOk  = true;
        hideFetchErrorBanner();
        updateMeta();
        buildEditList();

        // Check for localStorage draft
        checkForDraft();

        setModeNew();
      })
      .catch(function (err) {
        _loadedPosts = [];
        _dataLoadOk  = false;
        showFetchErrorBanner(err);
        updateMeta();

        // Still allow using a draft if one exists
        var draft = loadWorkingDraft();
        if (draft && draft.posts && draft.posts.length > 0) {
          showDraftBanner(draft);
        }

        setModeNew();
      });

    // Wire tabs
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

    // Day field → auto-update ID + screenshot hint
    document.getElementById('f-day').addEventListener('input', function () {
      var n = parseInt(this.value, 10);
      if (!isNaN(n) && n > 0) {
        document.getElementById('f-id').value = 'day-' + padDay(n);
        if (!_editingId) {
          var curr = document.getElementById('f-screenshot').value;
          if (!curr || curr.startsWith('screenshots/day-')) {
            document.getElementById('f-screenshot').value = 'screenshots/day-' + padDay(n) + '.png';
          }
        }
      }
    });

    // Screenshot path text input → update preview
    document.getElementById('f-screenshot').addEventListener('input', function () {
      if (!_pendingScreenshotFile) {
        updateScreenshotPreview(this.value.trim(), null);
      }
    });

    // Screenshot file input
    var fileInput = document.getElementById('f-screenshot-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) {
          handleScreenshotUpload(this.files[0]);
        }
      });
    }

    // Drag-and-drop upload area
    var uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
      uploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
      });
      uploadArea.addEventListener('dragleave', function () {
        uploadArea.classList.remove('drag-over');
      });
      uploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          handleScreenshotUpload(file);
        }
      });
      uploadArea.addEventListener('click', function () {
        document.getElementById('f-screenshot-file').click();
      });
    }

    // GitHub setup save
    var ghSaveBtn = document.getElementById('gh-save-btn');
    if (ghSaveBtn) {
      ghSaveBtn.addEventListener('click', function () {
        var owner = document.getElementById('gh-owner').value.trim();
        var repo  = document.getElementById('gh-repo').value.trim();
        var token = document.getElementById('gh-token').value.trim();
        if (!owner || !repo || !token) {
          showToast('Please fill in all GitHub fields.', 'error');
          return;
        }
        saveGithubConfig({ owner: owner, repo: repo, token: token });
        renderGithubSetup();
        showToast('GitHub config saved!', 'success');
      });
    }

    // GitHub edit button (when already configured)
    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'gh-edit-btn') {
        renderGithubSetup(true); // force expand
      }
    });

    // Publish to GitHub button
    var publishBtn = document.getElementById('publish-btn');
    if (publishBtn) {
      publishBtn.addEventListener('click', function () {
        handlePublish();
      });
    }
  }

  /* ============================================================
     GITHUB SETUP PANEL
  ============================================================ */
  function renderGithubSetup(forceExpand) {
    var panel = document.getElementById('gh-setup-panel');
    if (!panel) return;

    var cfg = getGithubConfig();
    var configured = isGithubConfigured();

    if (configured && !forceExpand) {
      panel.classList.add('configured');
      panel.innerHTML = [
        '<div class="gh-setup-summary">',
        '  <span class="gh-check">✓</span>',
        '  <span>GitHub connected — <strong>' + PostUtils.escapeHTML(cfg.owner) + '/' + PostUtils.escapeHTML(cfg.repo) + '</strong></span>',
        '  <button id="gh-edit-btn" class="btn btn--ghost btn--sm">Edit</button>',
        '</div>'
      ].join('');
    } else {
      panel.classList.remove('configured');
      panel.innerHTML = [
        '<div class="gh-setup-header">',
        '  <span class="gh-setup-title">⚙ GitHub Setup <span class="gh-required-badge">Required for Publish</span></span>',
        '</div>',
        '<div class="gh-setup-fields">',
        '  <div class="form-row form-row--3">',
        '    <div class="form-group">',
        '      <label class="form-label" for="gh-owner">GitHub Username</label>',
        '      <input id="gh-owner" type="text" class="form-input" placeholder="e.g. KellenSmalley" value="' + PostUtils.escapeHTML(cfg.owner || '') + '">',
        '    </div>',
        '    <div class="form-group">',
        '      <label class="form-label" for="gh-repo">Repository Name</label>',
        '      <input id="gh-repo" type="text" class="form-input" placeholder="ClaudeCodeJournal" value="' + PostUtils.escapeHTML(cfg.repo || 'ClaudeCodeJournal') + '">',
        '    </div>',
        '    <div class="form-group">',
        '      <label class="form-label" for="gh-token">Personal Access Token</label>',
        '      <input id="gh-token" type="password" class="form-input" placeholder="ghp_..." value="' + PostUtils.escapeHTML(cfg.token || '') + '">',
        '    </div>',
        '  </div>',
        '  <div class="gh-setup-actions">',
        '    <button id="gh-save-btn" class="btn btn--accent btn--sm">Save GitHub Config</button>',
        '  </div>',
        '  <details class="gh-setup-help">',
        '    <summary>How to create a Personal Access Token</summary>',
        '    <ol>',
        '      <li>Go to <strong>github.com</strong> → your avatar → <strong>Settings</strong></li>',
        '      <li>Scroll to <strong>Developer settings</strong> (bottom of left sidebar)</li>',
        '      <li>Click <strong>Personal access tokens</strong> → <strong>Tokens (classic)</strong></li>',
        '      <li>Click <strong>Generate new token (classic)</strong></li>',
        '      <li>Give it any name (e.g. "Claude Code Journal")</li>',
        '      <li>Check <strong>public_repo</strong> under the "repo" section</li>',
        '      <li>Click <strong>Generate token</strong> → copy it → paste above</li>',
        '    </ol>',
        '    <p style="color:var(--text-muted);font-size:0.78rem;margin-top:8px">Your token is stored only in your browser\'s localStorage. It is never sent anywhere except GitHub\'s own API.</p>',
        '  </details>',
        '</div>'
      ].join('');

      // Re-wire save button (since we just re-rendered)
      var btn = document.getElementById('gh-save-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          var owner = document.getElementById('gh-owner').value.trim();
          var repo  = document.getElementById('gh-repo').value.trim();
          var token = document.getElementById('gh-token').value.trim();
          if (!owner || !repo || !token) {
            showToast('Please fill in all GitHub fields.', 'error');
            return;
          }
          saveGithubConfig({ owner: owner, repo: repo, token: token });
          renderGithubSetup();
          showToast('GitHub config saved!', 'success');
        });
      }
    }
  }

  /* ============================================================
     DRAFT BANNER
  ============================================================ */
  function checkForDraft() {
    var draft = loadWorkingDraft();
    if (draft && draft.posts && draft.posts.length > 0) {
      // Only show restore banner if draft differs from fetched
      showDraftBanner(draft);
    }
  }

  function showDraftBanner(draft) {
    var banner = document.getElementById('draft-banner');
    if (!banner) return;
    var count = draft.posts ? draft.posts.length : 0;
    banner.innerHTML = [
      '<span>📝 You have an unsaved session draft (' + count + ' post' + (count !== 1 ? 's' : '') + ').</span>',
      '<button id="draft-restore-btn" class="btn btn--ghost btn--sm">Restore Draft</button>',
      '<button id="draft-discard-btn" class="btn btn--ghost btn--sm">Discard</button>'
    ].join('');
    banner.classList.add('visible');

    document.getElementById('draft-restore-btn').addEventListener('click', function () {
      _loadedPosts = (draft.posts || []).slice().sort(function (a, b) { return a.day - b.day; });
      _dataLoadOk  = true;
      hideFetchErrorBanner();
      updateMeta();
      buildEditList();
      banner.classList.remove('visible');
      showToast('Draft restored — ' + _loadedPosts.length + ' posts loaded.', 'success');
    });

    document.getElementById('draft-discard-btn').addEventListener('click', function () {
      clearWorkingDraft();
      banner.classList.remove('visible');
    });
  }

  /* ============================================================
     FETCH ERROR BANNER
  ============================================================ */
  function showFetchErrorBanner(err) {
    var banner = document.getElementById('fetch-error-banner');
    if (!banner) return;
    banner.innerHTML = [
      '<strong>⚠ Could not load existing posts from GitHub.</strong> ',
      'Generating or publishing now will overwrite all your other posts with only the current post. ',
      'Make sure you are viewing admin.html from your live GitHub Pages URL, not a local file.',
      err ? '<br><small style="opacity:0.7">' + PostUtils.escapeHTML(err.message || String(err)) + '</small>' : ''
    ].join('');
    banner.classList.add('visible');

    // Disable generate + publish
    var submitBtn  = document.querySelector('#post-form button[type="submit"]');
    var publishBtn = document.getElementById('publish-btn');
    if (submitBtn)  submitBtn.disabled = true;
    if (publishBtn) publishBtn.disabled = true;
  }

  function hideFetchErrorBanner() {
    var banner = document.getElementById('fetch-error-banner');
    if (banner) banner.classList.remove('visible');

    var submitBtn  = document.querySelector('#post-form button[type="submit"]');
    var publishBtn = document.getElementById('publish-btn');
    if (submitBtn)  submitBtn.disabled = false;
    if (publishBtn) publishBtn.disabled = false;
  }

  /* ============================================================
     SCREENSHOT FILE UPLOAD
  ============================================================ */
  function handleScreenshotUpload(file) {
    _pendingScreenshotFile = file;
    var path = 'screenshots/' + file.name;
    document.getElementById('f-screenshot').value = path;
    updateScreenshotPreview(path, file);

    // Update upload area label
    var uploadLabel = document.getElementById('upload-label');
    if (uploadLabel) {
      uploadLabel.textContent = '✓ ' + file.name + ' selected';
    }
  }

  function updateScreenshotPreview(path, file) {
    var wrap = document.getElementById('screenshot-preview');
    var img  = document.getElementById('screenshot-img');
    if (!wrap || !img) return;

    if (file) {
      // Local file selected — use object URL for immediate preview
      img.src = URL.createObjectURL(file);
      wrap.style.display = 'block';
    } else if (path) {
      img.src = path;
      img.onerror = function () { wrap.style.display = 'none'; };
      img.onload  = function () { wrap.style.display = 'block'; };
    } else {
      wrap.style.display = 'none';
    }
  }

  /* fileToBase64: reads a File object, returns base64 string (no data-url prefix) */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function (e) {
        // Strip "data:image/png;base64," prefix
        var result = e.target.result;
        var b64 = result.split(',')[1];
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
     MODE: NEW POST
  ============================================================ */
  function setModeNew() {
    _editingId = null;
    _pendingScreenshotFile = null;
    setActiveTab('tab-new');
    document.getElementById('edit-list-section').style.display = 'none';
    document.getElementById('form-section').style.display      = 'block';
    document.getElementById('form-title').textContent          = 'New Post';
    resetForm();
    prefillDefaults();
    hidePreview();
    hideErrors();
  }

  function prefillDefaults() {
    var nextDay = _loadedPosts.length > 0
      ? Math.max.apply(null, _loadedPosts.map(function (p) { return p.day || 0; })) + 1
      : 1;

    document.getElementById('f-day').value        = nextDay;
    document.getElementById('f-id').value         = 'day-' + padDay(nextDay);
    document.getElementById('f-date').value       = todayISO();
    document.getElementById('f-screenshot').value = 'screenshots/day-' + padDay(nextDay) + '.png';

    var medRadio = document.querySelector('.diff-option[data-diff="medium"] input');
    if (medRadio) medRadio.checked = true;
  }

  /* ============================================================
     MODE: EDIT EXISTING
  ============================================================ */
  function setModeEdit() {
    setActiveTab('tab-edit');
    document.getElementById('form-section').style.display      = 'none';
    document.getElementById('edit-list-section').style.display = 'block';
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
      var esc       = PostUtils.escapeHTML;
      var diff      = post.difficulty || 'medium';
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
      if (item) loadPostIntoForm(item.dataset.id);
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
    _pendingScreenshotFile = null;
    document.getElementById('edit-list-section').style.display = 'none';
    document.getElementById('form-section').style.display      = 'block';
    document.getElementById('form-title').textContent          = 'Editing: Day ' + padDay(post.day);

    resetForm();
    hidePreview();
    hideErrors();

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

    var diffRadio = document.querySelector('.diff-option[data-diff="' + (post.difficulty || 'medium') + '"] input');
    if (diffRadio) diffRadio.checked = true;

    document.querySelectorAll('.tag-checkbox input').forEach(function (cb) {
      cb.checked = (post.tags || []).indexOf(cb.value) !== -1;
    });

    var presetTags  = PostSchema.TAGS;
    var customTags  = (post.tags || []).filter(function (t) { return presetTags.indexOf(t) === -1; });
    document.getElementById('f-custom-tags').value = customTags.join(', ');

    updateScreenshotPreview(post.screenshot || '', null);

    // Reset upload label
    var uploadLabel = document.getElementById('upload-label');
    if (uploadLabel) uploadLabel.textContent = 'Click or drag a screenshot here';
  }

  /* ============================================================
     FORM COLLECTION & VALIDATION
  ============================================================ */
  function collectFormData() {
    var tags = [];
    document.querySelectorAll('.tag-checkbox input:checked').forEach(function (cb) {
      tags.push(cb.value);
    });
    var customRaw = document.getElementById('f-custom-tags').value.trim();
    if (customRaw) {
      customRaw.split(',').forEach(function (t) {
        var trimmed = t.trim();
        if (trimmed && tags.indexOf(trimmed) === -1) tags.push(trimmed);
      });
    }

    var diffRadio  = document.querySelector('.diff-option input:checked');
    var difficulty = diffRadio ? diffRadio.value : 'medium';
    var link       = document.getElementById('f-link').value.trim();

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
    if (!post.id)                errors.push('Post ID is missing.');
    if (!post.day || post.day < 1) errors.push('Day number must be a positive integer.');
    if (!post.date)              errors.push('Date is required.');
    if (!post.title)             errors.push('Title is required.');
    if (!post.difficulty)        errors.push('Difficulty is required.');
    if (!post.whatIBuilt)        errors.push('"What I Built" is required.');
    if (!post.howItWent)         errors.push('"How It Went" is required.');
    if (!post.whatILearned)      errors.push('"What I Learned" is required.');
    if (!post.biggestChallenge)  errors.push('"Biggest Challenge" is required.');
    if (post.link && !/^https?:\/\//i.test(post.link)) {
      errors.push('Link must start with http:// or https://');
    }
    if (PostSchema.DIFFICULTIES.indexOf(post.difficulty) === -1) {
      errors.push('Invalid difficulty value.');
    }
    return errors;
  }

  /* ============================================================
     BUILD OUTPUT (shared by generate + publish)
  ============================================================ */
  function buildOutput() {
    var post   = collectFormData();
    var errors = validatePost(post);
    if (errors.length) { showErrors(errors); return null; }

    var allPosts = _loadedPosts.slice();
    var idx = allPosts.findIndex(function (p) { return p.id === post.id; });
    if (idx !== -1) {
      allPosts[idx] = post;
    } else {
      allPosts.push(post);
    }
    allPosts.sort(function (a, b) { return a.day - b.day; });

    // *** FIX: write back to _loadedPosts so subsequent edits see this change ***
    _loadedPosts = allPosts.slice();
    updateMeta();
    buildEditList();

    var output = {
      meta: {
        version:     1,
        lastUpdated: todayISO(),
        totalPosts:  allPosts.length
      },
      posts: allPosts
    };

    // Persist to localStorage draft
    saveWorkingDraft(output);

    return output;
  }

  /* ============================================================
     GENERATE + DOWNLOAD (fallback / offline flow)
  ============================================================ */
  function handleGenerate() {
    hideErrors();
    hidePreview();

    var output = buildOutput();
    if (!output) return;

    var jsonStr = JSON.stringify(output, null, 2);
    showPreview(jsonStr);
    showToast('JSON ready — download and commit to GitHub!', 'success');
  }

  function showPreview(jsonStr) {
    var section  = document.getElementById('json-preview');
    var textarea = document.getElementById('json-output');
    var dlBtn    = document.getElementById('download-btn');

    textarea.value = jsonStr;
    section.classList.add('visible');

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
     PUBLISH TO GITHUB
  ============================================================ */
  function handlePublish() {
    if (!isGithubConfigured()) {
      showToast('Set up GitHub config first (see the setup panel above).', 'error');
      renderGithubSetup(true);
      document.getElementById('gh-setup-panel').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    hideErrors();

    var output = buildOutput();
    if (!output) return;

    var jsonStr    = JSON.stringify(output, null, 2);
    var screenshotPath = document.getElementById('f-screenshot').value.trim();

    setPublishState('loading');

    publishToGithub(jsonStr, _pendingScreenshotFile, screenshotPath)
      .then(function () {
        setPublishState('success');
        clearWorkingDraft();
        PostData.clearCache();
        hideDraftBanner();
        showToast('Published! Your site will update in ~1 minute.', 'success');
        // After publish, reset so next post starts fresh
        setTimeout(function () {
          setPublishState('default');
          _pendingScreenshotFile = null;
        }, 3000);
      })
      .catch(function (err) {
        setPublishState('error');
        showToast('Publish failed: ' + (err.message || err), 'error');
        console.error('GitHub publish error:', err);
        setTimeout(function () { setPublishState('default'); }, 3000);
      });
  }

  async function publishToGithub(jsonStr, screenshotFile, screenshotPath) {
    var cfg = getGithubConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      throw new Error('GitHub config incomplete. Please fill in the setup panel.');
    }

    var headers = {
      'Authorization': 'token ' + cfg.token,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github.v3+json'
    };
    var base = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/';

    /* 1. Upload screenshot if a local file was selected */
    if (screenshotFile && screenshotPath) {
      var imgBase64 = await fileToBase64(screenshotFile);
      // Check if file already exists (need its SHA to update)
      var existImgResp = await fetch(base + screenshotPath, { headers: headers });
      var imgSha = null;
      if (existImgResp.ok) {
        var existImgData = await existImgResp.json();
        imgSha = existImgData.sha;
      }
      var imgBody = {
        message: 'Add screenshot: ' + screenshotPath,
        content: imgBase64
      };
      if (imgSha) imgBody.sha = imgSha;

      var imgResp = await fetch(base + screenshotPath, {
        method:  'PUT',
        headers: headers,
        body:    JSON.stringify(imgBody)
      });
      if (!imgResp.ok) {
        var imgErr = await imgResp.text();
        throw new Error('Screenshot upload failed (' + imgResp.status + '): ' + imgErr);
      }
    }

    /* 2. Get current posts.json SHA (required to update an existing file) */
    var existResp = await fetch(base + 'posts.json', { headers: headers });
    var existSha  = null;
    if (existResp.ok) {
      var existData = await existResp.json();
      existSha = existData.sha;
    }

    /* 3. Commit updated posts.json */
    // btoa on unicode requires encoding workaround
    var encoded = btoa(unescape(encodeURIComponent(jsonStr)));
    var body = {
      message: 'Update posts via admin (' + todayISO() + ')',
      content: encoded
    };
    if (existSha) body.sha = existSha;

    var result = await fetch(base + 'posts.json', {
      method:  'PUT',
      headers: headers,
      body:    JSON.stringify(body)
    });

    if (!result.ok) {
      var errText = await result.text();
      throw new Error('posts.json commit failed (' + result.status + '): ' + errText);
    }
  }

  function setPublishState(state) {
    var btn = document.getElementById('publish-btn');
    if (!btn) return;
    btn.classList.remove('loading', 'success', 'error');
    btn.disabled = false;

    if (state === 'loading') {
      btn.classList.add('loading');
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span> Publishing...';
    } else if (state === 'success') {
      btn.classList.add('success');
      btn.innerHTML = '✓ Published!';
    } else if (state === 'error') {
      btn.classList.add('error');
      btn.innerHTML = '✗ Failed — see toast';
    } else {
      btn.innerHTML = '↑ Publish to GitHub';
    }
  }

  /* ============================================================
     UI HELPERS
  ============================================================ */
  function resetForm() {
    document.getElementById('post-form').reset();
    document.getElementById('screenshot-preview').style.display = 'none';
    var uploadLabel = document.getElementById('upload-label');
    if (uploadLabel) uploadLabel.textContent = 'Click or drag a screenshot here';
    _pendingScreenshotFile = null;
  }

  function setActiveTab(id) {
    ['tab-new', 'tab-edit'].forEach(function (tabId) {
      document.getElementById(tabId).classList.toggle('active', tabId === id);
    });
  }

  function updateMeta() {
    var metaEl = document.getElementById('admin-meta');
    if (metaEl) {
      metaEl.textContent = _loadedPosts.length + ' post' + (_loadedPosts.length !== 1 ? 's' : '') + ' loaded';
    }
  }

  function hideDraftBanner() {
    var banner = document.getElementById('draft-banner');
    if (banner) banner.classList.remove('visible');
  }

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

  function showToast(msg, type) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className   = 'toast toast--' + (type || 'success');
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () { toast.classList.remove('show'); }, 4000);
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  function padDay(n) { return String(n).padStart(3, '0'); }
  function todayISO() { return new Date().toISOString().split('T')[0]; }

  /* ============================================================
     BOOT
  ============================================================ */
  document.addEventListener('DOMContentLoaded', init);

})();
