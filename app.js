
const state = {
  db: null,
  activeBookmarks: [],
  filters: { status: 'all', category: null, search: '', page: 0 },
  hasMore: false,
  limit: 50
};

const dom = {
  themeToggle: document.getElementById('theme-toggle'),
  searchInput: document.getElementById('search-input'),
  statusFilters: document.getElementById('status-filters'),
  categoryFilters: document.getElementById('category-filters'),
  bookmarksGrid: document.getElementById('bookmarks-grid'),
  emptyState: document.getElementById('empty-state'),
  count: document.getElementById('bookmark-count'),
  filterTitle: document.getElementById('current-filter-title'),
  modal: document.getElementById('details-modal'),
  closeModal: document.getElementById('close-modal'),
  modalBody: document.getElementById('modal-body'),
  mobileFilterFab: document.getElementById('mobile-filter-fab'),
  sidebar: document.getElementById('sidebar'),
  closeSheetBtn: document.getElementById('close-sheet-btn'),
  filterBackdrop: document.getElementById('filter-backdrop'),
  loadMoreBtn: document.getElementById('load-more-btn'),
  loadMoreContainer: document.getElementById('load-more-container'),
};

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTimeSpent(ms) {
  if (!ms) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function init() {
  const savedTheme = localStorage.getItem('gistra_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  dom.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gistra_theme', next);
  });

  try {
    const data = GISTRA_SNAPSHOT_DATA;
    state.db = data;
    
    // Build category map
    const catMap = {};
    if(data.categories) {
      data.categories.forEach(c => catMap[c.id] = c);
    }
    const bookmarkCats = {}; // bookmarkId -> category[]
    if(data.bookmarkCategories) {
      data.bookmarkCategories.forEach(bc => {
        if(!bookmarkCats[bc.bookmarkId]) bookmarkCats[bc.bookmarkId] = [];
        if(catMap[bc.categoryId]) bookmarkCats[bc.bookmarkId].push(catMap[bc.categoryId]);
      });
    }

    // pre-process
    state.db.bookmarks = state.db.bookmarks.filter(b => !b.isDeleted).map(b => {
      b.cats = bookmarkCats[b.id] || [];
      b.searchStr = (b.title || '') + ' ' + (b.originalUrl || '') + ' ' + (b.userTitle || '') + ' ' + b.cats.map(c=>c.name).join(' ');
      b.searchStr = b.searchStr.toLowerCase();
      return b;
    });

    // active categories only
    const usedCategories = [];
    if(data.categories) {
      data.categories.forEach(c => {
         if (!c.isDeleted) usedCategories.push(c);
      });
    }
    usedCategories.sort((a,b) => a.sortOrder - b.sortOrder);
    
    renderCategories(usedCategories);
    applyFilters();
  } catch (e) {
    dom.bookmarksGrid.innerHTML = '<p class="error">Failed to load snapshot.json</p>';
    console.error(e);
  }
}

function applyFilters() {
  let filtered = state.db.bookmarks;
  
  if (state.filters.status === 'todo') {
    filtered = filtered.filter(b => !b.isProcessed && !b.isArchived);
    dom.filterTitle.innerText = "To-Do Bookmarks";
  } else if (state.filters.status === 'done') {
    filtered = filtered.filter(b => b.isProcessed);
    dom.filterTitle.innerText = "Done";
  } else {
    dom.filterTitle.innerText = "All Bookmarks";
  }
  
  if (state.filters.category) {
    filtered = filtered.filter(b => b.cats.some(c => c.id === state.filters.category));
    const catNode = document.querySelector(`li[data-cat="${state.filters.category}"]`);
    if(catNode) dom.filterTitle.innerText = catNode.innerText;
  }
  
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    filtered = filtered.filter(b => b.searchStr.includes(q));
  }

  // sort newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  state.activeBookmarks = filtered;
  dom.count.innerText = filtered.length;
  state.filters.page = 0;
  
  renderBookmarks();
}

function renderCategories(categories) {
  dom.categoryFilters.innerHTML = `
    <li class="${!state.filters.category ? 'active' : ''}" data-cat="">All Categories</li>
    ${categories.map(c => `
      <li class="${state.filters.category === c.id ? 'active' : ''}" data-cat="${c.id}">
        ${escapeHtml(c.name)}
      </li>
    `).join('')}
  `;
}

function renderBookmarks() {
  const start = 0;
  const end = (state.filters.page + 1) * state.limit;
  const chunk = state.activeBookmarks.slice(start, end);
  state.hasMore = state.activeBookmarks.length > end;

  if (chunk.length === 0) {
    dom.bookmarksGrid.innerHTML = '';
    dom.emptyState.classList.remove('hidden');
  } else {
    dom.emptyState.classList.add('hidden');
    dom.bookmarksGrid.innerHTML = chunk.map(b => `
      <div class="bookmark-card" data-id="${b.id}">
        <h3>${escapeHtml(b.title || b.originalUrl)}</h3>
        <div class="bookmark-url" title="${escapeHtml(b.originalUrl)}" style="margin-bottom: 0.25rem;">${escapeHtml(b.originalUrl)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-bottom: 0.75rem;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${formatDate(b.createdAt)}
        </div>
        <div class="bookmark-tags">
          ${b.latestAiSummaryId ? `<span class="tag ai">✦ AI Analysed</span>` : ''}
          ${b.cats.slice(0,2).map(c => `<span class="tag">${escapeHtml(c.name)}</span>`).join('')}
        </div>
        <div class="bookmark-metrics">
          <span class="metric" title="Views"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> ${b.openCount || 0} views</span>
          <span class="metric" title="Read Time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${formatTimeSpent(b.totalInAppReadMs)} read</span>
          <span class="metric" title="Shares"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> ${b.shareCount || 0} shares</span>
        </div>
      </div>
    `).join('');
  }

  if (state.hasMore) {
    dom.loadMoreContainer.classList.remove('hidden');
  } else {
    dom.loadMoreContainer.classList.add('hidden');
  }
}

