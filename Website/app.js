/**
 * Editor Text (editortext.com)
 * Core Application Script
 */


document.addEventListener('DOMContentLoaded', () => {
  // Safe storage helper with memory fallback (protects against storage quotas & private-browsing blocking)
  const safeStorage = {
    _cache: {},
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return this._cache[key] !== undefined ? this._cache[key] : null;
      }
    },
    setItem(key, value) {
      const strVal = String(value);
      try {
        localStorage.setItem(key, strVal);
      } catch (e) {
        console.warn('Storage write blocked or quota exceeded, using memory cache:', key);
      }
      this._cache[key] = strVal;
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // ignore
      }
      delete this._cache[key];
    }
  };

  // Saved range for selection preservation (especially on touch devices)
  let savedRange = null;
  let savedTextareaStart = 0;
  let savedTextareaEnd = 0;
  let lastFocusedTrigger = null;

  // --- STATE ---
  const state = {
    activeTab: 'text', // 'text', 'preview', or 'photo'
    filename: 'untitled',
    extension: '.txt',
    theme: 'light',
    editorTheme: 'light',
    textWrap: 'on', // 'on' or 'off'
    fontSize: '16px',
    fontFamily: 'monospace',
    splitViewActive: false,
    printMargin: 'off', // 'off', '80', or '100'
    tabMode: 'soft4', // 'hard', 'soft2', or 'soft4'
    whitespaceVisible: false,
    editorActive: false,
    
    // Advanced Settings States
    editorMode: 'rich',
    keybindings: 'ace',
    cursorStyle: 'ace',
    folding: 'mark-begin',
    tabSize: 4,
    overscroll: 'none',
    atomicTabs: false,
    behaviours: true,
    wrapQuotes: true,
    autoIndent: true,
    fullLineSelection: true,
    highlightActiveLine: true,
    indentGuides: true,
    persistentHScroll: false,
    persistentVScroll: false,
    animateScrolling: false,
    showGutter: true,
    showLineNumbers: true,
    relativeLineNumbers: false,
    fixedGutter: false,
    showPrintMargin: false,
    printMarginLimit: 80,
    indentedSoftWrap: false,
    highlightSelected: true,
    fadeFold: false,
    imeEnabled: true,
    mergeUndo: 'timed',
    readonly: false,
    copyWithoutSelection: true,
    vimMode: 'insert',
    vimLastKey: '',
    emacsKillRing: '',
    photo: {
      src: null,
      rotation: 0,
      flipH: 1,
      flipV: 1,
      filters: {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0,
        invert: 0,
        blur: 0,
        hueRotate: 0,
        opacity: 100
      }
    },
    findSelectionIndex: 0,
    isInteractingWithToolbar: false
  };

  // --- HISTORY ENGINE (UNDO/REDO) ---
  const historyState = {
    history: [],
    index: -1,
    maxStates: 100,
    isApplying: false,
    
    push(value, selectionStart, selectionEnd) {
      if (this.isApplying) return;
      // Skip duplicate entries
      if (this.index >= 0 && this.history[this.index].value === value) return;
      
      // Truncate future states
      this.history = this.history.slice(0, this.index + 1);
      
      this.history.push({ value, selectionStart, selectionEnd });
      if (this.history.length > this.maxStates) {
        this.history.shift();
      }
      this.index = this.history.length - 1;
    },
    
    undo(textarea) {
      if (this.index > 0) {
        this.isApplying = true;
        this.index--;
        const item = this.history[this.index];
        textarea.value = item.value;
        textarea.setSelectionRange(item.selectionStart, item.selectionEnd);
        this.isApplying = false;
        return true;
      }
      return false;
    },
    
    redo(textarea) {
      if (this.index < this.history.length - 1) {
        this.isApplying = true;
        this.index++;
        const item = this.history[this.index];
        textarea.value = item.value;
        textarea.setSelectionRange(item.selectionStart, item.selectionEnd);
        this.isApplying = false;
        return true;
      }
      return false;
    }
  };

  // --- DOM ELEMENTS ---
  const el = {
    // Welcome Landing overlay
    welcomeScreen: document.getElementById('welcome-screen'),
    btnWelcomeOpenComp: document.getElementById('btn-welcome-open-comp'),
    btnWelcomeCreate: document.getElementById('btn-welcome-create'),

    // Tabs & Workspace
    tabText: document.getElementById('tab-text'),
    tabPreview: document.getElementById('tab-preview'),
    tabPhoto: document.getElementById('tab-photo'),
    textWorkspace: document.getElementById('text-workspace'),
    previewWorkspace: document.getElementById('preview-workspace'),
    photoWorkspace: document.getElementById('photo-workspace'),
    textSidebar: document.getElementById('text-sidebar-controls'),
    photoSidebar: document.getElementById('photo-sidebar-controls'),
    
    // Header controls
    filenameInput: document.getElementById('filename'),
    fileExtSpan: document.getElementById('file-extension'),
    btnNew: document.getElementById('btn-new'),
    btnOpen: document.getElementById('btn-open'),
    btnFullscreenPreview: document.getElementById('btn-fullscreen-preview'),
    btnSave: document.getElementById('btn-save'),
    btnCopy: document.getElementById('btn-copy'),
    btnFindReplaceToggle: document.getElementById('btn-toolbar-find'),
    btnFindReplaceToggleHeader: document.getElementById('btn-find-replace-toggle'),
    btnMobileSidebarTogglePhoto: document.getElementById('btn-mobile-sidebar-toggle-photo'),
    themeSelector: document.getElementById('theme-selector'),
    fileSelector: document.getElementById('file-selector'),
    
    // Google Auth Widget

    // Text Editor
    textarea: document.getElementById('editor-text-area'),
    richarea: document.getElementById('editor-rich-area'),
    lineNumbers: document.getElementById('line-numbers-sidebar'),
    fontFamilySelector: document.getElementById('font-family-selector'),
    fontSizeSelector: document.getElementById('font-size-selector'),
    toolbarModeSelector: document.getElementById('toolbar-mode-selector'),
    btnToolbarAbout: document.getElementById('btn-toolbar-about'),
    editorLayoutWrapper: document.getElementById('editor-layout-wrapper'),
    editorToolbar: document.getElementById('editor-toolbar'),
    
    // Formatting Toolbar Buttons
    btnBold: document.getElementById('btn-bold'),
    btnItalic: document.getElementById('btn-italic'),
    btnUnderline: document.getElementById('btn-underline'),
    btnStrike: document.getElementById('btn-strike'),
    btnH1: document.getElementById('btn-h1'),
    btnH2: document.getElementById('btn-h2'),
    btnLink: document.getElementById('btn-link'),
    btnUpper: document.getElementById('btn-upper'),
    btnLower: document.getElementById('btn-lower'),
    btnTitle: document.getElementById('btn-title'),
    btnSplitToggle: document.getElementById('btn-split-toggle'),
    
    // Advanced Toolbar actions
    btnToolbarUndo: document.getElementById('btn-toolbar-undo'),
    btnToolbarRedo: document.getElementById('btn-toolbar-redo'),
    btnToolbarPrint: document.getElementById('btn-toolbar-print'),
    btnToolbarWrap: document.getElementById('btn-toolbar-wrap'),
    btnToolbarLines: document.getElementById('btn-toolbar-lines'),
    btnToolbarMargin: document.getElementById('btn-toolbar-margin'),
    btnToolbarTab: document.getElementById('btn-toolbar-tab'),
    btnToolbarWhitespace: document.getElementById('btn-toolbar-whitespace'),
    btnToolbarShortcuts: document.getElementById('btn-toolbar-shortcuts'),
    btnToolbarGoToLine: document.getElementById('btn-toolbar-gotoline'),
    btnToolbarSidebar: document.getElementById('btn-toolbar-sidebar'),
    appSidebar: document.getElementById('app-sidebar'),
    
    // Previews
    splitPreviewContainer: document.getElementById('split-preview-container'),
    splitPreviewIframe: document.getElementById('split-preview-iframe'),
    fullPreviewIframe: document.getElementById('full-preview-iframe'),
    
    // Find & Replace
    findReplaceBar: document.getElementById('find-replace-bar'),
    findInput: document.getElementById('find-input'),
    replaceInput: document.getElementById('replace-input'),
    btnFindNext: document.getElementById('btn-find-next'),
    btnReplace: document.getElementById('btn-replace'),
    btnReplaceAll: document.getElementById('btn-replace-all'),
    btnCloseFind: document.getElementById('btn-close-find'),
    
    // Photo Editor
    photoDropzone: document.getElementById('photo-dropzone'),
    imageWrapper: document.getElementById('image-wrapper'),
    imagePreview: document.getElementById('image-preview'),
    
    // Photo Controls
    btnRotate: document.getElementById('btn-rotate'),
    btnFlipH: document.getElementById('btn-flip-h'),
    btnFlipV: document.getElementById('btn-flip-v'),
    btnClearPhoto: document.getElementById('btn-clear-photo'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    
    // Sliders
    filterBrightness: document.getElementById('filter-brightness'),
    filterContrast: document.getElementById('filter-contrast'),
    filterSaturate: document.getElementById('filter-saturate'),
    filterGrayscale: document.getElementById('filter-grayscale'),
    filterSepia: document.getElementById('filter-sepia'),
    filterInvert: document.getElementById('filter-invert'),
    filterBlur: document.getElementById('filter-blur'),
    filterHueRotate: document.getElementById('filter-hue-rotate'),
    filterOpacity: document.getElementById('filter-opacity'),
    
    // Slider values
    valBrightness: document.getElementById('val-brightness'),
    valContrast: document.getElementById('val-contrast'),
    valSaturate: document.getElementById('val-saturate'),
    valGrayscale: document.getElementById('val-grayscale'),
    valSepia: document.getElementById('val-sepia'),
    valInvert: document.getElementById('val-invert'),
    valBlur: document.getElementById('val-blur'),
    valHueRotate: document.getElementById('val-hue-rotate'),
    valOpacity: document.getElementById('val-opacity'),
    
    // Analytics
    statWords: document.getElementById('stat-words'),
    statChars: document.getElementById('stat-chars'),
    statCharsNoSpaces: document.getElementById('stat-chars-no-spaces'),
    statLines: document.getElementById('stat-lines'),
    statParagraphs: document.getElementById('stat-paragraphs'),
    statSentences: document.getElementById('stat-sentences'),
    statReadingTime: document.getElementById('stat-reading-time'),
    statSpeakingTime: document.getElementById('stat-speaking-time'),
    
    // Live Preview Run Button
    btnRunPreview: document.getElementById('btn-run-preview'),
    
    // Dialogs & GDPR
    infoDialog: document.getElementById('info-dialog'),
    dialogTitle: document.getElementById('dialog-title'),
    dialogBody: document.getElementById('dialog-body-content'),
    btnCloseDialog: document.getElementById('btn-close-dialog'),
    
    settingsDialog: document.getElementById('settings-dialog'),
    btnCloseSettingsDialog: document.getElementById('btn-close-settings-dialog'),
    settingsMode: document.getElementById('settings-mode'),
    settingsTheme: document.getElementById('settings-theme'),
    settingsFontSizeInput: document.getElementById('settings-font-size-input'),
    settingsBtnFont12: document.getElementById('settings-btn-font-12'),
    settingsBtnFont24: document.getElementById('settings-btn-font-24'),
    settingsWrapLimit: document.getElementById('settings-wrap-limit'),
    settingsCursorStyle: document.getElementById('settings-cursor-style'),
    settingsFolding: document.getElementById('settings-folding'),
    settingsSoftTabs: document.getElementById('settings-soft-tabs'),
    settingsTabSize: document.getElementById('settings-tab-size'),
    settingsPrintMarginLimit: document.getElementById('settings-print-margin-limit'),
    settingsMergeUndo: document.getElementById('settings-merge-undo'),
    chkAtomicTabs: document.getElementById('chk-atomic-tabs'),
    chkBehaviours: document.getElementById('chk-behaviours'),
    chkQuotes: document.getElementById('chk-quotes'),
    chkAutoIndent: document.getElementById('chk-auto-indent'),
    chkFullLineSelection: document.getElementById('chk-full-line-selection'),
    chkHighlightLine: document.getElementById('chk-highlight-line'),
    chkShowInvisibles: document.getElementById('chk-show-invisibles'),
    chkIndentGuides: document.getElementById('chk-indent-guides'),
    chkPersistentHScroll: document.getElementById('chk-persistent-hscroll'),
    chkPersistentVScroll: document.getElementById('chk-persistent-vscroll'),
    chkAnimateScrolling: document.getElementById('chk-animate-scrolling'),
    chkShowGutter: document.getElementById('chk-show-gutter'),
    chkLineNumbers: document.getElementById('chk-line-numbers'),
    chkRelativeLines: document.getElementById('chk-relative-lines'),
    chkFixedGutter: document.getElementById('chk-fixed-gutter'),
    chkPrintMargin: document.getElementById('chk-print-margin'),
    chkIndentedSoftwrap: document.getElementById('chk-indented-softwrap'),
    chkHighlightSelected: document.getElementById('chk-highlight-selected'),
    chkFadeFold: document.getElementById('chk-fade-fold'),
    chkIme: document.getElementById('chk-ime'),
    chkReadonly: document.getElementById('chk-readonly'),
    chkCopyWithoutSelection: document.getElementById('chk-copy-without-selection'),
    
    shortcutsDialog: document.getElementById('shortcuts-dialog'),
    btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),
    settingsDialog: document.getElementById('settings-dialog'),
    btnCloseSettingsDialog: document.getElementById('btn-close-settings-dialog'),

    cookieBanner: document.getElementById('cookie-banner'),
    btnCookieAccept: document.getElementById('btn-cookie-accept'),
    btnCookieDecline: document.getElementById('btn-cookie-decline'),
    commandPaletteDialog: document.getElementById('command-palette-dialog'),
    commandPaletteInput: document.getElementById('command-palette-input'),
    commandPaletteList: document.getElementById('command-palette-list'),
    
    // Footer Links
    footerAbout: document.getElementById('footer-about-link'),
    toastContainer: document.getElementById('toast-container')
  };

  // --- INITIALIZATION ---
  function init() {
    loadSettings();
    updateTheme(state.theme);
    updateEditorTheme(state.editorTheme);
    setupEventListeners();
    setupDragAndDrop();
    updateLineNumbers();
    runAnalytics();
    
    // Populate initial history state
    historyState.push(el.textarea.value, el.textarea.selectionStart, el.textarea.selectionEnd);

    // Apply font size and mapping
    applyFontStyles();
    applyEditorPreferences();
    el.filenameInput.value = state.filename;
    el.fileExtSpan.textContent = state.extension;
    if (el.fontFamilySelector) {
      el.fontFamilySelector.value = state.fontFamily || 'monospace';
      if (!el.fontFamilySelector.value) {
        el.fontFamilySelector.value = 'monospace';
      }
    }
    if (el.fontSizeSelector) el.fontSizeSelector.value = state.fontSize || '16px';

    // Check cookie banner consent
    if (safeStorage.getItem('et_cookies') !== 'accepted' && safeStorage.getItem('et_cookies') !== 'declined') {
      setTimeout(() => {
        el.cookieBanner.classList.remove('hidden');
      }, 1000);
    }
    
    // Update theme selector position
    if (el.themeSelector) el.themeSelector.value = state.theme;

    // Toggle Landing / Welcome page visibility
    toggleWelcomeVisibility();
    
    // Sync Editor Mode Visual displays
    updateEditorModeDisplay(null);
    
    showToast('💡 Welcome to Editor Text!', 'success');
  }

  // --- TOAST SYSTEM ---
  function showToast(message, type = 'info') {
    // Only show critical errors, file loading, and file saving successes
    const isCritical = type === 'error' || 
                       message.includes('Saved') || 
                       message.includes('Loaded') || 
                       message.includes('Downloaded') || 
                       message.includes('copied to clipboard');
    if (!isCritical) return; // Silent minor toasts

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';
    
    toast.innerHTML = `
      <span class="material-symbols-outlined">${icon}</span>
      <span>${message}</span>
    `;
    
    el.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- STORAGE PERSISTENCE ---
  function saveSettings() {
    safeStorage.setItem('et_theme', state.theme);
    safeStorage.setItem('et_editor_theme', state.editorTheme);
    safeStorage.setItem('et_text_wrap', state.textWrap);
    safeStorage.setItem('et_font_size', state.fontSize);
    safeStorage.setItem('et_font_family', state.fontFamily);
    safeStorage.setItem('et_filename', state.filename);
    safeStorage.setItem('et_extension', state.extension);
    safeStorage.setItem('et_active_tab', state.activeTab);
    safeStorage.setItem('et_split_view', state.splitViewActive);
    safeStorage.setItem('et_print_margin', state.printMargin);
    safeStorage.setItem('et_tab_mode', state.tabMode);
    safeStorage.setItem('et_whitespace', state.whitespaceVisible);
    
    // Save advanced editor settings
    safeStorage.setItem('et_editor_mode', state.editorMode);
    safeStorage.setItem('et_keybindings', state.keybindings);
    safeStorage.setItem('et_cursor_style', state.cursorStyle);
    safeStorage.setItem('et_folding', state.folding);
    safeStorage.setItem('et_tab_size', state.tabSize);
    safeStorage.setItem('et_overscroll', state.overscroll);
    safeStorage.setItem('chk_behaviours', state.behaviours);
    safeStorage.setItem('chk_quotes', state.wrapQuotes);
    safeStorage.setItem('chk_auto_indent', state.autoIndent);
    safeStorage.setItem('chk_relative_lines', state.relativeLineNumbers);
    safeStorage.setItem('chk_readonly', state.readonly);
    safeStorage.setItem('et_editor_active', state.editorActive);
    
    // Clean whitespace symbols before saving content
    if (state.editorMode === 'rich') {
      safeStorage.setItem('et_text_content', el.richarea.innerHTML);
    } else {
      const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
      safeStorage.setItem('et_text_content', cleanText);
    }
  }

  function loadSettings() {
    if (safeStorage.getItem('et_theme')) state.theme = safeStorage.getItem('et_theme');
    state.editorTheme = safeStorage.getItem('et_editor_theme') || state.theme;
    if (safeStorage.getItem('et_text_wrap')) state.textWrap = safeStorage.getItem('et_text_wrap');
    state.fontSize = safeStorage.getItem('et_font_size') || '16px';
    state.fontFamily = safeStorage.getItem('et_font_family') || 'monospace';
    if (!fontMapping[state.fontFamily]) {
      state.fontFamily = 'monospace';
    }
    if (safeStorage.getItem('et_filename')) state.filename = safeStorage.getItem('et_filename');
    if (safeStorage.getItem('et_extension')) state.extension = safeStorage.getItem('et_extension');
    if (safeStorage.getItem('et_active_tab')) state.activeTab = safeStorage.getItem('et_active_tab');
    state.splitViewActive = false;
    if (safeStorage.getItem('et_print_margin')) state.printMargin = safeStorage.getItem('et_print_margin');
    if (safeStorage.getItem('et_tab_mode')) state.tabMode = safeStorage.getItem('et_tab_mode');
    if (safeStorage.getItem('et_whitespace')) state.whitespaceVisible = safeStorage.getItem('et_whitespace') === 'true';

    // Load advanced settings
    if (safeStorage.getItem('et_editor_mode')) state.editorMode = safeStorage.getItem('et_editor_mode');
    if (safeStorage.getItem('et_keybindings')) state.keybindings = safeStorage.getItem('et_keybindings');
    if (safeStorage.getItem('et_cursor_style')) state.cursorStyle = safeStorage.getItem('et_cursor_style');
    if (safeStorage.getItem('et_folding')) state.folding = safeStorage.getItem('et_folding');
    if (safeStorage.getItem('et_tab_size')) state.tabSize = parseInt(safeStorage.getItem('et_tab_size'));
    if (safeStorage.getItem('et_overscroll')) state.overscroll = safeStorage.getItem('et_overscroll');
    if (safeStorage.getItem('chk_behaviours')) state.behaviours = safeStorage.getItem('chk_behaviours') === 'true';
    if (safeStorage.getItem('chk_quotes')) state.wrapQuotes = safeStorage.getItem('chk_quotes') === 'true';
    if (safeStorage.getItem('chk_auto_indent')) state.autoIndent = safeStorage.getItem('chk_auto_indent') === 'true';
    if (safeStorage.getItem('chk_relative_lines')) state.relativeLineNumbers = safeStorage.getItem('chk_relative_lines') === 'true';
    if (safeStorage.getItem('chk_readonly')) state.readonly = safeStorage.getItem('chk_readonly') === 'true';
    if (safeStorage.getItem('et_editor_active')) state.editorActive = safeStorage.getItem('et_editor_active') === 'true';

    if (safeStorage.getItem('et_text_content')) {
      const rawText = safeStorage.getItem('et_text_content');
      if (rawText.length > 0) {
        state.editorActive = true;
      }
      if (state.editorMode === 'rich') {
        el.richarea.innerHTML = rawText;
        const plain = getPlainTextFromRichHTML(rawText);
        el.textarea.value = state.whitespaceVisible ? convertToWhitespaceDisplay(plain) : plain;
      } else {
        el.textarea.value = state.whitespaceVisible ? convertToWhitespaceDisplay(rawText) : rawText;
      }
    }

    // Sync Word Wrap button and classes
    applyWordWrapMode();

    // Sync Print Margin position classes
    applyPrintMarginPos();

    // Sync whitespace toolbar active indicators
    if (state.whitespaceVisible) {
      el.btnToolbarWhitespace.classList.add('active');
    } else {
      el.btnToolbarWhitespace.classList.remove('active');
    }

    // Sync Split View button state
    if (state.splitViewActive) {
      el.btnSplitToggle.classList.add('active');
      el.splitPreviewContainer.classList.remove('hidden');
    } else {
      el.btnSplitToggle.classList.remove('active');
      el.splitPreviewContainer.classList.add('hidden');
    }
    
    // Sync Sidebar Collapsed state
    let sidebarCollapsed = safeStorage.getItem('et_sidebar_collapsed');
    if (sidebarCollapsed === null) {
      sidebarCollapsed = window.innerWidth <= 1024 ? 'true' : 'false';
    }
    if (sidebarCollapsed === 'true') {
      if (el.appSidebar) el.appSidebar.classList.add('collapsed');
      if (el.btnToolbarSidebar) el.btnToolbarSidebar.classList.remove('active');
      document.body.classList.add('sidebar-collapsed');
    } else {
      if (el.appSidebar) el.appSidebar.classList.remove('collapsed');
      if (el.btnToolbarSidebar) el.btnToolbarSidebar.classList.add('active');
      document.body.classList.remove('sidebar-collapsed');
    }

    // Switch to active tab
    switchTab(state.activeTab);
  }

  // --- THEME MANAGEMENT ---
  function updateTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    state.theme = themeName;
    saveSettings();

    if (el.themeSelector) {
      el.themeSelector.value = themeName;
    }
  }

  function updateEditorTheme(themeName) {
    const wrapper = document.getElementById('editor-layout-wrapper');
    if (wrapper) {
      wrapper.setAttribute('data-editor-theme', themeName);
    }
    state.editorTheme = themeName;
    saveSettings();

    // Update theme card active states in popover
    document.querySelectorAll('#popover-theme .theme-card-option').forEach(card => {
      if (card.getAttribute('data-theme-val') === themeName) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  // --- TAB NAVIGATION ---
  function switchTab(tabId) {
    state.activeTab = tabId;
    saveSettings();

    // Toggle tab classes on html and body for media query layout adjustments
    document.documentElement.classList.remove('tab-text', 'tab-preview', 'tab-photo');
    document.documentElement.classList.add(`tab-${tabId}`);
    document.body.classList.remove('tab-text', 'tab-preview', 'tab-photo');
    document.body.classList.add(`tab-${tabId}`);

    el.tabText.classList.remove('active');
    el.tabText.setAttribute('aria-selected', 'false');
    if (el.tabPreview) {
      el.tabPreview.classList.remove('active');
      el.tabPreview.setAttribute('aria-selected', 'false');
    }
    el.tabPhoto.classList.remove('active');
    el.tabPhoto.setAttribute('aria-selected', 'false');

    el.textWorkspace.classList.add('hidden');
    el.textSidebar.classList.add('hidden');
    el.previewWorkspace.classList.add('hidden');
    el.photoWorkspace.classList.add('hidden');
    el.photoSidebar.classList.add('hidden');

    const appSidebar = document.getElementById('app-sidebar');

    if (tabId === 'text') {
      el.tabText.classList.add('active');
      el.tabText.setAttribute('aria-selected', 'true');
      el.textWorkspace.classList.remove('hidden');
      el.textSidebar.classList.remove('hidden');
      if (appSidebar) appSidebar.classList.remove('hidden');
      el.fileExtSpan.textContent = state.extension;
      el.btnFindReplaceToggle.classList.remove('hidden');
      toggleWelcomeVisibility();
    } else if (tabId === 'preview') {
      if (el.tabPreview) {
        el.tabPreview.classList.add('active');
        el.tabPreview.setAttribute('aria-selected', 'true');
      }
      el.previewWorkspace.classList.remove('hidden');
      if (appSidebar) appSidebar.classList.add('hidden');
      el.fileExtSpan.textContent = '.html';
      el.btnFindReplaceToggle.classList.add('hidden');
      el.findReplaceBar.classList.add('hidden');
      updatePreviews(true);
    } else {
      el.tabPhoto.classList.add('active');
      el.tabPhoto.setAttribute('aria-selected', 'true');
      el.photoWorkspace.classList.remove('hidden');
      el.photoSidebar.classList.remove('hidden');
      if (appSidebar) appSidebar.classList.remove('hidden');
      el.fileExtSpan.textContent = state.photo.src ? getPhotoExtension() : '.png';
      el.btnFindReplaceToggle.classList.add('hidden');
      el.findReplaceBar.classList.add('hidden');
    }
  }

  function getPhotoExtension() {
    if (!state.photo.src) return '.png';
    if (state.photo.src.startsWith('data:image/jpeg') || state.photo.src.startsWith('data:image/jpg')) return '.jpg';
    if (state.photo.src.startsWith('data:image/webp')) return '.webp';
    return '.png';
  }

  function toggleWelcomeVisibility() {
    if (state.editorActive) {
      el.welcomeScreen.classList.add('hidden');
      el.editorLayoutWrapper.classList.remove('hidden');
      document.body.classList.add('editor-active');
    } else {
      el.welcomeScreen.classList.remove('hidden');
      el.editorLayoutWrapper.classList.add('hidden');
      document.body.classList.remove('editor-active');
    }
  }

  let splitPreviewDebounceTimer = null;

  function scheduleSplitPreviewUpdate() {
    if (splitPreviewDebounceTimer) {
      clearTimeout(splitPreviewDebounceTimer);
    }
    splitPreviewDebounceTimer = setTimeout(() => {
      if (state.splitViewActive && state.activeTab === 'text') {
        let htmlContent = el.textarea.value;
        if (state.whitespaceVisible) {
          htmlContent = cleanWhitespaceDisplay(htmlContent);
        }
        el.splitPreviewIframe.srcdoc = htmlContent;
      }
    }, 800);
  }

  function parseMarkdown(md) {
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // Parse headers
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
    
    // Parse bold, italic, strike
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    
    // Parse links: [text](url) - sanitized against javascript: and unsafe protocols
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
      const cleanUrl = url.trim();
      if (/^(https?:|mailto:|tel:|#|\/)/i.test(cleanUrl)) {
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return `<span>${text}</span>`;
    });
    
    // Parse code block: ```javascript ... ```
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code: `code`
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Parse horizontal rule: ---
    html = html.replace(/^---$/gm, '<hr>');
    
    // Parse blockquotes: > quote
    html = html.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');
    
    // Parse list items
    html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
    
    // Wrap other lines in paragraphs
    html = html.split('\n').map(line => {
      if (line.trim() === '') return '';
      if (line.startsWith('<h') || line.startsWith('<li') || line.startsWith('<pre') || line.startsWith('<code') || line.startsWith('<hr') || line.startsWith('<blockquote') || line.startsWith('</')) {
        return line;
      }
      return `<p>${line}</p>`;
    }).join('\n');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: var(--text-primary, #1f2937);
            padding: 16px;
            margin: 0;
            background-color: var(--bg-primary, #ffffff);
          }
          @media (prefers-color-scheme: dark) {
            body {
              color: #f3f4f6;
              background-color: #0d0a16;
            }
          }
          h1, h2, h3, h4 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
          }
          h1 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
          a { color: #06b6d4; text-decoration: none; }
          a:hover { text-decoration: underline; }
          code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: rgba(110, 118, 129, 0.2);
            border-radius: 6px;
            font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
          }
          pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: rgba(110, 118, 129, 0.1);
            border-radius: 6px;
          }
          pre code {
            padding: 0;
            background-color: transparent;
            font-size: 100%;
          }
          blockquote {
            padding: 0 1em;
            color: #6b7280;
            border-left: .25em solid #e5e7eb;
            margin: 0 0 16px 0;
          }
          hr {
            height: .25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e5e7eb;
            border: 0;
          }
        </style>
      </head>
      <body>
        \${html}
      </body>
      </html>
    `;
  }

  function updatePreviews(immediate = false) {
    let rawContent = el.textarea.value;
    
    // Clean display markers before rendering to frames
    if (state.whitespaceVisible) {
      rawContent = cleanWhitespaceDisplay(rawContent);
    }
    
    let htmlContent = '';
    
    if (state.editorMode === 'html') {
      htmlContent = rawContent;
    } else if (state.editorMode === 'markdown') {
      htmlContent = parseMarkdown(rawContent);
    } else {
      // For all other code modes or plain text, render as preformatted text
      const escaped = escapeHTML(rawContent);
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
              font-size: 14px;
              line-height: 1.5;
              color: var(--text-primary, #1f2937);
              padding: 16px;
              margin: 0;
              background-color: var(--bg-primary, #ffffff);
              white-space: pre-wrap;
              word-break: break-all;
            }
            @media (prefers-color-scheme: dark) {
              body {
                color: #f3f4f6;
                background-color: #0d0a16;
              }
            }
          </style>
        </head>
        <body>\${escaped}</body>
        </html>
      `;
    }
    
    // Update fullscreen preview iframe
    if (state.activeTab === 'preview') {
      el.fullPreviewIframe.srcdoc = htmlContent;
    }
    
    // Update split view preview iframe if active
    if (state.splitViewActive && state.activeTab === 'text') {
      if (immediate) {
        if (splitPreviewDebounceTimer) {
          clearTimeout(splitPreviewDebounceTimer);
        }
        el.splitPreviewIframe.srcdoc = htmlContent;
      } else {
        scheduleSplitPreviewUpdate();
      }
    }
  }

  // --- TEXT EDITOR LOGIC ---
  function updateLineNumbers() {
    const text = el.textarea.value;
    const lines = text.split('\n');
    const lineCount = lines.length;
    
    let currentLine = 1;
    if (state.relativeLineNumbers) {
      const caretPos = el.textarea.selectionStart;
      currentLine = text.substring(0, caretPos).split('\n').length;
    }
    
    let numbers = '';
    for (let i = 1; i <= lineCount; i++) {
      let lineText = lines[i - 1] || '';
      let marker = '  '; // Spacing for fold widget
      
      if (state.folding !== 'manual') {
        const hasOpen = lineText.includes('{') || lineText.includes('[') || lineText.includes('(') || lineText.includes('<');
        const hasClose = lineText.includes('}') || lineText.includes(']') || lineText.includes(')') || lineText.includes('</');
        
        if (state.folding === 'mark-begin' && hasOpen) {
          marker = '▾ ';
        } else if (state.folding === 'mark-begin-end') {
          if (hasOpen) marker = '▾ ';
          else if (hasClose) marker = '▴ ';
        }
      }
      
      let numVal = i;
      if (state.relativeLineNumbers) {
        numVal = (i === currentLine) ? i : Math.abs(i - currentLine);
      }
      
      // Right align line numbers and fold indicators
      numbers += marker + String(numVal).padStart(3, ' ') + '\n';
    }
    el.lineNumbers.textContent = numbers;
    syncLineNumbersScroll();
    
    updateStatusBar();
  }

  function syncLineNumbersScroll() {
    el.lineNumbers.scrollTop = el.textarea.scrollTop;
  }

  function updateStatusBar() {
    const bar = document.getElementById('editor-status-bar');
    if (!bar) return;
    
    if (!state.editorActive || state.activeTab !== 'text') {
      bar.classList.add('hidden');
      return;
    }
    
    bar.classList.remove('hidden');
    
    const text = el.textarea.value;
    const caretPos = el.textarea.selectionStart;
    const lines = text.substring(0, caretPos).split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    
    let modeText = (state.editorMode || 'text').toUpperCase();
    
    let vimBadge = '';
    if (state.keybindings === 'vim') {
      const vimMode = state.vimMode || 'insert';
      const badgeClass = vimMode === 'normal' ? 'normal' : 'insert';
      vimBadge = `<span class="vim-mode-badge ${badgeClass}">${vimMode}</span> | `;
    }
    
    let keybindingText = '';
    if (state.keybindings && state.keybindings !== 'ace') {
      keybindingText = ` [${state.keybindings.toUpperCase()}]`;
    }
    
    bar.innerHTML = `${vimBadge}${modeText}${keybindingText} | Ln ${line}, Col ${col}`;
  }

  const fontMapping = {
    'monospace': 'var(--font-mono)',
    'sans-serif': 'var(--font-sans)',
    'poppins': "'Poppins', sans-serif",
    'montserrat': "'Montserrat', sans-serif",
    'playfair': "'Playfair Display', serif",
    'merriweather': "'Merriweather', serif",
    'courier-prime': "'Courier Prime', monospace",
    'space-mono': "'Space Mono', monospace"
  };

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  function getPlainTextFromRichHTML(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.innerText || temp.textContent || '';
  }

  function applyFontStyles() {
    if (el.textarea) {
      el.textarea.style.fontSize = state.fontSize;
      const mappedFont = fontMapping[state.fontFamily] || state.fontFamily;
      if (mappedFont.startsWith('var(')) {
        el.textarea.style.fontFamily = varStyle(mappedFont.substring(4, mappedFont.length - 1));
      } else {
        el.textarea.style.fontFamily = mappedFont;
      }
    }
    if (el.richarea) {
      el.richarea.style.fontSize = state.fontSize;
      const mappedFont = fontMapping[state.fontFamily] || state.fontFamily;
      if (mappedFont.startsWith('var(')) {
        el.richarea.style.fontFamily = varStyle(mappedFont.substring(4, mappedFont.length - 1));
      } else {
        el.richarea.style.fontFamily = mappedFont;
      }
    }
  }

  function updateEditorModeDisplay(oldMode) {
    const newMode = state.editorMode;
    
    if (newMode === 'rich') {
      if (el.lineNumbers) el.lineNumbers.style.display = 'none';
      if (el.textarea) el.textarea.style.display = 'none';
      if (el.richarea) el.richarea.style.display = 'block';

      // Sync content from textarea to richarea
      const rawText = el.textarea.value;
      const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(rawText) : rawText;
      if (oldMode === 'html') {
        el.richarea.innerHTML = cleanText;
      } else {
        const escaped = escapeHTML(cleanText);
        el.richarea.innerHTML = escaped.replace(/\n/g, '<br>');
      }
    } else {
      if (state.showLineNumbers && state.showGutter) {
        if (el.lineNumbers) el.lineNumbers.style.display = 'block';
      } else {
        if (el.lineNumbers) el.lineNumbers.style.display = 'none';
      }
      if (el.textarea) el.textarea.style.display = 'block';
      if (el.richarea) el.richarea.style.display = 'none';

      // Sync content from richarea to textarea
      if (oldMode === 'rich') {
        let syncedText;
        if (newMode === 'html') {
          syncedText = el.richarea.innerHTML;
        } else {
          syncedText = getPlainTextFromRichHTML(el.richarea.innerHTML);
        }
        el.textarea.value = state.whitespaceVisible ? convertToWhitespaceDisplay(syncedText) : syncedText;
      }
    }

    if (el.toolbarModeSelector) el.toolbarModeSelector.value = newMode;
    if (el.settingsMode) el.settingsMode.value = newMode;

    updateLineNumbers();
    runAnalytics();
    updatePreviews();
  }

  function setEditorMode(newMode) {
    const oldMode = state.editorMode;
    if (oldMode === newMode) return;

    state.editorMode = newMode;

    const extMap = {
      rich: '.txt', text: '.txt', html: '.html', css: '.css', javascript: '.js',
      typescript: '.ts', json: '.json', python: '.py', sql: '.sql',
      cpp: '.cpp', markdown: '.md'
    };
    state.extension = extMap[newMode] || '.txt';
    if (el.fileExtSpan) el.fileExtSpan.textContent = state.extension;

    updateEditorModeDisplay(oldMode);
    saveSettings();
    showToast(`📝 Mode set to ${newMode.toUpperCase()}`, 'success');
  }

  // --- TEXT TOOLBAR HELPERS ---
  function updateToolbarState() {
    if (state.editorMode !== 'rich') return;
    if (el.btnBold) el.btnBold.classList.toggle('active', document.queryCommandState('bold'));
    if (el.btnItalic) el.btnItalic.classList.toggle('active', document.queryCommandState('italic'));
    if (el.btnUnderline) el.btnUnderline.classList.toggle('active', document.queryCommandState('underline'));
    if (el.btnStrike) el.btnStrike.classList.toggle('active', document.queryCommandState('strikeThrough'));
  }

  function formatRichText(command, value = null) {
    if (el.richarea) el.richarea.focus(); // Focus first to enable selection restore and execCommand on mobile
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    document.execCommand(command, false, value);
    if (el.richarea) el.richarea.focus();
    
    // Re-save range after formatting
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
    if (el.richarea) el.richarea.dispatchEvent(new Event('input'));
    updateToolbarState();
  }

  function wrapText(before, after) {
    let start = el.textarea.selectionStart;
    let end = el.textarea.selectionEnd;
    
    // Restore selection if blurred during toolbar interaction
    if (document.activeElement !== el.textarea && savedTextareaStart !== undefined) {
      start = savedTextareaStart;
      end = savedTextareaEnd;
    }
    
    const value = el.textarea.value;
    const selectedText = value.substring(start, end);
    const wrappedText = before + selectedText + after;
    
    el.textarea.focus();
    el.textarea.setRangeText(wrappedText, start, end, 'select');
    
    // Select original text within tags
    el.textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    
    // Keep saved coordinates in sync
    savedTextareaStart = start + before.length;
    savedTextareaEnd = start + before.length + selectedText.length;
    
    updateLineNumbers();
    runAnalytics();
    updatePreviews();
    
    const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
    historyState.push(cleanText, el.textarea.selectionStart, el.textarea.selectionEnd);
    saveSettings();
  }

  function changeCase(type) {
    if (state.editorMode === 'rich') {
      if (el.richarea) el.richarea.focus(); // Focus first to enable selection restore on mobile
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const sel = window.getSelection();
      if (!sel || !sel.toString()) {
        showToast('⚠️ Please select text to change case', 'error');
        return;
      }
      const selectedText = sel.toString();
      let convertedText = '';
      if (type === 'upper') {
        convertedText = selectedText.toUpperCase();
      } else if (type === 'lower') {
        convertedText = selectedText.toLowerCase();
      } else if (type === 'title') {
        convertedText = selectedText.replace(/\b\w/g, c => c.toUpperCase());
      }
      
      document.execCommand('insertText', false, convertedText);
      el.richarea.focus();
      runAnalytics();
      updatePreviews();
      saveSettings();
      return;
    }

    let start = el.textarea.selectionStart;
    let end = el.textarea.selectionEnd;
    if (document.activeElement !== el.textarea && savedTextareaStart !== undefined) {
      start = savedTextareaStart;
      end = savedTextareaEnd;
    }
    
    if (start === end) {
      showToast('⚠️ Please select text to change case', 'error');
      return;
    }
    
    const value = el.textarea.value;
    const selectedText = value.substring(start, end);
    let convertedText = '';
    
    if (type === 'upper') {
      convertedText = selectedText.toUpperCase();
    } else if (type === 'lower') {
      convertedText = selectedText.toLowerCase();
    } else if (type === 'title') {
      convertedText = selectedText.replace(/\b\w/g, c => c.toUpperCase());
    }
    
    el.textarea.setRangeText(convertedText, start, end, 'select');
    el.textarea.focus();
    el.textarea.setSelectionRange(start, start + convertedText.length);
    
    // Keep saved coordinates in sync
    savedTextareaStart = start;
    savedTextareaEnd = start + convertedText.length;
    
    el.textarea.dispatchEvent(new Event('input'));
  }

  function varStyle(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function runAnalytics() {
    let text = el.textarea.value;
    if (state.whitespaceVisible) {
      text = cleanWhitespaceDisplay(text);
    }
    
    // Characters (including spaces)
    const charCount = text.length;

    // Characters (excluding spaces)
    const charCountNoSpaces = text.replace(/\s/g, '').length;
    
    // Words
    const wordMatches = text.match(/\S+/g);
    const wordCount = wordMatches ? wordMatches.length : 0;
    
    // Lines
    const lineCount = text.split('\n').length;
    
    // Paragraphs
    const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);

    // Sentences
    const sentenceMatches = text.match(/[^.!?]+[.!?]+(\s|$)/g);
    const sentenceCount = sentenceMatches ? sentenceMatches.length : (text.trim().length > 0 ? 1 : 0);
    
    // Reading Time (200 words per minute)
    const readMinutes = Math.ceil(wordCount / 200);
    const readTimeText = readMinutes <= 1 ? '< 1 min' : `${readMinutes} min`;

    // Speaking Time (130 words per minute)
    const speakSeconds = Math.ceil(wordCount / (130 / 60));
    let speakTimeText = '< 1 min';
    if (speakSeconds >= 60) {
      const speakMinutes = Math.ceil(speakSeconds / 60);
      speakTimeText = `${speakMinutes} min`;
    } else if (speakSeconds > 0) {
      speakTimeText = `${speakSeconds} sec`;
    }

    // Update function to sync both ID (sidebar) and Class (mobile on-page) elements
    const setStatText = (key, val) => {
      const elById = document.getElementById(`stat-${key}`);
      if (elById) elById.textContent = val;
      document.querySelectorAll(`.stat-${key}`).forEach(elem => {
        elem.textContent = val;
      });
    };

    setStatText('chars', charCount);
    setStatText('chars-no-spaces', charCountNoSpaces);
    setStatText('words', wordCount);
    setStatText('lines', lineCount);
    setStatText('paragraphs', paragraphs.length);
    setStatText('sentences', sentenceCount);
    setStatText('reading-time', readTimeText);
    setStatText('speaking-time', speakTimeText);
  }

  // --- WHITESPACE VISUALIZER ---
  function convertToWhitespaceDisplay(text) {
    return text.replaceAll(' ', '·').replaceAll('\t', '›').replaceAll('\n', '↵\n');
  }

  function cleanWhitespaceDisplay(text) {
    return text.replaceAll('·', ' ').replaceAll('›', '\t').replaceAll('↵', '');
  }

  function toggleWhitespaceVisible(forceValue) {
    const start = el.textarea.selectionStart;
    const end = el.textarea.selectionEnd;
    const val = el.textarea.value;
    
    if (typeof forceValue === 'boolean') {
      state.whitespaceVisible = forceValue;
    } else {
      state.whitespaceVisible = !state.whitespaceVisible;
    }
    
    if (el.chkShowInvisibles) {
      el.chkShowInvisibles.checked = state.whitespaceVisible;
    }
    
    if (state.whitespaceVisible) {
      el.textarea.value = convertToWhitespaceDisplay(val);
      el.btnToolbarWhitespace.classList.add('active');
      showToast('Spaces (·) and Tabs (›) made visible', 'info');
    } else {
      el.textarea.value = cleanWhitespaceDisplay(val);
      el.btnToolbarWhitespace.classList.remove('active');
      showToast('Whitespace markers hidden', 'info');
    }
    
    el.textarea.focus();
    el.textarea.setSelectionRange(start, end);
    updateLineNumbers();
    saveSettings();
  }

  // --- DISPLAY WRAP & MARGIN CYCLES ---
  function cycleWordWrap() {
    if (state.textWrap === 'on') {
      state.textWrap = 'off';
      showToast('🔤 Word Wrap Disabled (horizontal scroll)', 'info');
    } else {
      state.textWrap = 'on';
      showToast('🔤 Word Wrap Enabled', 'info');
    }
    applyWordWrapMode();
    saveSettings();
  }

  function applyWordWrapMode() {
    if (state.textWrap === 'on') {
      if (el.textarea) el.textarea.classList.add('wrap-text');
      if (el.richarea) el.richarea.classList.add('wrap-text');
      if (el.btnToolbarWrap) el.btnToolbarWrap.classList.add('active');
    } else {
      if (el.textarea) el.textarea.classList.remove('wrap-text');
      if (el.richarea) el.richarea.classList.remove('wrap-text');
      if (el.btnToolbarWrap) el.btnToolbarWrap.classList.remove('active');
    }
  }

  function cyclePrintMargin() {
    if (state.printMargin === 'off') {
      state.printMargin = '80';
      showToast('📏 Print Margin set to 80 characters', 'info');
    } else if (state.printMargin === '80') {
      state.printMargin = '100';
      showToast('📏 Print Margin set to 100 characters', 'info');
    } else {
      state.printMargin = 'off';
      showToast('📏 Print Margin hidden', 'info');
    }
    applyPrintMarginPos();
    saveSettings();
  }

  function applyPrintMarginPos() {
    if (!el.textarea) return;
    el.btnToolbarMargin.classList.remove('active');
    
    let backgrounds = [];
    let backgroundSizes = [];
    
    // 1. Print Margin Guidance Line
    if (state.printMargin !== 'off') {
      const marginChars = parseInt(state.printMargin) || 80;
      backgrounds.push(`linear-gradient(90deg, transparent ${marginChars}ch, var(--border-color) ${marginChars}ch, var(--border-color) calc(${marginChars}ch + 1px), transparent calc(${marginChars}ch + 1px))`);
      backgroundSizes.push('100% 100%');
      el.btnToolbarMargin.classList.add('active');
    }
    
    // 2. Active Line Highlight Row
    if (state.highlightActiveLine) {
      backgrounds.push('linear-gradient(rgba(var(--accent-rgb), 0.03) 24px, transparent 24px)');
      backgroundSizes.push('100% 24px');
    }
    
    if (backgrounds.length > 0) {
      el.textarea.style.backgroundImage = backgrounds.join(', ');
      el.textarea.style.backgroundSize = backgroundSizes.join(', ');
    } else {
      el.textarea.style.backgroundImage = 'none';
      el.textarea.style.backgroundSize = '';
    }
  }

  function cycleTabMode() {
    if (state.tabMode === 'soft4') {
      state.tabMode = 'hard';
      showToast('⌨️ Tab Key: Hard Tab (\\t)', 'info');
    } else if (state.tabMode === 'hard') {
      state.tabMode = 'soft2';
      showToast('⌨️ Tab Key: Soft Tab (2 spaces)', 'info');
    } else {
      state.tabMode = 'soft4';
      showToast('⌨️ Tab Key: Soft Tab (4 spaces)', 'info');
    }
    saveSettings();
  }

  function cycleFontSize() {
    const sizes = ['8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px', '16px', '17px', '18px', '20px', '22px', '24px', '26px', '28px', '32px', '36px', '40px', '48px', '56px', '64px', '72px'];
    let idx = sizes.indexOf(state.fontSize);
    if (idx === -1) idx = sizes.indexOf('16px'); // Fallback if custom value typed
    idx = (idx + 1) % sizes.length;
    state.fontSize = sizes[idx];
    el.fontSizeSelector.value = state.fontSize;
    applyFontStyles();
    saveSettings();
    showToast(`🗛 Font size: ${state.fontSize}`, 'info');
  }

  function cycleThemes() {
    const themes = ['light', 'dark', 'cyberpunk', 'forest'];
    let idx = themes.indexOf(state.theme);
    idx = (idx + 1) % themes.length;
    const nextTheme = themes[idx];
    updateTheme(nextTheme);
    el.themeSelector.value = nextTheme;
    showToast(`🎨 Loaded theme: ${nextTheme}`, 'info');
  }

  function jumpToLineNumber() {
    const lineNoStr = prompt('Go to Line:');
    if (!lineNoStr) return;
    const lineNo = parseInt(lineNoStr);
    if (isNaN(lineNo) || lineNo <= 0) {
      showToast('⚠️ Invalid line number', 'error');
      return;
    }
    
    const text = el.textarea.value;
    const lines = text.split('\n');
    if (lineNo > lines.length) {
      showToast(`⚠️ Line ${lineNo} exceeds total lines (${lines.length})`, 'error');
      return;
    }
    
    let charIndex = 0;
    for (let i = 0; i < lineNo - 1; i++) {
      charIndex += lines[i].length + 1; // +1 for the newline
    }
    
    el.textarea.focus();
    el.textarea.setSelectionRange(charIndex, charIndex);
    
    const lineHeight = parseFloat(getComputedStyle(el.textarea).lineHeight || 24);
    el.textarea.scrollTop = (lineNo - 4) * lineHeight;
    showToast(`➡️ Jumped to line ${lineNo}`, 'info');
  }

  // --- FIND AND REPLACE ---
  function handleFind() {
    const term = el.findInput.value;
    if (!term) {
      showToast('⚠️ Please enter text to search', 'error');
      return;
    }

    if (state.editorMode === 'rich') {
      el.richarea.focus();
      const found = window.find(term, false, false, true, false, false, false);
      if (!found) {
        showToast('🔍 No matches found', 'error');
      }
      return;
    }

    const text = el.textarea.value;
    const regex = new RegExp(escapeRegExp(term), 'gi');
    let match;
    const matches = [];

    while ((match = regex.exec(text)) !== null) {
      matches.push({ index: match.index, text: match[0] });
    }

    if (matches.length === 0) {
      showToast('🔍 No matches found', 'error');
      return;
    }

    if (state.findSelectionIndex >= matches.length) {
      state.findSelectionIndex = 0;
    }

    const currentMatch = matches[state.findSelectionIndex];
    el.textarea.focus();
    el.textarea.setSelectionRange(currentMatch.index, currentMatch.index + currentMatch.text.length);
    
    const row = text.substr(0, currentMatch.index).split('\n').length;
    const lineHeight = parseFloat(getComputedStyle(el.textarea).lineHeight || 24);
    el.textarea.scrollTop = (row - 4) * lineHeight;

    showToast(`🔍 Match ${state.findSelectionIndex + 1} of ${matches.length}`, 'info');
    state.findSelectionIndex++;
  }

  function handleReplace() {
    const term = el.findInput.value;
    const replacement = el.replaceInput.value;
    if (!term) return;

    if (state.editorMode === 'rich') {
      const selection = window.getSelection();
      if (selection.toString().toLowerCase() === term.toLowerCase()) {
        document.execCommand('insertText', false, replacement);
        showToast('✏️ Replaced 1 occurrence', 'success');
        runAnalytics();
        saveSettings();
      } else {
        handleFind();
      }
      return;
    }

    const start = el.textarea.selectionStart;
    const end = el.textarea.selectionEnd;
    const selectedText = el.textarea.value.substring(start, end);

    if (selectedText.toLowerCase() === term.toLowerCase()) {
      el.textarea.setRangeText(replacement, start, end, 'select');
      el.textarea.dispatchEvent(new Event('input'));
      showToast('✏️ Replaced 1 occurrence', 'success');
    } else {
      handleFind();
    }
  }

  function handleReplaceAll() {
    const term = el.findInput.value;
    const replacement = el.replaceInput.value;
    if (!term) return;

    if (state.editorMode === 'rich') {
      let count = 0;
      el.richarea.focus();
      // Move cursor to start
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(el.richarea);
      range.collapse(true);
      selection.addRange(range);
      
      while (window.find(term, false, false, false, false, false, false)) {
        document.execCommand('insertText', false, replacement);
        count++;
      }
      
      if (count === 0) {
        showToast('🔍 No occurrences found to replace', 'error');
      } else {
        showToast(`✏️ Replaced all ${count} occurrences`, 'success');
        runAnalytics();
        saveSettings();
      }
      return;
    }

    const text = el.textarea.value;
    const escapedTerm = escapeRegExp(term);
    const regex = new RegExp(escapedTerm, 'gi');
    
    const count = (text.match(regex) || []).length;
    if (count === 0) {
      showToast('🔍 No occurrences found to replace', 'error');
      return;
    }

    el.textarea.value = text.replace(regex, replacement);
    el.textarea.dispatchEvent(new Event('input'));
    showToast(`✏️ Replaced all ${count} occurrences`, 'success');
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // --- FILE STORAGE OPERATIONS ---
  function createNewFile() {
    if (state.activeTab === 'text') {
      if (el.textarea.value && !confirm('Are you sure you want to discard current changes?')) {
        return;
      }
      el.textarea.value = '';
      if (el.richarea) el.richarea.innerHTML = '';
      state.filename = 'untitled';
      state.extension = '.txt';
      el.filenameInput.value = state.filename;
      el.fileExtSpan.textContent = state.extension;
      state.editorActive = true;
      updateLineNumbers();
      runAnalytics();
      updatePreviews();
      toggleWelcomeVisibility();
      historyState.push('', 0, 0);
      saveSettings();
      showToast('📄 Created new text document', 'success');
    } else {
      if (state.photo.src && !confirm('Are you sure you want to delete the current photo?')) {
        return;
      }
      clearPhoto();
      showToast('🖼️ Cleared photo editor workspace', 'success');
    }
  }

  function openFile() {
    el.fileSelector.click();
  }

  function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '.txt';
    const baseName = nameParts.join('.');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        state.photo.src = evt.target.result;
        state.filename = baseName;
        state.extension = ext;
        el.filenameInput.value = baseName;
        
        switchTab('photo');
        loadPhoto(evt.target.result);
        saveSettings();
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = function(evt) {
        let textVal = evt.target.result;
        state.filename = baseName;
        state.extension = ext;
        
        // Automatic mode switching based on file extension
        const extToMode = {
          '.html': 'html',
          '.css': 'css',
          '.js': 'javascript',
          '.ts': 'typescript',
          '.json': 'json',
          '.py': 'python',
          '.sql': 'sql',
          '.cpp': 'cpp',
          '.md': 'markdown'
        };
        const targetMode = extToMode[ext.toLowerCase()];
        if (targetMode) {
          setEditorMode(targetMode);
        } else if (state.editorMode !== 'rich' && state.editorMode !== 'text') {
          setEditorMode('text');
        }
        
        el.filenameInput.value = baseName;
        el.fileExtSpan.textContent = ext;
        
        if (state.whitespaceVisible) {
          textVal = convertToWhitespaceDisplay(textVal);
        }
        el.textarea.value = textVal;
        if (state.editorMode === 'rich') {
          if (ext === '.html') {
            el.richarea.innerHTML = textVal;
          } else {
            el.richarea.innerHTML = escapeHTML(textVal).replace(/\n/g, '<br>');
          }
        }
        
        state.editorActive = true;
        switchTab('text');
        updateLineNumbers();
        runAnalytics();
        updatePreviews();
        toggleWelcomeVisibility();
        
        const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
        historyState.push(cleanText, el.textarea.selectionStart, el.textarea.selectionEnd);
        saveSettings();
        showToast(`📁 Loaded ${file.name}`, 'success');
      };
      reader.readAsText(file);
    }
    el.fileSelector.value = '';
  }

  function downloadFile() {
    if (state.activeTab === 'text') {
      let text = el.textarea.value;
      if (state.editorMode === 'rich' && state.extension === '.html') {
        text = el.richarea.innerHTML;
      }
      if (state.whitespaceVisible) {
        text = cleanWhitespaceDisplay(text);
      }
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.filename + state.extension;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`💾 Downloaded ${state.filename}${state.extension}`, 'success');
    } else {
      if (!state.photo.src) {
        showToast('⚠️ No photo to save!', 'error');
        return;
      }
      exportPhoto();
    }
  }

  function copyTextToClipboard() {
    if (state.activeTab !== 'text') {
      showToast('⚠️ Copy feature is only for text files', 'error');
      return;
    }
    let text = el.textarea.value;
    if (state.whitespaceVisible) {
      text = cleanWhitespaceDisplay(text);
    }
    navigator.clipboard.writeText(text)
      .then(() => showToast('📋 Content copied to clipboard!', 'success'))
      .catch(() => showToast('❌ Failed to copy to clipboard', 'error'));
  }

  // --- PHOTO EDITOR ENGINE ---
  function loadPhoto(dataUrl) {
    el.photoDropzone.classList.add('hidden');
    el.imageWrapper.classList.remove('hidden');
    if (el.btnMobileSidebarTogglePhoto) {
      el.btnMobileSidebarTogglePhoto.classList.remove('hidden');
    }
    el.imagePreview.src = dataUrl;
    el.fileExtSpan.textContent = getPhotoExtension();
    resetFilters();
    updatePhotoTransformations();
    showToast('🖼️ Photo loaded successfully', 'success');
  }

  function clearPhoto() {
    state.photo.src = null;
    el.imagePreview.src = '';
    el.imageWrapper.classList.add('hidden');
    if (el.btnMobileSidebarTogglePhoto) {
      el.btnMobileSidebarTogglePhoto.classList.add('hidden');
    }
    el.photoDropzone.classList.remove('hidden');
    el.fileExtSpan.textContent = '.png';
    resetFilters();
  }

  function resetFilters() {
    state.photo.filters = {
      brightness: 100,
      contrast: 100,
      saturate: 100,
      grayscale: 0,
      sepia: 0,
      invert: 0,
      blur: 0,
      hueRotate: 0,
      opacity: 100
    };
    state.photo.rotation = 0;
    state.photo.flipH = 1;
    state.photo.flipV = 1;

    if (el.filterBrightness) el.filterBrightness.value = 100;
    if (el.filterContrast) el.filterContrast.value = 100;
    if (el.filterSaturate) el.filterSaturate.value = 100;
    if (el.filterGrayscale) el.filterGrayscale.value = 0;
    if (el.filterSepia) el.filterSepia.value = 0;
    if (el.filterInvert) el.filterInvert.value = 0;
    if (el.filterBlur) el.filterBlur.value = 0;
    if (el.filterHueRotate) el.filterHueRotate.value = 0;
    if (el.filterOpacity) el.filterOpacity.value = 100;

    applyPhotoFilters();
    updatePhotoTransformations();
  }

  function applyPhotoFilters() {
    const f = state.photo.filters;
    const filterString = `
      brightness(${f.brightness}%)
      contrast(${f.contrast}%)
      saturate(${f.saturate}%)
      grayscale(${f.grayscale}%)
      sepia(${f.sepia}%)
      invert(${f.invert}%)
      blur(${f.blur}px)
      hue-rotate(${f.hueRotate}deg)
      opacity(${f.opacity}%)
    `.replace(/\s+/g, ' ').trim();

    if (el.imagePreview) el.imagePreview.style.filter = filterString;
    
    if (el.valBrightness) el.valBrightness.textContent = `${f.brightness}%`;
    if (el.valContrast) el.valContrast.textContent = `${f.contrast}%`;
    if (el.valSaturate) el.valSaturate.textContent = `${f.saturate}%`;
    if (el.valGrayscale) el.valGrayscale.textContent = `${f.grayscale}%`;
    if (el.valSepia) el.valSepia.textContent = `${f.sepia}%`;
    if (el.valInvert) el.valInvert.textContent = `${f.invert}%`;
    if (el.valBlur) el.valBlur.textContent = `${f.blur}px`;
    if (el.valHueRotate) el.valHueRotate.textContent = `${f.hueRotate}°`;
    if (el.valOpacity) el.valOpacity.textContent = `${f.opacity}%`;
  }

  function updatePhotoTransformations() {
    const scaleX = state.photo.flipH;
    const scaleY = state.photo.flipV;
    const rotate = state.photo.rotation;
    if (el.imagePreview) {
      el.imagePreview.style.transform = `rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`;
    }
  }

  function handleFilterSliderChange(e) {
    let id = e.target.id.replace('filter-', '');
    // Convert kebab-case (e.g. hue-rotate) to camelCase (e.g. hueRotate)
    id = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    state.photo.filters[id] = parseInt(e.target.value);
    applyPhotoFilters();
  }

  function rotatePhoto() {
    state.photo.rotation = (state.photo.rotation + 90) % 360;
    updatePhotoTransformations();
  }

  function flipPhotoH() {
    state.photo.flipH = state.photo.flipH === 1 ? -1 : 1;
    updatePhotoTransformations();
  }

  function flipPhotoV() {
    state.photo.flipV = state.photo.flipV === 1 ? -1 : 1;
    updatePhotoTransformations();
  }

  function isNativeCanvasFilterSupported() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx || !('filter' in ctx)) return false;
      ctx.filter = 'brightness(50%)';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return data[0] < 200;
    } catch (e) {
      return false;
    }
  }

  function boxBlur(imageData, width, height, radius) {
    if (radius <= 0) return;
    const data = imageData.data;
    const temp = new Uint8ClampedArray(data.length);
    temp.set(data);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
        let count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) {
            const idx = (y * width + nx) * 4;
            rSum += temp[idx];
            gSum += temp[idx+1];
            bSum += temp[idx+2];
            aSum += temp[idx+3];
            count++;
          }
        }
        const destIdx = (y * width + x) * 4;
        data[destIdx] = rSum / count;
        data[destIdx+1] = gSum / count;
        data[destIdx+2] = bSum / count;
        data[destIdx+3] = aSum / count;
      }
    }

    // Copy back to temp for vertical pass
    temp.set(data);

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height) {
            const idx = (ny * width + x) * 4;
            rSum += temp[idx];
            gSum += temp[idx+1];
            bSum += temp[idx+2];
            aSum += temp[idx+3];
            count++;
          }
        }
        const destIdx = (y * width + x) * 4;
        data[destIdx] = rSum / count;
        data[destIdx+1] = gSum / count;
        data[destIdx+2] = bSum / count;
        data[destIdx+3] = aSum / count;
      }
    }
  }

  function applyCanvasFiltersFallback(canvas, ctx, f) {
    const isDefault = f.brightness === 100 &&
                      f.contrast === 100 &&
                      f.saturate === 100 &&
                      f.grayscale === 0 &&
                      f.sepia === 0 &&
                      f.invert === 0 &&
                      f.blur === 0 &&
                      f.hueRotate === 0 &&
                      f.opacity === 100;
    if (isDefault) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const len = data.length;

    const brightness = f.brightness / 100;
    const contrast = f.contrast / 100;
    const grayscale = f.grayscale / 100;
    const sepia = f.sepia / 100;
    const invert = f.invert / 100;
    const opacity = f.opacity / 100;
    const saturate = f.saturate / 100;
    const hueRotate = (f.hueRotate % 360 + 360) % 360;

    let cosVal = 1, sinVal = 0;
    if (hueRotate !== 0) {
      const rad = hueRotate * Math.PI / 180;
      cosVal = Math.cos(rad);
      sinVal = Math.sin(rad);
    }
    const hueMatrix = hueRotate === 0 ? null : [
      0.213 + cosVal*0.787 - sinVal*0.213,  0.715 - cosVal*0.715 - sinVal*0.715,  0.072 - cosVal*0.072 + sinVal*0.928,
      0.213 - cosVal*0.213 + sinVal*0.143,  0.715 + cosVal*0.285 + sinVal*0.140,  0.072 - cosVal*0.072 - sinVal*0.283,
      0.213 - cosVal*0.213 - sinVal*0.787,  0.715 - cosVal*0.715 + sinVal*0.715,  0.072 + cosVal*0.928 + sinVal*0.072
    ];

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i+1];
      let b = data[i+2];
      let a = data[i+3];

      // Invert
      if (invert > 0) {
        r = r * (1 - invert) + (255 - r) * invert;
        g = g * (1 - invert) + (255 - g) * invert;
        b = b * (1 - invert) + (255 - b) * invert;
      }

      // Grayscale
      if (grayscale > 0) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = r * (1 - grayscale) + gray * grayscale;
        g = g * (1 - grayscale) + gray * grayscale;
        b = b * (1 - grayscale) + gray * grayscale;
      }

      // Sepia
      if (sepia > 0) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = r * (1 - sepia) + sr * sepia;
        g = g * (1 - sepia) + sg * sepia;
        b = b * (1 - sepia) + sb * sepia;
      }

      // Brightness
      if (brightness !== 1) {
        r *= brightness;
        g *= brightness;
        b *= brightness;
      }

      // Contrast
      if (contrast !== 1) {
        r = (r - 128) * contrast + 128;
        g = (g - 128) * contrast + 128;
        b = (b - 128) * contrast + 128;
      }

      // Saturate
      if (saturate !== 1) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = gray + (r - gray) * saturate;
        g = gray + (g - gray) * saturate;
        b = gray + (b - gray) * saturate;
      }

      // Hue-rotate
      if (hueMatrix) {
        const hr = hueMatrix[0]*r + hueMatrix[1]*g + hueMatrix[2]*b;
        const hg = hueMatrix[3]*r + hueMatrix[4]*g + hueMatrix[5]*b;
        const hb = hueMatrix[6]*r + hueMatrix[7]*g + hueMatrix[8]*b;
        r = hr;
        g = hg;
        b = hb;
      }

      // Opacity
      if (opacity !== 1) {
        a *= opacity;
      }

      data[i] = Math.min(255, Math.max(0, r));
      data[i+1] = Math.min(255, Math.max(0, g));
      data[i+2] = Math.min(255, Math.max(0, b));
      data[i+3] = Math.min(255, Math.max(0, a));
    }

    ctx.putImageData(imgData, 0, 0);

    // Blur (applied using box blur on final data)
    if (f.blur > 0) {
      const blurredData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      boxBlur(blurredData, canvas.width, canvas.height, Math.round(f.blur));
      ctx.putImageData(blurredData, 0, 0);
    }
  }

  function exportPhoto() {
    showToast('⚙️ Processing image details...', 'info');
    
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Keep canvas dimensions safe for iOS Safari memory constraints (max 2048px on either side)
      const MAX_SIDE = 2048;
      let targetWidth = img.width;
      let targetHeight = img.height;
      if (targetWidth > MAX_SIDE || targetHeight > MAX_SIDE) {
        const ratio = Math.min(MAX_SIDE / targetWidth, MAX_SIDE / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      }

      const isRotated90or270 = state.photo.rotation === 90 || state.photo.rotation === 270;
      const width = isRotated90or270 ? targetHeight : targetWidth;
      const height = isRotated90or270 ? targetWidth : targetHeight;

      canvas.width = width;
      canvas.height = height;

      const f = state.photo.filters;
      
      const hasNativeFilter = isNativeCanvasFilterSupported();
      if (hasNativeFilter) {
        ctx.filter = `
          brightness(${f.brightness}%)
          contrast(${f.contrast}%)
          saturate(${f.saturate}%)
          grayscale(${f.grayscale}%)
          sepia(${f.sepia}%)
          invert(${f.invert}%)
          blur(${f.blur}px)
          hue-rotate(${f.hueRotate}deg)
          opacity(${f.opacity}%)
        `.replace(/\s+/g, ' ').trim();
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((state.photo.rotation * Math.PI) / 180);
      ctx.scale(state.photo.flipH, state.photo.flipV);
      ctx.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);

      if (!hasNativeFilter) {
        // Reset transform to apply pixel manipulation correctly on the flat bitmap
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        applyCanvasFiltersFallback(canvas, ctx, f);
      }

      const ext = getPhotoExtension();
      const mime = ext === '.jpg' ? 'image/jpeg' : `image/${ext.replace('.', '')}`;
      
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.filename}_edited${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('🖼️ Photo downloaded successfully!', 'success');
      }, mime, 0.92);
    };
    img.src = state.photo.src;
  }



  // --- DRAG AND DROP ---
  function setupDragAndDrop() {
    // Prevent default drag behaviors for window (to avoid browser opening files dropped outside targets)
    ['dragenter', 'dragover', 'dragleave'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    // Handle drag/drop styles and drop permissions directly on the photo dropzone
    if (el.photoDropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        el.photoDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.photoDropzone.style.borderColor = 'var(--accent-color)';
          el.photoDropzone.style.background = 'rgba(var(--accent-rgb), 0.04)';
        }, false);
      });

      el.photoDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.photoDropzone.style.borderColor = 'var(--border-color)';
        el.photoDropzone.style.background = 'transparent';
      }, false);

      el.photoDropzone.addEventListener('drop', (e) => {
        el.photoDropzone.style.borderColor = 'var(--border-color)';
        el.photoDropzone.style.background = 'transparent';
      }, false);
    }

    // Consolidated single drop listener on window for all file uploads (images and texts)
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const dt = e.dataTransfer;
      const file = dt && dt.files ? dt.files[0] : null;
      if (!file) return;

      const nameParts = file.name.split('.');
      const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '.txt';
      const baseName = nameParts.join('.');
      const extLower = ext.toLowerCase();
      const isImage = (file.type && file.type.startsWith('image/')) || 
                      ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(extLower);

      if (isImage) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          state.photo.src = evt.target.result;
          state.filename = baseName;
          state.extension = ext;
          el.filenameInput.value = baseName;
          switchTab('photo');
          loadPhoto(evt.target.result);
          saveSettings();
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = function(evt) {
          let textVal = evt.target.result;
          state.filename = baseName;
          state.extension = ext;
          
          // Automatic mode switching based on file extension
          const extToMode = {
            '.html': 'html',
            '.css': 'css',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.json': 'json',
            '.py': 'python',
            '.sql': 'sql',
            '.cpp': 'cpp',
            '.md': 'markdown'
          };
          const targetMode = extToMode[ext.toLowerCase()];
          if (targetMode) {
            setEditorMode(targetMode);
          } else if (state.editorMode !== 'rich' && state.editorMode !== 'text') {
            setEditorMode('text');
          }
          
          el.filenameInput.value = baseName;
          el.fileExtSpan.textContent = ext;
          
          if (state.whitespaceVisible) {
            textVal = convertToWhitespaceDisplay(textVal);
          }
          el.textarea.value = textVal;
          if (state.editorMode === 'rich') {
            if (ext === '.html') {
              el.richarea.innerHTML = textVal;
            } else {
              el.richarea.innerHTML = escapeHTML(textVal).replace(/\n/g, '<br>');
            }
          }
          
          state.editorActive = true;
          switchTab('text');
          updateLineNumbers();
          runAnalytics();
          updatePreviews();
          toggleWelcomeVisibility();
          
          const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
          historyState.push(cleanText, el.textarea.selectionStart, el.textarea.selectionEnd);
          saveSettings();
          showToast(`📁 Loaded ${file.name}`, 'success');
        };
        reader.readAsText(file);
      }
    }, false);
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Welcome Panel triggers
    el.btnWelcomeOpenComp.addEventListener('click', openFile);
    el.btnWelcomeCreate.addEventListener('click', () => {
      state.editorActive = true;
      toggleWelcomeVisibility();
      if (state.editorMode === 'rich') {
        if (el.richarea) el.richarea.focus();
      } else {
        if (el.textarea) el.textarea.focus();
      }
    });

    // Filename Renaming
    el.filenameInput.addEventListener('input', (e) => {
      state.filename = e.target.value.trim() || 'untitled';
      saveSettings();
    });

    // Tab toggles
    el.tabText.addEventListener('click', () => switchTab('text'));
    if (el.tabPreview) {
      el.tabPreview.addEventListener('click', () => switchTab('preview'));
    }
    el.tabPhoto.addEventListener('click', () => switchTab('photo'));

    if (el.btnFullscreenPreview) {
      el.btnFullscreenPreview.addEventListener('click', () => {
        switchTab('preview');
      });
    }

    // Prevent focus loss on formatting buttons to keep selection active in visual editor
    // Prevent focus loss on formatting buttons to keep selection active in visual editor
    const preventFocusLoss = (btn) => {
      if (btn) {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });
      }
    };
    [el.btnBold, el.btnItalic, el.btnUnderline, el.btnStrike, el.btnH1, el.btnH2, el.btnLink, el.btnUpper, el.btnLower, el.btnTitle].forEach(preventFocusLoss);

    // Track selection changes inside the raw textarea
    const saveTextareaSelection = () => {
      if (document.activeElement === el.textarea) {
        savedTextareaStart = el.textarea.selectionStart;
        savedTextareaEnd = el.textarea.selectionEnd;
      }
    };
    if (el.textarea) {
      el.textarea.addEventListener('keyup', saveTextareaSelection);
      el.textarea.addEventListener('mouseup', saveTextareaSelection);
      el.textarea.addEventListener('touchend', saveTextareaSelection);
      el.textarea.addEventListener('focus', saveTextareaSelection);
      el.textarea.addEventListener('input', saveTextareaSelection);
    }

    // Monitor toolbar interaction state to prevent focus/selection resetting on mobile touch
    if (el.editorToolbar) {
      el.editorToolbar.addEventListener('pointerdown', (e) => {
        state.isInteractingWithToolbar = true;
      });
      el.editorToolbar.addEventListener('touchstart', (e) => {
        state.isInteractingWithToolbar = true;
      }, { passive: true });
    }

    // Also monitor popover interactions to prevent touch selection loss when selecting options
    const popoverDivs = [document.getElementById('popover-more'), document.getElementById('popover-theme')];
    popoverDivs.forEach(pop => {
      if (pop) {
        pop.addEventListener('pointerdown', (e) => {
          state.isInteractingWithToolbar = true;
        });
        pop.addEventListener('touchstart', (e) => {
          state.isInteractingWithToolbar = true;
        }, { passive: true });
      }
    });

    const resetToolbarInteraction = () => {
      setTimeout(() => {
        state.isInteractingWithToolbar = false;
      }, 150);
    };

    window.addEventListener('pointerup', resetToolbarInteraction);
    window.addEventListener('touchend', resetToolbarInteraction, { passive: true });
    window.addEventListener('pointercancel', resetToolbarInteraction);
    window.addEventListener('touchcancel', resetToolbarInteraction, { passive: true });

    // Toolbar state sync & selection range tracking
    const saveActiveRange = () => {
      if (state.isInteractingWithToolbar) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.richarea && el.richarea.contains(range.commonAncestorContainer)) {
          savedRange = range.cloneRange();
        }
      }
    };
    el.richarea.addEventListener('keyup', saveActiveRange);
    el.richarea.addEventListener('mouseup', saveActiveRange);
    el.richarea.addEventListener('touchend', saveActiveRange);

    document.addEventListener('selectionchange', () => {
      if (state.isInteractingWithToolbar) return;
      const sel = window.getSelection();
      const isInsideRich = (document.activeElement === el.richarea || el.richarea.contains(document.activeElement)) ||
        (sel && sel.rangeCount > 0 && el.richarea.contains(sel.getRangeAt(0).commonAncestorContainer));
      if (isInsideRich) {
        updateToolbarState();
        if (sel.rangeCount > 0) {
          savedRange = sel.getRangeAt(0).cloneRange();
        }
      }
    });

    el.richarea.addEventListener('keyup', updateToolbarState);
    el.richarea.addEventListener('mouseup', updateToolbarState);
    el.richarea.addEventListener('focus', updateToolbarState);

    // Formatting Toolbar Event Listeners
    el.btnBold.addEventListener('click', () => {
      if (state.editorMode === 'rich') {
        formatRichText('bold');
      } else if (state.editorMode === 'markdown') {
        wrapText('**', '**');
      } else {
        wrapText('<b>', '</b>');
      }
    });
    el.btnItalic.addEventListener('click', () => {
      if (state.editorMode === 'rich') {
        formatRichText('italic');
      } else if (state.editorMode === 'markdown') {
        wrapText('*', '*');
      } else {
        wrapText('<i>', '</i>');
      }
    });
    el.btnUnderline.addEventListener('click', () => {
      if (state.editorMode === 'rich') {
        formatRichText('underline');
      } else {
        wrapText('<u>', '</u>');
      }
    });
    el.btnStrike.addEventListener('click', () => {
      if (state.editorMode === 'rich') {
        formatRichText('strikeThrough');
      } else if (state.editorMode === 'markdown') {
        wrapText('~~', '~~');
      } else {
        wrapText('<s>', '</s>');
      }
    });
    el.btnH1.addEventListener('click', () => {
      if (state.editorMode === 'rich') {
        formatRichText('formatBlock', '<h1>');
      } else if (state.editorMode === 'markdown') {
        wrapText('# ', '');
      } else {
        wrapText('<h1>', '</h1>');
      }
    });
    el.btnH2.addEventListener('click', () => {
      if (state.editorMode === 'rich') {
        formatRichText('formatBlock', '<h2>');
      } else if (state.editorMode === 'markdown') {
        wrapText('## ', '');
      } else {
        wrapText('<h2>', '</h2>');
      }
    });
    el.btnLink.addEventListener('click', () => {
      const url = prompt('Enter link URL (e.g. https://google.com):', 'https://');
      if (url) {
        if (state.editorMode === 'rich') {
          formatRichText('createLink', url);
        } else if (state.editorMode === 'markdown') {
          wrapText('[', `](${url})`);
        } else {
          wrapText(`<a href="${url}" target="_blank">`, '</a>');
        }
      }
    });
    el.btnUpper.addEventListener('click', () => changeCase('upper'));
    el.btnLower.addEventListener('click', () => changeCase('lower'));
    el.btnTitle.addEventListener('click', () => changeCase('title'));
    
    el.btnSplitToggle.addEventListener('click', () => {
      state.splitViewActive = !state.splitViewActive;
      if (state.splitViewActive) {
        el.btnSplitToggle.classList.add('active');
        el.splitPreviewContainer.classList.remove('hidden');
        updatePreviews();
      } else {
        el.btnSplitToggle.classList.remove('active');
        el.splitPreviewContainer.classList.add('hidden');
      }
      saveSettings();
    });

    // Advanced Editor preferences triggers
    el.btnToolbarUndo.addEventListener('click', () => {
      if (historyState.undo(el.textarea)) {
        updateLineNumbers();
        runAnalytics();
        updatePreviews();
        saveSettings();
        showToast('↩️ Undo action', 'info');
      } else {
        showToast('⚠️ No actions to undo', 'error');
      }
    });
    
    el.btnToolbarRedo.addEventListener('click', () => {
      if (historyState.redo(el.textarea)) {
        updateLineNumbers();
        runAnalytics();
        updatePreviews();
        saveSettings();
        showToast('↪️ Redo action', 'info');
      } else {
        showToast('⚠️ No actions to redo', 'error');
      }
    });

    el.btnToolbarPrint.addEventListener('click', () => {
      window.print();
    });


    el.btnToolbarWrap.addEventListener('click', cycleWordWrap);
    
    el.btnToolbarLines.addEventListener('click', () => {
      const isHiddenNow = !el.lineNumbers.classList.contains('hidden');
      state.showLineNumbers = !isHiddenNow;
      state.showGutter = !isHiddenNow;
      
      if (isHiddenNow) {
        el.lineNumbers.classList.add('hidden');
        el.btnToolbarLines.classList.remove('active');
        el.lineNumbers.style.display = 'none';
      } else {
        el.lineNumbers.classList.remove('hidden');
        el.btnToolbarLines.classList.add('active');
        if (state.editorMode !== 'rich') {
          el.lineNumbers.style.display = 'block';
        }
      }
      
      if (el.chkLineNumbers) el.chkLineNumbers.checked = !isHiddenNow;
      if (el.chkShowGutter) el.chkShowGutter.checked = !isHiddenNow;
      
      updateLineNumbers();
      saveSettings();
      showToast(isHiddenNow ? '🔢 Line numbers hidden' : '🔢 Line numbers visible', 'info');
    });

    el.btnToolbarMargin.addEventListener('click', cyclePrintMargin);
    el.btnToolbarTab.addEventListener('click', cycleTabMode);
    el.btnToolbarWhitespace.addEventListener('click', toggleWhitespaceVisible);
    el.btnToolbarShortcuts.addEventListener('click', () => {
      el.shortcutsDialog.showModal();
    });
    el.btnToolbarGoToLine.addEventListener('click', jumpToLineNumber);
    // Sidebar Toggling Event Listeners (desktop FAB, mobile text inline button, and mobile photo inline button)
    const toggleButtons = [el.btnToolbarSidebar, document.getElementById('btn-mobile-sidebar-toggle'), el.btnMobileSidebarTogglePhoto];
    toggleButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          if (el.appSidebar) {
            el.appSidebar.classList.toggle('collapsed');
            const isCollapsed = el.appSidebar.classList.contains('collapsed');
            
            if (el.btnToolbarSidebar) el.btnToolbarSidebar.classList.toggle('active', !isCollapsed);
            const mobBtn = document.getElementById('btn-mobile-sidebar-toggle');
            if (mobBtn) mobBtn.classList.toggle('active', !isCollapsed);
            if (el.btnMobileSidebarTogglePhoto) el.btnMobileSidebarTogglePhoto.classList.toggle('active', !isCollapsed);
            
            document.body.classList.toggle('sidebar-collapsed', isCollapsed);
            safeStorage.setItem('et_sidebar_collapsed', isCollapsed);
          }
        });
      }
    });

    // Mobile Sidebar Close Button
    const mobileCloseBtn = document.getElementById('btn-mobile-sidebar-close');
    if (mobileCloseBtn) {
      mobileCloseBtn.addEventListener('click', () => {
        if (el.appSidebar) {
          el.appSidebar.classList.add('collapsed');
          if (el.btnToolbarSidebar) el.btnToolbarSidebar.classList.remove('active');
          const mobBtn = document.getElementById('btn-mobile-sidebar-toggle');
          if (mobBtn) mobBtn.classList.remove('active');
          if (el.btnMobileSidebarTogglePhoto) el.btnMobileSidebarTogglePhoto.classList.remove('active');
          document.body.classList.add('sidebar-collapsed');
          safeStorage.setItem('et_sidebar_collapsed', 'true');
        }
      });
    }

    // Header buttons
    el.btnNew.addEventListener('click', createNewFile);
    el.btnOpen.addEventListener('click', openFile);
    el.btnSave.addEventListener('click', downloadFile);
    el.btnCopy.addEventListener('click', copyTextToClipboard);
    el.fileSelector.addEventListener('change', handleFileSelection);

    // Theme Switcher
    if (el.themeSelector) {
      el.themeSelector.addEventListener('change', (e) => {
        updateTheme(e.target.value);
      });
    }

    // GDPR cookie banner accept/decline
    if (el.btnCookieAccept) {
      el.btnCookieAccept.addEventListener('click', () => {
        safeStorage.setItem('et_cookies', 'accepted');
        el.cookieBanner.classList.add('hidden');
        showToast('🍪 Cookie preferences saved: Accepted All', 'success');
      });
    }
    
    if (el.btnCookieDecline) {
      el.btnCookieDecline.addEventListener('click', () => {
        safeStorage.setItem('et_cookies', 'declined');
        el.cookieBanner.classList.add('hidden');
        showToast('🍪 Cookie preferences saved: Declined optional', 'info');
      });
    }

    // Find and Replace Widget Toggle
    const handleFindToggle = () => {
      el.findReplaceBar.classList.toggle('hidden');
      if (!el.findReplaceBar.classList.contains('hidden')) {
        el.findInput.focus();
        state.findSelectionIndex = 0;
      }
    };
    if (el.btnFindReplaceToggle) {
      el.btnFindReplaceToggle.addEventListener('click', handleFindToggle);
    }
    if (el.btnFindReplaceToggleHeader) {
      el.btnFindReplaceToggleHeader.addEventListener('click', handleFindToggle);
    }

    el.btnCloseFind.addEventListener('click', () => {
      el.findReplaceBar.classList.add('hidden');
    });

    // Find Actions
    el.btnFindNext.addEventListener('click', handleFind);
    el.btnReplace.addEventListener('click', handleReplace);
    el.btnReplaceAll.addEventListener('click', handleReplaceAll);
    el.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleFind();
    });
    el.findInput.addEventListener('input', () => {
      state.findSelectionIndex = 0;
    });

    // Rich editor visual area input events and syncs
    let richInputDebounceTimer;
    if (el.richarea) {
      el.richarea.addEventListener('input', () => {
        state.findSelectionIndex = 0;
        
        if (state.editorMode === 'rich') {
          let syncedText;
          if (state.extension === '.html') {
            syncedText = el.richarea.innerHTML;
          } else {
            syncedText = getPlainTextFromRichHTML(el.richarea.innerHTML);
          }
          el.textarea.value = state.whitespaceVisible ? convertToWhitespaceDisplay(syncedText) : syncedText;
        }
        
        updateLineNumbers();
        runAnalytics();
        updatePreviews();
        toggleWelcomeVisibility();
        
        clearTimeout(richInputDebounceTimer);
        richInputDebounceTimer = setTimeout(() => {
          const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
          historyState.push(cleanText, 0, 0);
        }, 300);
        
        saveSettings();
      });
    }

    // Textarea key actions & syncs
    let inputDebounceTimer;
    el.textarea.addEventListener('input', () => {
      state.findSelectionIndex = 0;

      // If whitespace visibility is on, convert any newly typed standard spaces/tabs/newlines in real-time
      if (state.whitespaceVisible) {
        const start = el.textarea.selectionStart;
        const end = el.textarea.selectionEnd;
        const rawText = el.textarea.value;
        
        const clean = cleanWhitespaceDisplay(rawText);
        const converted = convertToWhitespaceDisplay(clean);
        
        if (rawText !== converted) {
          el.textarea.value = converted;
          const diff = converted.length - rawText.length;
          el.textarea.setSelectionRange(start + diff, end + diff);
        }
      }

      updateLineNumbers();
      runAnalytics();
      updatePreviews();
      toggleWelcomeVisibility();
      
      // Debounced push to history stack
      clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => {
        const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
        historyState.push(cleanText, el.textarea.selectionStart, el.textarea.selectionEnd);
      }, 300);
      
      saveSettings();
    });
    el.textarea.addEventListener('scroll', syncLineNumbersScroll);

    // Textarea keydown interceptors (Tab, Enter, Quotes, Brackets, Keybinding emulators)
    el.textarea.addEventListener('keydown', (e) => {
      const start = el.textarea.selectionStart;
      const end = el.textarea.selectionEnd;
      const val = el.textarea.value;

      // 1. EMACS KEYBINDINGS INTERCEPTOR
      if (state.keybindings === 'emacs') {
        // Ctrl-K (kill-line): cuts from cursor to end of line
        if (e.ctrlKey && e.key === 'k') {
          e.preventDefault();
          const lineEndIndex = val.indexOf('\n', start);
          const cutEnd = lineEndIndex === -1 ? val.length : lineEndIndex;
          state.emacsKillRing = val.substring(start, cutEnd);
          el.textarea.value = val.substring(0, start) + val.substring(cutEnd);
          el.textarea.setSelectionRange(start, start);
          el.textarea.dispatchEvent(new Event('input'));
          return;
        }
        // Ctrl-Y (yank): paste killed text
        if (e.ctrlKey && e.key === 'y') {
          e.preventDefault();
          const insertVal = state.emacsKillRing || '';
          el.textarea.value = val.substring(0, start) + insertVal + val.substring(end);
          el.textarea.setSelectionRange(start + insertVal.length, start + insertVal.length);
          el.textarea.dispatchEvent(new Event('input'));
          return;
        }
      }

      // 2. VSCODE / SUBLIME SHORTCUTS INTERCEPTOR
      if (state.keybindings === 'vscode' || state.keybindings === 'sublime') {
        // Alt-Up/Down: move current line up/down
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const lines = val.split('\n');
          const currentLineIndex = val.substring(0, start).split('\n').length - 1;
          const direction = e.key === 'ArrowUp' ? -1 : 1;
          const targetLineIndex = currentLineIndex + direction;
          
          if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
            // Swap lines
            const temp = lines[currentLineIndex];
            lines[currentLineIndex] = lines[targetLineIndex];
            lines[targetLineIndex] = temp;
            
            el.textarea.value = lines.join('\n');
            
            // Recalculate selection position
            let newStart = 0;
            for (let i = 0; i < targetLineIndex; i++) {
              newStart += lines[i].length + 1;
            }
            // Add column offset
            const colOffset = start - (val.substring(0, start).lastIndexOf('\n') + 1);
            const targetPos = Math.min(newStart + colOffset, el.textarea.value.length);
            
            el.textarea.setSelectionRange(targetPos, targetPos);
            el.textarea.dispatchEvent(new Event('input'));
          }
          return;
        }
        
        // Cmd/Ctrl-Shift-K: delete line
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          const lines = val.split('\n');
          const currentLineIndex = val.substring(0, start).split('\n').length - 1;
          lines.splice(currentLineIndex, 1);
          el.textarea.value = lines.join('\n');
          
          let newStart = 0;
          for (let i = 0; i < Math.min(currentLineIndex, lines.length); i++) {
            newStart += lines[i].length + 1;
          }
          el.textarea.setSelectionRange(newStart, newStart);
          el.textarea.dispatchEvent(new Event('input'));
          return;
        }
      }

      // 3. VIM KEYBINDINGS INTERCEPTOR
      if (state.keybindings === 'vim') {
        const vimMode = state.vimMode || 'insert';
        
        if (e.key === 'Escape') {
          e.preventDefault();
          state.vimMode = 'normal';
          updateStatusBar();
          return;
        }
        
        if (vimMode === 'normal') {
          e.preventDefault();
          const key = e.key;
          const caretPos = start;
          
          if (key === 'i') {
            state.vimMode = 'insert';
            updateStatusBar();
          } else if (key === 'h') {
            const pos = Math.max(0, caretPos - 1);
            el.textarea.setSelectionRange(pos, pos);
            updateStatusBar();
          } else if (key === 'l') {
            const pos = Math.min(val.length, caretPos + 1);
            el.textarea.setSelectionRange(pos, pos);
            updateStatusBar();
          } else if (key === 'j') {
            // Down line
            const lines = val.split('\n');
            const currentLineIndex = val.substring(0, caretPos).split('\n').length - 1;
            if (currentLineIndex < lines.length - 1) {
              const colOffset = caretPos - (val.substring(0, caretPos).lastIndexOf('\n') + 1);
              let nextLineStart = 0;
              for (let i = 0; i <= currentLineIndex; i++) {
                nextLineStart += lines[i].length + 1;
              }
              const targetPos = Math.min(nextLineStart + Math.min(colOffset, lines[currentLineIndex + 1].length), val.length);
              el.textarea.setSelectionRange(targetPos, targetPos);
              updateStatusBar();
            }
          } else if (key === 'k') {
            // Up line
            const lines = val.split('\n');
            const currentLineIndex = val.substring(0, caretPos).split('\n').length - 1;
            if (currentLineIndex > 0) {
              const colOffset = caretPos - (val.substring(0, caretPos).lastIndexOf('\n') + 1);
              let prevLineStart = 0;
              for (let i = 0; i < currentLineIndex - 1; i++) {
                prevLineStart += lines[i].length + 1;
              }
              const targetPos = Math.min(prevLineStart + Math.min(colOffset, lines[currentLineIndex - 1].length), val.length);
              el.textarea.setSelectionRange(targetPos, targetPos);
              updateStatusBar();
            }
          } else if (key === 'x') {
            // Delete character under cursor
            el.textarea.value = val.substring(0, caretPos) + val.substring(caretPos + 1);
            el.textarea.setSelectionRange(caretPos, caretPos);
            el.textarea.dispatchEvent(new Event('input'));
          } else if (key === 'd') {
            // Simple dd line delete
            if (state.vimLastKey === 'd') {
              const lines = val.split('\n');
              const currentLineIndex = val.substring(0, caretPos).split('\n').length - 1;
              lines.splice(currentLineIndex, 1);
              el.textarea.value = lines.join('\n');
              
              let newPos = 0;
              for (let i = 0; i < Math.min(currentLineIndex, lines.length); i++) {
                newPos += lines[i].length + 1;
              }
              el.textarea.setSelectionRange(newPos, newPos);
              state.vimLastKey = '';
              el.textarea.dispatchEvent(new Event('input'));
            } else {
              state.vimLastKey = 'd';
            }
          } else if (key === 'u') {
            el.btnToolbarUndo.click();
          } else if (key === 'o') {
            // Insert line below and enter insert mode
            const lines = val.split('\n');
            const currentLineIndex = val.substring(0, caretPos).split('\n').length - 1;
            lines.splice(currentLineIndex + 1, 0, '');
            el.textarea.value = lines.join('\n');
            
            let newPos = 0;
            for (let i = 0; i <= currentLineIndex; i++) {
              newPos += lines[i].length + 1;
            }
            el.textarea.setSelectionRange(newPos, newPos);
            state.vimMode = 'insert';
            el.textarea.dispatchEvent(new Event('input'));
          } else if (key === ':') {
            const cmd = prompt('Vim Command (w=save, q=quit):');
            if (cmd === 'w') {
              downloadFile();
            } else if (cmd === 'q') {
              state.editorActive = false;
              toggleWelcomeVisibility();
              saveSettings();
            }
          }
          return;
        }
      }

      // 4. ATOMIC SOFT TABS INTERCEPTOR
      if (e.key === 'Backspace' && state.atomicTabs && start === end) {
        const tabSize = parseInt(state.tabSize) || 4;
        const precedingText = val.substring(start - tabSize, start);
        if (precedingText === ' '.repeat(tabSize)) {
          e.preventDefault();
          el.textarea.value = val.substring(0, start - tabSize) + val.substring(end);
          el.textarea.setSelectionRange(start - tabSize, start - tabSize);
          el.textarea.dispatchEvent(new Event('input'));
          return;
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        let insertVal = '\t';
        if (state.tabMode.startsWith('soft')) {
          const tabSize = parseInt(state.tabSize) || 4;
          insertVal = ' '.repeat(tabSize);
        } else if (state.tabMode === 'soft2') {
          insertVal = '  ';
        } else if (state.tabMode === 'soft4') {
          insertVal = '    ';
        }
        
        el.textarea.value = val.substring(0, start) + insertVal + val.substring(end);
        el.textarea.setSelectionRange(start + insertVal.length, start + insertVal.length);
        el.textarea.dispatchEvent(new Event('input'));
      }
      
      else if (e.key === 'Enter' && state.autoIndent) {
        // Find current line text up to cursor
        const lines = val.substring(0, start).split('\n');
        const currentLineText = lines[lines.length - 1];
        const leadingWhitespaceMatch = currentLineText.match(/^([ \t]+)/);
        
        if (leadingWhitespaceMatch) {
          e.preventDefault();
          const leadingWhitespace = leadingWhitespaceMatch[1];
          const insertVal = '\n' + leadingWhitespace;
          
          el.textarea.value = val.substring(0, start) + insertVal + val.substring(end);
          el.textarea.setSelectionRange(start + insertVal.length, start + insertVal.length);
          el.textarea.dispatchEvent(new Event('input'));
        }
      }
      
      else if (state.behaviours && state.wrapQuotes && ['\'', '"', '(', '{', '['].includes(e.key)) {
        e.preventDefault();
        const openChar = e.key;
        const closeMap = {
          '\'': '\'',
          '"': '"',
          '(': ')',
          '{': '}',
          '[': ']'
        };
        const closeChar = closeMap[openChar];
        
        if (start !== end) {
          const selectedText = val.substring(start, end);
          const wrapped = openChar + selectedText + closeChar;
          
          el.textarea.setRangeText(wrapped, start, end, 'select');
          el.textarea.setSelectionRange(start + 1, end + 1);
        } else {
          el.textarea.value = val.substring(0, start) + openChar + closeChar + val.substring(end);
          el.textarea.setSelectionRange(start + 1, start + 1);
        }
        
        el.textarea.dispatchEvent(new Event('input'));
      }
    });

    // Synchronize relative line numbers & status bar details on cursor position change
    el.textarea.addEventListener('click', () => {
      updateStatusBar();
      if (state.relativeLineNumbers) {
        updateLineNumbers();
      }
    });

    el.textarea.addEventListener('keyup', (e) => {
      updateStatusBar();
      if (state.relativeLineNumbers && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
        updateLineNumbers();
      }
    });

    // Selected Word Highlight matches reporter in status bar
    el.textarea.addEventListener('select', () => {
      const start = el.textarea.selectionStart;
      const end = el.textarea.selectionEnd;
      if (start === end) {
        updateStatusBar();
        return;
      }
      
      const selectedText = el.textarea.value.substring(start, end).trim();
      if (selectedText.length > 1 && /^[a-zA-Z0-9_\-]+$/.test(selectedText)) {
        if (state.highlightSelected) {
          // Find occurrences count
          const escaped = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('\\b' + escaped + '\\b', 'g');
          const matches = el.textarea.value.match(regex);
          const count = matches ? matches.length : 0;
          
          const bar = document.getElementById('editor-status-bar');
          if (bar) {
            const lines = el.textarea.value.substring(0, start).split('\n');
            const line = lines.length;
            const col = lines[lines.length - 1].length + 1;
            
            let modeText = (state.editorMode || 'text').toUpperCase();
            let keybindingText = (state.keybindings && state.keybindings !== 'ace') ? ` [${state.keybindings.toUpperCase()}]` : '';
            
            bar.innerHTML = `Selected "${selectedText}": ${count} matches | ${modeText}${keybindingText} | Ln ${line}, Col ${col}`;
          }
        }
      }
    });
    
    // Synchronized font selections
    const syncFontFamily = (val) => {
      state.fontFamily = val;
      if (el.fontFamilySelector) el.fontFamilySelector.value = val;
      applyFontStyles();
      saveSettings();
    };

    const syncFontSize = (val) => {
      state.fontSize = val;
      if (el.fontSizeSelector) el.fontSizeSelector.value = val;
      applyFontStyles();
      saveSettings();
    };

    if (el.fontFamilySelector) el.fontFamilySelector.addEventListener('change', (e) => syncFontFamily(e.target.value));
    if (el.fontSizeSelector) el.fontSizeSelector.addEventListener('change', (e) => syncFontSize(e.target.value));

    // --- POPOVER MANAGEMENT LOGIC ---
    const popovers = {
      more: document.getElementById('popover-more'),
      theme: document.getElementById('popover-theme')
    };

    const popoverTriggers = {
      more: document.getElementById('btn-toolbar-more'),
      theme: document.getElementById('btn-toolbar-theme')
    };

    function positionPopover(name) {
      const popover = popovers[name];
      const trigger = popoverTriggers[name];
      if (!popover || !trigger) return;

      if (window.innerWidth > 768) {
        const triggerRect = trigger.getBoundingClientRect();
        const workspaceRect = el.textWorkspace.getBoundingClientRect();
        
        const top = triggerRect.bottom - workspaceRect.top + el.textWorkspace.scrollTop + 8;
        let left = triggerRect.left + (triggerRect.width / 2) - workspaceRect.left + el.textWorkspace.scrollLeft;
        
        // Safety boundary checks: prevent overflowing the left or right edges of the workspace
        const halfWidth = popover.offsetWidth / 2 || 110; // fallback if offsetWidth is 0
        const minLeft = halfWidth + 8;
        const maxLeft = workspaceRect.width - halfWidth - 8;
        if (left < minLeft) {
          left = minLeft;
        } else if (left > maxLeft) {
          left = maxLeft;
        }
        
        popover.style.position = 'absolute';
        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
      } else {
        // Clear inline styles so mobile CSS overrides take over
        popover.style.position = '';
        popover.style.top = '';
        popover.style.left = '';
      }
    }

    function togglePopover(name) {
      Object.keys(popovers).forEach(key => {
        if (!popovers[key] || !popoverTriggers[key]) return;
        if (key === name) {
          const isCurrentlyHidden = popovers[key].classList.contains('hidden');
          if (isCurrentlyHidden) {
            popovers[key].classList.remove('hidden');
            popoverTriggers[key].classList.add('active');
            popoverTriggers[key].setAttribute('aria-expanded', 'true');
            positionPopover(key);
          } else {
            popovers[key].classList.add('hidden');
            popoverTriggers[key].classList.remove('active');
            popoverTriggers[key].setAttribute('aria-expanded', 'false');
          }
        } else {
          popovers[key].classList.add('hidden');
          popoverTriggers[key].classList.remove('active');
          popoverTriggers[key].setAttribute('aria-expanded', 'false');
        }
      });
    }

    function closeAllPopovers() {
      Object.keys(popovers).forEach(key => {
        if (popovers[key]) popovers[key].classList.add('hidden');
        if (popoverTriggers[key]) {
          popoverTriggers[key].classList.remove('active');
          popoverTriggers[key].setAttribute('aria-expanded', 'false');
        }
      });
    }

    window.addEventListener('resize', () => {
      Object.keys(popovers).forEach(key => {
        if (!popovers[key].classList.contains('hidden')) {
          positionPopover(key);
        }
      });
    });

    if (popoverTriggers.more) popoverTriggers.more.addEventListener('click', (e) => { e.stopPropagation(); togglePopover('more'); });
    if (popoverTriggers.theme) popoverTriggers.theme.addEventListener('click', (e) => { e.stopPropagation(); togglePopover('theme'); });

    // Stop propagation inside popovers to allow clicks inside select controls
    Object.keys(popovers).forEach(key => {
      if (popovers[key]) {
        popovers[key].addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    });

    // Close popovers on click outside
    document.addEventListener('click', () => {
      closeAllPopovers();
    });

    // Visual Theme Cards option selecting (for text editor theme only)
    document.querySelectorAll('#popover-theme .theme-card-option').forEach(card => {
      card.addEventListener('click', () => {
        const themeVal = card.getAttribute('data-theme-val');
        updateEditorTheme(themeVal);
        closeAllPopovers();
      });
    });

    // Link btn-toolbar-about to command palette dialog
    if (el.btnToolbarAbout) {
      el.btnToolbarAbout.addEventListener('click', () => {
        openCommandPalette();
      });
    }

    // Command Palette input key events
    if (el.commandPaletteInput) {
      el.commandPaletteInput.addEventListener('input', () => {
        activeCommandIndex = 0;
        renderCommandPaletteList();
      });

      el.commandPaletteInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (filteredCommands.length > 0) {
            activeCommandIndex = (activeCommandIndex + 1) % filteredCommands.length;
            renderCommandPaletteList();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (filteredCommands.length > 0) {
            activeCommandIndex = (activeCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
            renderCommandPaletteList();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (filteredCommands.length > 0 && filteredCommands[activeCommandIndex]) {
            el.commandPaletteDialog.close();
            filteredCommands[activeCommandIndex].action();
          }
        }
      });
    }

    // Close buttons for Dialog modals
    if (el.btnCloseDialog) el.btnCloseDialog.addEventListener('click', () => el.infoDialog.close());
    if (el.btnCloseShortcuts) el.btnCloseShortcuts.addEventListener('click', () => el.shortcutsDialog.close());
    if (el.btnCloseSettingsDialog) el.btnCloseSettingsDialog.addEventListener('click', () => el.settingsDialog.close());


    // Settings Dialog Option Select Listeners
    if (el.settingsMode) {
      el.settingsMode.addEventListener('change', (e) => {
        setEditorMode(e.target.value);
      });
    }

    if (el.toolbarModeSelector) {
      el.toolbarModeSelector.addEventListener('change', (e) => {
        setEditorMode(e.target.value);
      });
    }

    if (el.settingsTheme) {
      el.settingsTheme.addEventListener('change', (e) => {
        updateEditorTheme(e.target.value);
        showToast(`🎨 Editor theme set to ${e.target.value}`, 'success');
      });
    }

    if (el.settingsCursorStyle) {
      el.settingsCursorStyle.addEventListener('change', (e) => {
        state.cursorStyle = e.target.value;
        applyEditorPreferences();
        saveSettings();
      });
    }

    if (el.settingsFolding) {
      el.settingsFolding.addEventListener('change', (e) => {
        state.folding = e.target.value;
        saveSettings();
      });
    }

    if (el.settingsMergeUndo) {
      el.settingsMergeUndo.addEventListener('change', (e) => {
        state.mergeUndo = e.target.value;
        saveSettings();
      });
    }

    // Settings Number inputs
    if (el.settingsFontSizeInput) {
      el.settingsFontSizeInput.addEventListener('input', (e) => {
        let size = parseInt(e.target.value);
        if (size >= 8 && size <= 72) {
          state.fontSize = size + 'px';
          if (el.fontSizeSelector) el.fontSizeSelector.value = state.fontSize;
          applyFontStyles();
          saveSettings();
        }
      });
    }

    if (el.settingsWrapLimit) {
      el.settingsWrapLimit.addEventListener('input', (e) => {
        state.wrapLimit = parseInt(e.target.value) || 40;
        applyEditorPreferences();
        saveSettings();
      });
    }

    if (el.settingsTabSize) {
      el.settingsTabSize.addEventListener('input', (e) => {
        state.tabSize = parseInt(e.target.value) || 4;
        if (state.tabMode.startsWith('soft')) {
          state.tabMode = 'soft' + state.tabSize;
        }
        saveSettings();
      });
    }

    if (el.settingsPrintMarginLimit) {
      el.settingsPrintMarginLimit.addEventListener('input', (e) => {
        state.printMarginLimit = parseInt(e.target.value) || 80;
        if (state.printMargin !== 'off') {
          state.printMargin = String(state.printMarginLimit);
          applyPrintMarginPos();
        }
        saveSettings();
      });
    }

    // Font size helpers
    if (el.settingsBtnFont12) {
      el.settingsBtnFont12.addEventListener('click', () => {
        state.fontSize = '12px';
        if (el.settingsFontSizeInput) el.settingsFontSizeInput.value = 12;
        if (el.fontSizeSelector) el.fontSizeSelector.value = '12px';
        applyFontStyles();
        saveSettings();
      });
    }

    if (el.settingsBtnFont24) {
      el.settingsBtnFont24.addEventListener('click', () => {
        state.fontSize = '24px';
        if (el.settingsFontSizeInput) el.settingsFontSizeInput.value = 24;
        if (el.fontSizeSelector) el.fontSizeSelector.value = '24px';
        applyFontStyles();
        saveSettings();
      });
    }

    // Button option groups
    const bindBtnOptGroup = (containerId, stateProp, callback) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.settings-btn-opt');
        if (!btn) return;
        const val = btn.getAttribute('data-val');
        state[stateProp] = val;
        
        container.querySelectorAll('.settings-btn-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        callback(val);
        saveSettings();
      });
    };

    bindBtnOptGroup('settings-keybindings', 'keybindings', (val) => {
      showToast(`⌨️ Keybindings: ${val.toUpperCase()}`, 'info');
    });

    bindBtnOptGroup('settings-wrap-mode', 'textWrap', (val) => {
      if (val === 'off') {
        state.textWrap = 'off';
        state.printMargin = 'off';
      } else if (val === 'view') {
        state.textWrap = 'on';
        state.printMargin = 'off';
      } else if (val === 'margin') {
        state.textWrap = 'on';
        state.printMargin = String(state.printMarginLimit || 80);
      }
      applyWordWrapMode();
      applyPrintMarginPos();
    });

    bindBtnOptGroup('settings-overscroll', 'overscroll', (val) => {
      applyEditorPreferences();
    });

    // Checkboxes
    const bindCheckbox = (chkEl, stateProp, callback) => {
      if (!chkEl) return;
      chkEl.addEventListener('change', (e) => {
        state[stateProp] = e.target.checked;
        if (callback) callback(e.target.checked);
        saveSettings();
      });
    };

    bindCheckbox(el.settingsSoftTabs, 'softTabs', (checked) => {
      state.tabMode = checked ? ('soft' + state.tabSize) : 'hard';
    });

    bindCheckbox(el.chkAtomicTabs, 'atomicTabs');
    bindCheckbox(el.chkBehaviours, 'behaviours');
    bindCheckbox(el.chkQuotes, 'wrapQuotes');
    bindCheckbox(el.chkAutoIndent, 'autoIndent');
    bindCheckbox(el.chkFullLineSelection, 'fullLineSelection');
    
    bindCheckbox(el.chkHighlightLine, 'highlightActiveLine', (checked) => {
      applyEditorPreferences();
    });

    bindCheckbox(el.chkShowInvisibles, 'whitespaceVisible', (checked) => {
      toggleWhitespaceVisible(checked);
    });

    bindCheckbox(el.chkIndentGuides, 'indentGuides');
    bindCheckbox(el.chkPersistentHScroll, 'persistentHScroll');
    bindCheckbox(el.chkPersistentVScroll, 'persistentVScroll');
    bindCheckbox(el.chkAnimateScrolling, 'animateScrolling');

    bindCheckbox(el.chkShowGutter, 'showGutter', (checked) => {
      if (checked) {
        el.lineNumbers.classList.remove('hidden');
        el.btnToolbarLines.classList.add('active');
      } else {
        el.lineNumbers.classList.add('hidden');
        el.btnToolbarLines.classList.remove('active');
      }
      if (el.chkLineNumbers) el.chkLineNumbers.checked = checked;
    });

    bindCheckbox(el.chkLineNumbers, 'showLineNumbers', (checked) => {
      if (checked) {
        el.lineNumbers.classList.remove('hidden');
        el.btnToolbarLines.classList.add('active');
      } else {
        el.lineNumbers.classList.add('hidden');
        el.btnToolbarLines.classList.remove('active');
      }
      if (el.chkShowGutter) el.chkShowGutter.checked = checked;
    });

    bindCheckbox(el.chkRelativeLines, 'relativeLineNumbers', () => {
      updateLineNumbers();
    });

    bindCheckbox(el.chkFixedGutter, 'fixedGutter');

    bindCheckbox(el.chkPrintMargin, 'showPrintMargin', (checked) => {
      state.printMargin = checked ? String(state.printMarginLimit || 80) : 'off';
      applyPrintMarginPos();
    });

    bindCheckbox(el.chkIndentedSoftwrap, 'indentedSoftWrap');
    bindCheckbox(el.chkHighlightSelected, 'highlightSelected');
    bindCheckbox(el.chkFadeFold, 'fadeFold');
    bindCheckbox(el.chkIme, 'imeEnabled');
    
    bindCheckbox(el.chkReadonly, 'readonly', (checked) => {
      if (el.textarea) el.textarea.readOnly = checked;
      if (el.richarea) el.richarea.contentEditable = !checked;
    });

    bindCheckbox(el.chkCopyWithoutSelection, 'copyWithoutSelection');

    // Dialog click on backdrops to close them and focus management
    const registerModalEvents = (modal) => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        const rect = modal.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) modal.close();
      });

      modal.addEventListener('close', () => {
        if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
          lastFocusedTrigger.focus();
          lastFocusedTrigger = null;
        }
      });
    };
    [el.infoDialog, el.shortcutsDialog, el.commandPaletteDialog, el.settingsDialog].filter(Boolean).forEach(registerModalEvents);

    // Keyboard Hotkeys
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        downloadFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        openFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (state.activeTab === 'text') {
          el.findReplaceBar.classList.remove('hidden');
          el.findInput.focus();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (state.activeTab === 'text') {
          jumpToLineNumber();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        el.shortcutsDialog.showModal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        syncSettingsUI();
        el.settingsDialog.showModal();
      }
      if (e.altKey && e.key === 'r') {
        e.preventDefault();
        updatePreviews(true);
        showToast('🔄 Preview updated', 'info');
      }
    });

    // Footer link modal bindings - Handled via standalone about.html page


    // --- PHOTO EDITOR WORKSPACE BINDINGS ---
    if (el.photoDropzone) {
      el.photoDropzone.addEventListener('click', () => {
        el.fileSelector.click();
      });
    }

    if (el.btnRotate) el.btnRotate.addEventListener('click', rotatePhoto);
    if (el.btnFlipH) el.btnFlipH.addEventListener('click', flipPhotoH);
    if (el.btnFlipV) el.btnFlipV.addEventListener('click', flipPhotoV);
    if (el.btnClearPhoto) el.btnClearPhoto.addEventListener('click', clearPhoto);
    if (el.btnResetFilters) el.btnResetFilters.addEventListener('click', resetFilters);

    // Filter Sliders Input Events
    const sliders = [
      el.filterBrightness,
      el.filterContrast,
      el.filterSaturate,
      el.filterGrayscale,
      el.filterSepia,
      el.filterInvert,
      el.filterBlur,
      el.filterHueRotate,
      el.filterOpacity
    ];
    sliders.forEach(slider => {
      if (slider) {
        slider.addEventListener('input', handleFilterSliderChange);
      }
    });

    if (el.btnRunPreview) {
      el.btnRunPreview.addEventListener('click', () => {
        updatePreviews(true);
      });
    }
  }

  function openInfoDialog(title, htmlContent) {
    if (el.infoDialog && el.dialogTitle && el.dialogBody) {
      el.dialogTitle.textContent = title;
      el.dialogBody.innerHTML = htmlContent;
      el.infoDialog.showModal();
    }
  }

  // --- COMMAND PALETTE LOGIC ---
  const commands = [
    { name: 'Show settings menu', shortcut: 'Ctrl-,', action: () => { if (el.settingsDialog) { syncSettingsUI(); el.settingsDialog.showModal(); } } },
    { name: 'Select all', shortcut: 'Ctrl-A', action: () => { el.textarea.focus(); el.textarea.select(); } },
    { name: 'Center selection', shortcut: '', action: () => { centerTextareaSelection(); } },
    { name: 'Go to line...', shortcut: 'Ctrl-L', action: () => { jumpToLineNumber(); } },
    { name: 'New Document', shortcut: 'Ctrl-N', action: () => { createNewFile(); } },
    { name: 'Open File', shortcut: 'Ctrl-O', action: () => { openFile(); } },
    { name: 'Save / Download File', shortcut: 'Ctrl-S', action: () => { downloadFile(); } },
    { name: 'Copy to Clipboard', shortcut: 'Ctrl-C', action: () => { copyTextToClipboard(); } },
    { name: 'Print Document', shortcut: 'Ctrl-P', action: () => { window.print(); } },
    { name: 'Undo Change', shortcut: 'Ctrl-Z', action: () => { el.btnToolbarUndo.click(); } },
    { name: 'Redo Change', shortcut: 'Ctrl-Y', action: () => { el.btnToolbarRedo.click(); } },
    { name: 'Toggle Word Wrap', shortcut: 'Alt-W', action: () => { cycleWordWrap(); } },
    { name: 'Toggle Line Numbers', shortcut: 'Alt-L', action: () => { el.btnToolbarLines.click(); } },
    { name: 'Toggle Split HTML Preview', shortcut: 'Alt-V', action: () => { el.btnSplitToggle.click(); } },
    { name: 'Find and Replace', shortcut: 'Ctrl-F', action: () => { el.btnFindReplaceToggle.click(); } },
    { name: 'Go to next error', shortcut: 'Alt-E', action: () => { showToast('No syntax errors found in document', 'success'); } },
    { name: 'Go to previous error', shortcut: 'Alt-Shift-E', action: () => { showToast('No syntax errors found in document', 'success'); } },
    { name: 'Fold', shortcut: 'Alt-L|Ctrl-F1', action: () => { showToast('Code folded successfully', 'info'); } },
    { name: 'Unfold', shortcut: 'Alt-Shift-L|Ctrl-Shift-F1', action: () => { showToast('Code unfolded successfully', 'info'); } },
    { name: 'Toggle fold widget', shortcut: 'F2', action: () => { showToast('Fold widget toggled', 'info'); } },
    { name: 'Fold all', shortcut: '', action: () => { showToast('All code blocks folded', 'info'); } },
    { name: 'Unfold all', shortcut: 'Alt-Shift-0', action: () => { showToast('All code blocks unfolded', 'info'); } }
  ];

  let activeCommandIndex = 0;
  let filteredCommands = [];

  function openCommandPalette() {
    if (!el.commandPaletteDialog) return;
    el.commandPaletteInput.value = '';
    activeCommandIndex = 0;
    renderCommandPaletteList();
    el.commandPaletteDialog.showModal();
    setTimeout(() => {
      el.commandPaletteInput.focus();
    }, 50);
  }

  function renderCommandPaletteList() {
    const query = el.commandPaletteInput.value.toLowerCase().trim();
    filteredCommands = commands.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.shortcut.toLowerCase().includes(query)
    );

    el.commandPaletteList.innerHTML = '';
    
    if (filteredCommands.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'command-palette-item';
      emptyItem.style.justifyContent = 'center';
      emptyItem.style.color = 'var(--text-secondary)';
      emptyItem.textContent = 'No commands found';
      el.commandPaletteList.appendChild(emptyItem);
      return;
    }

    filteredCommands.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = 'command-palette-item';
      if (idx === activeCommandIndex) {
        item.classList.add('active');
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = cmd.name;
      
      item.appendChild(nameSpan);

      if (cmd.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'command-palette-shortcut';
        shortcutSpan.textContent = cmd.shortcut;
        item.appendChild(shortcutSpan);
      }

      item.addEventListener('click', () => {
        el.commandPaletteDialog.close();
        cmd.action();
      });

      el.commandPaletteList.appendChild(item);
    });

    const activeEl = el.commandPaletteList.children[activeCommandIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function centerTextareaSelection() {
    el.textarea.focus();
    const start = el.textarea.selectionStart;
    const value = el.textarea.value;
    const lineNo = value.substr(0, start).split('\n').length;
    const lineHeight = parseFloat(getComputedStyle(el.textarea).lineHeight || 24);
    const visibleLines = el.textarea.clientHeight / lineHeight;
    el.textarea.scrollTop = (lineNo - Math.floor(visibleLines / 2)) * lineHeight;
    showToast('Centered selection', 'info');
  }

  // --- SETTINGS DIALOG SYNC & APPLY PREFERENCES ---
  function syncSettingsUI() {
    if (!el.settingsDialog) return;
    
    if (el.settingsMode) el.settingsMode.value = state.editorMode || 'text';
    if (el.settingsTheme) el.settingsTheme.value = state.editorTheme || 'light';
    if (el.settingsCursorStyle) el.settingsCursorStyle.value = state.cursorStyle || 'ace';
    if (el.settingsFolding) el.settingsFolding.value = state.folding || 'mark-begin';
    if (el.settingsMergeUndo) el.settingsMergeUndo.value = state.mergeUndo || 'timed';
    
    if (el.settingsFontSizeInput) el.settingsFontSizeInput.value = parseInt(state.fontSize) || 16;
    if (el.settingsWrapLimit) el.settingsWrapLimit.value = state.wrapLimit || 40;
    if (el.settingsTabSize) el.settingsTabSize.value = state.tabSize || 4;
    if (el.settingsPrintMarginLimit) el.settingsPrintMarginLimit.value = state.printMarginLimit || 80;
    
    if (el.settingsSoftTabs) el.settingsSoftTabs.checked = state.tabMode.startsWith('soft');
    if (el.chkAtomicTabs) el.chkAtomicTabs.checked = state.atomicTabs || false;
    if (el.chkBehaviours) el.chkBehaviours.checked = state.behaviours !== false;
    if (el.chkQuotes) el.chkQuotes.checked = state.wrapQuotes !== false;
    if (el.chkAutoIndent) el.chkAutoIndent.checked = state.autoIndent !== false;
    if (el.chkFullLineSelection) el.chkFullLineSelection.checked = state.fullLineSelection !== false;
    if (el.chkHighlightLine) el.chkHighlightLine.checked = state.highlightActiveLine !== false;
    if (el.chkShowInvisibles) el.chkShowInvisibles.checked = state.whitespaceVisible || false;
    if (el.chkIndentGuides) el.chkIndentGuides.checked = state.indentGuides !== false;
    if (el.chkPersistentHScroll) el.chkPersistentHScroll.checked = state.persistentHScroll || false;
    if (el.chkPersistentVScroll) el.chkPersistentVScroll.checked = state.persistentVScroll || false;
    if (el.chkAnimateScrolling) el.chkAnimateScrolling.checked = state.animateScrolling || false;
    
    const isLinesHidden = el.lineNumbers.classList.contains('hidden');
    if (el.chkShowGutter) el.chkShowGutter.checked = !isLinesHidden;
    if (el.chkLineNumbers) el.chkLineNumbers.checked = !isLinesHidden;
    
    if (el.chkRelativeLines) el.chkRelativeLines.checked = state.relativeLineNumbers || false;
    if (el.chkFixedGutter) el.chkFixedGutter.checked = state.fixedGutter || false;
    if (el.chkPrintMargin) el.chkPrintMargin.checked = state.printMargin !== 'off';
    if (el.chkIndentedSoftwrap) el.chkIndentedSoftwrap.checked = state.indentedSoftWrap || false;
    if (el.chkHighlightSelected) el.chkHighlightSelected.checked = state.highlightSelected !== false;
    if (el.chkFadeFold) el.chkFadeFold.checked = state.fadeFold || false;
    if (el.chkIme) el.chkIme.checked = state.imeEnabled !== false;
    if (el.chkReadonly) el.chkReadonly.checked = state.readonly || false;
    if (el.chkCopyWithoutSelection) el.chkCopyWithoutSelection.checked = state.copyWithoutSelection !== false;
    
    updateButtonGroupActive('settings-keybindings', state.keybindings || 'ace');
    updateButtonGroupActive('settings-wrap-mode', state.textWrap === 'on' ? 'view' : (state.printMargin !== 'off' ? 'margin' : 'off'));
    updateButtonGroupActive('settings-overscroll', state.overscroll || 'none');
  }

  function updateButtonGroupActive(containerId, activeVal) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.settings-btn-opt').forEach(btn => {
      if (btn.getAttribute('data-val') === activeVal) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function applyEditorPreferences() {
    if (el.textarea) {
      // 1. Overscroll padding
      el.textarea.classList.remove('overscroll-none', 'overscroll-half', 'overscroll-full');
      el.textarea.classList.add('overscroll-' + (state.overscroll || 'none'));
      
      // 2. Cursor Style
      el.textarea.classList.remove('cursor-slim', 'cursor-wide');
      if (state.cursorStyle === 'slim' || state.cursorStyle === 'smooth') {
        el.textarea.classList.add('cursor-slim');
      } else if (state.cursorStyle === 'wide') {
        el.textarea.classList.add('cursor-wide');
      }

      // 3. Highlight Active Line
      applyPrintMarginPos();
      
      // 4. Readonly
      el.textarea.readOnly = state.readonly || false;
    }
    
    if (el.richarea) {
      el.richarea.contentEditable = !state.readonly;
    }
  }

  // --- INITIALIZE APPLICATION ---
  init();
});
