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
  let deferredInstallPrompt = null;
  let speechUtterance = null;
  let isSpeaking = false;

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
    mobileStatsMode: 'compact',
    
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
    isInteractingWithToolbar: false,

    // File System Access & Multi-Draft State
    activeFileHandle: null,
    activeFileHandleName: null,
    currentDraftId: null,
    previewFormat: 'auto',
    printSettings: {
      source: 'raw',
      paperSize: 'a4',
      orientation: 'portrait',
      margin: 'standard',
      fontSize: '12pt',
      includeHeader: true,
      includeLineNumbers: false,
      includeFooter: true,
      preserveSyntax: true
    }
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
    mobileTabText: document.getElementById('mobile-tab-text'),
    mobileTabPhoto: document.getElementById('mobile-tab-photo'),
    textWorkspace: document.getElementById('text-workspace'),
    previewWorkspace: document.getElementById('preview-workspace'),
    photoWorkspace: document.getElementById('photo-workspace'),
    textSidebar: document.getElementById('text-sidebar-controls'),
    photoSidebar: document.getElementById('photo-sidebar-controls'),
    
    // Header controls
    filenameInput: document.getElementById('filename'),
    fileExtSpan: document.getElementById('file-extension'),
    fileSyncBadge: document.getElementById('file-sync-badge'),
    btnNew: document.getElementById('btn-new'),
    btnOpen: document.getElementById('btn-open'),
    btnRecents: document.getElementById('btn-recents'),
    btnFullscreenPreview: document.getElementById('btn-fullscreen-preview'),
    btnSave: document.getElementById('btn-save'),
    btnCopy: document.getElementById('btn-copy'),
    btnFindReplaceToggle: document.getElementById('btn-toolbar-find'),
    btnFindReplaceToggleHeader: document.getElementById('btn-find-replace-toggle'),
    btnMobileSidebarTogglePhoto: document.getElementById('btn-mobile-sidebar-toggle-photo'),
    themeSelector: document.getElementById('theme-selector'),
    fileSelector: document.getElementById('file-selector'),
    
    // Resume Draft Banner
    resumeDraftBanner: document.getElementById('resume-draft-banner'),
    resumeDraftFilename: document.getElementById('resume-draft-filename'),
    resumeDraftMeta: document.getElementById('resume-draft-meta'),
    resumeDraftWords: document.getElementById('resume-draft-words'),
    resumeDraftTime: document.getElementById('resume-draft-time'),
    btnResumeDraft: document.getElementById('btn-resume-draft'),
    btnViewRecentsBanner: document.getElementById('btn-view-recents-banner'),
    btnDismissDraftBanner: document.getElementById('btn-dismiss-draft-banner'),
    btnWelcomeRecents: document.getElementById('btn-welcome-recents'),
    
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
    toolbarScrollHint: document.getElementById('toolbar-scroll-hint'),
    
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
    btnToolbarSettings: document.getElementById('btn-toolbar-settings'),
    btnToolbarZen: document.getElementById('btn-toolbar-zen'),
    btnZenExit: document.getElementById('btn-zen-exit'),
    btnSortLines: document.getElementById('btn-sort-lines'),
    btnDedupeLines: document.getElementById('btn-dedupe-lines'),
    btnTrimSpaces: document.getElementById('btn-trim-spaces'),
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
    toastContainer: document.getElementById('toast-container'),

    // Export & PWA Elements
    btnExportMenu: document.getElementById('btn-export-menu'),
    popoverExport: document.getElementById('popover-export'),
    btnExportSaveAs: document.getElementById('btn-export-save-as'),
    btnExportTxt: document.getElementById('btn-export-txt'),
    btnExportMd: document.getElementById('btn-export-md'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportHtml: document.getElementById('btn-export-html'),
    btnExportDoc: document.getElementById('btn-export-doc'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnInstallPwa: document.getElementById('btn-install-pwa'),

    // Recent Files Dialog
    recentFilesDialog: document.getElementById('recent-files-dialog'),
    btnCloseRecentFiles: document.getElementById('btn-close-recent-files'),
    recentFilesList: document.getElementById('recent-files-list'),
    recentFilesCount: document.getElementById('recent-files-count'),
    btnClearRecentFiles: document.getElementById('btn-clear-recent-files'),

    // Print & PDF Setup Dialog
    printDialog: document.getElementById('print-dialog'),
    btnClosePrintDialog: document.getElementById('btn-close-print-dialog'),
    btnCancelPrint: document.getElementById('btn-cancel-print'),
    btnExecutePrint: document.getElementById('btn-execute-print'),
    printRenderContainer: document.getElementById('print-render-container'),
    printPaperSize: document.getElementById('print-paper-size'),
    printOptHeader: document.getElementById('print-opt-header'),
    printOptLineNumbers: document.getElementById('print-opt-linenumbers'),
    printOptFooter: document.getElementById('print-opt-footer'),
    printOptSyntax: document.getElementById('print-opt-syntax'),
    splitPreviewTitle: document.getElementById('split-preview-title'),

    // TTS & Diff Toolbar
    btnToolbarTts: document.getElementById('btn-toolbar-tts'),
    btnToolbarDiff: document.getElementById('btn-toolbar-diff'),

    // Diff Dialog Elements
    diffDialog: document.getElementById('diff-dialog'),
    btnCloseDiff: document.getElementById('btn-close-diff'),
    diffOriginal: document.getElementById('diff-original'),
    diffModified: document.getElementById('diff-modified'),
    btnRunDiff: document.getElementById('btn-run-diff'),
    btnDiffSwap: document.getElementById('btn-diff-swap'),
    btnDiffLoadEditor: document.getElementById('btn-diff-load-editor'),
    btnDiffApplyEditor: document.getElementById('btn-diff-apply-editor'),
    diffSummaryBadge: document.getElementById('diff-summary-badge'),
    diffResultsContainer: document.getElementById('diff-results-container'),
    diffOutputLines: document.getElementById('diff-output-lines'),

    // Developer Utilities
    btnUrlEncode: document.getElementById('btn-url-encode'),
    btnUrlDecode: document.getElementById('btn-url-decode'),
    btnB64Encode: document.getElementById('btn-b64-encode'),
    btnB64Decode: document.getElementById('btn-b64-decode'),
    btnJsonPrettify: document.getElementById('btn-json-prettify'),
    btnJsonMinify: document.getElementById('btn-json-minify'),

    // Mobile Analytics Panel & Controls
    mobileAnalyticsPanel: document.getElementById('mobile-analytics-panel'),
    mobileStatsCompactView: document.getElementById('mobile-stats-compact-view'),
    mobileStatsFullView: document.getElementById('mobile-stats-full-view'),
    btnStatsModeFull: document.getElementById('btn-stats-mode-full'),
    btnStatsModeCompact: document.getElementById('btn-stats-mode-compact'),
    statusBar: document.getElementById('editor-status-bar'),
    btnFooterBackToTop: document.getElementById('btn-footer-back-to-top')
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

    // Ensure zen exit button is hidden initially
    if (el.btnZenExit) el.btnZenExit.style.setProperty('display', 'none', 'important');

    // Toggle Landing / Welcome page visibility
    toggleWelcomeVisibility();
    
    // Sync Editor Mode Visual displays
    updateEditorModeDisplay(null);

    // Initialize Mobile Stats Mode
    setMobileStatsMode(state.mobileStatsMode || 'compact');
    
    // Register Service Worker for offline capability & PWA
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.debug('Service Worker registration skipped or failed:', err);
      });
    }

    // Check for interrupted or saved drafts to resume
    checkResumeDraftBanner();

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
    recordCurrentDraft();
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
    if (safeStorage.getItem('et_mobile_stats_mode')) state.mobileStatsMode = safeStorage.getItem('et_mobile_stats_mode');

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
    state.editorTheme = themeName;

    // Synchronize editor workspace theme attribute
    const wrapper = document.getElementById('editor-layout-wrapper');
    if (wrapper) {
      wrapper.setAttribute('data-editor-theme', themeName);
    }

    // Synchronize header theme selector
    if (el.themeSelector) {
      el.themeSelector.value = themeName;
    }

    // Synchronize settings dialog theme selector
    if (el.settingsTheme) {
      el.settingsTheme.value = themeName;
    }

    // Synchronize toolbar popover theme cards
    document.querySelectorAll('#popover-theme .theme-card-option').forEach(card => {
      if (card.getAttribute('data-theme-val') === themeName) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    saveSettings();
  }

  function updateEditorTheme(themeName) {
    updateTheme(themeName);
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
    if (el.mobileTabText) {
      el.mobileTabText.classList.remove('active');
      el.mobileTabText.setAttribute('aria-selected', 'false');
    }
    if (el.tabPreview) {
      el.tabPreview.classList.remove('active');
      el.tabPreview.setAttribute('aria-selected', 'false');
    }
    el.tabPhoto.classList.remove('active');
    el.tabPhoto.setAttribute('aria-selected', 'false');
    if (el.mobileTabPhoto) {
      el.mobileTabPhoto.classList.remove('active');
      el.mobileTabPhoto.setAttribute('aria-selected', 'false');
    }

    el.textWorkspace.classList.add('hidden');
    el.textSidebar.classList.add('hidden');
    el.previewWorkspace.classList.add('hidden');
    el.photoWorkspace.classList.add('hidden');
    el.photoSidebar.classList.add('hidden');

    const appSidebar = document.getElementById('app-sidebar');

    if (tabId === 'text') {
      el.tabText.classList.add('active');
      el.tabText.setAttribute('aria-selected', 'true');
      if (el.mobileTabText) {
        el.mobileTabText.classList.add('active');
        el.mobileTabText.setAttribute('aria-selected', 'true');
      }
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
      if (el.mobileTabPhoto) {
        el.mobileTabPhoto.classList.add('active');
        el.mobileTabPhoto.setAttribute('aria-selected', 'true');
      }
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
        updatePreviews(true);
      }
    }, 400);
  }

  function convertTableRowsToHtml(tableLines) {
    if (!tableLines || tableLines.length === 0) return '';
    const parseCells = (rowStr) => {
      return rowStr.slice(1, -1).split('|').map(c => c.trim());
    };

    const headerCells = parseCells(tableLines[0]);
    let startIdx = 1;
    if (tableLines.length > 1 && /^[|\s:-]+$/.test(tableLines[1])) {
      startIdx = 2;
    }

    let rowsHtml = '';
    for (let i = startIdx; i < tableLines.length; i++) {
      const cells = parseCells(tableLines[i]);
      rowsHtml += `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }

    return `
      <div class="table-container" style="overflow-x: auto; margin: 16px 0;">
        <table class="markdown-table" style="width: 100%; border-collapse: collapse;">
          <thead><tr>${headerCells.map(c => `<th style="background: rgba(0,0,0,0.04); border: 1px solid #e5e7eb; padding: 8px 12px; font-weight: 600;">${c}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function parseMarkdownBodyOnly(md) {
    if (!md) return '';
    let html = escapeHTML(md);

    // Code blocks
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
      return `<pre style="background: rgba(110,118,129,0.1); padding: 12px; border-radius: 6px; overflow-x: auto;"><code>${code}</code></pre>`;
    });

    // GFM Tables
    const lines = html.split('\n');
    const processedLines = [];
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        inTable = true;
        tableRows.push(line);
      } else {
        if (inTable) {
          processedLines.push(convertTableRowsToHtml(tableRows));
          tableRows = [];
          inTable = false;
        }
        processedLines.push(lines[i]);
      }
    }
    if (inTable) {
      processedLines.push(convertTableRowsToHtml(tableRows));
    }
    html = processedLines.join('\n');

    // Headers
    html = html.replace(/^###### (.*?)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.*?)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Task lists
    html = html.replace(/^- \[(x|X)\] (.*?)$/gm, '<li style="list-style: none;"><input type="checkbox" checked disabled> <span>$2</span></li>');
    html = html.replace(/^- \[ \] (.*?)$/gm, '<li style="list-style: none;"><input type="checkbox" disabled> <span>$2</span></li>');

    // Lists
    html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');

    // Bold, italic, strike
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    html = html.replace(/`(.*?)`/g, '<code style="background: rgba(110,118,129,0.2); padding: 2px 5px; border-radius: 4px;">$1</code>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^> (.*?)$/gm, '<blockquote style="border-left: 4px solid #0d9488; margin: 8px 0; padding-left: 12px; color: #6b7280;">$1</blockquote>');

    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
      const cleanUrl = url.trim();
      if (/^(https?:|mailto:|tel:|#|\/)/i.test(cleanUrl)) {
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return `<span>${text}</span>`;
    });

    // Wrap paragraphs
    html = html.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed === '') return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<li') || trimmed.startsWith('<pre') || 
          trimmed.startsWith('<code') || trimmed.startsWith('<hr') || trimmed.startsWith('<blockquote') || 
          trimmed.startsWith('<table') || trimmed.startsWith('<div') || trimmed.startsWith('</')) {
        return line;
      }
      return `<p>${line}</p>`;
    }).join('\n');

    return html;
  }

  function parseMarkdown(md) {
    const bodyHtml = parseMarkdownBodyOnly(md);
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            padding: 16px;
            margin: 0;
            background-color: #ffffff;
          }
          @media (prefers-color-scheme: dark) {
            body {
              color: #f3f4f6;
              background-color: #0d0a16;
            }
            th { background: #1f2937 !important; border-color: #374151 !important; }
            td { border-color: #374151 !important; }
            hr { background-color: #374151 !important; }
            h1 { border-color: #374151 !important; }
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
          }
          h1 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
          a { color: #0d9488; text-decoration: none; }
          a:hover { text-decoration: underline; }
          table td { padding: 6px 12px; border: 1px solid #e5e7eb; }
          table tr:nth-child(even) td { background: rgba(0,0,0,0.02); }
          hr { height: 1px; border: 0; background-color: #e5e7eb; margin: 24px 0; }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
      </html>
    `;
  }

  function parseCsvTableOnly(csvText) {
    if (!csvText || csvText.trim().length === 0) {
      return '<p style="color:#6b7280; font-style:italic;">Empty CSV or TSV data.</p>';
    }
    const firstLine = csvText.split('\n')[0] || '';
    const delimiter = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';
    const rows = [];
    const lines = csvText.split(/\r?\n/);
    
    for (let line of lines) {
      if (line.trim().length === 0) continue;
      const row = [];
      let inQuotes = false;
      let currentVal = '';
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            currentVal += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          row.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      row.push(currentVal.trim());
      rows.push(row);
    }

    if (rows.length === 0) return '<p>No data found.</p>';
    const header = rows[0];
    const dataRows = rows.slice(1);

    return `
      <div style="overflow-x: auto; margin: 12px 0;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr>
              <th style="padding: 6px 10px; background: rgba(0,0,0,0.04); border: 1px solid #e5e7eb; width: 36px; text-align: center; color: #9ca3af;">#</th>
              ${header.map(col => `<th style="padding: 6px 12px; background: rgba(0,0,0,0.04); border: 1px solid #e5e7eb; font-weight: 600;">${escapeHTML(col)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${dataRows.map((r, idx) => `
              <tr>
                <td style="padding: 6px 10px; border: 1px solid #e5e7eb; text-align: center; color: #9ca3af;">${idx + 1}</td>
                ${r.map(cell => `<td style="padding: 6px 12px; border: 1px solid #e5e7eb;">${escapeHTML(cell)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function parseCsvToHtml(csvText) {
    const tableHtml = parseCsvTableOnly(csvText);
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 16px;
            color: #1f2937;
            background: #ffffff;
            font-size: 13px;
          }
          @media (prefers-color-scheme: dark) {
            body { background: #0d0a16; color: #f3f4f6; }
            th { background: #1f2937 !important; border-color: #374151 !important; }
            td { border-color: #374151 !important; }
            tr:nth-child(even) td { background: rgba(255,255,255,0.02) !important; }
          }
          tr:nth-child(even) td { background: #fdfdfd; }
          tr:hover td { background: rgba(13, 148, 136, 0.08); }
        </style>
      </head>
      <body>
        <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #6b7280;">
          <span><strong>Tabular CSV / TSV View</strong></span>
          <span style="background: #0d9488; color: #fff; padding: 2px 8px; border-radius: 12px; font-weight: 600;">Data Table</span>
        </div>
        ${tableHtml}
      </body>
      </html>
    `;
  }

  function updatePreviews(immediate = false) {
    let rawContent = el.textarea.value;
    if (state.whitespaceVisible) {
      rawContent = cleanWhitespaceDisplay(rawContent);
    }
    
    let htmlContent = '';
    const format = state.previewFormat || 'auto';

    const isMarkdown = format === 'markdown' || (format === 'auto' && (state.editorMode === 'markdown' || state.extension === '.md'));
    const isCsv = format === 'csv' || (format === 'auto' && (state.extension === '.csv' || state.extension === '.tsv'));
    const isHtml = format === 'html' || (format === 'auto' && (state.editorMode === 'html' || state.extension === '.html'));
    const isRaw = format === 'raw';

    // Update Split Preview header label
    if (el.splitPreviewTitle) {
      let formatName = 'Live Preview';
      if (isMarkdown) formatName = 'Markdown Preview';
      else if (isCsv) formatName = 'CSV Table Preview';
      else if (isHtml) formatName = 'HTML Preview';
      else if (isRaw) formatName = 'Raw Text Preview';
      el.splitPreviewTitle.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1.1rem; vertical-align: middle; margin-right: 4px;">visibility</span>${formatName}`;
    }

    if (isMarkdown) {
      htmlContent = parseMarkdown(rawContent);
    } else if (isCsv) {
      htmlContent = parseCsvToHtml(rawContent);
    } else if (isHtml) {
      htmlContent = rawContent;
    } else {
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
              body { color: #f3f4f6; background-color: #0d0a16; }
            }
          </style>
        </head>
        <body>${escaped}</body>
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
    
    if (state.editorMode === 'rich') {
      const text = el.richarea ? (el.richarea.innerText || '') : '';
      const words = (text.match(/\S+/g) || []).length;
      const chars = text.length;
      bar.innerHTML = `<span class="vim-mode-badge insert">VISUAL</span> RICH | ${words} words | ${chars} chars`;
      return;
    }

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

  function updateToolbarScrollHint() {
    if (!el.editorToolbar || !el.toolbarScrollHint) return;
    const maxScroll = el.editorToolbar.scrollWidth - el.editorToolbar.clientWidth;
    el.toolbarScrollHint.classList.toggle('is-scrolled-end', maxScroll <= 5 || el.editorToolbar.scrollLeft >= maxScroll - 15);
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
    updateToolbarScrollHint();
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
    const isLineOp = type === 'sort' || type === 'dedupe' || type === 'trim';

    function transformContent(raw) {
      if (type === 'upper') return raw.toUpperCase();
      if (type === 'lower') return raw.toLowerCase();
      if (type === 'title') return raw.replace(/\b\w/g, c => c.toUpperCase());
      if (type === 'sort') {
        const lines = raw.split('\n');
        return lines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join('\n');
      }
      if (type === 'dedupe') {
        const seen = new Set();
        return raw.split('\n').filter(line => {
          if (seen.has(line)) return false;
          seen.add(line);
          return true;
        }).join('\n');
      }
      if (type === 'trim') {
        return raw.split('\n').map(line => line.replace(/[ \t]+$/, '')).join('\n');
      }
      return raw;
    }

    function getOpToast(op) {
      if (op === 'sort') return '🔤 Sorted lines alphabetically';
      if (op === 'dedupe') return '🧹 Removed duplicate lines';
      if (op === 'trim') return '✂️ Trimmed trailing spaces';
      return null;
    }

    if (state.editorMode === 'rich') {
      if (el.richarea) el.richarea.focus(); // Focus first to enable selection restore on mobile
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const sel = window.getSelection();
      const hasSelection = sel && sel.toString().length > 0;

      if (!hasSelection && !isLineOp) {
        showToast('⚠️ Please select text to change case', 'error');
        return;
      }

      if (!hasSelection && isLineOp) {
        const converted = transformContent(el.richarea.innerText || el.richarea.textContent || '');
        el.richarea.innerText = converted;
      } else {
        const selectedText = sel.toString();
        const convertedText = transformContent(selectedText);
        document.execCommand('insertText', false, convertedText);
      }

      el.richarea.focus();
      runAnalytics();
      updatePreviews();
      saveSettings();
      const toastMsg = getOpToast(type);
      if (toastMsg) showToast(toastMsg, 'info');
      return;
    }

    let start = el.textarea.selectionStart;
    let end = el.textarea.selectionEnd;
    if (document.activeElement !== el.textarea && savedTextareaStart !== undefined) {
      start = savedTextareaStart;
      end = savedTextareaEnd;
    }

    const value = el.textarea.value;

    if (start === end && !isLineOp) {
      showToast('⚠️ Please select text to change case', 'error');
      return;
    }

    if (start === end && isLineOp) {
      start = 0;
      end = value.length;
    }

    const selectedText = value.substring(start, end);
    const convertedText = transformContent(selectedText);

    el.textarea.setRangeText(convertedText, start, end, 'select');
    el.textarea.focus();
    el.textarea.setSelectionRange(start, start + convertedText.length);

    // Keep saved coordinates in sync
    savedTextareaStart = start;
    savedTextareaEnd = start + convertedText.length;

    el.textarea.dispatchEvent(new Event('input'));
    const toastMsg = getOpToast(type);
    if (toastMsg) showToast(toastMsg, 'info');
  }

  function runDevTool(tool) {
    function transform(raw) {
      if (tool === 'url-encode') {
        return encodeURIComponent(raw);
      }
      if (tool === 'url-decode') {
        return decodeURIComponent(raw);
      }
      if (tool === 'base64-encode') {
        return btoa(unescape(encodeURIComponent(raw)));
      }
      if (tool === 'base64-decode') {
        return decodeURIComponent(escape(atob(raw.trim())));
      }
      if (tool === 'json-prettify') {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      }
      if (tool === 'json-minify') {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed);
      }
      return raw;
    }

    function getToolToast(t) {
      if (t === 'url-encode') return '🔗 URL Encoded';
      if (t === 'url-decode') return '🔗 URL Decoded';
      if (t === 'base64-encode') return '🔐 Base64 Encoded';
      if (t === 'base64-decode') return '🔓 Base64 Decoded';
      if (t === 'json-prettify') return '✨ JSON Formatted';
      if (t === 'json-minify') return '📦 JSON Minified';
      return null;
    }

    try {
      if (state.editorMode === 'rich') {
        if (el.richarea) el.richarea.focus();
        const sel = window.getSelection();
        const hasSelection = sel && sel.toString().length > 0;
        if (hasSelection) {
          const transformed = transform(sel.toString());
          document.execCommand('insertText', false, transformed);
        } else {
          const raw = el.richarea.innerText || el.richarea.textContent || '';
          if (!raw.trim()) {
            showToast('⚠️ Document is empty', 'error');
            return;
          }
          el.richarea.innerText = transform(raw);
        }
        runAnalytics();
        updatePreviews();
        saveSettings();
        const msg = getToolToast(tool);
        if (msg) showToast(msg, 'success');
        return;
      }

      let start = el.textarea.selectionStart;
      let end = el.textarea.selectionEnd;
      if (document.activeElement !== el.textarea && savedTextareaStart !== undefined) {
        start = savedTextareaStart;
        end = savedTextareaEnd;
      }
      const val = el.textarea.value;
      const isSelection = start !== end;
      const targetText = isSelection ? val.substring(start, end) : val;

      if (!targetText.trim()) {
        showToast('⚠️ Text is empty', 'error');
        return;
      }

      const transformed = transform(targetText);

      if (isSelection) {
        el.textarea.setRangeText(transformed, start, end, 'select');
        el.textarea.focus();
        el.textarea.setSelectionRange(start, start + transformed.length);
        savedTextareaStart = start;
        savedTextareaEnd = start + transformed.length;
      } else {
        el.textarea.value = transformed;
        el.textarea.focus();
      }

      el.textarea.dispatchEvent(new Event('input'));
      const msg = getToolToast(tool);
      if (msg) showToast(msg, 'success');
    } catch (err) {
      console.error('Developer tool error:', err);
      showToast(`❌ Error: ${err.message || 'Operation failed'}`, 'error');
    }
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

    // Estimated File Size
    const byteSize = new Blob([text]).size;
    let fileSizeText = '0 B';
    if (byteSize < 1024) fileSizeText = `${byteSize} B`;
    else if (byteSize < 1024 * 1024) fileSizeText = `${(byteSize / 1024).toFixed(1)} KB`;
    else fileSizeText = `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;

    // Readability / Grade Level (Flesch-Kincaid formula)
    let syllables = 0;
    const wordsArr = text.toLowerCase().match(/[a-z]+/g) || [];
    for (const w of wordsArr) {
      let count = (w.match(/[aeiouy]{1,2}/g) || []).length;
      if (w.endsWith('e') && !w.endsWith('le') && count > 1) count--;
      syllables += Math.max(1, count);
    }
    let readingEase = 100;
    if (wordCount > 0 && sentenceCount > 0) {
      readingEase = Math.round(206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * (syllables / wordCount)));
      readingEase = Math.max(0, Math.min(100, readingEase));
    }
    let readabilityText = 'Standard';
    if (wordCount === 0) readabilityText = 'Standard';
    else if (readingEase >= 90) readabilityText = 'Very Easy (5th gr)';
    else if (readingEase >= 80) readabilityText = 'Easy (6th gr)';
    else if (readingEase >= 70) readabilityText = 'Fairly Easy (7th gr)';
    else if (readingEase >= 60) readabilityText = 'Standard (8-9th gr)';
    else if (readingEase >= 50) readabilityText = 'Fairly Difficult';
    else if (readingEase >= 30) readabilityText = 'Difficult (College)';
    else readabilityText = 'Graduate Level';

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
    setStatText('size', fileSizeText);
    setStatText('readability', readabilityText);
  }

  function setMobileStatsMode(mode) {
    if (!['full', 'compact'].includes(mode)) mode = 'compact';
    state.mobileStatsMode = mode;
    safeStorage.setItem('et_mobile_stats_mode', mode);

    if (el.mobileAnalyticsPanel) {
      el.mobileAnalyticsPanel.setAttribute('data-mode', mode);
      el.mobileAnalyticsPanel.classList.remove('hidden');
      
      if (mode === 'compact') {
        if (el.mobileStatsCompactView) el.mobileStatsCompactView.classList.remove('hidden');
        if (el.mobileStatsFullView) el.mobileStatsFullView.classList.add('hidden');
        if (el.btnStatsModeCompact) el.btnStatsModeCompact.classList.add('active');
        if (el.btnStatsModeFull) el.btnStatsModeFull.classList.remove('active');
      } else if (mode === 'full') {
        if (el.mobileStatsCompactView) el.mobileStatsCompactView.classList.add('hidden');
        if (el.mobileStatsFullView) el.mobileStatsFullView.classList.remove('hidden');
        if (el.btnStatsModeFull) el.btnStatsModeFull.classList.add('active');
        if (el.btnStatsModeCompact) el.btnStatsModeCompact.classList.remove('active');
      }
    }
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
    const themes = ['light', 'dark', 'cyberpunk', 'forest', 'dracula', 'monokai', 'nord', 'solarized', 'rose-pine', 'sepia'];
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

  function toggleZenMode() {
    const isZen = document.body.classList.toggle('zen-mode');
    if (el.btnZenExit) {
      el.btnZenExit.style.setProperty('display', isZen ? 'flex' : 'none', 'important');
    }
    if (isZen) {
      if (el.btnToolbarZen) el.btnToolbarZen.classList.add('active');
      showToast('🧘 Zen Mode activated (Press Esc to exit)', 'info');
    } else {
      if (el.btnToolbarZen) el.btnToolbarZen.classList.remove('active');
      showToast('Exited Zen Mode', 'info');
    }
  }

  function exitZenMode() {
    if (document.body.classList.contains('zen-mode')) {
      document.body.classList.remove('zen-mode');
      if (el.btnZenExit) {
        el.btnZenExit.style.setProperty('display', 'none', 'important');
      }
      if (el.btnToolbarZen) el.btnToolbarZen.classList.remove('active');
      showToast('Exited Zen Mode', 'info');
    }
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

  // --- FORMAT & DRAFT UTILITIES ---
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'recently';
    const diff = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // --- RECENT DRAFTS & AUTOSAVE RECOVERY ENGINE ---
  function getRecentDocs() {
    try {
      const raw = safeStorage.getItem('et_recent_docs');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecentDocs(docs) {
    try {
      safeStorage.setItem('et_recent_docs', JSON.stringify(docs.slice(0, 15)));
    } catch (e) {
      console.warn('Failed to save recent docs:', e);
    }
  }

  function recordCurrentDraft(explicitContent = null) {
    let content = explicitContent !== null ? explicitContent : el.textarea.value;
    if (state.whitespaceVisible) {
      content = cleanWhitespaceDisplay(content);
    }
    if (!content || content.trim().length === 0) return;

    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    const docId = state.currentDraftId || (Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5));
    state.currentDraftId = docId;

    const docRecord = {
      id: docId,
      name: state.filename || 'untitled',
      ext: state.extension || '.txt',
      content: content,
      mode: state.editorMode,
      words: words,
      chars: chars,
      sizeFormatted: formatBytes(new Blob([content]).size),
      timestamp: Date.now()
    };

    let docs = getRecentDocs().filter(d => d.id !== docId && !(d.name === docRecord.name && d.content === docRecord.content));
    docs.unshift(docRecord);
    saveRecentDocs(docs);
  }

  function checkResumeDraftBanner() {
    if (!el.resumeDraftBanner) return;
    try {
      if (sessionStorage.getItem('et_banner_dismissed') === 'true') {
        el.resumeDraftBanner.classList.add('hidden');
        return;
      }
    } catch (e) {}

    const docs = getRecentDocs();
    if (docs.length > 0 && docs[0].content && docs[0].content.trim().length > 5) {
      const draft = docs[0];
      const timeAgo = formatTimeAgo(draft.timestamp);
      if (el.resumeDraftFilename) el.resumeDraftFilename.textContent = `${draft.name}${draft.ext}`;
      if (el.resumeDraftWords) el.resumeDraftWords.textContent = `• ${draft.words.toLocaleString()} words`;
      if (el.resumeDraftTime) el.resumeDraftTime.textContent = ` • edited ${timeAgo}`;
      if (el.resumeDraftMeta && !el.resumeDraftWords) el.resumeDraftMeta.textContent = `• ${draft.words.toLocaleString()} words • edited ${timeAgo}`;
      el.resumeDraftBanner.classList.remove('hidden');
    } else {
      el.resumeDraftBanner.classList.add('hidden');
    }
  }

  function restoreDraft(draft) {
    if (!draft) return;
    state.currentDraftId = draft.id;
    state.filename = draft.name;
    state.extension = draft.ext || '.txt';
    el.filenameInput.value = draft.name;
    el.fileExtSpan.textContent = draft.ext || '.txt';

    if (draft.mode) setEditorMode(draft.mode);
    el.textarea.value = draft.content;
    if (state.editorMode === 'rich' && el.richarea) {
      el.richarea.innerHTML = draft.ext === '.html' ? draft.content : escapeHTML(draft.content).replace(/\n/g, '<br>');
    }

    state.editorActive = true;
    switchTab('text');
    updateLineNumbers();
    runAnalytics();
    updatePreviews(true);
    toggleWelcomeVisibility();
    saveSettings();

    if (el.resumeDraftBanner) el.resumeDraftBanner.classList.add('hidden');
    showToast(`🔄 Restored draft: ${draft.name}${draft.ext}`, 'success');
  }

  function openRecentFilesModal() {
    if (!el.recentFilesDialog) return;
    renderRecentFilesList();
    if (typeof el.recentFilesDialog.showModal === 'function') {
      el.recentFilesDialog.showModal();
    } else {
      el.recentFilesDialog.classList.remove('hidden');
    }
  }

  function closeRecentFilesModal() {
    if (!el.recentFilesDialog) return;
    if (typeof el.recentFilesDialog.close === 'function') {
      el.recentFilesDialog.close();
    } else {
      el.recentFilesDialog.classList.add('hidden');
    }
  }

  function renderRecentFilesList() {
    if (!el.recentFilesList) return;
    const docs = getRecentDocs();
    if (el.recentFilesCount) {
      el.recentFilesCount.textContent = `${docs.length} saved ${docs.length === 1 ? 'draft' : 'drafts'}`;
    }
    el.recentFilesList.innerHTML = '';

    if (docs.length === 0) {
      el.recentFilesList.innerHTML = `
        <div class="recent-empty-state">
          <span class="material-symbols-outlined recent-empty-icon">history_toggle_off</span>
          <p style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No recent drafts yet</p>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Start writing or open a file and your drafts will be securely saved here.</p>
        </div>
      `;
      return;
    }

    docs.forEach(doc => {
      const item = document.createElement('div');
      item.className = 'recent-file-item';
      const icon = doc.ext === '.md' ? 'edit_note' : (doc.ext === '.csv' || doc.ext === '.tsv' ? 'table_chart' : (doc.ext === '.html' ? 'code' : 'description'));
      
      item.innerHTML = `
        <div class="recent-file-info" role="button" tabindex="0" title="Click to load draft">
          <span class="material-symbols-outlined recent-file-icon">${icon}</span>
          <div class="recent-file-details">
            <div class="recent-file-name">${escapeHTML(doc.name)}${escapeHTML(doc.ext)}</div>
            <div class="recent-file-sub">
              <span>${doc.words.toLocaleString()} words</span>
              <span>&bull;</span>
              <span>${doc.sizeFormatted}</span>
              <span>&bull;</span>
              <span>${formatTimeAgo(doc.timestamp)}</span>
            </div>
          </div>
        </div>
        <div class="recent-file-actions">
          <button class="btn btn-sm btn-primary btn-load-recent" title="Open this draft">Open</button>
          <button class="btn btn-sm btn-download-recent" title="Download file"><span class="material-symbols-outlined" style="font-size: 0.95rem;">download</span></button>
          <button class="btn btn-sm btn-danger btn-delete-recent" title="Remove from history"><span class="material-symbols-outlined" style="font-size: 0.95rem;">delete</span></button>
        </div>
      `;

      item.querySelector('.recent-file-info').addEventListener('click', () => {
        restoreDraft(doc);
        closeRecentFilesModal();
      });

      item.querySelector('.btn-load-recent').addEventListener('click', () => {
        restoreDraft(doc);
        closeRecentFilesModal();
      });

      item.querySelector('.btn-download-recent').addEventListener('click', () => {
        triggerDownload(doc.content, `${doc.name}${doc.ext}`, 'text/plain;charset=utf-8');
        showToast(`💾 Downloaded ${doc.name}${doc.ext}`, 'success');
      });

      item.querySelector('.btn-delete-recent').addEventListener('click', (e) => {
        e.stopPropagation();
        const updated = getRecentDocs().filter(d => d.id !== doc.id);
        saveRecentDocs(updated);
        renderRecentFilesList();
        checkResumeDraftBanner();
        showToast('🗑️ Removed draft from recents', 'info');
      });

      el.recentFilesList.appendChild(item);
    });
  }

  // --- NATIVE FILE SYSTEM ACCESS API & SYNC ---
  const supportsFileSystemAccess = ('showOpenFilePicker' in window && 'showSaveFilePicker' in window);

  function updateSyncBadge(active) {
    if (!el.fileSyncBadge) return;
    if (active && state.activeFileHandle) {
      el.fileSyncBadge.classList.remove('hidden');
      el.fileSyncBadge.title = `Directly synchronized to: ${state.activeFileHandleName} (Ctrl+S saves in-place)`;
      const saveLabel = document.getElementById('btn-save-label');
      if (saveLabel) saveLabel.textContent = 'Sync';
    } else {
      el.fileSyncBadge.classList.add('hidden');
      const saveLabel = document.getElementById('btn-save-label');
      if (saveLabel) saveLabel.textContent = 'Save';
    }
  }

  function loadDocumentIntoEditor(fileName, textVal) {
    const nameParts = fileName.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '.txt';
    const baseName = nameParts.join('.');

    state.filename = baseName;
    state.extension = ext;
    el.filenameInput.value = baseName;
    el.fileExtSpan.textContent = ext;

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

    if (state.whitespaceVisible) {
      textVal = convertToWhitespaceDisplay(textVal);
    }
    el.textarea.value = textVal;
    if (state.editorMode === 'rich' && el.richarea) {
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
    updatePreviews(true);
    toggleWelcomeVisibility();

    const cleanText = state.whitespaceVisible ? cleanWhitespaceDisplay(el.textarea.value) : el.textarea.value;
    historyState.push(cleanText, el.textarea.selectionStart, el.textarea.selectionEnd);
    recordCurrentDraft(cleanText);
    saveSettings();
  }

  async function openFile() {
    if (supportsFileSystemAccess) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Text, Code, Markdown & Data Files',
              accept: {
                'text/*': ['.txt', '.md', '.csv', '.tsv', '.html', '.css', '.js', '.ts', '.json', '.py', '.sql', '.cpp', '.xml'],
                'image/*': ['.png', '.jpg', '.jpeg', '.webp']
              }
            }
          ]
        });
        if (handle) {
          const file = await handle.getFile();
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(evt) {
              state.photo.src = evt.target.result;
              const nameParts = file.name.split('.');
              state.extension = nameParts.length > 1 ? '.' + nameParts.pop() : '.png';
              state.filename = nameParts.join('.');
              el.filenameInput.value = state.filename;
              switchTab('photo');
              loadPhoto(evt.target.result);
              saveSettings();
              showToast(`🖼️ Loaded photo: ${file.name}`, 'success');
            };
            reader.readAsDataURL(file);
            return;
          }

          state.activeFileHandle = handle;
          state.activeFileHandleName = file.name;
          updateSyncBadge(true);
          const text = await file.text();
          loadDocumentIntoEditor(file.name, text);
          showToast(`📁 Opened ${file.name} (Direct Disk Sync Active)`, 'success');
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Native picker aborted, falling back:', err);
      }
    }
    el.fileSelector.click();
  }

  function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    state.activeFileHandle = null;
    state.activeFileHandleName = null;
    updateSyncBadge(false);

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
        loadDocumentIntoEditor(file.name, evt.target.result);
        showToast(`📁 Loaded ${file.name}`, 'success');
      };
      reader.readAsText(file);
    }
    el.fileSelector.value = '';
  }

  async function downloadFile(forceSaveAs = false) {
    if (state.activeTab !== 'text') {
      if (!state.photo.src) {
        showToast('⚠️ No photo to save!', 'error');
        return;
      }
      exportPhoto();
      return;
    }

    let text = el.textarea.value;
    if (state.editorMode === 'rich' && state.extension === '.html' && el.richarea) {
      text = el.richarea.innerHTML;
    }
    if (state.whitespaceVisible) {
      text = cleanWhitespaceDisplay(text);
    }

    // Direct in-place disk save if handle is active
    if (!forceSaveAs && state.activeFileHandle && typeof state.activeFileHandle.createWritable === 'function') {
      try {
        const writable = await state.activeFileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        recordCurrentDraft(text);
        showToast(`💾 Saved directly to disk: ${state.activeFileHandleName}`, 'success');
        updateSyncBadge(true);
        return;
      } catch (err) {
        console.warn('Failed in-place write, falling back:', err);
      }
    }

    // Native showSaveFilePicker
    if (supportsFileSystemAccess) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: state.filename + state.extension,
          types: [
            {
              description: 'Text Document',
              accept: { 'text/plain': [state.extension || '.txt'] }
            }
          ]
        });
        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(text);
          await writable.close();
          const file = await handle.getFile();
          state.activeFileHandle = handle;
          state.activeFileHandleName = file.name;
          
          const nameParts = file.name.split('.');
          state.extension = nameParts.length > 1 ? '.' + nameParts.pop() : '.txt';
          state.filename = nameParts.join('.');
          el.filenameInput.value = state.filename;
          el.fileExtSpan.textContent = state.extension;
          
          updateSyncBadge(true);
          recordCurrentDraft(text);
          saveSettings();
          showToast(`💾 Saved directly to disk: ${file.name}`, 'success');
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Save file picker error, falling back:', err);
      }
    }

    // Browser download fallback
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.filename + state.extension;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    recordCurrentDraft(text);
    showToast(`💾 Downloaded ${state.filename}${state.extension}`, 'success');
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

  // --- ADVANCED PRINT & PDF SETUP DIALOG ---
  function openPrintSetupDialog() {
    if (!el.printDialog) {
      window.print();
      return;
    }
    const isRenderable = state.editorMode === 'markdown' || state.editorMode === 'html' || state.extension === '.md' || state.extension === '.csv' || state.extension === '.tsv';
    const sourcePills = document.querySelectorAll('#print-source-pills .print-pill');
    sourcePills.forEach(p => {
      const isRendered = p.dataset.source === 'rendered';
      p.classList.toggle('active', isRenderable ? isRendered : !isRendered);
    });
    state.printSettings.source = isRenderable ? 'rendered' : 'raw';

    if (typeof el.printDialog.showModal === 'function') {
      el.printDialog.showModal();
    } else {
      el.printDialog.classList.remove('hidden');
    }
  }

  function closePrintSetupDialog() {
    if (!el.printDialog) return;
    if (typeof el.printDialog.close === 'function') {
      el.printDialog.close();
    } else {
      el.printDialog.classList.add('hidden');
    }
  }

  function executeCustomPrint() {
    closePrintSetupDialog();

    const { source, paperSize, orientation, margin, fontSize, includeHeader, includeLineNumbers, includeFooter } = state.printSettings;
    let rawText = el.textarea.value;
    if (state.whitespaceVisible) rawText = cleanWhitespaceDisplay(rawText);

    const marginMap = { compact: '10mm', standard: '20mm', wide: '30mm' };
    const marginVal = marginMap[margin] || '20mm';

    let printStyleTag = document.getElementById('dynamic-print-style');
    if (!printStyleTag) {
      printStyleTag = document.createElement('style');
      printStyleTag.id = 'dynamic-print-style';
      document.head.appendChild(printStyleTag);
    }
    printStyleTag.textContent = `@page { size: ${paperSize} ${orientation}; margin: ${marginVal}; }`;

    let bodyHtml = '';
    const timestampStr = new Date().toLocaleString();
    const docTitle = `${state.filename}${state.extension}`;

    const headerHtml = includeHeader ? `
      <div class="print-header">
        <span><strong>${escapeHTML(docTitle)}</strong></span>
        <span>${timestampStr}</span>
      </div>
    ` : '';

    const footerHtml = includeFooter ? `
      <div class="print-footer">
        <span>Document created with Editor Text &bull; editortext.com</span>
        <span>Page &num;</span>
      </div>
    ` : '';

    if (source === 'rendered') {
      if (state.editorMode === 'markdown' || state.extension === '.md') {
        bodyHtml = parseMarkdownBodyOnly(rawText);
      } else if (state.extension === '.csv' || state.extension === '.tsv') {
        bodyHtml = parseCsvTableOnly(rawText);
      } else if (state.editorMode === 'html' || state.extension === '.html') {
        bodyHtml = rawText;
      } else {
        bodyHtml = `<pre style="white-space: pre-wrap; font-family: monospace;">${escapeHTML(rawText)}</pre>`;
      }
    } else {
      const lines = rawText.split('\n');
      if (includeLineNumbers) {
        bodyHtml = `
          <div style="font-family: ui-monospace, monospace; font-size: ${fontSize}; line-height: 1.5;">
            ${lines.map((l, i) => `
              <div style="display: flex;">
                <span style="width: 48px; color: #9ca3af; text-align: right; margin-right: 16px; user-select: none;">${i + 1}</span>
                <span style="flex: 1; white-space: pre-wrap; word-break: break-all;">${escapeHTML(l) || '&nbsp;'}</span>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        bodyHtml = `<pre style="white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: ${fontSize}; line-height: 1.5; margin: 0;">${escapeHTML(rawText)}</pre>`;
      }
    }

    el.printRenderContainer.innerHTML = `
      <div class="print-page">
        ${headerHtml}
        <div class="print-content" style="font-size: ${fontSize};">
          ${bodyHtml}
        </div>
        ${footerHtml}
      </div>
    `;

    document.body.classList.add('printing-custom');
    
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-custom');
        el.printRenderContainer.innerHTML = '';
      }, 1000);
    }, 100);
  }

  // --- EXPORT DOCUMENT SUITE ---
  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportDocument(format) {
    if (state.activeTab !== 'text') {
      showToast('⚠️ Document export is only for text documents', 'error');
      return;
    }

    const baseName = state.filename || 'document';
    let textContent = el.textarea.value;
    if (state.whitespaceVisible) {
      textContent = cleanWhitespaceDisplay(textContent);
    }
    const htmlContent = state.editorMode === 'rich' ? (el.richarea.innerHTML || '') : `<pre>${escapeHtml(textContent)}</pre>`;
    const rawText = state.editorMode === 'rich' ? (el.richarea.innerText || el.richarea.textContent || '') : textContent;

    if (format === 'save-as') {
      downloadFile(true);
    } else if (format === 'txt') {
      triggerDownload(rawText, `${baseName}.txt`, 'text/plain;charset=utf-8');
      showToast(`💾 Exported ${baseName}.txt`, 'success');
    } else if (format === 'md') {
      triggerDownload(rawText, `${baseName}.md`, 'text/markdown;charset=utf-8');
      showToast(`📝 Exported ${baseName}.md`, 'success');
    } else if (format === 'csv') {
      triggerDownload(rawText, `${baseName}.csv`, 'text/csv;charset=utf-8');
      showToast(`📊 Exported ${baseName}.csv`, 'success');
    } else if (format === 'html') {
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(baseName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1f2937; background: #ffffff; }
    h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(baseName)}</h1>
  <div class="content">
    ${state.editorMode === 'rich' ? htmlContent : `<pre>${escapeHtml(rawText)}</pre>`}
  </div>
</body>
</html>`;
      triggerDownload(fullHtml, `${baseName}.html`, 'text/html;charset=utf-8');
      showToast(`🌐 Exported ${baseName}.html`, 'success');
    } else if (format === 'doc') {
      const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${escapeHtml(baseName)}</title>
  <style>
    body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; margin: 1in; }
    h1 { font-size: 18pt; color: #1e3a8a; }
  </style>
</head>
<body>
  <h1>${escapeHtml(baseName)}</h1>
  ${state.editorMode === 'rich' ? htmlContent : `<pre style="font-family: Calibri, sans-serif; white-space: pre-wrap;">${escapeHtml(rawText)}</pre>`}
</body>
</html>`;
      triggerDownload(docHtml, `${baseName}.doc`, 'application/msword;charset=utf-8');
      showToast(`📄 Exported ${baseName}.doc (Word)`, 'success');
    } else if (format === 'pdf') {
      openPrintSetupDialog();
    }
  }

  // --- TEXT-TO-SPEECH (READ ALOUD) ---
  function toggleSpeechSynthesis() {
    if (!('speechSynthesis' in window)) {
      showToast('⚠️ Speech synthesis is not supported in this browser', 'error');
      return;
    }

    if (window.speechSynthesis.speaking || isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      if (el.btnToolbarTts) {
        el.btnToolbarTts.classList.remove('speaking');
        el.btnToolbarTts.setAttribute('title', 'Read aloud (Text-to-Speech)');
        el.btnToolbarTts.setAttribute('aria-label', 'Read aloud (Text-to-Speech)');
      }
      showToast('⏹️ Speech stopped', 'info');
      return;
    }

    let textToRead = '';
    if (state.editorMode === 'rich') {
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) {
        textToRead = sel.toString().trim();
      } else if (el.richarea) {
        textToRead = (el.richarea.innerText || el.richarea.textContent || '').trim();
      }
    } else if (el.textarea) {
      const start = el.textarea.selectionStart;
      const end = el.textarea.selectionEnd;
      if (start !== end) {
        textToRead = el.textarea.value.substring(start, end).trim();
      } else {
        textToRead = el.textarea.value.trim();
      }
    }

    if (!textToRead) {
      showToast('⚠️ Document is empty', 'error');
      return;
    }

    window.speechSynthesis.cancel();
    speechUtterance = new SpeechSynthesisUtterance(textToRead);
    speechUtterance.rate = 1.0;
    speechUtterance.pitch = 1.0;

    speechUtterance.onstart = () => {
      isSpeaking = true;
      if (el.btnToolbarTts) {
        el.btnToolbarTts.classList.add('speaking');
        el.btnToolbarTts.setAttribute('title', 'Stop reading aloud');
        el.btnToolbarTts.setAttribute('aria-label', 'Stop reading aloud');
      }
    };

    const cleanupSpeaking = () => {
      isSpeaking = false;
      if (el.btnToolbarTts) {
        el.btnToolbarTts.classList.remove('speaking');
        el.btnToolbarTts.setAttribute('title', 'Read aloud (Text-to-Speech)');
        el.btnToolbarTts.setAttribute('aria-label', 'Read aloud (Text-to-Speech)');
      }
    };

    speechUtterance.onend = cleanupSpeaking;
    speechUtterance.onerror = cleanupSpeaking;

    window.speechSynthesis.speak(speechUtterance);
    showToast('🔊 Reading document aloud...', 'info');
  }

  // --- DIFF / TEXT COMPARISON TOOL ---
  function openDiffDialog() {
    if (!el.diffDialog) return;
    if (el.diffOriginal && !el.diffOriginal.value) {
      let currentText = state.editorMode === 'rich' ? (el.richarea.innerText || el.richarea.textContent || '') : el.textarea.value;
      if (state.whitespaceVisible) currentText = cleanWhitespaceDisplay(currentText);
      el.diffOriginal.value = currentText;
    }
    el.diffDialog.showModal();
    if (el.diffModified) el.diffModified.focus();
  }

  function swapDiffTexts() {
    if (!el.diffOriginal || !el.diffModified) return;
    const temp = el.diffOriginal.value;
    el.diffOriginal.value = el.diffModified.value;
    el.diffModified.value = temp;
    if (el.diffResultsContainer && !el.diffResultsContainer.classList.contains('hidden')) {
      runDiffComparison();
    }
    showToast('🔄 Swapped original and modified texts', 'info');
  }

  function loadEditorIntoDiff() {
    if (!el.diffOriginal) return;
    let currentText = state.editorMode === 'rich' ? (el.richarea.innerText || el.richarea.textContent || '') : el.textarea.value;
    if (state.whitespaceVisible) currentText = cleanWhitespaceDisplay(currentText);
    el.diffOriginal.value = currentText;
    showToast('📥 Loaded current document into Original', 'info');
  }

  function applyDiffToEditor() {
    if (!el.diffModified) return;
    const newText = el.diffModified.value;
    if (state.editorMode === 'rich') {
      if (el.richarea) el.richarea.innerText = newText;
    } else if (el.textarea) {
      el.textarea.value = newText;
      el.textarea.dispatchEvent(new Event('input'));
    }
    runAnalytics();
    updatePreviews();
    saveSettings();
    if (el.diffDialog) el.diffDialog.close();
    showToast('✅ Applied modified text to document!', 'success');
  }

  function computeLineDiff(text1, text2) {
    const lines1 = text1 === '' ? [] : text1.split('\n');
    const lines2 = text2 === '' ? [] : text2.split('\n');
    const MAX_LINES = 1200;
    const s1 = lines1.slice(0, MAX_LINES);
    const s2 = lines2.slice(0, MAX_LINES);
    const len1 = s1.length;
    const len2 = s2.length;

    const dp = Array.from({ length: len1 + 1 }, () => new Uint16Array(len2 + 1));
    for (let i = 0; i < len1; i++) {
      for (let j = 0; j < len2; j++) {
        if (s1[i] === s2[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const diff = [];
    let i = len1, j = len2;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && s1[i - 1] === s2[j - 1]) {
        diff.unshift({ type: 'eq', text: s1[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'add', text: s2[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        diff.unshift({ type: 'del', text: s1[i - 1] });
        i--;
      }
    }
    return diff;
  }

  function runDiffComparison() {
    if (!el.diffOriginal || !el.diffModified || !el.diffOutputLines) return;
    const text1 = el.diffOriginal.value;
    const text2 = el.diffModified.value;

    const diff = computeLineDiff(text1, text2);

    let adds = 0;
    let dels = 0;
    let eqs = 0;

    el.diffOutputLines.innerHTML = '';
    const fragment = document.createDocumentFragment();

    diff.forEach((item) => {
      const lineEl = document.createElement('div');
      lineEl.className = `diff-line diff-${item.type}`;

      const sign = item.type === 'add' ? '+' : (item.type === 'del' ? '-' : ' ');
      if (item.type === 'add') adds++;
      else if (item.type === 'del') dels++;
      else eqs++;

      const signSpan = document.createElement('span');
      signSpan.className = 'diff-sign';
      signSpan.textContent = sign;

      const contentSpan = document.createElement('span');
      contentSpan.className = 'diff-text';
      contentSpan.textContent = item.text || ' ';

      lineEl.appendChild(signSpan);
      lineEl.appendChild(contentSpan);
      fragment.appendChild(lineEl);
    });

    el.diffOutputLines.appendChild(fragment);
    if (el.diffResultsContainer) el.diffResultsContainer.classList.remove('hidden');

    if (el.diffSummaryBadge) {
      el.diffSummaryBadge.classList.remove('hidden');
      el.diffSummaryBadge.innerHTML = `<span style="color: #10b981; font-weight: 600;">+${adds} added</span> &bull; <span style="color: #ef4444; font-weight: 600;">-${dels} removed</span> &bull; <span style="color: var(--text-secondary);">${eqs} unchanged</span>`;
    }
    showToast(`🔍 Compared: +${adds} -${dels}`, 'info');
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

    document.querySelectorAll('.photo-preset-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-preset') === 'original');
    });

    applyPhotoFilters();
    updatePhotoTransformations();
  }

  function applyPhotoPreset(presetName) {
    const presets = {
      original: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 0, opacity: 100 },
      vintage:  { brightness: 110, contrast: 90, saturate: 80, grayscale: 0, sepia: 40, invert: 0, blur: 0, hueRotate: -10, opacity: 100 },
      vivid:    { brightness: 105, contrast: 125, saturate: 150, grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 0, opacity: 100 },
      noir:     { brightness: 95, contrast: 140, saturate: 0, grayscale: 100, sepia: 0, invert: 0, blur: 0, hueRotate: 0, opacity: 100 },
      cyberpunk:{ brightness: 110, contrast: 130, saturate: 160, grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 180, opacity: 100 },
      warm:     { brightness: 105, contrast: 105, saturate: 120, grayscale: 0, sepia: 25, invert: 0, blur: 0, hueRotate: 15, opacity: 100 }
    };

    const target = presets[presetName];
    if (!target) return;

    Object.assign(state.photo.filters, target);

    if (el.filterBrightness) el.filterBrightness.value = target.brightness;
    if (el.filterContrast) el.filterContrast.value = target.contrast;
    if (el.filterSaturate) el.filterSaturate.value = target.saturate;
    if (el.filterGrayscale) el.filterGrayscale.value = target.grayscale;
    if (el.filterSepia) el.filterSepia.value = target.sepia;
    if (el.filterInvert) el.filterInvert.value = target.invert;
    if (el.filterBlur) el.filterBlur.value = target.blur;
    if (el.filterHueRotate) el.filterHueRotate.value = target.hueRotate;
    if (el.filterOpacity) el.filterOpacity.value = target.opacity;

    applyPhotoFilters();

    document.querySelectorAll('.photo-preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-preset') === presetName);
    });

    showToast(`🎨 Preset applied: ${presetName.charAt(0).toUpperCase() + presetName.slice(1)}`, 'info');
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
    document.querySelectorAll('.photo-preset-btn').forEach(b => b.classList.remove('active'));
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
    if (el.mobileTabText) el.mobileTabText.addEventListener('click', () => switchTab('text'));
    if (el.tabPreview) {
      el.tabPreview.addEventListener('click', () => switchTab('preview'));
    }
    el.tabPhoto.addEventListener('click', () => switchTab('photo'));
    if (el.mobileTabPhoto) el.mobileTabPhoto.addEventListener('click', () => switchTab('photo'));

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
    [el.btnBold, el.btnItalic, el.btnUnderline, el.btnStrike, el.btnH1, el.btnH2, el.btnLink, el.btnUpper, el.btnLower, el.btnTitle, el.btnSortLines, el.btnDedupeLines, el.btnTrimSpaces, el.btnUrlEncode, el.btnUrlDecode, el.btnB64Encode, el.btnB64Decode, el.btnJsonPrettify, el.btnJsonMinify].filter(Boolean).forEach(preventFocusLoss);

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

    if (el.editorToolbar) {
      el.editorToolbar.addEventListener('scroll', updateToolbarScrollHint, { passive: true });
      window.addEventListener('resize', updateToolbarScrollHint, { passive: true });
      if (el.toolbarScrollHint) {
        el.toolbarScrollHint.addEventListener('click', () => {
          el.editorToolbar.scrollBy({ left: 160, behavior: 'smooth' });
        });
      }
      updateToolbarScrollHint();
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
    
    if (el.btnSortLines) {
      el.btnSortLines.addEventListener('click', () => {
        changeCase('sort');
        closeAllPopovers();
      });
    }
    if (el.btnDedupeLines) {
      el.btnDedupeLines.addEventListener('click', () => {
        changeCase('dedupe');
        closeAllPopovers();
      });
    }
    if (el.btnTrimSpaces) {
      el.btnTrimSpaces.addEventListener('click', () => {
        changeCase('trim');
        closeAllPopovers();
      });
    }

    // Developer Utilities click listeners
    if (el.btnUrlEncode) el.btnUrlEncode.addEventListener('click', () => { runDevTool('url-encode'); closeAllPopovers(); });
    if (el.btnUrlDecode) el.btnUrlDecode.addEventListener('click', () => { runDevTool('url-decode'); closeAllPopovers(); });
    if (el.btnB64Encode) el.btnB64Encode.addEventListener('click', () => { runDevTool('base64-encode'); closeAllPopovers(); });
    if (el.btnB64Decode) el.btnB64Decode.addEventListener('click', () => { runDevTool('base64-decode'); closeAllPopovers(); });
    if (el.btnJsonPrettify) el.btnJsonPrettify.addEventListener('click', () => { runDevTool('json-prettify'); closeAllPopovers(); });
    if (el.btnJsonMinify) el.btnJsonMinify.addEventListener('click', () => { runDevTool('json-minify'); closeAllPopovers(); });

    // Export Document click listeners
    if (el.btnExportTxt) el.btnExportTxt.addEventListener('click', () => { exportDocument('txt'); closeAllPopovers(); });
    if (el.btnExportMd) el.btnExportMd.addEventListener('click', () => { exportDocument('md'); closeAllPopovers(); });
    if (el.btnExportHtml) el.btnExportHtml.addEventListener('click', () => { exportDocument('html'); closeAllPopovers(); });
    if (el.btnExportDoc) el.btnExportDoc.addEventListener('click', () => { exportDocument('doc'); closeAllPopovers(); });
    if (el.btnExportPdf) el.btnExportPdf.addEventListener('click', () => { exportDocument('pdf'); closeAllPopovers(); });

    // TTS & Diff listeners
    if (el.btnToolbarTts) el.btnToolbarTts.addEventListener('click', toggleSpeechSynthesis);
    if (el.btnToolbarDiff) el.btnToolbarDiff.addEventListener('click', openDiffDialog);
    if (el.btnCloseDiff) el.btnCloseDiff.addEventListener('click', () => el.diffDialog.close());
    if (el.btnRunDiff) el.btnRunDiff.addEventListener('click', runDiffComparison);
    if (el.btnDiffSwap) el.btnDiffSwap.addEventListener('click', swapDiffTexts);
    if (el.btnDiffLoadEditor) el.btnDiffLoadEditor.addEventListener('click', loadEditorIntoDiff);
    if (el.btnDiffApplyEditor) el.btnDiffApplyEditor.addEventListener('click', applyDiffToEditor);

    // Install PWA Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (el.btnInstallPwa) {
        el.btnInstallPwa.classList.remove('hidden');
      }
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (el.btnInstallPwa) {
        el.btnInstallPwa.classList.add('hidden');
      }
      showToast('🎉 Editor Text was successfully installed!', 'success');
    });

    if (el.btnInstallPwa) {
      el.btnInstallPwa.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          const choiceResult = await deferredInstallPrompt.userChoice;
          if (choiceResult && choiceResult.outcome === 'accepted') {
            showToast('🎉 App install initiated!', 'success');
          }
          deferredInstallPrompt = null;
          el.btnInstallPwa.classList.add('hidden');
        } else {
          showToast('📱 To install, tap your browser menu and choose "Install app" or "Add to Home Screen"', 'info');
        }
      });
    }
    if (el.btnToolbarZen) {
      el.btnToolbarZen.addEventListener('click', () => {
        toggleZenMode();
      });
    }
    if (el.btnZenExit) {
      el.btnZenExit.addEventListener('click', () => {
        exitZenMode();
      });
    }

    // Mobile Analytics Mode Switcher listeners
    if (el.btnStatsModeFull) {
      el.btnStatsModeFull.addEventListener('click', () => setMobileStatsMode('full'));
    }
    if (el.btnStatsModeCompact) {
      el.btnStatsModeCompact.addEventListener('click', () => setMobileStatsMode('compact'));
    }
    if (el.statusBar) {
      el.statusBar.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          if (state.mobileStatsMode === 'compact') {
            setMobileStatsMode('full');
            showToast('📊 Stats: Full View', 'info');
          } else {
            setMobileStatsMode('compact');
            showToast('📊 Stats: Compact View', 'info');
          }
        }
      });
    }

    // Footer Back to Top Button
    if (el.btnFooterBackToTop) {
      el.btnFooterBackToTop.addEventListener('click', () => {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
      });
    }

    // Footer Interactive Navigation Links & Actions
    document.querySelectorAll('.site-footer a[data-switch-mode]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const mode = link.getAttribute('data-switch-mode');
        if (mode && el.editorModeSelect) {
          el.editorModeSelect.value = mode;
          setEditorMode(mode);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.site-footer a[data-switch-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-switch-tab');
        if (tab) {
          switchTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    document.querySelectorAll('.site-footer a[data-action]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const act = link.getAttribute('data-action');
        if (act === 'save') {
          downloadFile();
        } else if (act === 'recents') {
          openRecentFilesModal();
        } else if (act === 'print') {
          openPrintSetupDialog();
        } else if (act === 'tts') {
          if (el.btnSpeak) el.btnSpeak.click();
        } else if (act === 'theme') {
          cycleTheme();
        } else if (act === 'zen') {
          toggleZenMode();
        } else if (act === 'palette') {
          openCommandPalette();
        }
      });
    });
    if (el.btnToolbarSettings) {
      el.btnToolbarSettings.addEventListener('click', () => {
        syncSettingsUI();
        el.settingsDialog.showModal();
      });
    }
    
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
      openPrintSetupDialog();
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
    // Sidebar Toggling Event Listeners (desktop FAB and mobile photo inline button)
    const toggleButtons = [el.btnToolbarSidebar, el.btnMobileSidebarTogglePhoto];
    toggleButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          if (el.appSidebar) {
            el.appSidebar.classList.toggle('collapsed');
            const isCollapsed = el.appSidebar.classList.contains('collapsed');
            
            if (el.btnToolbarSidebar) el.btnToolbarSidebar.classList.toggle('active', !isCollapsed);
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
          if (el.btnMobileSidebarTogglePhoto) el.btnMobileSidebarTogglePhoto.classList.remove('active');
          document.body.classList.add('sidebar-collapsed');
          safeStorage.setItem('et_sidebar_collapsed', 'true');
        }
      });
    }

    // Header buttons
    el.btnNew.addEventListener('click', createNewFile);
    el.btnOpen.addEventListener('click', openFile);
    el.btnSave.addEventListener('click', () => downloadFile(false));
    el.btnCopy.addEventListener('click', copyTextToClipboard);
    el.fileSelector.addEventListener('change', handleFileSelection);

    // Recent Files & Draft Recovery Listeners
    if (el.btnRecents) el.btnRecents.addEventListener('click', openRecentFilesModal);
    if (el.btnWelcomeRecents) el.btnWelcomeRecents.addEventListener('click', openRecentFilesModal);
    if (el.btnViewRecentsBanner) el.btnViewRecentsBanner.addEventListener('click', openRecentFilesModal);
    if (el.btnResumeDraft) el.btnResumeDraft.addEventListener('click', () => {
      const docs = getRecentDocs();
      if (docs.length > 0) restoreDraft(docs[0]);
    });
    if (el.btnDismissDraftBanner) el.btnDismissDraftBanner.addEventListener('click', () => {
      if (el.resumeDraftBanner) el.resumeDraftBanner.classList.add('hidden');
      try { sessionStorage.setItem('et_banner_dismissed', 'true'); } catch (e) {}
    });
    if (el.btnCloseRecentFiles) el.btnCloseRecentFiles.addEventListener('click', closeRecentFilesModal);
    if (el.btnClearRecentFiles) el.btnClearRecentFiles.addEventListener('click', () => {
      if (confirm('Clear all recent files and saved drafts from this browser?')) {
        saveRecentDocs([]);
        renderRecentFilesList();
        checkResumeDraftBanner();
        showToast('🗑️ Cleared all recent drafts', 'info');
      }
    });

    // Advanced Print & PDF Dialog Listeners
    if (el.btnClosePrintDialog) el.btnClosePrintDialog.addEventListener('click', closePrintSetupDialog);
    if (el.btnCancelPrint) el.btnCancelPrint.addEventListener('click', closePrintSetupDialog);
    if (el.btnExecutePrint) el.btnExecutePrint.addEventListener('click', executeCustomPrint);
    if (el.printPaperSize) {
      el.printPaperSize.addEventListener('change', (e) => {
        state.printSettings.paperSize = e.target.value;
      });
    }
    if (el.printOptHeader) {
      el.printOptHeader.addEventListener('change', (e) => {
        state.printSettings.includeHeader = e.target.checked;
      });
    }
    if (el.printOptLineNumbers) {
      el.printOptLineNumbers.addEventListener('change', (e) => {
        state.printSettings.includeLineNumbers = e.target.checked;
      });
    }
    if (el.printOptFooter) {
      el.printOptFooter.addEventListener('change', (e) => {
        state.printSettings.includeFooter = e.target.checked;
      });
    }
    if (el.printOptSyntax) {
      el.printOptSyntax.addEventListener('change', (e) => {
        state.printSettings.preserveSyntax = e.target.checked;
      });
    }

    const bindPrintPills = (containerId, settingKey) => {
      const pills = document.querySelectorAll(`#${containerId} .print-pill`);
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          pills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          state.printSettings[settingKey] = pill.dataset[settingKey] || pill.dataset.source || pill.dataset.orientation || pill.dataset.margin || pill.dataset.size;
        });
      });
    };
    bindPrintPills('print-source-pills', 'source');
    bindPrintPills('print-orientation-pills', 'orientation');
    bindPrintPills('print-margin-pills', 'margin');
    bindPrintPills('print-fontsize-pills', 'fontSize');

    // Split Preview Format Selector Pills
    const previewPills = document.querySelectorAll('.preview-format-pills .preview-pill');
    previewPills.forEach(pill => {
      pill.addEventListener('click', () => {
        previewPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.previewFormat = pill.dataset.format || 'auto';
        updatePreviews(true);
        showToast(`👁️ Preview format: ${pill.textContent}`, 'info');
      });
    });

    // Save As and CSV export
    if (el.btnExportSaveAs) {
      el.btnExportSaveAs.addEventListener('click', () => {
        if (el.popoverExport) el.popoverExport.classList.add('hidden');
        exportDocument('save-as');
      });
    }
    if (el.btnExportCsv) {
      el.btnExportCsv.addEventListener('click', () => {
        if (el.popoverExport) el.popoverExport.classList.add('hidden');
        exportDocument('csv');
      });
    }

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
      theme: document.getElementById('popover-theme'),
      export: document.getElementById('popover-export')
    };

    const popoverTriggers = {
      more: document.getElementById('btn-toolbar-more'),
      theme: document.getElementById('btn-toolbar-theme'),
      export: document.getElementById('btn-export-menu')
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
    if (popoverTriggers.export) popoverTriggers.export.addEventListener('click', (e) => { e.stopPropagation(); togglePopover('export'); });

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
    [el.infoDialog, el.shortcutsDialog, el.commandPaletteDialog, el.settingsDialog, el.diffDialog].filter(Boolean).forEach(registerModalEvents);

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
        openPrintSetupDialog();
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
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCommandPalette();
      }
      if (e.key === 'F1') {
        e.preventDefault();
        openCommandPalette();
      }
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        cycleThemes();
      }
      if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        cycleWordWrap();
      }
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (el.btnSplitToggle) el.btnSplitToggle.click();
      }
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        if (el.btnToolbarLines) el.btnToolbarLines.click();
      }
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        updatePreviews(true);
        showToast('🔄 Preview updated', 'info');
      }
      if (e.key === 'Escape') {
        if (document.body.classList.contains('zen-mode')) {
          e.preventDefault();
          exitZenMode();
        }
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

    // Photo Preset Buttons
    document.querySelectorAll('.photo-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        applyPhotoPreset(preset);
      });
    });

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
    { name: 'Toggle Zen Mode (Distraction-free)', shortcut: 'Esc', action: () => { toggleZenMode(); } },
    { name: 'Cycle Color Themes', shortcut: 'Alt-T', action: () => { cycleThemes(); } },
    { name: 'Theme: Light Clean', shortcut: '', action: () => { updateTheme('light'); showToast('🎨 Theme set to Light Clean', 'success'); } },
    { name: 'Theme: Dark Space', shortcut: '', action: () => { updateTheme('dark'); showToast('🎨 Theme set to Dark Space', 'success'); } },
    { name: 'Theme: Cyberpunk Neon', shortcut: '', action: () => { updateTheme('cyberpunk'); showToast('🎨 Theme set to Cyberpunk', 'success'); } },
    { name: 'Theme: Forest Emerald', shortcut: '', action: () => { updateTheme('forest'); showToast('🎨 Theme set to Forest Emerald', 'success'); } },
    { name: 'Theme: Dracula', shortcut: '', action: () => { updateTheme('dracula'); showToast('🎨 Theme set to Dracula', 'success'); } },
    { name: 'Theme: Monokai Pro', shortcut: '', action: () => { updateTheme('monokai'); showToast('🎨 Theme set to Monokai', 'success'); } },
    { name: 'Theme: Nord Frost', shortcut: '', action: () => { updateTheme('nord'); showToast('🎨 Theme set to Nord Frost', 'success'); } },
    { name: 'Theme: Solarized Dark', shortcut: '', action: () => { updateTheme('solarized'); showToast('🎨 Theme set to Solarized Dark', 'success'); } },
    { name: 'Theme: Rosé Pine', shortcut: '', action: () => { updateTheme('rose-pine'); showToast('🎨 Theme set to Rosé Pine', 'success'); } },
    { name: 'Theme: Sepia Paper', shortcut: '', action: () => { updateTheme('sepia'); showToast('🎨 Theme set to Sepia Paper', 'success'); } },
    { name: 'Sort Lines A-Z', shortcut: '', action: () => { changeCase('sort'); } },
    { name: 'Remove Duplicate Lines', shortcut: '', action: () => { changeCase('dedupe'); } },
    { name: 'Trim Trailing Spaces', shortcut: '', action: () => { changeCase('trim'); } },
    { name: 'Select all', shortcut: 'Ctrl-A', action: () => {
      if (state.editorMode === 'rich') {
        if (el.richarea) {
          el.richarea.focus();
          document.execCommand('selectAll', false, null);
        }
      } else if (el.textarea) {
        el.textarea.focus();
        el.textarea.select();
      }
    } },
    { name: 'Center selection', shortcut: '', action: () => { centerTextareaSelection(); } },
    { name: 'Go to line...', shortcut: 'Ctrl-G', action: () => { jumpToLineNumber(); } },
    { name: 'New Document', shortcut: 'Ctrl-N', action: () => { createNewFile(); } },
    { name: 'Open File', shortcut: 'Ctrl-O', action: () => { openFile(); } },
    { name: 'Recent Files & Drafts', shortcut: '', action: () => { openRecentFilesModal(); } },
    { name: 'Save / Sync File', shortcut: 'Ctrl-S', action: () => { downloadFile(false); } },
    { name: 'Save As (Choose Location)...', shortcut: '', action: () => { downloadFile(true); } },
    { name: 'Print & PDF Setup', shortcut: 'Ctrl-P', action: () => { openPrintSetupDialog(); } },
    { name: 'Copy to Clipboard', shortcut: 'Ctrl-C', action: () => { copyTextToClipboard(); } },
    { name: 'Undo Change', shortcut: 'Ctrl-Z', action: () => { el.btnToolbarUndo.click(); } },
    { name: 'Redo Change', shortcut: 'Ctrl-Y', action: () => { el.btnToolbarRedo.click(); } },
    { name: 'Toggle Word Wrap', shortcut: 'Alt-W', action: () => { cycleWordWrap(); } },
    { name: 'Toggle Line Numbers', shortcut: 'Alt-L', action: () => { el.btnToolbarLines.click(); } },
    { name: 'Toggle Split Live Preview', shortcut: 'Alt-V', action: () => { el.btnSplitToggle.click(); } },
    { name: 'Preview Format: Auto-detect', shortcut: '', action: () => { state.previewFormat = 'auto'; updatePreviews(true); showToast('Preview: Auto-detect', 'info'); } },
    { name: 'Preview Format: Markdown', shortcut: '', action: () => { state.previewFormat = 'markdown'; updatePreviews(true); showToast('Preview: Markdown', 'info'); } },
    { name: 'Preview Format: CSV Table', shortcut: '', action: () => { state.previewFormat = 'csv'; updatePreviews(true); showToast('Preview: CSV Table', 'info'); } },
    { name: 'Preview Format: HTML Live', shortcut: '', action: () => { state.previewFormat = 'html'; updatePreviews(true); showToast('Preview: HTML Live', 'info'); } },
    { name: 'Read Aloud (Text-to-Speech)', shortcut: '', action: () => { toggleSpeechSynthesis(); } },
    { name: 'Diff / Compare Texts', shortcut: '', action: () => { openDiffDialog(); } },
    { name: 'Export: Plain Text (.txt)', shortcut: '', action: () => { exportDocument('txt'); } },
    { name: 'Export: Markdown (.md)', shortcut: '', action: () => { exportDocument('md'); } },
    { name: 'Export: CSV Table (.csv)', shortcut: '', action: () => { exportDocument('csv'); } },
    { name: 'Export: HTML Document (.html)', shortcut: '', action: () => { exportDocument('html'); } },
    { name: 'Export: Word Document (.doc)', shortcut: '', action: () => { exportDocument('doc'); } },
    { name: 'Dev: URL Encode', shortcut: '', action: () => { runDevTool('url-encode'); } },
    { name: 'Dev: URL Decode', shortcut: '', action: () => { runDevTool('url-decode'); } },
    { name: 'Dev: Base64 Encode', shortcut: '', action: () => { runDevTool('base64-encode'); } },
    { name: 'Dev: Base64 Decode', shortcut: '', action: () => { runDevTool('base64-decode'); } },
    { name: 'Dev: Prettify JSON', shortcut: '', action: () => { runDevTool('json-prettify'); } },
    { name: 'Dev: Minify JSON', shortcut: '', action: () => { runDevTool('json-minify'); } },
    { name: 'Install App (PWA)', shortcut: '', action: () => { if (el.btnInstallPwa) el.btnInstallPwa.click(); } },
    { name: 'Photo: Vintage Preset', shortcut: '', action: () => { switchTab('photo'); applyPhotoPreset('vintage'); } },
    { name: 'Photo: Vivid Pop Preset', shortcut: '', action: () => { switchTab('photo'); applyPhotoPreset('vivid'); } },
    { name: 'Photo: Noir B&W Preset', shortcut: '', action: () => { switchTab('photo'); applyPhotoPreset('noir'); } },
    { name: 'Photo: Cyberpunk Preset', shortcut: '', action: () => { switchTab('photo'); applyPhotoPreset('cyberpunk'); } },
    { name: 'Stats: Compact View (Mobile)', shortcut: '', action: () => { setMobileStatsMode('compact'); showToast('📊 Stats: Compact View', 'info'); } },
    { name: 'Stats: Full Detailed View (Mobile)', shortcut: '', action: () => { setMobileStatsMode('full'); showToast('📊 Stats: Full View', 'info'); } },
    { name: 'Stats: Toggle Full / Compact (Mobile)', shortcut: '', action: () => { setMobileStatsMode(state.mobileStatsMode === 'compact' ? 'full' : 'compact'); } },
    { name: 'Photo: Warm Sun Preset', shortcut: '', action: () => { switchTab('photo'); applyPhotoPreset('warm'); } },
    { name: 'Photo: Reset All Filters', shortcut: '', action: () => { switchTab('photo'); resetFilters(); } }
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