// Events
dom.statusFilters.addEventListener('click', (e) => {
  if (e.target.tagName === 'LI') {
    Array.from(dom.statusFilters.children).forEach(el => el.classList.remove('active'));
    e.target.classList.add('active');
    state.filters.status = e.target.dataset.status;
    applyFilters();
    if(dom.sidebar.classList.contains('open')) {
      dom.sidebar.classList.remove('open');
      dom.filterBackdrop.classList.remove('active');
    }
  }
});

dom.categoryFilters.addEventListener('click', (e) => {
  if (e.target.tagName === 'LI') {
    Array.from(dom.categoryFilters.children).forEach(el => el.classList.remove('active'));
    e.target.classList.add('active');
    state.filters.category = e.target.dataset.cat || null;
    applyFilters();
    if(dom.sidebar.classList.contains('open')) {
      dom.sidebar.classList.remove('open');
      dom.filterBackdrop.classList.remove('active');
    }
  }
});

dom.loadMoreBtn.addEventListener('click', () => {
  if(state.hasMore) {
    state.filters.page++;
    renderBookmarks(); // render preserves existing array, just displays more
  }
});

let searchTimeout;
dom.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.filters.search = e.target.value.trim();
    applyFilters();
  }, 300);
});

// Modal Logic
dom.bookmarksGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.bookmark-card');
  if (!card) return;
  openModal(card.dataset.id);
});

function openModal(id) {
  const b = state.activeBookmarks.find(x => x.id === id);
  if(!b) return;
  dom.modal.classList.add('active');
  
  let previewImg = '';
  if (state.db.previews) {
    const p = state.db.previews.find(x => x.bookmarkId === id);
    if (p && p.imageUrl) previewImg = p.imageUrl;
  }
  
  let aiSummary = '';
  let aiKeypoints = [];
  if (state.db.aiOutputs) {
    const outs = state.db.aiOutputs.filter(x => x.bookmarkId === id && !x.isDeleted);
    // Sort descending by createdAt
    outs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const sumOut = outs.find(x => x.kind === 'summary');
    if (sumOut) aiSummary = sumOut.content;
    const kpOut = outs.find(x => x.kind === 'key_points');
    if (kpOut) {
      try {
        const decoded = JSON.parse(kpOut.content);
        if (Array.isArray(decoded)) aiKeypoints = decoded;
      } catch(e) {
        aiKeypoints = kpOut.content.split('\n').map(x => x.replace(/^[-*]\s*/,'').trim()).filter(x => x);
      }
    }
  }

  dom.modalBody.innerHTML = `
    <div class="detail-header">
      <h2 class="detail-title">${escapeHtml(b.title || b.originalUrl)}</h2>
      <a href="${escapeHtml(b.originalUrl)}" target="_blank" class="detail-url" style="margin-bottom: 0.25rem;">${escapeHtml(b.originalUrl)}</a>
      <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${formatDate(b.createdAt)}
      </div>
      <div class="bookmark-metrics" style="margin-top: 1rem; margin-bottom: 0.5rem; justify-content: flex-start;">
        <span class="metric" title="Views"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> ${b.openCount || 0} views</span>
        <span class="metric" title="Read Time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${formatTimeSpent(b.totalInAppReadMs)} read</span>
        <span class="metric" title="Shares"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> ${b.shareCount || 0} shares</span>
      </div>
    </div>
    ${previewImg ? `<img src="${escapeHtml(previewImg)}" class="detail-img" alt="Preview"/>` : ''}
    ${aiSummary ? `
      <div class="detail-section">
        <h3><span class="ai-icon">✦</span> AI Summary</h3>
        <p class="detail-text">${escapeHtml(aiSummary)}</p>
      </div>` : ''}
    ${aiKeypoints.length > 0 ? `
      <div class="detail-section">
        <h3><span class="ai-icon">✦</span> Keypoints</h3>
        <ul class="keypoints-list">${aiKeypoints.map(k => `<li>${escapeHtml(k)}</li>`).join('')}</ul>
      </div>` : ''}
    ${b.cats.length > 0 ? `
      <div class="detail-section">
        <h3>Categories</h3>
        <div class="bookmark-tags">${b.cats.map(c => `<span class="tag">${escapeHtml(c.name)}</span>`).join('')}</div>
      </div>` : ''}
    <div style="margin-top: 3rem; text-align: center;">
      <button id="close-modal-bottom" class="btn secondary outline" style="width: 100%; max-width: 300px;">Close Details</button>
    </div>
  `;
  
  setTimeout(() => {
    const bottomCloseBtn = document.getElementById('close-modal-bottom');
    if (bottomCloseBtn) bottomCloseBtn.addEventListener('click', () => dom.modal.classList.remove('active'));
  }, 0);
}

dom.closeModal.addEventListener('click', () => dom.modal.classList.remove('active'));
dom.modal.addEventListener('click', (e) => {
  if (e.target === dom.modal) dom.modal.classList.remove('active');
});

dom.mobileFilterFab.addEventListener('click', () => {
  dom.sidebar.classList.add('open');
  dom.filterBackdrop.classList.add('active');
});
dom.closeSheetBtn.addEventListener('click', () => {
  dom.sidebar.classList.remove('open');
  dom.filterBackdrop.classList.remove('active');
});
dom.filterBackdrop.addEventListener('click', () => {
  dom.sidebar.classList.remove('open');
  dom.filterBackdrop.classList.remove('active');
});

init();
