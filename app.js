/**
 * Web CTT Logística — Portal Abierto de Material de Estudio
 * Arquitectura SPA con enrutamiento por hash y doble motor de búsqueda:
 *  1. Búsqueda instantánea por Título / Ruta (por defecto en la barra superior)
 *  2. Búsqueda profunda dentro del Contenido de los documentos vía Google Apps Script API
 *     (buscador principal de la portada #inicio y modo "Contenido" en la barra superior)
 */

(() => {
  'use strict';

  // --- Constantes de configuración y almacenamiento ---
  const STORAGE_KEYS = {
    THEME: 'ctt_logistica_theme',
    FAVORITES: 'ctt_logistica_favorites',
    VIEW_MODE: 'ctt_logistica_view_mode',
    LIVE_CATALOG: 'ctt_live_catalog_v1',
  };

  const CATALOG_SYNC_TIMEOUT_MS = 10000;

  const DEFAULT_CONTENT_SEARCH_API_URL =
    'https://script.google.com/macros/s/AKfycbxVGYNvDqGse-nHCC0WhSotTGdGHs58SfN9DVldmv-ZrLL7wS0SAgjpsTnYQCNxW7Y/exec';

  // Opciones de filtro por Año y Semestre
  const YEAR_OPTIONS = [
    { id: 'all', label: 'Todos' },
    { id: '1', label: '1.° Año' },
    { id: '2', label: '2.° Año' },
    { id: 'general', label: 'General' },
  ];

  const SEMESTER_OPTIONS = [
    { id: 'all', label: 'Todos', year: null },
    { id: 1, label: '1.° Sem.', fullLabel: '1.° Semestre', year: '1', accent: '#2563EB' },
    { id: 2, label: '2.° Sem.', fullLabel: '2.° Semestre', year: '1', accent: '#0284C7' },
    { id: 3, label: '3.° Sem.', fullLabel: '3.° Semestre', year: '2', accent: '#10B981' },
    { id: 4, label: '4.° Sem.', fullLabel: '4.° Semestre', year: '2', accent: '#F59E0B' },
  ];

  // Categorías principales; cualquier archivo fuera de las 5 primeras se agrupa en 'other' (Otros)
  const PRIMARY_CATEGORIES = new Set(['pdf', 'slides', 'image', 'word', 'excel']);

  const CATEGORY_META = {
    all: {
      label: 'Todos',
      shortLabel: 'Todos',
      className: 'cat-all',
      icon: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    },
    pdf: {
      label: 'PDF',
      shortLabel: 'PDF',
      className: 'cat-pdf',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15h6"></path><path d="M9 11h6"></path></svg>`,
    },
    slides: {
      label: 'Presentaciones',
      shortLabel: 'Slides',
      className: 'cat-slides',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
    },
    image: {
      label: 'Imágenes',
      shortLabel: 'Imagen',
      className: 'cat-image',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    },
    word: {
      label: 'Word',
      shortLabel: 'Word',
      className: 'cat-word',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>`,
    },
    excel: {
      label: 'Excel',
      shortLabel: 'Excel',
      className: 'cat-excel',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`,
    },
    other: {
      label: 'Otros',
      shortLabel: 'Otro',
      className: 'cat-other',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
    },
  };

  // --- Estado Global de la Aplicación ---
  const state = {
    catalog: null,
    materiasConfig: null,
    contentSearchApiUrl: DEFAULT_CONTENT_SEARCH_API_URL,
    materiaLookup: new Map(),
    subjectsBySlug: new Map(),
    foldersById: new Map(),
    foldersByPath: new Map(),
    allFiles: [],
    filesById: new Map(),

    // Vista y ruta activa controlada por hash
    // routeType: 'welcome' | 'semester' | 'general' | 'subject' | 'search' | 'all-files' | 'favorites'
    routeType: 'welcome',
    activeSemesterId: null,
    activeSubjectSlug: null,
    activeFolderId: null,
    lastVisitedSemester: null,

    // Acordeón del menú lateral
    expandedSemesters: new Set(['sem-1']),
    allTreeExpanded: false,

    // Modos de búsqueda: 'titulo' (instantáneo) | 'contenido' (Apps Script API bajo demanda)
    topSearchMode: 'titulo',
    activeSearchMode: 'titulo',
    globalSearchQuery: '',
    localSearchQuery: '',

    // Estado y caché en memoria (Map) para la búsqueda dentro del contenido
    contentSearchCache: new Map(),
    contentSearchLoading: false,
    contentSearchError: null,
    contentSearchResultIds: [],
    contentSearchActiveQuery: '',
    contentSearchReqId: 0,

    // Filtros académicos y de archivo
    selectedYear: 'all',
    selectedSemester: 'all',
    selectedCategory: 'all',
    sortBy: 'name-asc',
    viewMode: 'grid',

    favorites: new Set(),
    activeModalFileId: null,
    ignoreNextHashChange: false,
    activeCatalogUpdatedAt: '',
    activeCatalogFingerprint: '',
  };

  // --- Referencias al DOM ---
  const dom = {};

  function cacheDom() {
    dom.sidebar = document.getElementById('sidebar');
    dom.sidebarToggle = document.getElementById('sidebarToggle');
    dom.sidebarBackdrop = document.getElementById('sidebarBackdrop');
    dom.brandHomeLink = document.getElementById('brandHomeLink');

    // Topbar search + mode switch
    dom.topbarSearchForm = document.getElementById('topbarSearchForm');
    dom.searchInput = document.getElementById('searchInput');
    dom.clearSearchBtn = document.getElementById('clearSearchBtn');
    dom.topbarSearchSubmitBtn = document.getElementById('topbarSearchSubmitBtn');
    dom.topbarSearchShortcut = document.getElementById('topbarSearchShortcut');
    dom.modeTitleBtn = document.getElementById('modeTitleBtn');
    dom.modeContentBtn = document.getElementById('modeContentBtn');

    dom.topFavBtn = document.getElementById('topFavBtn');
    dom.topFavCount = document.getElementById('topFavCount');
    dom.sidebarFavCount = document.getElementById('sidebarFavCount');
    dom.themeToggleBtn = document.getElementById('themeToggleBtn');

    dom.navHomeBtn = document.getElementById('navHomeBtn');
    dom.navAllFilesBtn = document.getElementById('navAllFilesBtn');
    dom.navFavBtn = document.getElementById('navFavBtn');
    dom.totalFoldersBadge = document.getElementById('totalFoldersBadge');
    dom.totalFilesBadge = document.getElementById('totalFilesBadge');
    dom.toggleAllTreeBtn = document.getElementById('toggleAllTreeBtn');
    dom.folderTree = document.getElementById('folderTree');
    dom.catalogSummaryText = document.getElementById('catalogSummaryText');
    dom.catalogSyncDateText = document.getElementById('catalogSyncDateText');

    dom.loadingState = document.getElementById('loadingState');

    // Welcome View (#inicio)
    dom.welcomeView = document.getElementById('welcomeView');
    dom.welcomeHero = document.getElementById('welcomeHero');
    dom.welcomeHeroImg = document.getElementById('welcomeHeroImg');
    dom.portalSubtitle = document.getElementById('portalSubtitle');
    dom.portalTitle = document.getElementById('portalTitle');
    dom.portalWelcomeDesc = document.getElementById('portalWelcomeDesc');
    dom.heroSearchForm = document.getElementById('heroSearchForm');
    dom.heroSearchInput = document.getElementById('heroSearchInput');
    dom.metricMainSubjects = document.getElementById('metricMainSubjects');
    dom.metricSemesters = document.getElementById('metricSemesters');
    dom.metricTotalFiles = document.getElementById('metricTotalFiles');
    dom.semesterJourneyGrid = document.getElementById('semesterJourneyGrid');

    // Explorer View
    dom.explorerView = document.getElementById('explorerView');
    dom.backNavBtn = document.getElementById('backNavBtn');
    dom.backNavBtnText = document.getElementById('backNavBtnText');
    dom.breadcrumbs = document.getElementById('breadcrumbs');
    dom.viewControlsGroup = document.getElementById('viewControlsGroup');
    dom.sortSelect = document.getElementById('sortSelect');
    dom.gridViewBtn = document.getElementById('gridViewBtn');
    dom.listViewBtn = document.getElementById('listViewBtn');

    // Subject Banner (#materia/<slug>)
    dom.subjectBanner = document.getElementById('subjectBanner');
    dom.subjectBannerImg = document.getElementById('subjectBannerImg');
    dom.subjectBannerAcadBadge = document.getElementById('subjectBannerAcadBadge');
    dom.subjectBannerCounters = document.getElementById('subjectBannerCounters');
    dom.subjectBannerTitle = document.getElementById('subjectBannerTitle');
    dom.subjectBannerDesc = document.getElementById('subjectBannerDesc');

    // Standard Header & Filters
    dom.standardPageHeader = document.getElementById('standardPageHeader');
    dom.currentViewTitle = document.getElementById('currentViewTitle');
    dom.currentViewSubtitle = document.getElementById('currentViewSubtitle');
    dom.academicFiltersBar = document.getElementById('academicFiltersBar');
    dom.yearFilters = document.getElementById('yearFilters');
    dom.semesterFilterDivider = document.getElementById('semesterFilterDivider');
    dom.semesterFilterGroup = document.getElementById('semesterFilterGroup');
    dom.semesterFilters = document.getElementById('semesterFilters');

    dom.fileFiltersSection = document.getElementById('fileFiltersSection');
    dom.localSearchWrap = document.getElementById('localSearchWrap');
    dom.localSearchInput = document.getElementById('localSearchInput');
    dom.clearLocalSearchBtn = document.getElementById('clearLocalSearchBtn');
    dom.categoryFilters = document.getElementById('categoryFilters');

    dom.activeFilterBanner = document.getElementById('activeFilterBanner');
    dom.activeFilterText = document.getElementById('activeFilterText');
    dom.switchSearchModeBtn = document.getElementById('switchSearchModeBtn');
    dom.resetFiltersBtn = document.getElementById('resetFiltersBtn');

    dom.contentSearchLoading = document.getElementById('contentSearchLoading');
    dom.contentSearchLoadingTitle = document.getElementById('contentSearchLoadingTitle');

    // Content Sections
    dom.subjectsSection = document.getElementById('subjectsSection');
    dom.subjectsHeadingText = document.getElementById('subjectsHeadingText');
    dom.subjectsCountLabel = document.getElementById('subjectsCountLabel');
    dom.subjectsGrid = document.getElementById('subjectsGrid');

    dom.foldersSection = document.getElementById('foldersSection');
    dom.foldersHeadingText = document.getElementById('foldersHeadingText');
    dom.foldersCountLabel = document.getElementById('foldersCountLabel');
    dom.foldersGrid = document.getElementById('foldersGrid');

    dom.filesSection = document.getElementById('filesSection');
    dom.filesHeadingText = document.getElementById('filesHeadingText');
    dom.filesCountLabel = document.getElementById('filesCountLabel');
    dom.filesContainer = document.getElementById('filesContainer');

    dom.emptyState = document.getElementById('emptyState');
    dom.emptyStateTitle = document.getElementById('emptyStateTitle');
    dom.emptyStateDesc = document.getElementById('emptyStateDesc');
    dom.emptyStateAltBtn = document.getElementById('emptyStateAltBtn');
    dom.emptyStateActionBtn = document.getElementById('emptyStateActionBtn');

    // Modal
    dom.previewModal = document.getElementById('previewModal');
    dom.modalCategoryBadge = document.getElementById('modalCategoryBadge');
    dom.modalFileTitle = document.getElementById('modalFileTitle');
    dom.modalFilePath = document.getElementById('modalFilePath');
    dom.modalFileSize = document.getElementById('modalFileSize');
    dom.modalFileExt = document.getElementById('modalFileExt');
    dom.modalFavBtn = document.getElementById('modalFavBtn');
    dom.modalFavText = document.getElementById('modalFavText');
    dom.modalDownloadBtn = document.getElementById('modalDownloadBtn');
    dom.modalDriveBtn = document.getElementById('modalDriveBtn');
    dom.modalCloseBtn = document.getElementById('modalCloseBtn');
    dom.iframeLoader = document.getElementById('iframeLoader');
    dom.previewIframe = document.getElementById('previewIframe');
    dom.modalFooterDownloadLink = document.getElementById('modalFooterDownloadLink');
    dom.modalFooterDriveLink = document.getElementById('modalFooterDriveLink');
  }

  // --- Utilidades de Normalización y Formato ---

  function cleanText(str) {
    if (!str) return '';
    return String(str).normalize('NFC').trim();
  }

  function normalizeMatchKey(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeForSearch(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(str) {
    return normalizeForSearch(str)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatDisplayFileName(rawName) {
    const cleaned = cleanText(rawName);
    return cleaned.replace(/_[0-9a-fA-F]{32}(\.[a-zA-Z0-9]+)$/, '$1');
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    const safeText = cleanText(text);
    if (!query || !query.trim()) {
      return escapeHtml(safeText);
    }

    const normQuery = normalizeForSearch(query);
    if (!normQuery) return escapeHtml(safeText);

    const normChars = [];
    const indexMap = [];
    for (let i = 0; i < safeText.length; i++) {
      const stripped = safeText[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      for (let j = 0; j < stripped.length; j++) {
        normChars.push(stripped[j]);
        indexMap.push(i);
      }
    }

    const normFull = normChars.join('');
    const matchIndex = normFull.indexOf(normQuery);
    if (matchIndex === -1) {
      return escapeHtml(safeText);
    }

    const startOrig = indexMap[matchIndex];
    const endOrig = indexMap[matchIndex + normQuery.length - 1] + 1;

    const before = escapeHtml(safeText.slice(0, startOrig));
    const match = escapeHtml(safeText.slice(startOrig, endOrig));
    const after = escapeHtml(safeText.slice(endOrig));

    return `${before}<mark class="search-highlight">${match}</mark>${after}`;
  }

  function getAcademicMeta(anio, semestres) {
    const strAnio = String(anio);
    const sems = Array.isArray(semestres) ? semestres.map(Number).filter(Boolean) : [];

    if (strAnio === 'general') {
      return {
        anio: 'general',
        semestres: [],
        badgeLabel: 'General',
        fullLabel: 'Libros y Recursos Generales',
        badgeClass: 'acad-anio-general',
        sortOrder: 90,
      };
    }

    const yearText = `${strAnio}.° Año`;
    let semText = '';
    if (sems.length === 1) {
      semText = `Sem. ${sems[0]}`;
    } else if (sems.length > 1) {
      semText = `Sem. ${sems.join(' y ')}`;
    }

    const minSem = sems.length > 0 ? Math.min(...sems) : Number(strAnio) * 2;
    return {
      anio: strAnio,
      semestres: sems,
      badgeLabel: semText ? `${yearText} · ${semText}` : yearText,
      fullLabel: semText ? `${yearText} · ${semText}` : yearText,
      badgeClass: strAnio === '1' ? 'acad-anio-1' : 'acad-anio-2',
      sortOrder: Number(strAnio) * 10 + minSem,
    };
  }

  // --- Persistencia en localStorage (Tema, Favoritos, Modo de Vista) ---

  function loadPersistedState() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', savedTheme);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch {
      // Fallback light
    }

    try {
      const savedFavs = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (savedFavs) {
        const parsed = JSON.parse(savedFavs);
        if (Array.isArray(parsed)) {
          state.favorites = new Set(parsed);
        }
      }
    } catch {
      state.favorites = new Set();
    }

    try {
      const savedView = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      if (savedView === 'grid' || savedView === 'list') {
        state.viewMode = savedView;
      }
    } catch {
      state.viewMode = 'grid';
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, next);
    } catch {
      // ignore
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...state.favorites]));
    } catch {
      // ignore
    }
    updateFavoritesBadges();
  }

  function toggleFavorite(fileId) {
    if (!fileId) return;
    if (state.favorites.has(fileId)) {
      state.favorites.delete(fileId);
    } else {
      state.favorites.add(fileId);
    }
    saveFavorites();

    document.querySelectorAll(`.card-fav-btn[data-file-id="${CSS.escape(fileId)}"]`).forEach((btn) => {
      const isFav = state.favorites.has(fileId);
      btn.classList.toggle('is-fav', isFav);
      btn.setAttribute('aria-label', isFav ? 'Quitar de Favoritos' : 'Guardar en Favoritos');
      btn.setAttribute('title', isFav ? 'Quitar de Favoritos' : 'Guardar en Favoritos');
    });

    if (state.activeModalFileId === fileId) {
      updateModalFavButton(fileId);
    }

    if (state.routeType === 'favorites') {
      renderCurrentRoute();
    }
  }

  function updateFavoritesBadges() {
    const count = state.favorites.size;
    dom.topFavCount.textContent = count;
    dom.sidebarFavCount.textContent = count;
  }

  // --- Indexación de `materias-config.json` y `catalogo.json` ---

  function buildMateriaLookup(configData) {
    state.materiasConfig = configData;
    state.materiaLookup.clear();

    if (configData && configData.portal && configData.portal.contentSearchApiUrl) {
      state.contentSearchApiUrl = configData.portal.contentSearchApiUrl;
    }

    if (!configData || !Array.isArray(configData.materias)) return;

    for (const item of configData.materias) {
      const candidates = [
        item.folderName,
        ...(Array.isArray(item.aliases) ? item.aliases : []),
        item.displayName,
      ].filter(Boolean);

      for (const candidate of candidates) {
        const key = normalizeMatchKey(candidate);
        if (key && !state.materiaLookup.has(key)) {
          state.materiaLookup.set(key, item);
        }
      }
    }
  }

  function indexCatalog(data) {
    state.catalog = data;
    state.foldersById.clear();
    state.foldersByPath.clear();
    state.subjectsBySlug.clear();
    state.allFiles = [];
    state.filesById.clear();

    function traverseFolder(folder, parentId = null, ancestors = [], rootSubjectMeta = null) {
      const rawFolderName = cleanText(folder.name);
      let displayName = rawFolderName;
      let subjectMeta = rootSubjectMeta;
      let aliasSearchTokens = '';

      if (parentId === null) {
        const matched = state.materiaLookup.get(normalizeMatchKey(folder.name));
        if (matched) {
          displayName = cleanText(matched.displayName || rawFolderName);
          const academic = getAcademicMeta(matched.anio ?? 'general', matched.semestres);
          const slug = matched.slug || slugify(displayName);
          const allNames = [
            matched.folderName,
            matched.displayName,
            rawFolderName,
            ...(matched.aliases || []),
          ].filter(Boolean);
          aliasSearchTokens = normalizeForSearch(allNames.join(' '));

          subjectMeta = {
            slug,
            displayName,
            description: matched.description || 'Material de estudio, apuntes y bibliografía de la asignatura.',
            bannerImage: matched.bannerImage || '',
            bannerTheme: matched.bannerTheme || '',
            accentColor: matched.accentColor || '#3B82F6',
            academic,
            aliasSearchTokens,
            rootFolderId: folder.id,
          };
        } else {
          const academic = getAcademicMeta('general', []);
          const slug = slugify(rawFolderName) || folder.id;
          aliasSearchTokens = normalizeForSearch(rawFolderName);
          subjectMeta = {
            slug,
            displayName: rawFolderName,
            description: 'Material de estudio y recursos disponibles en el repositorio académico.',
            bannerImage: 'assets/banners/libros-recursos.jpg',
            bannerTheme: '',
            accentColor: '#64748B',
            academic,
            aliasSearchTokens,
            rootFolderId: folder.id,
          };
        }
      }

      const currentAncestors = [
        ...ancestors,
        {
          id: folder.id,
          name: displayName,
          rawName: rawFolderName,
          drivePath: folder.path,
          slug: subjectMeta.slug,
        },
      ];
      const displayPath = currentAncestors.map((a) => a.name).join(' / ');
      const drivePath = folder.path;

      const indexedFolder = {
        ...folder,
        id: folder.id,
        path: drivePath,
        slug: subjectMeta.slug,
        rootFolderId: subjectMeta.rootFolderId,
        rootSubjectName: subjectMeta.displayName,
        rawFolderName,
        displayName,
        cleanName: displayName,
        cleanPath: displayPath,
        description: subjectMeta.description,
        bannerImage: subjectMeta.bannerImage,
        accentColor: subjectMeta.accentColor,
        anio: subjectMeta.academic.anio,
        semestres: subjectMeta.academic.semestres,
        academic: subjectMeta.academic,
        searchName: normalizeForSearch(`${displayName} ${rawFolderName} ${subjectMeta.aliasSearchTokens}`),
        searchPath: normalizeForSearch(`${displayPath} ${drivePath} ${subjectMeta.aliasSearchTokens}`),
        parentId,
        ancestors: currentAncestors,
        directFiles: [],
        allDescendantFiles: [],
        subfolders: [],
        totalSubfoldersCount: 0,
      };

      state.foldersById.set(folder.id, indexedFolder);
      state.foldersByPath.set(normalizeMatchKey(folder.path), indexedFolder);
      if (parentId === null) {
        state.subjectsBySlug.set(subjectMeta.slug, indexedFolder);
      }

      if (Array.isArray(folder.files)) {
        for (const file of folder.files) {
          const fileDisplayName = formatDisplayFileName(file.name);
          const rawCleanName = cleanText(file.name);
          const rawCat = (file.category || 'other').toLowerCase();
          const category = PRIMARY_CATEGORIES.has(rawCat) ? rawCat : 'other';

          const indexedFile = {
            ...file,
            id: file.id,
            path: file.path,
            category,
            rawCleanName,
            displayName: fileDisplayName,
            cleanPath: displayPath,
            folderId: folder.id,
            folderName: displayName,
            subjectSlug: subjectMeta.slug,
            rootFolderId: subjectMeta.rootFolderId,
            rootSubjectName: subjectMeta.displayName,
            anio: subjectMeta.academic.anio,
            semestres: subjectMeta.academic.semestres,
            academic: subjectMeta.academic,
            searchName: normalizeForSearch(`${rawCleanName} ${fileDisplayName}`),
            searchPath: normalizeForSearch(`${displayPath} ${file.path} ${subjectMeta.aliasSearchTokens}`),
            formattedDate: formatDate(file.updatedAt),
            timestamp: file.updatedAt ? new Date(file.updatedAt).getTime() : 0,
          };

          indexedFolder.directFiles.push(indexedFile);
          indexedFolder.allDescendantFiles.push(indexedFile);
          state.allFiles.push(indexedFile);
          state.filesById.set(file.id, indexedFile);
        }
      }

      if (Array.isArray(folder.folders)) {
        for (const sub of folder.folders) {
          const indexedSub = traverseFolder(sub, folder.id, currentAncestors, subjectMeta);
          indexedFolder.subfolders.push(indexedSub);
          indexedFolder.allDescendantFiles.push(...indexedSub.allDescendantFiles);
          indexedFolder.totalSubfoldersCount += 1 + indexedSub.totalSubfoldersCount;
        }
      }

      return indexedFolder;
    }

    const rootFolders = (data.folders || []).map((f) => traverseFolder(f, null, [], null));

    rootFolders.sort((a, b) => {
      if (a.academic.sortOrder !== b.academic.sortOrder) {
        return a.academic.sortOrder - b.academic.sortOrder;
      }
      return a.cleanName.localeCompare(b.cleanName, 'es', { sensitivity: 'base' });
    });

    state.catalog.indexedRootFolders = rootFolders;

    const mainSubjectsCount = rootFolders.length;
    const totalFiles = data.totalFiles || state.allFiles.length;
    dom.totalFoldersBadge.textContent = mainSubjectsCount;
    dom.totalFilesBadge.textContent = totalFiles;
    dom.catalogSummaryText.textContent = `${mainSubjectsCount} materias · ${totalFiles} archivos`;
  }

  // --- Control del Selector de Modo de Búsqueda Superior (Título | Contenido) ---

  function setTopbarSearchModeUI(mode) {
    state.topSearchMode = mode === 'contenido' ? 'contenido' : 'titulo';
    const isContent = state.topSearchMode === 'contenido';

    dom.modeTitleBtn.classList.toggle('active', !isContent);
    dom.modeTitleBtn.setAttribute('aria-pressed', String(!isContent));

    dom.modeContentBtn.classList.toggle('active', isContent);
    dom.modeContentBtn.setAttribute('aria-pressed', String(isContent));

    dom.topbarSearchForm.classList.toggle('mode-contenido', isContent);
    dom.topbarSearchSubmitBtn.classList.toggle('hidden', !isContent);
    dom.topbarSearchShortcut.classList.toggle('hidden', isContent);

    dom.searchInput.placeholder = isContent
      ? 'Buscar dentro del contenido de los documentos (Enter)...'
      : 'Buscar materia o archivo por título...';
  }

  // --- Integración con Google Apps Script para Búsqueda dentro del Contenido ---

  async function executeContentSearch(rawQuery) {
    const trimmedQuery = cleanText(rawQuery);
    if (trimmedQuery.length < 2) {
      return;
    }

    const cacheKey = normalizeForSearch(trimmedQuery);
    state.activeSearchMode = 'contenido';
    state.globalSearchQuery = trimmedQuery;
    state.contentSearchActiveQuery = trimmedQuery;
    state.contentSearchError = null;

    setTopbarSearchModeUI('contenido');
    dom.searchInput.value = trimmedQuery;
    dom.clearSearchBtn.classList.remove('hidden');

    // Si ya está en la caché de la sesión (Map), resolver instantáneamente
    if (state.contentSearchCache.has(cacheKey)) {
      state.contentSearchLoading = false;
      state.contentSearchResultIds = state.contentSearchCache.get(cacheKey);
      renderCurrentRoute();
      return;
    }

    const reqId = ++state.contentSearchReqId;
    state.contentSearchLoading = true;
    state.contentSearchResultIds = [];
    renderCurrentRoute();

    try {
      // Petición fetch GET simple sin headers personalizados para evitar preflight CORS con Apps Script
      const apiUrl = state.contentSearchApiUrl || DEFAULT_CONTENT_SEARCH_API_URL;
      const response = await fetch(`${apiUrl}?q=${encodeURIComponent(trimmedQuery)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (reqId !== state.contentSearchReqId) return;

      if (payload && payload.ok === false) {
        throw new Error(payload.error || 'La API de búsqueda devolvió un error');
      }

      const ids = Array.isArray(payload.ids)
        ? payload.ids
        : Array.isArray(payload.results)
        ? payload.results.map((r) => (typeof r === 'string' ? r : r.id)).filter(Boolean)
        : [];

      state.contentSearchCache.set(cacheKey, ids);
      state.contentSearchResultIds = ids;
      state.contentSearchLoading = false;
      state.contentSearchError = null;
      renderCurrentRoute();
    } catch (err) {
      if (reqId !== state.contentSearchReqId) return;
      console.error('Error en búsqueda de contenido (Apps Script):', err);
      state.contentSearchLoading = false;
      state.contentSearchError = err.message || 'Error de conexión con la API';
      state.contentSearchResultIds = [];
      renderCurrentRoute();
    }
  }

  // --- Enrutamiento por Hash (`window.location.hash`) ---

  function setRouteHash(newHash) {
    if (window.location.hash === newHash) {
      parseHashAndRender();
      return;
    }
    window.location.hash = newHash;
  }

  function parseHashAndRender() {
    if (state.ignoreNextHashChange) {
      state.ignoreNextHashChange = false;
      return;
    }

    const rawHash = (window.location.hash || '').replace(/^#/, '').trim();

    state.localSearchQuery = '';
    if (dom.localSearchInput) {
      dom.localSearchInput.value = '';
      dom.clearLocalSearchBtn.classList.add('hidden');
    }

    // 1. #inicio o vacío -> Página de bienvenida
    if (!rawHash || rawHash === 'inicio') {
      state.routeType = 'welcome';
      state.activeSemesterId = null;
      state.activeSubjectSlug = null;
      state.activeFolderId = null;
      state.globalSearchQuery = '';
      dom.searchInput.value = '';
      if (dom.heroSearchInput) dom.heroSearchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      renderCurrentRoute();
      return;
    }

    // 2. #semestre/<1..4>
    if (rawHash.startsWith('semestre/')) {
      const semNum = Number(rawHash.split('/')[1]);
      if ([1, 2, 3, 4].includes(semNum)) {
        state.routeType = 'semester';
        state.activeSemesterId = semNum;
        state.lastVisitedSemester = semNum;
        state.activeSubjectSlug = null;
        state.activeFolderId = null;
        state.selectedYear = semNum <= 2 ? '1' : '2';
        state.selectedSemester = semNum;
        state.selectedCategory = 'all';
        state.expandedSemesters.add(`sem-${semNum}`);
        renderCurrentRoute();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // 3. #general
    if (rawHash === 'general') {
      state.routeType = 'general';
      state.activeSemesterId = 'general';
      state.lastVisitedSemester = 'general';
      state.activeSubjectSlug = null;
      state.activeFolderId = null;
      state.selectedYear = 'general';
      state.selectedSemester = 'all';
      state.selectedCategory = 'all';
      state.expandedSemesters.add('sem-general');
      renderCurrentRoute();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 4. #materia/<slug>[/<subfolderId>]
    if (rawHash.startsWith('materia/')) {
      const parts = decodeURIComponent(rawHash).split('/');
      const slug = parts[1] || '';
      const subId = parts[2] || null;
      const subjectFolder = state.subjectsBySlug.get(slug);

      if (subjectFolder) {
        state.routeType = 'subject';
        state.activeSubjectSlug = slug;

        const targetFolder =
          subId && state.foldersById.has(subId) ? state.foldersById.get(subId) : subjectFolder;
        state.activeFolderId = targetFolder.id;

        if (subjectFolder.anio === 'general') {
          state.expandedSemesters.add('sem-general');
        } else if (subjectFolder.semestres.length > 0) {
          const semToExpand =
            state.lastVisitedSemester && subjectFolder.semestres.includes(Number(state.lastVisitedSemester))
              ? state.lastVisitedSemester
              : subjectFolder.semestres[0];
          state.expandedSemesters.add(`sem-${semToExpand}`);
        }

        renderCurrentRoute();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // 5. #buscar[?modo=contenido|titulo&q=...]
    if (rawHash.startsWith('buscar')) {
      state.routeType = 'search';
      state.activeSubjectSlug = null;
      state.activeFolderId = null;

      let mode = 'titulo';
      let qVal = '';
      const qMarkIdx = rawHash.indexOf('?');
      if (qMarkIdx !== -1) {
        const params = new URLSearchParams(rawHash.slice(qMarkIdx + 1));
        mode = params.get('modo') === 'contenido' ? 'contenido' : 'titulo';
        qVal = params.get('q') || '';
      }

      state.activeSearchMode = mode;
      state.globalSearchQuery = qVal;
      setTopbarSearchModeUI(mode);
      dom.searchInput.value = qVal;
      dom.clearSearchBtn.classList.toggle('hidden', qVal.trim() === '');

      if (mode === 'contenido' && qVal.trim().length >= 2) {
        executeContentSearch(qVal);
      } else {
        state.contentSearchLoading = false;
        renderCurrentRoute();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 6. #todos
    if (rawHash === 'todos') {
      state.routeType = 'all-files';
      state.activeSubjectSlug = null;
      state.activeFolderId = null;
      renderCurrentRoute();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 7. #favoritos
    if (rawHash === 'favoritos') {
      state.routeType = 'favorites';
      state.activeSubjectSlug = null;
      state.activeFolderId = null;
      renderCurrentRoute();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    state.routeType = 'welcome';
    renderCurrentRoute();
  }

  // --- Menú Lateral Desglosado por Semestre (Acordeón) ---

  function getSemesterAccordionStructure() {
    const rootFolders = (state.catalog && state.catalog.indexedRootFolders) || [];
    return [
      {
        yearTitle: '1.° Año',
        semesters: [
          {
            key: 'sem-1',
            id: 1,
            label: '1.° Semestre',
            hash: '#semestre/1',
            subjects: rootFolders.filter((f) => f.anio === '1' && f.semestres.includes(1)),
          },
          {
            key: 'sem-2',
            id: 2,
            label: '2.° Semestre',
            hash: '#semestre/2',
            subjects: rootFolders.filter((f) => f.anio === '1' && f.semestres.includes(2)),
          },
        ],
      },
      {
        yearTitle: '2.° Año',
        semesters: [
          {
            key: 'sem-3',
            id: 3,
            label: '3.° Semestre',
            hash: '#semestre/3',
            subjects: rootFolders.filter((f) => f.anio === '2' && f.semestres.includes(3)),
          },
          {
            key: 'sem-4',
            id: 4,
            label: '4.° Semestre',
            hash: '#semestre/4',
            subjects: rootFolders.filter((f) => f.anio === '2' && f.semestres.includes(4)),
          },
        ],
      },
      {
        yearTitle: 'Recursos',
        semesters: [
          {
            key: 'sem-general',
            id: 'general',
            label: 'Libros y Recursos Generales',
            hash: '#general',
            subjects: rootFolders.filter((f) => f.anio === 'general'),
          },
        ],
      },
    ];
  }

  function renderFolderTree() {
    if (!state.catalog || !state.catalog.indexedRootFolders) return;

    const structure = getSemesterAccordionStructure();
    let html = '';

    for (const yearBlock of structure) {
      html += `
        <div class="tree-year-group">
          <div class="tree-year-header">${escapeHtml(yearBlock.yearTitle)}</div>
      `;

      for (const sem of yearBlock.semesters) {
        const isExpanded = state.expandedSemesters.has(sem.key);
        const isSemActive =
          (state.routeType === 'semester' && state.activeSemesterId === sem.id) ||
          (state.routeType === 'general' && sem.id === 'general');

        html += `
          <div class="sem-accordion-item">
            <div class="sem-accordion-row ${isSemActive ? 'active' : ''}">
              <button
                type="button"
                class="sem-toggle-btn ${isExpanded ? 'expanded' : ''}"
                data-sem-toggle="${sem.key}"
                aria-label="Expandir o colapsar ${escapeHtml(sem.label)}"
                title="Mostrar materias de ${escapeHtml(sem.label)}"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>

              <button
                type="button"
                class="sem-select-btn"
                data-sem-hash="${sem.hash}"
                data-sem-key="${sem.key}"
                title="Ver asignaturas de ${escapeHtml(sem.label)}"
              >
                <span class="sem-label-wrap">
                  <svg class="sem-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span class="tree-node-name">${escapeHtml(sem.label)}</span>
                </span>
                <span class="tree-badge" title="${sem.subjects.length} materias">${sem.subjects.length}</span>
              </button>
            </div>

            <ul class="sem-subjects-list ${isExpanded ? '' : 'hidden'}">
              ${sem.subjects
                .map((subj) => {
                  const isSubjActive =
                    state.routeType === 'subject' && state.activeSubjectSlug === subj.slug;
                  return `
                    <li>
                      <button
                        type="button"
                        class="tree-subject-btn ${isSubjActive ? 'active' : ''}"
                        data-subject-slug="${escapeHtml(subj.slug)}"
                        data-from-sem="${sem.id}"
                        title="${escapeHtml(subj.cleanName)} (${subj.fileCount} archivos)"
                      >
                        <span class="tree-subject-left">
                          <span class="tree-subject-dot" style="--subject-dot: ${escapeHtml(subj.accentColor)};"></span>
                          <span class="tree-node-name">${escapeHtml(subj.cleanName)}</span>
                        </span>
                        <span class="tree-badge">${subj.fileCount}</span>
                      </button>
                    </li>
                  `;
                })
                .join('')}
            </ul>
          </div>
        `;
      }

      html += `</div>`;
    }

    dom.folderTree.innerHTML = html;
    updateSidebarNavActiveStates();
  }

  function updateSidebarNavActiveStates() {
    dom.navHomeBtn.classList.toggle('active', state.routeType === 'welcome');
    dom.navAllFilesBtn.classList.toggle('active', state.routeType === 'all-files');
    dom.navFavBtn.classList.toggle('active', state.routeType === 'favorites');
    dom.topFavBtn.classList.toggle('active', state.routeType === 'favorites');
  }

  function toggleAllTreeExpansion() {
    const allKeys = ['sem-1', 'sem-2', 'sem-3', 'sem-4', 'sem-general'];
    state.allTreeExpanded = !state.allTreeExpanded;
    state.expandedSemesters.clear();

    if (state.allTreeExpanded) {
      allKeys.forEach((k) => state.expandedSemesters.add(k));
      dom.toggleAllTreeBtn.textContent = 'Colapsar todo';
    } else {
      dom.toggleAllTreeBtn.textContent = 'Expandir todo';
    }
    renderFolderTree();
  }

  // --- Renderizado de la Página de Bienvenida (#inicio) ---

  function renderWelcomeView() {
    const portalCfg = (state.materiasConfig && state.materiasConfig.portal) || {};
    const semestresCfg = (state.materiasConfig && state.materiasConfig.semestres) || [];
    const rootFolders = state.catalog.indexedRootFolders || [];

    if (portalCfg.title) dom.portalTitle.textContent = portalCfg.title;
    if (portalCfg.subtitle) dom.portalSubtitle.textContent = portalCfg.subtitle;
    if (portalCfg.welcomeDescription) dom.portalWelcomeDesc.textContent = portalCfg.welcomeDescription;
    if (portalCfg.heroImage && dom.welcomeHeroImg) {
      dom.welcomeHeroImg.src = portalCfg.heroImage;
    }

    dom.metricMainSubjects.textContent = rootFolders.length;
    dom.metricSemesters.textContent = semestresCfg.length || 4;
    dom.metricTotalFiles.textContent = state.catalog.totalFiles || state.allFiles.length;

    const semAccents = { 1: '#2563EB', 2: '#0284C7', 3: '#10B981', 4: '#F59E0B' };
    const cardsHtml = [];

    for (let semId = 1; semId <= 4; semId++) {
      const cfgSem = semestresCfg.find((s) => Number(s.id) === semId) || {
        id: semId,
        anio: semId <= 2 ? 1 : 2,
        label: `${semId}.° Semestre`,
        shortDesc: `Asignaturas y material de estudio correspondientes al ${semId}.° semestre.`,
      };

      const semSubjects = rootFolders.filter((f) => f.semestres.includes(semId));
      const semFilesCount = semSubjects.reduce((acc, f) => acc + (f.fileCount || 0), 0);
      const yearBadgeClass = Number(cfgSem.anio) === 1 ? 'acad-anio-1' : 'acad-anio-2';

      cardsHtml.push(`
        <article
          class="semester-journey-card"
          style="--sem-accent: ${semAccents[semId] || '#2563EB'};"
          data-goto-hash="#semestre/${semId}"
          tabindex="0"
          role="button"
          aria-label="Explorar ${escapeHtml(cfgSem.label)}"
        >
          <div>
            <div class="journey-card-top">
              <span class="journey-year-pill ${yearBadgeClass}">${cfgSem.anio}.° Año</span>
              <span class="journey-stats-pill">${semSubjects.length} materias · ${semFilesCount} archivos</span>
            </div>
            <h3 class="journey-card-title">${escapeHtml(cfgSem.label)}</h3>
            <p class="journey-card-desc">${escapeHtml(cfgSem.shortDesc)}</p>
          </div>

          <div class="journey-card-footer">
            <div class="journey-counts-group">
              <span class="journey-count-chip">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${semSubjects.length} asignaturas</span>
              </span>
              <span class="journey-count-chip">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                </svg>
                <span>${semFilesCount} recursos</span>
              </span>
            </div>
            <span class="journey-cta-text">
              <span>Ver materias</span>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </span>
          </div>
        </article>
      `);
    }

    const generalSubjects = rootFolders.filter((f) => f.anio === 'general');
    const generalFilesCount = generalSubjects.reduce((acc, f) => acc + (f.fileCount || 0), 0);
    const generalDesc =
      (generalSubjects[0] && generalSubjects[0].description) ||
      'Bibliografía de referencia, diccionarios de logística y SCM, manuales de transporte y compras, normas ISO e informes sectoriales.';

    cardsHtml.push(`
      <article
        class="semester-journey-card featured-general"
        style="--sem-accent: #64748B;"
        data-goto-hash="#general"
        tabindex="0"
        role="button"
        aria-label="Explorar Libros y Recursos Generales"
      >
        <div style="flex: 1;">
          <div class="journey-card-top" style="justify-content: flex-start; gap: 12px;">
            <span class="journey-year-pill acad-anio-general">Recursos Transversales</span>
            <span class="journey-stats-pill">${generalSubjects.length} ${generalSubjects.length === 1 ? 'colección' : 'colecciones'} · ${generalFilesCount} archivos</span>
          </div>
          <h3 class="journey-card-title">Libros y Recursos Generales</h3>
          <p class="journey-card-desc">${escapeHtml(generalDesc)}</p>
        </div>

        <div class="journey-card-footer">
          <span class="journey-cta-text">
            <span>Explorar biblioteca (${generalFilesCount} libros y manuales)</span>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </span>
        </div>
      </article>
    `);

    dom.semesterJourneyGrid.innerHTML = cardsHtml.join('');
  }

  // --- Lógica de Filtrado por Año y Semestre ---

  function matchesAcademicFilter(item, yearFilter = state.selectedYear, semFilter = state.selectedSemester) {
    if (yearFilter !== 'all' && String(item.anio) !== String(yearFilter)) {
      return false;
    }
    if (semFilter !== 'all') {
      const semNum = Number(semFilter);
      if (!Array.isArray(item.semestres) || !item.semestres.includes(semNum)) {
        return false;
      }
    }
    return true;
  }

  function setYearFilter(yearId) {
    state.selectedYear = yearId;

    if (yearId === 'general') {
      state.selectedSemester = 'all';
      if (state.routeType === 'semester') {
        setRouteHash('#general');
        return;
      }
    } else if (yearId === '1' && (state.selectedSemester === 3 || state.selectedSemester === 4)) {
      state.selectedSemester = 'all';
    } else if (yearId === '2' && (state.selectedSemester === 1 || state.selectedSemester === 2)) {
      state.selectedSemester = 'all';
    }

    renderFolderTree();
    renderExplorerView();
  }

  function setSemesterFilter(semId) {
    const parsedSem = semId === 'all' ? 'all' : Number(semId);

    if (state.routeType === 'semester' || state.routeType === 'general') {
      if (parsedSem !== 'all') {
        setRouteHash(`#semestre/${parsedSem}`);
        return;
      }
      state.selectedSemester = 'all';
      renderExplorerView();
      return;
    }

    state.selectedSemester = state.selectedSemester === parsedSem && parsedSem !== 'all' ? 'all' : parsedSem;
    renderFolderTree();
    renderExplorerView();
  }

  function renderAcademicFilters() {
    if (!state.catalog || !state.catalog.indexedRootFolders) return;

    const rootFolders = state.catalog.indexedRootFolders;

    dom.yearFilters.innerHTML = YEAR_OPTIONS.map((opt) => {
      const isActive = String(state.selectedYear) === String(opt.id);
      const count =
        opt.id === 'all'
          ? rootFolders.length
          : rootFolders.filter((f) => String(f.anio) === String(opt.id)).length;

      return `
        <button
          type="button"
          class="acad-pill-btn ${isActive ? 'active' : ''}"
          data-year="${opt.id}"
          aria-pressed="${isActive}"
        >
          <span>${escapeHtml(opt.label)}</span>
          <span class="acad-pill-count">${count}</span>
        </button>
      `;
    }).join('');

    if (state.selectedYear === 'general') {
      dom.semesterFilterDivider.classList.add('hidden');
      dom.semesterFilterGroup.classList.add('hidden');
      return;
    }

    dom.semesterFilterDivider.classList.remove('hidden');
    dom.semesterFilterGroup.classList.remove('hidden');

    const visibleSemesterOptions = SEMESTER_OPTIONS.filter(
      (opt) => opt.id === 'all' || state.selectedYear === 'all' || opt.year === String(state.selectedYear)
    );

    dom.semesterFilters.innerHTML = visibleSemesterOptions
      .map((opt) => {
        const isActive = String(state.selectedSemester) === String(opt.id);
        const count =
          opt.id === 'all'
            ? rootFolders.filter((f) => matchesAcademicFilter(f, state.selectedYear, 'all')).length
            : rootFolders.filter((f) => matchesAcademicFilter(f, state.selectedYear, opt.id)).length;

        return `
          <button
            type="button"
            class="acad-pill-btn ${isActive ? 'active' : ''}"
            data-semester="${opt.id}"
            aria-pressed="${isActive}"
          >
            <span>${escapeHtml(opt.label)}</span>
            <span class="acad-pill-count">${count}</span>
          </button>
        `;
      })
      .join('');
  }

  // --- Breadcrumbs y Botón de Retorno ---

  function renderBreadcrumbsAndBackBtn() {
    const items = [
      {
        label: 'Inicio',
        hash: '#inicio',
        isCurrent: false,
        icon: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>`,
      },
    ];

    let backBtnConfig = null;

    if (state.routeType === 'semester') {
      const semNum = Number(state.activeSemesterId);
      const yearNum = semNum <= 2 ? 1 : 2;
      items.push({
        label: `${yearNum}.° Año · ${semNum}.° Semestre`,
        isCurrent: true,
      });
      backBtnConfig = { label: 'Volver a Inicio', hash: '#inicio' };
    } else if (state.routeType === 'general') {
      items.push({
        label: 'Libros y Recursos Generales',
        isCurrent: true,
      });
      backBtnConfig = { label: 'Volver a Inicio', hash: '#inicio' };
    } else if (state.routeType === 'subject') {
      const subjectFolder = state.subjectsBySlug.get(state.activeSubjectSlug);
      const activeFolder = state.foldersById.get(state.activeFolderId) || subjectFolder;

      if (subjectFolder) {
        let semHash = '#general';
        let semLabel = 'Libros y Recursos Generales';

        if (subjectFolder.anio !== 'general' && subjectFolder.semestres.length > 0) {
          const semNum =
            state.lastVisitedSemester && subjectFolder.semestres.includes(Number(state.lastVisitedSemester))
              ? Number(state.lastVisitedSemester)
              : subjectFolder.semestres[0];
          const yearNum = semNum <= 2 ? 1 : 2;
          semHash = `#semestre/${semNum}`;
          semLabel = `${yearNum}.° Año · ${semNum}.° Semestre`;
        }

        items.push({
          label: semLabel,
          hash: semHash,
          isCurrent: false,
        });

        if (activeFolder && activeFolder.id !== subjectFolder.id) {
          activeFolder.ancestors.forEach((anc, idx) => {
            const isLast = idx === activeFolder.ancestors.length - 1;
            const ancHash =
              idx === 0 ? `#materia/${subjectFolder.slug}` : `#materia/${subjectFolder.slug}/${anc.id}`;
            items.push({
              label: anc.name,
              hash: ancHash,
              isCurrent: isLast,
            });
          });
          backBtnConfig = {
            label: `Volver a ${subjectFolder.cleanName}`,
            hash: `#materia/${subjectFolder.slug}`,
          };
        } else {
          items.push({
            label: subjectFolder.cleanName,
            isCurrent: true,
          });
          backBtnConfig = {
            label: subjectFolder.anio === 'general' ? 'Volver a Recursos' : 'Volver al semestre',
            hash: semHash,
          };
        }
      }
    } else if (state.routeType === 'search') {
      const modeText =
        state.activeSearchMode === 'contenido' ? 'Búsqueda en contenido' : 'Búsqueda por título';
      items.push({
        label: state.globalSearchQuery
          ? `${modeText}: «${state.globalSearchQuery}»`
          : modeText,
        isCurrent: true,
      });
      backBtnConfig = { label: 'Volver a Inicio', hash: '#inicio' };
    } else if (state.routeType === 'all-files') {
      items.push({
        label: 'Todos los Archivos',
        isCurrent: true,
      });
      backBtnConfig = { label: 'Volver a Inicio', hash: '#inicio' };
    } else if (state.routeType === 'favorites') {
      items.push({
        label: 'Mis Favoritos',
        isCurrent: true,
      });
      backBtnConfig = { label: 'Volver a Inicio', hash: '#inicio' };
    }

    if (backBtnConfig) {
      dom.backNavBtn.classList.remove('hidden');
      dom.backNavBtnText.textContent = backBtnConfig.label;
      dom.backNavBtn.setAttribute('data-back-hash', backBtnConfig.hash);
    } else {
      dom.backNavBtn.classList.add('hidden');
    }

    dom.breadcrumbs.innerHTML = items
      .map((item, idx) => {
        const sep =
          idx > 0
            ? `<span class="breadcrumb-sep" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`
            : '';

        if (item.isCurrent) {
          return `${sep}<span class="breadcrumb-item current" aria-current="page">${item.icon || ''}<span>${escapeHtml(item.label)}</span></span>`;
        }

        return `${sep}<button type="button" class="breadcrumb-item" data-bc-hash="${escapeHtml(item.hash)}">${item.icon || ''}<span>${escapeHtml(item.label)}</span></button>`;
      })
      .join('');
  }

  // --- Filtros de Archivos, Ordenamiento y Categorías (Incluyendo "Otros") ---

  function filterFilesByQuery(files, query) {
    const normQuery = normalizeForSearch(query);
    if (!normQuery) return files;

    const terms = normQuery.split(/\s+/).filter(Boolean);
    return files.filter((file) => {
      const haystack = `${file.searchName} ${file.searchPath} ${file.extension}`;
      return terms.every((term) => haystack.includes(term));
    });
  }

  function sortFiles(files, preserveApiOrder = false) {
    if (preserveApiOrder) {
      return [...files];
    }
    const copy = [...files];
    switch (state.sortBy) {
      case 'name-asc':
        copy.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base' }));
        break;
      case 'name-desc':
        copy.sort((a, b) => b.displayName.localeCompare(a.displayName, 'es', { sensitivity: 'base' }));
        break;
      case 'date-desc':
        copy.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'size-desc':
        copy.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
        break;
      case 'size-asc':
        copy.sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0));
        break;
      default:
        break;
    }
    return copy;
  }

  function renderCategoryFilters(filesAfterSearch) {
    const counts = { all: filesAfterSearch.length };
    for (const file of filesAfterSearch) {
      counts[file.category] = (counts[file.category] || 0) + 1;
    }

    const orderedCategories = ['all', 'pdf', 'slides', 'image', 'word', 'excel', 'other'];

    dom.categoryFilters.innerHTML = orderedCategories
      .map((cat) => {
        const meta = CATEGORY_META[cat] || CATEGORY_META.other;
        const count = counts[cat] || 0;
        const isActive = state.selectedCategory === cat;

        return `
          <button
            type="button"
            class="cat-filter-btn ${isActive ? 'active' : ''}"
            data-category="${cat}"
            aria-pressed="${isActive}"
          >
            <span class="cat-dot">${meta.icon}</span>
            <span>${escapeHtml(meta.label)}</span>
            <span class="cat-filter-count">${count}</span>
          </button>
        `;
      })
      .join('');
  }

  // --- Renderizado de Tarjetas de Materias (Vista de Semestre) ---

  function renderSubjectCards(subjects, searchHighlightQuery = '') {
    dom.subjectsGrid.innerHTML = subjects
      .map((subj) => {
        const subCount = subj.totalSubfoldersCount || (subj.subfolders ? subj.subfolders.length : 0);
        const subMeta =
          subCount > 0
            ? `${subCount} ${subCount === 1 ? 'subcarpeta' : 'subcarpetas'} · ${subj.fileCount} archivos`
            : `${subj.fileCount} ${subj.fileCount === 1 ? 'archivo de estudio' : 'archivos de estudio'}`;

        const bannerImgHtml = subj.bannerImage
          ? `<img src="${escapeHtml(subj.bannerImage)}" alt="" class="banner-bg-img" loading="lazy" onerror="this.remove()" />`
          : '';

        return `
          <article
            class="subject-card"
            style="--banner-accent: ${escapeHtml(subj.accentColor || '#3B82F6')};"
            data-open-subject="${escapeHtml(subj.slug)}"
            tabindex="0"
            role="button"
            aria-label="Abrir materia ${escapeHtml(subj.cleanName)}"
          >
            <div class="subject-card-banner">
              ${bannerImgHtml}
              <div class="banner-overlay"></div>
              <div class="subject-card-banner-top">
                <span class="subject-card-acad-badge">${escapeHtml(subj.academic.badgeLabel)}</span>
                <span class="subject-card-count-badge">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.2" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  </svg>
                  <span>${subj.fileCount}</span>
                </span>
              </div>
            </div>

            <div class="subject-card-body">
              <div>
                <h3 class="subject-card-title">${highlightMatch(subj.cleanName, searchHighlightQuery)}</h3>
                <p class="subject-card-desc">${escapeHtml(subj.description)}</p>
              </div>
              <div class="subject-card-footer">
                <span class="subject-card-meta">${escapeHtml(subMeta)}</span>
                <span class="subject-card-cta">
                  <span>Abrir materia</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </span>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  // --- Renderizado de Subcarpetas Internas y Archivos ---

  function renderSubfolderCards(subfolders, subjectSlug, highlightQuery = '') {
    dom.foldersGrid.innerHTML = subfolders
      .map((folder) => {
        const subCount = folder.subfolders ? folder.subfolders.length : 0;
        const metaText =
          subCount > 0
            ? `${subCount} ${subCount === 1 ? 'subcarpeta' : 'subcarpetas'} · ${folder.fileCount} archivos`
            : `${folder.fileCount} ${folder.fileCount === 1 ? 'archivo' : 'archivos'}`;

        return `
          <button
            type="button"
            class="folder-card"
            data-open-subfolder="${escapeHtml(folder.id)}"
            data-subject-slug="${escapeHtml(subjectSlug || folder.slug)}"
            title="Abrir subcarpeta ${escapeHtml(folder.cleanPath)}"
          >
            <div class="folder-card-left">
              <div class="folder-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="21" height="21" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div class="folder-card-info">
                <div class="folder-card-title">${highlightMatch(folder.cleanName, highlightQuery)}</div>
                <div class="folder-card-meta">${escapeHtml(metaText)}</div>
              </div>
            </div>
            <span class="folder-card-badge" title="${folder.fileCount} archivos">${folder.fileCount}</span>
          </button>
        `;
      })
      .join('');
  }

  function renderFileCards(files, highlightQuery = '', showSubjectAcademicTag = false) {
    dom.filesContainer.innerHTML = files
      .map((file) => {
        const catMeta = CATEGORY_META[file.category] || CATEGORY_META.other;
        const isFav = state.favorites.has(file.id);
        const extLabel = (file.extension || file.category || 'DOC').toUpperCase();

        // Etiqueta de materia + año/semestre (especialmente destacada en resultados de búsqueda)
        const subjectPillHtml = showSubjectAcademicTag
          ? `<div class="file-subject-pill ${file.academic.badgeClass}" title="${escapeHtml(file.rootSubjectName)} · ${escapeHtml(file.academic.badgeLabel)}">
               <span>${escapeHtml(file.rootSubjectName)} · ${escapeHtml(file.academic.badgeLabel)}</span>
             </div>`
          : '';

        return `
          <article
            class="file-card"
            data-preview-file="${escapeHtml(file.id)}"
            tabindex="0"
            role="button"
            aria-label="Abrir vista previa de ${escapeHtml(file.displayName)}"
          >
            <div class="file-card-top">
              <div class="file-type-group">
                <div class="file-type-icon ${catMeta.className}" aria-hidden="true">
                  ${catMeta.icon}
                </div>
                <div class="file-badges">
                  <span class="ext-badge ${catMeta.className}">${escapeHtml(extLabel)}</span>
                  <span class="size-badge" title="Tamaño del archivo">${escapeHtml(file.sizeFormatted)}</span>
                </div>
              </div>

              <button
                type="button"
                class="card-fav-btn ${isFav ? 'is-fav' : ''}"
                data-fav-file="${escapeHtml(file.id)}"
                data-file-id="${escapeHtml(file.id)}"
                aria-label="${isFav ? 'Quitar de Favoritos' : 'Guardar en Favoritos'}"
                title="${isFav ? 'Quitar de Favoritos' : 'Guardar en Favoritos'}"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </button>
            </div>

            <div class="file-card-body">
              <h3 class="file-card-title" title="${escapeHtml(file.rawCleanName)}">
                ${highlightMatch(file.displayName, highlightQuery)}
              </h3>

              <div class="file-meta-tags">
                ${subjectPillHtml}
                <button
                  type="button"
                  class="file-folder-tag"
                  data-jump-subject="${escapeHtml(file.subjectSlug)}"
                  data-jump-folder="${escapeHtml(file.folderId)}"
                  title="Ir a la carpeta: ${escapeHtml(file.cleanPath)}"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>${highlightMatch(file.cleanPath, highlightQuery)}</span>
                </button>
              </div>
            </div>

            <div class="file-card-footer">
              <span class="file-date">${escapeHtml(file.formattedDate)}</span>
              <div class="file-card-actions">
                <span class="card-preview-btn">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <span>Vista previa</span>
                </span>
                <a
                  href="${escapeHtml(file.downloadUrl)}"
                  class="card-action-link"
                  data-stop-prop="true"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Descargar (${escapeHtml(file.sizeFormatted)})"
                  aria-label="Descargar ${escapeHtml(file.displayName)}"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  // --- Orquestador de Renderizado según Ruta Activa ---

  function renderCurrentRoute() {
    if (!state.catalog) return;

    dom.loadingState.classList.add('hidden');
    renderFolderTree();

    if (state.routeType === 'welcome') {
      dom.welcomeView.classList.remove('hidden');
      dom.explorerView.classList.add('hidden');
      renderWelcomeView();
      return;
    }

    dom.welcomeView.classList.add('hidden');
    dom.explorerView.classList.remove('hidden');
    renderExplorerView();
  }

  function renderExplorerView() {
    renderBreadcrumbsAndBackBtn();
    dom.contentSearchLoading.classList.add('hidden');
    dom.switchSearchModeBtn.classList.add('hidden');
    dom.emptyStateAltBtn.classList.add('hidden');

    // CASO A: Vista de Semestre (#semestre/1..4 o #general)
    if (state.routeType === 'semester' || state.routeType === 'general') {
      dom.subjectBanner.classList.add('hidden');
      dom.standardPageHeader.classList.remove('hidden');
      dom.academicFiltersBar.classList.remove('hidden');
      dom.fileFiltersSection.classList.add('hidden');
      dom.activeFilterBanner.classList.add('hidden');
      dom.foldersSection.classList.add('hidden');
      dom.filesSection.classList.add('hidden');
      dom.viewControlsGroup.classList.add('hidden');

      renderAcademicFilters();

      const rootFolders = (state.catalog.indexedRootFolders || []).filter((f) =>
        matchesAcademicFilter(f)
      );

      const semestresCfg = (state.materiasConfig && state.materiasConfig.semestres) || [];
      if (state.selectedYear === 'general') {
        dom.currentViewTitle.textContent = 'Libros y Recursos Generales';
        dom.currentViewSubtitle.textContent =
          'Bibliografía de referencia, diccionarios técnicos, normas ISO e informes sectoriales de la carrera.';
      } else if (state.selectedSemester !== 'all') {
        const cfgSem = semestresCfg.find((s) => Number(s.id) === Number(state.selectedSemester));
        const yearNum = Number(state.selectedSemester) <= 2 ? 1 : 2;
        dom.currentViewTitle.textContent = cfgSem
          ? `${yearNum}.° Año · ${cfgSem.label}`
          : `${state.selectedSemester}.° Semestre`;
        dom.currentViewSubtitle.textContent = cfgSem
          ? cfgSem.shortDesc
          : 'Selecciona una asignatura para acceder a su portada, unidades temáticas y archivos.';
      } else if (state.selectedYear !== 'all') {
        dom.currentViewTitle.textContent = `Materias de ${state.selectedYear}.° Año`;
        dom.currentViewSubtitle.textContent = `Asignaturas correspondientes a los semestres de ${state.selectedYear}.° Año.`;
      } else {
        dom.currentViewTitle.textContent = 'Todas las Asignaturas y Recursos';
        dom.currentViewSubtitle.textContent = `Explora las ${rootFolders.length} materias activas organizadas por Año y Semestre.`;
      }

      if (rootFolders.length > 0) {
        dom.subjectsSection.classList.remove('hidden');
        dom.emptyState.classList.add('hidden');
        dom.subjectsHeadingText.textContent =
          state.selectedYear === 'general' ? 'Colecciones Disponibles' : 'Asignaturas del Semestre';
        dom.subjectsCountLabel.textContent = `${rootFolders.length} ${rootFolders.length === 1 ? 'materia' : 'materias'}`;
        renderSubjectCards(rootFolders);
      } else {
        dom.subjectsSection.classList.add('hidden');
        renderEmptyState('No hay materias en este filtro');
      }
      return;
    }

    // CASO B: Página Dedicada de Materia (#materia/<slug>[/<subfolderId>])
    if (state.routeType === 'subject') {
      const subjectFolder = state.subjectsBySlug.get(state.activeSubjectSlug);
      if (!subjectFolder) {
        setRouteHash('#inicio');
        return;
      }

      const activeFolder = state.foldersById.get(state.activeFolderId) || subjectFolder;
      const isAtSubjectRoot = activeFolder.id === subjectFolder.id;

      dom.subjectBanner.classList.remove('hidden');
      dom.standardPageHeader.classList.add('hidden');
      dom.academicFiltersBar.classList.add('hidden');
      dom.subjectsSection.classList.add('hidden');
      dom.fileFiltersSection.classList.remove('hidden');
      dom.localSearchWrap.classList.remove('hidden');
      dom.viewControlsGroup.classList.remove('hidden');

      dom.subjectBanner.style.setProperty('--banner-accent', subjectFolder.accentColor || '#3B82F6');
      dom.subjectBannerAcadBadge.textContent = subjectFolder.academic.badgeLabel;
      const subCount = subjectFolder.totalSubfoldersCount || subjectFolder.subfolders.length;
      dom.subjectBannerCounters.textContent = `${subCount} ${subCount === 1 ? 'subcarpeta' : 'subcarpetas'} · ${subjectFolder.fileCount} ${subjectFolder.fileCount === 1 ? 'archivo' : 'archivos'}`;
      dom.subjectBannerTitle.textContent = isAtSubjectRoot
        ? subjectFolder.cleanName
        : `${subjectFolder.cleanName} — ${activeFolder.cleanName}`;
      dom.subjectBannerDesc.textContent = subjectFolder.description;

      if (subjectFolder.bannerImage) {
        if (!document.body.contains(dom.subjectBannerImg)) {
          const newImg = document.createElement('img');
          newImg.id = 'subjectBannerImg';
          newImg.className = 'banner-bg-img';
          newImg.alt = '';
          newImg.onerror = () => newImg.remove();
          dom.subjectBanner.prepend(newImg);
          dom.subjectBannerImg = newImg;
        }
        dom.subjectBannerImg.onerror = () => dom.subjectBannerImg.remove();
        dom.subjectBannerImg.src = subjectFolder.bannerImage;
      } else if (dom.subjectBannerImg) {
        dom.subjectBannerImg.remove();
      }

      dom.localSearchInput.placeholder = `Buscar dentro de ${subjectFolder.cleanName}...`;

      const localQuery = state.localSearchQuery.trim();
      const baseFiles = activeFolder.allDescendantFiles;
      const filesMatchingLocal = filterFilesByQuery(baseFiles, localQuery);

      renderCategoryFilters(filesMatchingLocal);

      const finalFiles =
        state.selectedCategory === 'all'
          ? filesMatchingLocal
          : filesMatchingLocal.filter((f) => f.category === state.selectedCategory);
      const sortedFiles = sortFiles(finalFiles);

      let subfoldersToShow = activeFolder.subfolders || [];
      if (localQuery) {
        const terms = normalizeForSearch(localQuery).split(/\s+/).filter(Boolean);
        subfoldersToShow = subfoldersToShow.filter((sf) =>
          terms.every((t) => `${sf.searchName} ${sf.searchPath}`.includes(t))
        );
      }

      if (localQuery || state.selectedCategory !== 'all') {
        const parts = [];
        if (localQuery) parts.push(`Filtro local: <strong>"${escapeHtml(localQuery)}"</strong>`);
        if (state.selectedCategory !== 'all') {
          const catMeta = CATEGORY_META[state.selectedCategory] || CATEGORY_META.other;
          parts.push(`Tipo: <strong>${escapeHtml(catMeta.label)}</strong>`);
        }
        dom.activeFilterText.innerHTML = `${parts.join(' · ')} — Mostrando <strong>${sortedFiles.length}</strong> ${sortedFiles.length === 1 ? 'archivo' : 'archivos'}`;
        dom.activeFilterBanner.classList.remove('hidden');
      } else {
        dom.activeFilterBanner.classList.add('hidden');
      }

      if (subfoldersToShow.length > 0 && state.selectedCategory === 'all') {
        dom.foldersSection.classList.remove('hidden');
        dom.foldersHeadingText.textContent = isAtSubjectRoot
          ? 'Unidades y Subcarpetas de la Materia'
          : `Subcarpetas en ${activeFolder.cleanName}`;
        dom.foldersCountLabel.textContent = `${subfoldersToShow.length} ${subfoldersToShow.length === 1 ? 'subcarpeta' : 'subcarpetas'}`;
        renderSubfolderCards(subfoldersToShow, subjectFolder.slug, localQuery);
      } else {
        dom.foldersSection.classList.add('hidden');
      }

      if (sortedFiles.length > 0) {
        dom.filesSection.classList.remove('hidden');
        dom.emptyState.classList.add('hidden');
        dom.filesHeadingText.textContent = isAtSubjectRoot
          ? `Documentos de ${subjectFolder.cleanName}`
          : `Documentos en ${activeFolder.cleanName}`;
        dom.filesCountLabel.textContent = `${sortedFiles.length} ${sortedFiles.length === 1 ? 'archivo' : 'archivos'}`;
        dom.filesContainer.className = state.viewMode === 'list' ? 'files-list' : 'files-grid';
        renderFileCards(sortedFiles, localQuery, false);
      } else {
        dom.filesSection.classList.add('hidden');
        if (subfoldersToShow.length === 0 || localQuery || state.selectedCategory !== 'all') {
          renderEmptyState('No se encontraron archivos en esta materia con los filtros actuales.');
        } else {
          dom.emptyState.classList.add('hidden');
        }
      }
      return;
    }

    // CASO C1: Búsqueda dentro del CONTENIDO de los documentos (#buscar?modo=contenido&q=...)
    if (state.routeType === 'search' && state.activeSearchMode === 'contenido') {
      const query = state.globalSearchQuery.trim();
      dom.subjectBanner.classList.add('hidden');
      dom.standardPageHeader.classList.remove('hidden');
      dom.academicFiltersBar.classList.remove('hidden');
      dom.localSearchWrap.classList.add('hidden');
      dom.subjectsSection.classList.add('hidden');
      dom.foldersSection.classList.add('hidden');

      renderAcademicFilters();

      // Estado de carga mientras consulta Apps Script
      if (state.contentSearchLoading) {
        dom.currentViewTitle.textContent = `Buscando «${query}» en el contenido...`;
        dom.currentViewSubtitle.textContent =
          'Consultando el índice de texto completo en Google Drive.';
        dom.fileFiltersSection.classList.add('hidden');
        dom.activeFilterBanner.classList.add('hidden');
        dom.filesSection.classList.add('hidden');
        dom.emptyState.classList.add('hidden');
        dom.viewControlsGroup.classList.add('hidden');

        dom.contentSearchLoadingTitle.textContent = `Buscando «${query}» dentro de los documentos de Drive...`;
        dom.contentSearchLoading.classList.remove('hidden');
        return;
      }

      // Cruzar los IDs devueltos por la API con catalogo.json respetando exactamente el orden devuelto
      const matchedById = [];
      const seenIds = new Set();
      for (const fileId of state.contentSearchResultIds) {
        if (seenIds.has(fileId)) continue;
        const indexedFile = state.filesById.get(fileId);
        if (indexedFile) {
          seenIds.add(fileId);
          matchedById.push(indexedFile);
        }
      }

      // Aplicar filtro de Año / Semestre si el usuario seleccionó uno
      const filesAfterAcademic = matchedById.filter((f) => matchesAcademicFilter(f));
      renderCategoryFilters(filesAfterAcademic);
      dom.fileFiltersSection.classList.remove('hidden');
      dom.viewControlsGroup.classList.remove('hidden');

      const finalFiles =
        state.selectedCategory === 'all'
          ? filesAfterAcademic
          : filesAfterAcademic.filter((f) => f.category === state.selectedCategory);

      // Respetar el orden de relevancia devuelto por la API a menos que el usuario cambie el selector
      const sortedFiles =
        state.sortBy === 'name-asc'
          ? finalFiles
          : sortFiles(finalFiles, false);

      dom.currentViewTitle.textContent = `${finalFiles.length} ${
        finalFiles.length === 1 ? 'documento contiene' : 'documentos contienen'
      } «${query}»`;
      dom.currentViewSubtitle.textContent =
        'Resultados encontrados analizando el contenido interno de los documentos alojados en Google Drive.';

      // Banner con opción rápida para probar por título o limpiar búsqueda
      dom.activeFilterText.innerHTML = `Modo: <strong>Búsqueda dentro del contenido</strong> · Término: <strong>«${escapeHtml(query)}»</strong>`;
      dom.switchSearchModeBtn.textContent = `Buscar «${query}» por título`;
      dom.switchSearchModeBtn.classList.remove('hidden');
      dom.resetFiltersBtn.textContent = 'Limpiar búsqueda';
      dom.activeFilterBanner.classList.remove('hidden');

      if (sortedFiles.length > 0) {
        dom.filesSection.classList.remove('hidden');
        dom.emptyState.classList.add('hidden');
        dom.filesHeadingText.textContent = 'Documentos que contienen el término';
        dom.filesCountLabel.textContent = `${sortedFiles.length} ${sortedFiles.length === 1 ? 'documento' : 'documentos'}`;
        dom.filesContainer.className = state.viewMode === 'list' ? 'files-list' : 'files-grid';
        renderFileCards(sortedFiles, query, true);
      } else {
        dom.filesSection.classList.add('hidden');
        dom.emptyState.classList.remove('hidden');
        if (state.contentSearchError) {
          dom.emptyStateTitle.textContent = 'No se pudo consultar el contenido de los documentos';
          dom.emptyStateDesc.textContent = `Ocurrió un inconveniente al conectar con la API de búsqueda en contenido (${state.contentSearchError}). Puedes buscar este término por título en el catálogo local.`;
        } else {
          dom.emptyStateTitle.textContent = `Ningún documento contiene «${query}» con los filtros actuales`;
          dom.emptyStateDesc.textContent =
            'Prueba con otra palabra clave o busca este mismo término en los títulos de materias, carpetas y archivos del catálogo.';
        }
        dom.emptyStateAltBtn.textContent = `Buscar «${query}» por título en el catálogo`;
        dom.emptyStateAltBtn.classList.remove('hidden');
        dom.emptyStateActionBtn.textContent = 'Limpiar búsqueda';
      }
      return;
    }

    // CASO C2: Búsqueda por TÍTULO (#buscar?modo=titulo&q=...), Todos los Archivos (#todos) o Favoritos (#favoritos)
    dom.subjectBanner.classList.add('hidden');
    dom.standardPageHeader.classList.remove('hidden');
    dom.academicFiltersBar.classList.remove('hidden');
    dom.fileFiltersSection.classList.remove('hidden');
    dom.localSearchWrap.classList.add('hidden');
    dom.foldersSection.classList.add('hidden');
    dom.viewControlsGroup.classList.remove('hidden');
    dom.resetFiltersBtn.textContent = 'Limpiar filtros';

    renderAcademicFilters();

    const query = state.routeType === 'search' ? state.globalSearchQuery.trim() : '';
    let basePool = state.allFiles.filter((f) => matchesAcademicFilter(f));

    if (state.routeType === 'favorites') {
      basePool = basePool.filter((f) => state.favorites.has(f.id));
    }

    const filesMatchingSearch = filterFilesByQuery(basePool, query);
    renderCategoryFilters(filesMatchingSearch);

    const finalFiles =
      state.selectedCategory === 'all'
        ? filesMatchingSearch
        : filesMatchingSearch.filter((f) => f.category === state.selectedCategory);
    const sortedFiles = sortFiles(finalFiles);

    // En búsqueda por título también filtramos materias y subcarpetas por nombre
    let matchingSubjects = [];
    if (state.routeType === 'search' && query) {
      const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
      matchingSubjects = (state.catalog.indexedRootFolders || []).filter((subj) => {
        if (!matchesAcademicFilter(subj)) return false;
        const hay = `${subj.searchName} ${subj.searchPath}`;
        return terms.every((t) => hay.includes(t));
      });
    }

    if (matchingSubjects.length > 0 && state.selectedCategory === 'all') {
      dom.subjectsSection.classList.remove('hidden');
      dom.subjectsHeadingText.textContent = 'Materias que coinciden por título';
      dom.subjectsCountLabel.textContent = `${matchingSubjects.length} ${matchingSubjects.length === 1 ? 'materia' : 'materias'}`;
      renderSubjectCards(matchingSubjects, query);
    } else {
      dom.subjectsSection.classList.add('hidden');
    }

    if (state.routeType === 'search') {
      dom.currentViewTitle.textContent = query
        ? `Búsqueda por título: «${query}»`
        : 'Buscador por Título y Carpeta';
      dom.currentViewSubtitle.textContent = `Se encontraron ${sortedFiles.length} archivos y ${matchingSubjects.length} materias que coinciden en nombre o ruta.`;
    } else if (state.routeType === 'favorites') {
      dom.currentViewTitle.textContent = 'Mis Favoritos ⭐';
      dom.currentViewSubtitle.textContent =
        state.favorites.size > 0
          ? `Tienes ${state.favorites.size} ${state.favorites.size === 1 ? 'recurso guardado' : 'recursos guardados'} en este navegador.`
          : 'Guarda tus apuntes y libros más utilizados presionando la estrella en cualquier archivo.';
    } else {
      dom.currentViewTitle.textContent = 'Todos los Archivos del Repositorio';
      dom.currentViewSubtitle.textContent = `Explorando ${sortedFiles.length} recursos académicos de la Tecnicatura en Logística.`;
    }

    const hasYear = state.selectedYear !== 'all';
    const hasSem = state.selectedSemester !== 'all';
    const hasCat = state.selectedCategory !== 'all';
    if (query || hasYear || hasSem || hasCat) {
      const parts = [];
      if (state.routeType === 'search') {
        parts.push(`Modo: <strong>Título / Ruta</strong>`);
      }
      if (hasYear) {
        const yObj = YEAR_OPTIONS.find((y) => String(y.id) === String(state.selectedYear));
        if (yObj) parts.push(`Año: <strong>${escapeHtml(yObj.label)}</strong>`);
      }
      if (hasSem) {
        const sObj = SEMESTER_OPTIONS.find((s) => String(s.id) === String(state.selectedSemester));
        if (sObj) parts.push(`Semestre: <strong>${escapeHtml(sObj.label)}</strong>`);
      }
      if (query) parts.push(`Término: <strong>«${escapeHtml(query)}»</strong>`);
      if (hasCat) {
        const catMeta = CATEGORY_META[state.selectedCategory] || CATEGORY_META.other;
        parts.push(`Tipo: <strong>${escapeHtml(catMeta.label)}</strong>`);
      }
      dom.activeFilterText.innerHTML = `${parts.join(' · ')} — Mostrando <strong>${sortedFiles.length}</strong> ${sortedFiles.length === 1 ? 'archivo' : 'archivos'}`;

      if (state.routeType === 'search' && query.length >= 2) {
        dom.switchSearchModeBtn.textContent = `Buscar «${query}» dentro del contenido`;
        dom.switchSearchModeBtn.classList.remove('hidden');
      }
      dom.activeFilterBanner.classList.remove('hidden');
    } else {
      dom.activeFilterBanner.classList.add('hidden');
    }

    if (sortedFiles.length > 0) {
      dom.filesSection.classList.remove('hidden');
      dom.emptyState.classList.add('hidden');
      dom.filesHeadingText.textContent =
        state.routeType === 'favorites' ? 'Archivos Guardados' : 'Archivos Encontrados';
      dom.filesCountLabel.textContent = `${sortedFiles.length} ${sortedFiles.length === 1 ? 'archivo' : 'archivos'}`;
      dom.filesContainer.className = state.viewMode === 'list' ? 'files-list' : 'files-grid';
      renderFileCards(sortedFiles, query, true);
    } else {
      dom.filesSection.classList.add('hidden');
      if (matchingSubjects.length === 0) {
        renderEmptyState();
        if (state.routeType === 'search' && query.length >= 2) {
          dom.emptyStateAltBtn.textContent = `Buscar «${query}» dentro del contenido de los documentos`;
          dom.emptyStateAltBtn.classList.remove('hidden');
        }
      } else {
        dom.emptyState.classList.add('hidden');
      }
    }
  }

  function renderEmptyState(customMessage = '') {
    dom.emptyState.classList.remove('hidden');

    if (state.routeType === 'favorites' && state.favorites.size === 0) {
      dom.emptyStateTitle.textContent = 'Aún no tienes archivos en Favoritos';
      dom.emptyStateDesc.textContent =
        'Marca con una estrella ⭐ los apuntes, presentaciones o libros que estés estudiando para encontrarlos aquí al instante.';
      dom.emptyStateActionBtn.textContent = 'Ir al Inicio';
      return;
    }

    dom.emptyStateTitle.textContent = 'No se encontraron resultados';
    dom.emptyStateDesc.textContent =
      customMessage ||
      'Intenta con otros términos de búsqueda o presiona "Limpiar filtros" para restablecer la vista.';
    dom.emptyStateActionBtn.textContent = 'Limpiar filtros';
  }

  // --- Visor Modal Integrado con Respaldo ---

  function openPreviewModal(fileId) {
    const file = state.filesById.get(fileId);
    if (!file) return;

    state.activeModalFileId = file.id;
    const catMeta = CATEGORY_META[file.category] || CATEGORY_META.other;

    dom.modalCategoryBadge.className = `file-type-icon ${catMeta.className}`;
    dom.modalCategoryBadge.innerHTML = catMeta.icon;

    dom.modalFileTitle.textContent = file.displayName;
    dom.modalFileTitle.setAttribute('title', file.rawCleanName);
    dom.modalFilePath.textContent = `${file.cleanPath} (${file.academic.badgeLabel})`;
    dom.modalFileSize.textContent = file.sizeFormatted;
    dom.modalFileExt.textContent = (file.extension || file.category || '').toUpperCase();

    dom.modalDownloadBtn.href = file.downloadUrl;
    dom.modalDriveBtn.href = file.driveUrl;
    dom.modalFooterDownloadLink.href = file.downloadUrl;
    dom.modalFooterDriveLink.href = file.driveUrl;

    updateModalFavButton(file.id);

    dom.iframeLoader.classList.remove('hidden');
    dom.previewIframe.src = file.previewUrl;

    dom.previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    dom.modalCloseBtn.focus();
  }

  function updateModalFavButton(fileId) {
    const isFav = state.favorites.has(fileId);
    dom.modalFavBtn.classList.toggle('is-fav', isFav);
    dom.modalFavText.textContent = isFav ? 'En Favoritos' : 'Favorito';
    dom.modalFavBtn.setAttribute('title', isFav ? 'Quitar de Favoritos' : 'Guardar en Favoritos');
  }

  function closePreviewModal() {
    if (dom.previewModal.classList.contains('hidden')) return;
    dom.previewModal.classList.add('hidden');
    dom.previewIframe.src = 'about:blank';
    state.activeModalFileId = null;
    document.body.style.overflow = '';
  }

  // --- Control del Menú Lateral (Escritorio y Móvil) ---

  function isMobileViewport() {
    return window.innerWidth <= 960;
  }

  function toggleSidebar() {
    if (isMobileViewport()) {
      const isOpen = document.body.classList.toggle('mobile-sidebar-open');
      dom.sidebarBackdrop.classList.toggle('hidden', !isOpen);
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  }

  function closeMobileSidebar() {
    document.body.classList.remove('mobile-sidebar-open');
    dom.sidebarBackdrop.classList.add('hidden');
  }

  // --- Disparadores de Búsqueda por Título vs. Búsqueda por Contenido ---

  function triggerInstantTitleSearch(queryText) {
    state.globalSearchQuery = queryText;
    state.activeSearchMode = 'titulo';
    dom.searchInput.value = queryText;
    dom.clearSearchBtn.classList.toggle('hidden', queryText.trim() === '');

    if (queryText.trim() === '') {
      if (state.routeType === 'search') {
        setRouteHash('#inicio');
      } else {
        renderCurrentRoute();
      }
      return;
    }

    state.routeType = 'search';
    const targetHash = `#buscar?modo=titulo&q=${encodeURIComponent(queryText.trim())}`;
    if (window.location.hash.startsWith('#buscar')) {
      window.history.replaceState(null, '', targetHash);
      renderCurrentRoute();
    } else {
      state.ignoreNextHashChange = true;
      window.location.hash = targetHash;
      renderCurrentRoute();
    }
  }

  function navigateToContentSearch(queryText) {
    const trimmed = cleanText(queryText);
    if (trimmed.length < 2) {
      return;
    }
    const targetHash = `#buscar?modo=contenido&q=${encodeURIComponent(trimmed)}`;
    setRouteHash(targetHash);
  }

  function switchBetweenTitleAndContentSearch() {
    const query = state.globalSearchQuery.trim();
    if (!query) return;

    if (state.activeSearchMode === 'contenido') {
      setTopbarSearchModeUI('titulo');
      setRouteHash(`#buscar?modo=titulo&q=${encodeURIComponent(query)}`);
    } else if (query.length >= 2) {
      setTopbarSearchModeUI('contenido');
      navigateToContentSearch(query);
    }
  }

  // --- Registro de Eventos ---

  function bindEvents() {
    window.addEventListener('hashchange', parseHashAndRender);

    dom.sidebarToggle.addEventListener('click', toggleSidebar);
    dom.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    dom.brandHomeLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileSidebar();
      setRouteHash('#inicio');
    });

    dom.navHomeBtn.addEventListener('click', () => {
      closeMobileSidebar();
      setRouteHash('#inicio');
    });

    dom.navAllFilesBtn.addEventListener('click', () => {
      closeMobileSidebar();
      state.selectedYear = 'all';
      state.selectedSemester = 'all';
      state.selectedCategory = 'all';
      setRouteHash('#todos');
    });

    dom.navFavBtn.addEventListener('click', () => {
      closeMobileSidebar();
      state.selectedYear = 'all';
      state.selectedSemester = 'all';
      state.selectedCategory = 'all';
      setRouteHash('#favoritos');
    });

    dom.topFavBtn.addEventListener('click', () => {
      if (state.routeType === 'favorites') {
        setRouteHash('#inicio');
      } else {
        state.selectedYear = 'all';
        state.selectedSemester = 'all';
        state.selectedCategory = 'all';
        setRouteHash('#favoritos');
      }
    });

    dom.themeToggleBtn.addEventListener('click', toggleTheme);
    dom.toggleAllTreeBtn.addEventListener('click', toggleAllTreeExpansion);

    // Delegación en el Acordeón Lateral por Semestre
    dom.folderTree.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-sem-toggle]');
      if (toggleBtn) {
        e.stopPropagation();
        const semKey = toggleBtn.getAttribute('data-sem-toggle');
        if (state.expandedSemesters.has(semKey)) {
          state.expandedSemesters.delete(semKey);
        } else {
          state.expandedSemesters.add(semKey);
        }
        renderFolderTree();
        return;
      }

      const semBtn = e.target.closest('[data-sem-hash]');
      if (semBtn) {
        const semKey = semBtn.getAttribute('data-sem-key');
        const semHash = semBtn.getAttribute('data-sem-hash');
        state.expandedSemesters.add(semKey);
        closeMobileSidebar();
        setRouteHash(semHash);
        return;
      }

      const subjBtn = e.target.closest('[data-subject-slug]');
      if (subjBtn) {
        const slug = subjBtn.getAttribute('data-subject-slug');
        const fromSem = subjBtn.getAttribute('data-from-sem');
        if (fromSem && fromSem !== 'general') {
          state.lastVisitedSemester = Number(fromSem);
        }
        state.selectedCategory = 'all';
        closeMobileSidebar();
        setRouteHash(`#materia/${slug}`);
      }
    });

    // 1. Buscador Principal de la Portada (#inicio): EXCLUSIVO para búsqueda en CONTENIDO al presionar Enter o "Buscar ahora"
    dom.heroSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = dom.heroSearchInput.value.trim();
      if (q.length >= 2) {
        navigateToContentSearch(q);
      } else {
        dom.heroSearchInput.focus();
      }
    });

    // 2. Barra Superior: Selector de modo (Título | Contenido)
    dom.modeTitleBtn.addEventListener('click', () => {
      setTopbarSearchModeUI('titulo');
      const q = dom.searchInput.value.trim();
      if (q) {
        triggerInstantTitleSearch(q);
      } else {
        dom.searchInput.focus();
      }
    });

    dom.modeContentBtn.addEventListener('click', () => {
      setTopbarSearchModeUI('contenido');
      const q = dom.searchInput.value.trim();
      if (q.length >= 2 && state.routeType === 'search') {
        navigateToContentSearch(q);
      } else {
        dom.searchInput.focus();
      }
    });

    // Input de la barra superior: instantáneo SOLO en modo 'titulo'
    dom.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      dom.clearSearchBtn.classList.toggle('hidden', val.trim() === '');
      if (state.topSearchMode === 'titulo') {
        triggerInstantTitleSearch(val);
      }
    });

    // Submit de la barra superior (Enter o botón "Buscar"): ejecuta búsqueda en contenido si está en modo 'contenido'
    dom.topbarSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = dom.searchInput.value.trim();
      if (!val) return;
      if (state.topSearchMode === 'contenido') {
        if (val.length >= 2) {
          navigateToContentSearch(val);
        }
      } else {
        triggerInstantTitleSearch(val);
      }
    });

    dom.clearSearchBtn.addEventListener('click', () => {
      state.globalSearchQuery = '';
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      if (state.routeType === 'search') {
        setRouteHash('#inicio');
      } else {
        renderCurrentRoute();
      }
    });

    // Botones de cambio alternativo entre búsqueda en Contenido y búsqueda por Título
    dom.switchSearchModeBtn.addEventListener('click', switchBetweenTitleAndContentSearch);
    dom.emptyStateAltBtn.addEventListener('click', switchBetweenTitleAndContentSearch);

    // Tarjetas de Recorrido por Semestre en #inicio
    dom.semesterJourneyGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-goto-hash]');
      if (!card) return;
      setRouteHash(card.getAttribute('data-goto-hash'));
    });

    dom.semesterJourneyGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('[data-goto-hash]');
        if (card) {
          e.preventDefault();
          setRouteHash(card.getAttribute('data-goto-hash'));
        }
      }
    });

    // Botón Volver y Breadcrumbs
    dom.backNavBtn.addEventListener('click', () => {
      const targetHash = dom.backNavBtn.getAttribute('data-back-hash') || '#inicio';
      setRouteHash(targetHash);
    });

    dom.breadcrumbs.addEventListener('click', (e) => {
      const bcBtn = e.target.closest('[data-bc-hash]');
      if (!bcBtn) return;
      setRouteHash(bcBtn.getAttribute('data-bc-hash'));
    });

    // Filtros de Año y Semestre
    dom.yearFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-year]');
      if (!btn) return;
      const yearId = btn.getAttribute('data-year');
      setYearFilter(state.selectedYear === yearId && yearId !== 'all' ? 'all' : yearId);
    });

    dom.semesterFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-semester]');
      if (!btn || btn.disabled) return;
      const semId = btn.getAttribute('data-semester');
      setSemesterFilter(semId);
    });

    // Buscador Local dentro de una Materia
    dom.localSearchInput.addEventListener('input', (e) => {
      state.localSearchQuery = e.target.value;
      dom.clearLocalSearchBtn.classList.toggle('hidden', state.localSearchQuery.trim() === '');
      renderExplorerView();
    });

    dom.clearLocalSearchBtn.addEventListener('click', () => {
      state.localSearchQuery = '';
      dom.localSearchInput.value = '';
      dom.clearLocalSearchBtn.classList.add('hidden');
      dom.localSearchInput.focus();
      renderExplorerView();
    });

    // Atajos de teclado '/' o Cmd/Ctrl+K
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.previewModal.classList.contains('hidden')) {
        closePreviewModal();
        return;
      }

      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      if ((e.key === '/' && !isInputFocused) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (state.routeType === 'subject' && !dom.localSearchWrap.classList.contains('hidden')) {
          dom.localSearchInput.focus();
          dom.localSearchInput.select();
        } else {
          dom.searchInput.focus();
          dom.searchInput.select();
        }
      }
    });

    // Filtros por tipo de archivo
    dom.categoryFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      const cat = btn.getAttribute('data-category');
      state.selectedCategory = state.selectedCategory === cat && cat !== 'all' ? 'all' : cat;
      renderExplorerView();
    });

    dom.sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderExplorerView();
    });

    dom.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    dom.listViewBtn.addEventListener('click', () => setViewMode('list'));

    dom.resetFiltersBtn.addEventListener('click', clearActiveFilters);
    dom.emptyStateActionBtn.addEventListener('click', () => {
      if (state.routeType === 'favorites' && state.favorites.size === 0) {
        setRouteHash('#inicio');
      } else {
        clearActiveFilters();
      }
    });

    // Delegación en tarjetas de Materias (#semestre/<n>)
    dom.subjectsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-open-subject]');
      if (!card) return;
      state.selectedCategory = 'all';
      setRouteHash(`#materia/${card.getAttribute('data-open-subject')}`);
    });

    dom.subjectsGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('[data-open-subject]');
        if (card) {
          e.preventDefault();
          state.selectedCategory = 'all';
          setRouteHash(`#materia/${card.getAttribute('data-open-subject')}`);
        }
      }
    });

    // Delegación en tarjetas de Subcarpetas internas (#materia/<slug>/<subId>)
    dom.foldersGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-open-subfolder]');
      if (!card) return;
      const subId = card.getAttribute('data-open-subfolder');
      const slug = card.getAttribute('data-subject-slug') || state.activeSubjectSlug;
      setRouteHash(`#materia/${slug}/${subId}`);
    });

    // Delegación en tarjetas de Archivos
    dom.filesContainer.addEventListener('click', (e) => {
      const favBtn = e.target.closest('[data-fav-file]');
      if (favBtn) {
        e.stopPropagation();
        toggleFavorite(favBtn.getAttribute('data-fav-file'));
        return;
      }

      const folderTag = e.target.closest('[data-jump-folder]');
      if (folderTag) {
        e.stopPropagation();
        const slug = folderTag.getAttribute('data-jump-subject');
        const folderId = folderTag.getAttribute('data-jump-folder');
        const subjFolder = state.subjectsBySlug.get(slug);
        if (subjFolder && folderId && folderId !== subjFolder.id) {
          setRouteHash(`#materia/${slug}/${folderId}`);
        } else if (slug) {
          setRouteHash(`#materia/${slug}`);
        }
        return;
      }

      const stopLink = e.target.closest('[data-stop-prop]');
      if (stopLink) {
        e.stopPropagation();
        return;
      }

      const fileCard = e.target.closest('[data-preview-file]');
      if (fileCard) {
        openPreviewModal(fileCard.getAttribute('data-preview-file'));
      }
    });

    dom.filesContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const fileCard = e.target.closest('[data-preview-file]');
        if (fileCard && e.target === fileCard) {
          e.preventDefault();
          openPreviewModal(fileCard.getAttribute('data-preview-file'));
        }
      }
    });

    // Modal
    dom.modalCloseBtn.addEventListener('click', closePreviewModal);
    dom.previewModal.addEventListener('click', (e) => {
      if (e.target === dom.previewModal) {
        closePreviewModal();
      }
    });

    dom.modalFavBtn.addEventListener('click', () => {
      if (state.activeModalFileId) {
        toggleFavorite(state.activeModalFileId);
      }
    });

    dom.previewIframe.addEventListener('load', () => {
      if (dom.previewIframe.src && dom.previewIframe.src !== 'about:blank') {
        dom.iframeLoader.classList.add('hidden');
      }
    });
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    dom.gridViewBtn.classList.toggle('active', mode === 'grid');
    dom.listViewBtn.classList.toggle('active', mode === 'list');
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
    } catch {
      // ignore
    }
    dom.filesContainer.className = mode === 'list' ? 'files-list' : 'files-grid';
  }

  function clearActiveFilters() {
    state.localSearchQuery = '';
    if (dom.localSearchInput) {
      dom.localSearchInput.value = '';
      dom.clearLocalSearchBtn.classList.add('hidden');
    }
    state.selectedCategory = 'all';

    if (state.routeType === 'search') {
      state.globalSearchQuery = '';
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      state.selectedYear = 'all';
      state.selectedSemester = 'all';
      setRouteHash('#inicio');
      return;
    }

    if (state.routeType !== 'subject') {
      state.globalSearchQuery = '';
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      state.selectedYear = 'all';
      state.selectedSemester = 'all';
    }

    renderFolderTree();
    renderExplorerView();
  }

  // --- Sincronización Híbrida y Automática del Catálogo (`ctt_live_catalog_v1`) ---

  function isValidCatalogObject(obj) {
    return Boolean(obj && typeof obj === 'object' && Array.isArray(obj.folders));
  }

  function getCatalogUpdatedAtIso(updatedAtStr, catalogObj) {
    return (
      cleanText(updatedAtStr) ||
      cleanText(catalogObj && (catalogObj.updatedAt || catalogObj.generatedAt)) ||
      ''
    );
  }

  function getCatalogTimestampMs(updatedAtStr, catalogObj) {
    const iso = getCatalogUpdatedAtIso(updatedAtStr, catalogObj);
    if (!iso) return 0;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 0 : ms;
  }

  function computeCatalogStructureSignature(catalogObj) {
    if (!isValidCatalogObject(catalogObj)) return '';
    const tf = catalogObj.totalFolders ?? catalogObj.folders.length;
    const tfi = catalogObj.totalFiles ?? 0;
    let serialized = '';
    try {
      serialized = JSON.stringify(catalogObj.folders);
    } catch {
      serialized = '';
    }
    return `${tf}|${tfi}|${serialized.length}|${serialized}`;
  }

  function formatSyncDateDDMMYYYY(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return '';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return '';
    }
  }

  function updateSyncDateUI(isoString) {
    if (!dom.catalogSyncDateText) return;
    const formatted = formatSyncDateDDMMYYYY(isoString);
    if (formatted) {
      dom.catalogSyncDateText.textContent = `Catálogo actualizado: ${formatted}`;
      dom.catalogSyncDateText.title = `Última sincronización: ${isoString}`;
      dom.catalogSyncDateText.classList.remove('hidden');
    } else {
      dom.catalogSyncDateText.classList.add('hidden');
    }
  }

  function loadCachedLiveCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LIVE_CATALOG);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !isValidCatalogObject(parsed.catalog)) return null;
      return {
        updatedAt: getCatalogUpdatedAtIso(parsed.updatedAt, parsed.catalog),
        catalog: parsed.catalog,
      };
    } catch {
      return null;
    }
  }

  function saveCachedLiveCatalog(updatedAt, catalog) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.LIVE_CATALOG,
        JSON.stringify({
          updatedAt: getCatalogUpdatedAtIso(updatedAt, catalog),
          catalog,
        })
      );
    } catch {
      // Ignorar errores de cuota o navegación privada en silencio
    }
  }

  /**
   * Elige la versión más reciente y válida entre el catalogo.json local y ctt_live_catalog_v1 en localStorage.
   */
  function selectMostRecentInitialCatalog(localCatalog, cachedEntry) {
    const localValid = isValidCatalogObject(localCatalog);
    const cachedValid = Boolean(cachedEntry && isValidCatalogObject(cachedEntry.catalog));

    if (localValid && cachedValid) {
      const localMs = getCatalogTimestampMs(null, localCatalog);
      const cachedMs = getCatalogTimestampMs(cachedEntry.updatedAt, cachedEntry.catalog);
      if (cachedMs > localMs) {
        return {
          catalog: cachedEntry.catalog,
          updatedAt: getCatalogUpdatedAtIso(cachedEntry.updatedAt, cachedEntry.catalog),
        };
      }
      return {
        catalog: localCatalog,
        updatedAt: getCatalogUpdatedAtIso(null, localCatalog),
      };
    }

    if (localValid) {
      return {
        catalog: localCatalog,
        updatedAt: getCatalogUpdatedAtIso(null, localCatalog),
      };
    }

    if (cachedValid) {
      return {
        catalog: cachedEntry.catalog,
        updatedAt: getCatalogUpdatedAtIso(cachedEntry.updatedAt, cachedEntry.catalog),
      };
    }

    return null;
  }

  /**
   * Re-renderiza suavemente la vista actual tras una actualización en segundo plano
   * sin cambiar window.location.hash, sin perder el texto en los buscadores y sin saltar el scroll.
   */
  function softRefreshCurrentView() {
    const prevScrollX = window.scrollX;
    const prevScrollY = window.scrollY;

    const activeEl = document.activeElement;
    const activeId = activeEl && activeEl.id ? activeEl.id : null;
    let selStart = null;
    let selEnd = null;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      try {
        selStart = activeEl.selectionStart;
        selEnd = activeEl.selectionEnd;
      } catch {
        // ignore
      }
    }

    const savedTopQuery = dom.searchInput ? dom.searchInput.value : state.globalSearchQuery;
    const savedHeroQuery = dom.heroSearchInput ? dom.heroSearchInput.value : '';
    const savedLocalQuery = dom.localSearchInput ? dom.localSearchInput.value : state.localSearchQuery;

    renderCurrentRoute();

    if (dom.searchInput) dom.searchInput.value = savedTopQuery;
    if (dom.heroSearchInput) dom.heroSearchInput.value = savedHeroQuery;
    if (dom.localSearchInput) dom.localSearchInput.value = savedLocalQuery;

    if (activeId) {
      const restoredEl = document.getElementById(activeId);
      if (restoredEl && typeof restoredEl.focus === 'function') {
        restoredEl.focus({ preventScroll: true });
        if (selStart !== null && selEnd !== null && typeof restoredEl.setSelectionRange === 'function') {
          try {
            restoredEl.setSelectionRange(selStart, selEnd);
          } catch {
            // ignore
          }
        }
      }
    }

    window.scrollTo(prevScrollX, prevScrollY);
  }

  /**
   * Sincroniza silenciosamente en segundo plano contra ${contentSearchApiUrl}?action=catalog
   * con un timeout de 10 segundos. Si falla, se ignora en silencio.
   */
  async function syncLiveCatalogInBackground() {
    const apiUrl =
      (state.materiasConfig &&
        state.materiasConfig.portal &&
        state.materiasConfig.portal.contentSearchApiUrl) ||
      state.contentSearchApiUrl;

    if (!apiUrl) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CATALOG_SYNC_TIMEOUT_MS);

    try {
      const sep = apiUrl.includes('?') ? '&' : '?';
      // Petición fetch GET simple sin headers personalizados para evitar preflight CORS con Apps Script
      const response = await fetch(`${apiUrl}${sep}action=catalog`, {
        signal: controller.signal,
      });

      if (!response.ok) return;

      const payload = await response.json();
      if (!payload || payload.ok !== true || !isValidCatalogObject(payload.catalog)) {
        return;
      }

      const remoteCatalog = payload.catalog;
      const remoteUpdatedAt =
        getCatalogUpdatedAtIso(payload.updatedAt, remoteCatalog) || new Date().toISOString();

      // Guardar en localStorage bajo ctt_live_catalog_v1
      saveCachedLiveCatalog(remoteUpdatedAt, remoteCatalog);

      // Comparar si el catálogo recibido difiere del que ya está en pantalla
      const remoteSignature = computeCatalogStructureSignature(remoteCatalog);
      const structureChanged = remoteSignature !== state.activeCatalogFingerprint;
      const timestampChanged = remoteUpdatedAt !== state.activeCatalogUpdatedAt;

      if (structureChanged) {
        state.activeCatalogUpdatedAt = remoteUpdatedAt;
        state.activeCatalogFingerprint = remoteSignature;
        indexCatalog(remoteCatalog);
        updateSyncDateUI(remoteUpdatedAt);
        softRefreshCurrentView();
      } else if (timestampChanged) {
        state.activeCatalogUpdatedAt = remoteUpdatedAt;
        updateSyncDateUI(remoteUpdatedAt);
      }
    } catch {
      // Tolerancia a fallos: ignorar cualquier error de red, timeout o CORS en silencio
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Inicialización ---

  async function init() {
    cacheDom();
    loadPersistedState();
    setViewMode(state.viewMode);
    setTopbarSearchModeUI('titulo');
    updateFavoritesBadges();
    bindEvents();

    const cachedEntry = loadCachedLiveCatalog();

    try {
      const cacheBuster = Date.now();
      const [catalogRes, configRes] = await Promise.all([
        fetch(`./catalogo.json?t=${cacheBuster}`, { cache: 'no-store' }).catch(() => null),
        fetch(`./materias-config.json?t=${cacheBuster}`, { cache: 'no-store' }).catch(() => null),
      ]);

      if (configRes && configRes.ok) {
        const configData = await configRes.json();
        buildMateriaLookup(configData);
      }

      let localCatalog = null;
      if (catalogRes && catalogRes.ok) {
        localCatalog = await catalogRes.json();
      }

      const chosen = selectMostRecentInitialCatalog(localCatalog, cachedEntry);
      if (!chosen || !chosen.catalog) {
        throw new Error(catalogRes ? `HTTP ${catalogRes.status}` : 'Catálogo local no disponible');
      }

      state.activeCatalogUpdatedAt = chosen.updatedAt;
      state.activeCatalogFingerprint = computeCatalogStructureSignature(chosen.catalog);

      indexCatalog(chosen.catalog);
      updateSyncDateUI(chosen.updatedAt);

      if (!window.location.hash) {
        window.history.replaceState(null, '', '#inicio');
      }
      parseHashAndRender();

      // Lanzar sincronización silenciosa en segundo plano sin bloquear la apertura inicial
      syncLiveCatalogInBackground();
    } catch (err) {
      console.error('Error al cargar datos del portal:', err);
      dom.loadingState.innerHTML = `
        <p style="color: var(--cat-pdf-text); font-weight: 600;">
          No se pudo cargar catalogo.json (${escapeHtml(err.message)}).
        </p>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">
          Asegúrate de abrir el portal desde un servidor HTTP local.
        </p>
      `;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
