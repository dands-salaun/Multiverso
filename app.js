// Estado da aplicação
let movies = JSON.parse(localStorage.getItem('myMovies')) || [];

// Limpeza de cache para remover provedores duplicados antigos (ex: Netflix e Netflix Ads)
let cacheUpdated = false;
movies.forEach(m => {
    if (m.providers && m.providers.length > 0) {
        const unique = new Set();
        const beforeLen = m.providers.length;
        m.providers = m.providers.filter(p => {
            const core = p.name.split(' ')[0].toLowerCase();
            if (unique.has(core)) return false;
            unique.add(core);
            return true;
        });
        if (m.providers.length !== beforeLen) cacheUpdated = true;
    }

        if (m.type && m.type !== 'Filme' && m.type !== 'Livro' && m.type !== 'Série') {
        m.type = 'Série';
        cacheUpdated = true;
    }
    if (m.country && typeof m.country === 'string') {
        const cleanedCountry = m.country.replace(/[\uD83C][\uDDE6-\uDDFF]/g, '').trim().replace(/\s+/g, ' ');
        if (m.country !== cleanedCountry) {
            m.country = cleanedCountry;
            cacheUpdated = true;
        }
        // Migração: converter siglas ISO salvas para nomes completos em português
        if (typeof COUNTRY_MAP !== 'undefined') {
            const converted = m.country.split(',').map(part => {
                const code = part.trim();
                return COUNTRY_MAP[code] || code;
            }).join(', ');
            if (converted !== m.country) {
                m.country = converted;
                cacheUpdated = true;
            }
        }
    }
});
if (cacheUpdated) {
    localStorage.setItem('myMovies', JSON.stringify(movies));
}

// Migração: adicionar updatedAt a obras que ainda não têm o campo
let migrationUpdated = false;
movies.forEach(m => {
    if (!m.updatedAt) {
        m.updatedAt = m.addedAt || Date.now();
        migrationUpdated = true;
    }
});
if (migrationUpdated) {
    localStorage.setItem('myMovies', JSON.stringify(movies));
}

// Inicializar tombstones (lista de IDs de obras deletadas + timestamp de deleção)
// Usado pelo sistema de merge para não restaurar obras intencionalmente removidas
window.getDeletedTombstones = function() {
    try {
        return JSON.parse(localStorage.getItem('deletedMovies')) || [];
    } catch(e) {
        return [];
    }
};
window.addTombstone = function(id) {
    const tombstones = window.getDeletedTombstones();
    // Evitar duplicatas
    if (!tombstones.find(t => String(t.id) === String(id))) {
        tombstones.push({ id: String(id), deletedAt: Date.now() });
        localStorage.setItem('deletedMovies', JSON.stringify(tombstones));
    }
};
window.mergeTombstones = function(local, remote) {
    const map = new Map();
    [...(local || []), ...(remote || [])].forEach(t => {
        const existing = map.get(String(t.id));
        // Mantém o tombstone com deletedAt mais recente
        if (!existing || t.deletedAt > existing.deletedAt) {
            map.set(String(t.id), t);
        }
    });
    return Array.from(map.values());
};

// AVISO DE SEGURANÇA: As API Keys estão expostas no frontend, o que é uma limitação
// conhecida de aplicações puramente client-side. Considere usar um proxy server em produção.
const apiKey = '15d2ea6d0dc1d476efbca3eba2b9bbfb';         // TMDB
const googleBooksApiKey = 'AIzaSyBgF94ESL-dnP4_8xo2Y_HsRdGhQnpgigs'; // Google Books

// Bug #3 fix: Função para sanitizar strings e prevenir XSS ao inserir via innerHTML
function sanitizeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// SVG Placeholder local para capas inexistentes
const POSTER_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23182026'/%3E%3Cpath d='M150 190c-16.5 0-30 13.5-30 30s13.5 30 30 30 30-13.5 30-30-13.5-30-30-30zm0 15c8.3 0 15 6.7 15 15s-6.7 15-15 15-15-6.7-15-15 6.7-15 15-15z' fill='%23334250'/%3E%3Ctext x='150' y='280' fill='%236c8090' font-family='sans-serif' font-size='13' font-weight='600' text-anchor='middle'%3ESem Capa%3C/text%3E%3C/svg%3E";
// Bug #12 fix: Expor no window para garantir acesso no atributo onerror inline do HTML
// mesmo que futuramente o script seja modularizado.
window.POSTER_PLACEHOLDER = POSTER_PLACEHOLDER;


// Notificações Toast Modernas
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    const icon = type === 'success' 
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e054" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : (type === 'error' 
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5544" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#40bcf4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>');
    // Bug #9 fix: Sanitizar a mensagem antes de inserir via innerHTML para prevenir XSS
    toast.innerHTML = `${icon}<span>${sanitizeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
};

// Elementos do DOM
const moviesGrid = document.getElementById('movies-grid');
const searchModal = document.getElementById('search-modal');
const btnOpenSearch = document.getElementById('btn-open-search');
const closeSearch = document.getElementById('close-search');

const formAutoTitle = document.getElementById('auto-title');
const formAutoType = document.getElementById('auto-type');
const btnAutoSearch = document.getElementById('btn-auto-search');
const autoSuggestions = document.getElementById('auto-suggestions');

const formPosterUrl = document.getElementById('form-poster-url');
const formPosterPreview = document.getElementById('form-poster-preview');
const formPosterPlaceholder = document.getElementById('form-poster-placeholder');

const formYear = document.getElementById('form-year');
const formDirector = document.getElementById('form-director');
const formGenres = document.getElementById('form-genres');
const formOverview = document.getElementById('form-overview');
const formNotes = document.getElementById('form-notes');

const btnCancelForm = document.getElementById('btn-cancel-form');
const btnSaveForm = document.getElementById('btn-save-form');

let currentFetchedId = null;

const detailsModal = document.getElementById('details-modal');
const closeDetails = document.getElementById('close-details');
const detailsPoster = document.getElementById('details-poster');
const detailsTitle = document.getElementById('details-title');
const detailsOriginalTitle = document.getElementById('details-original-title');
const detailsAkaTitle = document.getElementById('details-aka-title');
const detailsBadge = document.getElementById('details-badge');
const detailsOverview = document.getElementById('details-overview');
const detailsNotesBox = document.getElementById('details-notes-box');
const detailsNotes = document.getElementById('details-notes');
const detailsEditBtn = document.getElementById('details-edit-btn');
const detailsRemoveBtn = document.getElementById('details-remove-btn');
const detailsYear = document.getElementById('details-year');
const detailsDirector = document.getElementById('details-director');
const detailsGenres = document.getElementById('details-genres');
const filterInput = document.getElementById('filter-input');
const detailsStatusBtn = document.getElementById('details-status-btn');
const detailsFavoriteBtn = document.getElementById('details-favorite-btn');

// Inicialização
function init() {
    const filterButtons = document.querySelectorAll('.filter-group .filter-btn[data-type]');
    filterButtons.forEach(btn => {
        if (!btn.dataset.bound) {
            btn.dataset.bound = 'true';
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTypeFilter = btn.dataset.type;
                renderMovies(filterInput ? filterInput.value : '');
            });
        }
    });

    const clearSearchBtn = document.getElementById('clear-search-btn');
    if (filterInput && !filterInput.dataset.bound) {
        filterInput.dataset.bound = 'true';
        filterInput.addEventListener('input', () => {
            if (clearSearchBtn) {
                clearSearchBtn.style.display = filterInput.value.trim() ? 'flex' : 'none';
            }
            renderMovies(filterInput.value);
        });
    }

    if (clearSearchBtn && !clearSearchBtn.dataset.bound) {
        clearSearchBtn.dataset.bound = 'true';
        clearSearchBtn.addEventListener('click', () => {
            if (filterInput) {
                filterInput.value = '';
                clearSearchBtn.style.display = 'none';
                filterInput.focus();
            }
            renderMovies('');
        });
    }

    const brandTitle = document.getElementById('header-brand-title');
    if (brandTitle && !brandTitle.dataset.bound) {
        brandTitle.dataset.bound = 'true';
        brandTitle.addEventListener('click', () => {
            if (filterInput) filterInput.value = '';
            if (clearSearchBtn) clearSearchBtn.style.display = 'none';
            currentTypeFilter = 'all';
            filterButtons.forEach(b => b.classList.toggle('active', b.dataset.type === 'all'));
            if (typeof clearAllDrawerFilters === 'function') clearAllDrawerFilters();
            renderMovies('');
            if (window.showToast) window.showToast('Exibindo todas as obras', 'info');
        });
    }

    if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
    renderMovies();
}

function generateStarsHTML(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (rating >= i) {
            html += '<span style="color:var(--primary-color);">\u2605</span>';
        } else if (rating >= i - 0.5) {
            html += '<span style="position:relative; display:inline-block; color:var(--text-faint);">\u2605<span style="position:absolute; left:0; top:0; width:50%; overflow:hidden; color:var(--primary-color);">\u2605</span></span>';
        } else {
            html += '<span style="color:var(--text-faint);">\u2605</span>';
        }
    }
    return html;
}

let currentTypeFilter = 'all';
let filterAssistidos = false;
let filterNaoAssistidos = false;
let filterFavoritos = false;
let isBookMode = false; // controla o modo exclusivo de busca de livros

let currentSort = 'recent';
const sortSelect = document.getElementById('sort-select');
if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderMovies(filterInput ? filterInput.value : '');
    });
}

let currentProviderFilter = 'all';
// Nota: o seletor #provider-filter foi removido do HTML; a filtragem de streaming é feita pelo drawer.

// Atualizar contadores dos filtros do topo (Todos, Filmes, Séries, Livros)
// Bug #15 fix: Esta função agora é chamada dentro de renderMovies para manter os contadores atualizados.
function updateFilterCounts() {
    const currentMovies = JSON.parse(localStorage.getItem('myMovies')) || [];
    const total = currentMovies.length;
    // Bug #6 fix: Comparação direta de tipo, sem includes('S') que era frágil
    const moviesCount = currentMovies.filter(m => (m.type || 'Filme') === 'Filme').length;
    const seriesCount = currentMovies.filter(m => m.type === 'Série').length;
    const bookCount = currentMovies.filter(m => m.type === 'Livro').length;
    
    document.querySelectorAll('.filter-group .filter-btn[data-type]').forEach(btn => {
        const type = btn.dataset.type;
        if (type === 'all') btn.innerText = 'Todos (' + total + ')';
        else if (type === 'Filme') btn.innerText = 'Filmes (' + moviesCount + ')';
        else if (type === 'Série') btn.innerText = 'Séries (' + seriesCount + ')';
        else if (type === 'Livro') btn.innerText = 'Livros (' + bookCount + ')';
    });
}


function renderMovies(filter = '') {
    try {
        // Bug #2 fix: Usar variável local para não causar race condition com loadProviders (async).
        // A variável global 'movies' é atualizada apenas via saveMovie/removeMovie/toggle.
        const currentMovies = JSON.parse(localStorage.getItem('myMovies')) || [];
        movies = currentMovies;
        if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
        // Bug #15 fix: Atualiza os contadores dos botões de filtro do topo
        updateFilterCounts();
        moviesGrid.innerHTML = '';
        
        let filteredMovies = [...currentMovies];

        // 1. Busca por texto
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            filteredMovies = filteredMovies.filter(m => 
                (m.title && m.title.toLowerCase().includes(lowerFilter)) || 
                (m.originalTitle && m.originalTitle.toLowerCase().includes(lowerFilter))
            );
        }

        // 2. Filtro Rápido de Tipo (Botões do Topo: Todos, Filmes, Séries, Livros)
        // Bug #6 fix: Comparação direta sem includes('S') que era frágil
        if (typeof currentTypeFilter !== 'undefined' && currentTypeFilter !== 'all') {
            filteredMovies = filteredMovies.filter(m => {
                const mType = m.type || 'Filme';
                return mType === currentTypeFilter;
            });
        }

        // 3. Filtros por Tipo (Checkboxes do Drawer)
        const chkFilme = document.getElementById('chk-type-filme');
        // Bug #1 fix: ID correto é 'chk-type-serie' (sem acento, minúsculo) conforme o HTML
        const chkSerie = document.getElementById('chk-type-serie');
        const chkLivro = document.getElementById('chk-type-livro');
        
        const activeTypes = [];
        if (chkFilme && chkFilme.checked) activeTypes.push('Filme');
        if (chkSerie && chkSerie.checked) activeTypes.push('Série');
        if (chkLivro && chkLivro.checked) activeTypes.push('Livro');

        if (activeTypes.length > 0) {
            filteredMovies = filteredMovies.filter(m => {
                const mType = m.type || 'Filme';
                // Bug #6 fix: comparação direta de tipo, sem heurísticas frágeis
                return activeTypes.includes(mType);
            });
        }

        // 4. Filtro de Status (Assistido / Não Assistido / Favorito)
        const chkAssistido = document.getElementById('chk-status-assistido');
        const chkNaoAssistido = document.getElementById('chk-status-nao-assistido');
        const chkFavorito = document.getElementById('chk-status-favorito');

        if (chkAssistido && chkAssistido.checked && (!chkNaoAssistido || !chkNaoAssistido.checked)) {
            filteredMovies = filteredMovies.filter(m => m.status === 'assistido');
        } else if (chkNaoAssistido && chkNaoAssistido.checked && (!chkAssistido || !chkAssistido.checked)) {
            filteredMovies = filteredMovies.filter(m => m.status !== 'assistido');
        }

        if (chkFavorito && chkFavorito.checked) {
            filteredMovies = filteredMovies.filter(m => m.favorite === true);
        }

        // 5. Filtro de Gêneros (Multi-seleção)
        if (typeof selectedDrawerGenres !== 'undefined' && selectedDrawerGenres.size > 0) {
            filteredMovies = filteredMovies.filter(m => {
                if (!m.genres) return false;
                let mGenres = [];
                if (Array.isArray(m.genres)) {
                    mGenres = m.genres.map(g => typeof g === 'object' ? g.name : String(g).trim());
                } else if (typeof m.genres === 'string') {
                    mGenres = m.genres.split(',').map(g => g.trim());
                }
                return Array.from(selectedDrawerGenres).some(g => mGenres.includes(g));
            });
        }

        // 6. Filtro de Países (Multi-seleção)
        if (typeof selectedDrawerCountries !== 'undefined' && selectedDrawerCountries.size > 0) {
            filteredMovies = filteredMovies.filter(m => {
                if (!m.country) return false;
                let mCountries = [];
                if (Array.isArray(m.country)) {
                    mCountries = m.country.map(c => (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[String(c).trim()]) || String(c).trim());
                } else if (typeof m.country === 'string') {
                    mCountries = m.country.split(',').map(c => (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c.trim()]) || c.trim());
                }
                return Array.from(selectedDrawerCountries).some(c => mCountries.includes(c));
            });
        }

        // 7. Filtro de Streamings (Multi-seleção)
        if (typeof selectedDrawerProviders !== 'undefined' && selectedDrawerProviders.size > 0) {
            filteredMovies = filteredMovies.filter(m => {
                const hasNone = (!m.providers || !Array.isArray(m.providers) || m.providers.length === 0);
                if (selectedDrawerProviders.has('Nenhum') && hasNone) return true;
                if (hasNone) return false;
                return m.providers.some(p => p && selectedDrawerProviders.has(p.name));
            });
        }

        // 8. Ordenação
        const sortVal = typeof currentSort !== 'undefined' ? currentSort : 'recent';

        if (sortVal === 'recent') {
            filteredMovies.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        } else if (sortVal === 'rating') {
            filteredMovies.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else if (sortVal === 'az') {
            filteredMovies.sort((a, b) => {
                const titleA = a.englishTitle || a.originalTitle || a.title || '';
                const titleB = b.englishTitle || b.originalTitle || b.title || '';
                return titleA.localeCompare(titleB);
            });
        } else if (sortVal === 'year') {
            filteredMovies.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
        }

        // Atualiza contador no Drawer
        const drawerTotalCount = document.getElementById('drawer-total-count');
        if (drawerTotalCount) {
            drawerTotalCount.innerText = filteredMovies.length + " obras encontradas";
        }

        if (filteredMovies.length === 0) {
            if (filter) {
                moviesGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); font-size: 18px;">Nenhum item encontrado na busca.</p>';
            } else {
                moviesGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); font-size: 18px;">Nenhum filme salvo na sua lista ainda. Clique em "Adicionar Obra" para começar!</p>';
            }
            return;
        }

        filteredMovies.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.onclick = () => showDetails(movie.id);
            
            const isWatched = (movie.status === 'assistido');
            const isBook = (movie.type === 'Livro');
            const statusTitle = isWatched 
                ? (isBook ? 'Lido (clique para alterar)' : 'Assistido (clique para alterar)')
                : (isBook ? 'Marcar como lido' : 'Marcar como assistido');

            const statusBtn = 
                '<button type="button" class="card-badge-btn card-status-btn ' + (isWatched ? 'active' : '') + '" ' +
                    'title="' + statusTitle + '" aria-label="' + statusTitle + '" ' +
                    'onclick="event.stopPropagation(); window.toggleMovieStatus(\'' + movie.id + '\')">' +
                    '<svg class="action-icon status-eye-icon" viewBox="0 0 24 24" width="14" height="14" ' +
                        'fill="' + (isWatched ? 'rgba(0, 224, 84, 0.25)' : 'none') + '" ' +
                        'stroke="' + (isWatched ? '#00e054' : 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>' +
                        '<circle cx="12" cy="12" r="3" fill="' + (isWatched ? '#00e054' : 'none') + '"></circle>' +
                    '</svg>' +
                '</button>';

            const favBtn = movie.favorite ? 
                '<button type="button" class="card-badge-btn card-fav-btn active" ' +
                    'title="Remover dos favoritos" aria-label="Remover dos favoritos" ' +
                    'onclick="event.stopPropagation(); window.toggleMovieFavorite(\'' + movie.id + '\')">' +
                    '<svg class="action-icon fav-heart-icon" viewBox="0 0 24 24" width="14" height="14" ' +
                        'fill="#ff4757" stroke="#ff4757" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>' +
                    '</svg>' +
                '</button>' : '';
            
            const starsDisplay = movie.rating ? '<div class="card-rating-badge" title="Sua nota: ' + movie.rating + '/5">' + generateStarsHTML(movie.rating) + '</div>' : '';

            // Tela principal sempre exibe o título em inglês; fallback para original e depois pt-BR
            const displayTitle = movie.englishTitle || movie.originalTitle || movie.title || '';
            const safeTitle = sanitizeHtml(displayTitle);
            const safePoster = sanitizeHtml(movie.poster || POSTER_PLACEHOLDER);
            const safeType = sanitizeHtml(movie.type || 'Filme');

            card.innerHTML = 
                '<div class="poster-container">' +
                    '<img class="poster-img" src="' + safePoster + '" alt="Capa de ' + safeTitle + '" onerror="this.src=window.POSTER_PLACEHOLDER">' +
                    '<div class="card-badges-top-left">' +
                        favBtn +
                        statusBtn +
                    '</div>' +
                    '<div class="media-type-badge">' + safeType + '</div>' +
                    '<div class="providers-container" id="providers-' + movie.id + '" style="display:none;"></div>' +
                    starsDisplay +
                '</div>' +
                '<div class="movie-info">' +
                    '<h3>' + safeTitle + '</h3>' +
                '</div>';
            moviesGrid.appendChild(card);
            
            loadProviders(movie);
        });
    } catch (err) {
        console.error("Erro em renderMovies:", err);
    }
}


window.toggleMovieStatus = function(id) {
    const movie = movies.find(m => String(m.id) === String(id));
    if (!movie) return;
    movie.status = (movie.status === 'assistido') ? 'quero-assistir' : 'assistido';
    movie.updatedAt = Date.now();
    localStorage.setItem('myMovies', JSON.stringify(movies));
    renderMovies(filterInput ? filterInput.value : '');
    if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
};

window.toggleMovieFavorite = function(id) {
    const movie = movies.find(m => String(m.id) === String(id));
    if (!movie) return;
    movie.favorite = !movie.favorite;
    movie.updatedAt = Date.now();
    localStorage.setItem('myMovies', JSON.stringify(movies));
    renderMovies(filterInput ? filterInput.value : '');
    if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
};

// Bug #2 fix: Debounce para evitar race condition quando múltiplos loadProviders
// resolvem quase ao mesmo tempo e cada um sobrescreveria o localStorage com estado parcial.
let _providerSaveTimer = null;
function scheduleProvidersSave() {
    clearTimeout(_providerSaveTimer);
    _providerSaveTimer = setTimeout(() => {
        localStorage.setItem('myMovies', JSON.stringify(movies));
        if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
    }, 250);
}

async function loadProviders(movie) {
    // Bug #5 fix: Livros não têm providers. Apenas retorna sem mutar o objeto
    // para não disparar o interceptor do localStorage.setItem e o JSONBin sync desnecessariamente.
    if (movie.type === 'Livro') {
        return;
    }
    
    if (movie.providers === undefined) {
        try {
            const typePath = (movie.type === 'Série' || movie.type === 'tv') ? 'tv' : 'movie';
            const provRes = await fetch(`https://api.themoviedb.org/3/${typePath}/${movie.id}/watch/providers?api_key=${apiKey}`);
            const provData = await provRes.json();
            let providers = [];
            // Filtra pelos serviços disponíveis no Brasil ("BR") de assinatura ("flatrate")
            if (provData.results && provData.results.BR && provData.results.BR.flatrate) {
                const uniqueNames = new Set();
                providers = provData.results.BR.flatrate.filter(p => {
                    let name = p.provider_name.toLowerCase();
                    let coreName = name.split(' ')[0];
                    
                    if (name.includes('paramount')) coreName = 'paramount';
                    else if (name.includes('netflix')) coreName = 'netflix';
                    else if (name.includes('prime') || name.includes('amazon')) coreName = 'prime';
                    else if (name.includes('apple')) coreName = 'apple';
                    else if (name.includes('hbo') || name.includes('max')) coreName = 'max';
                    else if (name.includes('disney')) coreName = 'disney';
                    else if (name.includes('star')) coreName = 'star';
                    else if (name.includes('claro')) coreName = 'claro';
                    else if (name.includes('telecine')) coreName = 'telecine';
                    else if (name.includes('globoplay')) coreName = 'globoplay';

                    if (uniqueNames.has(coreName)) return false;
                    uniqueNames.add(coreName);
                    return true;
                }).map(p => ({ logo: p.logo_path, name: p.provider_name }));
            }
            
            // Força a atualização se os provedores mudaram (para limpar o cache antigo)
            if (JSON.stringify(movie.providers) !== JSON.stringify(providers)) {
                movie.providers = providers;
                // Bug #2 fix: Usar debounce para evitar race condition entre fetches paralelos
                scheduleProvidersSave();
            }
        } catch(e) {
            console.error('Erro ao buscar provedores', e);
            movie.providers = []; // Evita ficar tentando buscar sempre que der erro
        }
    }
    
    if (movie.providers && movie.providers.length > 0) {
        const container = document.getElementById(`providers-${movie.id}`);
        if (container) {
            // Bug #3 fix: sanitizar nome do provider antes de inserir no HTML
            container.innerHTML = movie.providers.slice(0, 4).map(p => 
                `<img src="https://image.tmdb.org/t/p/w45${sanitizeHtml(p.logo || '')}" class="provider-logo" title="Disponível em: ${sanitizeHtml(p.name || '')}" alt="${sanitizeHtml(p.name || '')}">`
            ).join('');
            container.style.display = 'flex';
        }
    }

}

// Remover filme da lista
window.removeMovie = function(id) {
    if (confirm('Tem certeza que deseja remover este item da sua lista?')) {
        // Bug #1 fix: Usar coerção de String para suportar IDs numéricos (TMDB) e string (Google Books/OpenLibrary)
        movies = movies.filter(m => String(m.id) !== String(id));
        // Registrar tombstone para o sistema de merge não restaurar a obra da nuvem
        if (typeof window.addTombstone === 'function') window.addTombstone(id);
        localStorage.setItem('myMovies', JSON.stringify(movies));
        renderMovies();
        // Bug #10 fix: Verificação de null antes de acessar .style
        if (detailsModal) detailsModal.style.display = 'none';
    }
};


// Função de busca e preenchimento de sugestões
async function performAutoFetch() {
    if (isBookMode) {
        if (autoSuggestions) autoSuggestions.style.display = 'none';
        return;
    }
    const query = formAutoTitle.value.trim();
    if (!query) {
        autoSuggestions.style.display = 'none';
        return;
    }
    
    const typePath = formAutoType.value; // 'movie', 'tv', 'book', 'multi'
    
    try {
        let results = [];
        
        // Buscar no TMDB (Filmes e Séries)
        if (typePath === 'movie' || typePath === 'tv' || typePath === 'multi') {
            const tmdbType = typePath === 'multi' ? 'multi' : typePath;
            const res = await fetch(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=pt-BR`);
            const data = await res.json();
            if (data.results) {
                const tmdbResults = data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv' || typePath !== 'multi').map(item => ({
                    id: item.id,
                    type: item.media_type || typePath,
                    title: item.title || item.name,
                    year: (item.release_date || item.first_air_date || '').substring(0, 4),
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : POSTER_PLACEHOLDER,
                    source: 'tmdb'
                }));
                results = results.concat(tmdbResults);
            }
        }
        
        // Buscar Livros
        if (typePath === 'book' || typePath === 'multi') {

            // Solução A: detectar ISBN e usar operador específico; caso contrário usar intitle:
            const isIsbn = /^(?:\d{9}[\dXx]|\d{13})$/.test(query.replace(/[-\s]/g, ''));
            const gbQuery = isIsbn
                ? `isbn:${query.replace(/[-\s]/g, '')}`
                : `intitle:${encodeURIComponent(query)}`;

            // Solução A (OpenLibrary): usar campo title= para busca mais precisa
            const olQueryParam = isIsbn
                ? `isbn=${query.replace(/[-\s]/g, '')}`
                : `title=${encodeURIComponent(query)}`;

            // Solução B: buscar Google Books e OpenLibrary em paralelo, sempre
            const [gbResult, olResult] = await Promise.allSettled([
                fetch(`https://www.googleapis.com/books/v1/volumes?q=${gbQuery}&maxResults=20&key=${googleBooksApiKey}`)
                    .then(r => r.ok ? r.json() : Promise.reject(r.status)),
                fetch(`https://openlibrary.org/search.json?${olQueryParam}&limit=15&fields=key,title,author_name,first_publish_year,cover_i,isbn`)
                    .then(r => r.ok ? r.json() : Promise.reject(r.status))
            ]);

            let bookResults = [];

            // Processar resultados do Google Books
            if (gbResult.status === 'fulfilled' && gbResult.value.items?.length > 0) {
                const mapped = gbResult.value.items.map(item => {
                    const info = item.volumeInfo;
                    return {
                        id: item.id,
                        type: 'book',
                        title: info.title || '',
                        author: (info.authors || []).join(', '),
                        year: (info.publishedDate || '').substring(0, 4),
                        poster: info.imageLinks?.thumbnail
                            ? info.imageLinks.thumbnail.replace('http:', 'https:')
                            : POSTER_PLACEHOLDER,
                        hasCover: !!(info.imageLinks?.thumbnail),
                        source: 'books',
                        rawData: item
                    };
                });
                bookResults = bookResults.concat(mapped);
            } else if (gbResult.status === 'rejected') {
                console.log('Google Books falhou:', gbResult.reason);
            }

            // Processar resultados do OpenLibrary — deduplicar por título+autor
            if (olResult.status === 'fulfilled' && olResult.value.docs?.length > 0) {
                const gbTitles = new Set(bookResults.map(b => b.title.toLowerCase().trim()));
                const mapped = olResult.value.docs
                    .filter(item => item.title && !gbTitles.has(item.title.toLowerCase().trim()))
                    .map(item => ({
                        id: item.key.replace('/works/', ''),
                        type: 'book',
                        title: item.title || '',
                        author: (item.author_name || []).join(', '),
                        year: item.first_publish_year ? String(item.first_publish_year) : '',
                        poster: item.cover_i
                            ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
                            : POSTER_PLACEHOLDER,
                        hasCover: !!item.cover_i,
                        source: 'openlibrary',
                        rawData: item
                    }));
                bookResults = bookResults.concat(mapped);
            } else if (olResult.status === 'rejected') {
                console.log('OpenLibrary falhou:', olResult.reason);
            }

            // Solução C: ranquear por relevância antes de exibir
            if (bookResults.length > 0) {
                const q = query.toLowerCase().trim();
                bookResults.sort((a, b) => {
                    const scoreItem = (item) => {
                        const t = item.title.toLowerCase();
                        let score = 0;
                        if (t === q)                    score += 100; // correspondência exata
                        else if (t.startsWith(q))       score += 50;  // começa com a query
                        else if (t.includes(q))         score += 20;  // contém a query
                        if (item.hasCover)              score += 10;  // tem capa
                        if (item.source === 'books')    score += 5;   // Google Books tende a ter dados melhores
                        return score;
                    };
                    return scoreItem(b) - scoreItem(a);
                });
            }

            results = results.concat(bookResults);
        }

        
        if (results.length > 0) {
            autoSuggestions.innerHTML = '';
            
            // Se for multi, intercala os resultados ou só pega os 5 primeiros
            results.slice(0, 5).forEach(item => {
                const badge = item.type === 'tv' ? '\uD83D\uDCFA' : (item.type === 'book' ? '\uD83D\uDCDA' : '\uD83C\uDFAC');
                
                const div = document.createElement('div');
                div.style.cssText = "display:flex; gap:10px; padding:10px; border-bottom:1px solid var(--border-soft); cursor:pointer; align-items:center;";
                div.onmouseover = () => div.style.background = 'var(--bg-elevated-hover)';
                div.onmouseout = () => div.style.background = 'transparent';
                
                const safeTitle  = sanitizeHtml(item.title || '');
                const safeAuthor = item.author ? sanitizeHtml(item.author) : '';
                const subline = safeAuthor
                    ? `${safeAuthor}${item.year ? ' · ' + item.year : ''}`
                    : (item.year || '');

                div.innerHTML = `
                    <img src="${item.poster}" style="width:30px; height:45px; object-fit:cover; border-radius:3px;">
                    <div>
                        <div style="font-size:14px; font-weight:bold; color:var(--text-color);">${badge} ${safeTitle}</div>
                        <div style="font-size:12px; color:var(--text-faint);">${subline}</div>
                    </div>
                `;
                
                // Passamos o source também para saber de onde veio
                div.onclick = () => selectSuggestion(item.id, item.type, item.rawData, item.source);
                autoSuggestions.appendChild(div);
            });
            autoSuggestions.style.display = 'block';
        } else {
            autoSuggestions.innerHTML = '<div style="padding:10px; color:var(--text-faint); font-size:13px; text-align:center;">Nenhum resultado encontrado</div>';
            autoSuggestions.style.display = 'block';
        }
    } catch(err) {
        console.error('Erro ao buscar sugestões.', err);
    }
}

async function selectSuggestion(id, typePath, rawData = null, source = null) {
    // Bug #8 fix: Null checks nos elementos do formulário
    if (autoSuggestions) autoSuggestions.style.display = 'none';
    currentFetchedId = id;
    
    // Altera o select do formulário para refletir o tipo real escolhido
    if (formAutoType && ['movie', 'tv', 'book'].includes(typePath)) {
        formAutoType.value = typePath;
    }
    
    try {
        if (typePath === 'book') {
            if (source === 'openlibrary') {
                window.lastFetchedOriginalTitle = rawData.title || '';
                if (formAutoTitle) formAutoTitle.value = rawData.title || '';
                const poster = rawData.cover_i ? `https://covers.openlibrary.org/b/id/${rawData.cover_i}-L.jpg` : '';
                if (poster) {
                    if (formPosterUrl) formPosterUrl.value = poster;
                    if (formPosterPreview) { formPosterPreview.src = poster; formPosterPreview.style.display = 'block'; }
                    if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'none';
                } else {
                    if (formPosterUrl) formPosterUrl.value = '';
                    if (formPosterPreview) formPosterPreview.style.display = 'none';
                    if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'block';
                }
                if (formYear) formYear.value = rawData.first_publish_year || '';
                if (formDirector) formDirector.value = rawData.author_name ? rawData.author_name.join(', ') : '';
                if (formGenres) formGenres.value = rawData.subject ? rawData.subject.slice(0, 3).join(', ') : '';
                if (formOverview) formOverview.value = 'Informações de resumo não fornecidas pela API OpenLibrary.';
                return;
            }

            // Google Books
            let info = null;
            if (rawData && rawData.volumeInfo) {
                info = rawData.volumeInfo;
            } else {
                const res = await fetch(`https://www.googleapis.com/books/v1/volumes/${id}?key=${googleBooksApiKey}`);
                const data = await res.json();
                info = data.volumeInfo;
            }
            
            window.lastFetchedOriginalTitle = info.title || '';
            if (formAutoTitle) formAutoTitle.value = info.title || '';
            const poster = info.imageLinks && info.imageLinks.thumbnail ? info.imageLinks.thumbnail.replace('http:', 'https:') : '';
            if (poster) {
                if (formPosterUrl) formPosterUrl.value = poster;
                if (formPosterPreview) { formPosterPreview.src = poster; formPosterPreview.style.display = 'block'; }
                if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'none';
            } else {
                if (formPosterUrl) formPosterUrl.value = '';
                if (formPosterPreview) formPosterPreview.style.display = 'none';
                if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'block';
            }
            if (formYear) formYear.value = (info.publishedDate || '').substring(0, 4);
            if (formDirector) formDirector.value = info.authors ? info.authors.join(', ') : '';
            if (formGenres) formGenres.value = info.categories ? info.categories.join(', ') : '';
            if (formOverview) formOverview.value = info.description || '';
            
        } else {
            // Filme ou Série
            const detailsRes = await fetch(`https://api.themoviedb.org/3/${typePath}/${id}?api_key=${apiKey}&language=pt-BR&append_to_response=credits`);
            const details = await detailsRes.json();

            // Busca título em inglês para exibição nos cards da tela principal
            try {
                const enRes = await fetch(`https://api.themoviedb.org/3/${typePath}/${id}?api_key=${apiKey}&language=en-US`);
                const enDetails = await enRes.json();
                window.lastFetchedEnglishTitle = enDetails.title || enDetails.name || '';
            } catch(e) {
                window.lastFetchedEnglishTitle = '';
            }

            window.lastFetchedOriginalTitle = details.original_title || details.original_name || details.title || details.name || '';
            if (formAutoTitle) formAutoTitle.value = details.title || details.name;
            
            if (details.poster_path) {
                if (formPosterUrl) formPosterUrl.value = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
                if (formPosterPreview) { formPosterPreview.src = formPosterUrl ? formPosterUrl.value : ''; formPosterPreview.style.display = 'block'; }
                if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'none';
            } else {
                if (formPosterUrl) formPosterUrl.value = '';
                if (formPosterPreview) formPosterPreview.style.display = 'none';
                if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'block';
            }
            
            if (formYear) formYear.value = (details.release_date || details.first_air_date || '').substring(0, 4);
            
            if (details.genres) {
                if (formGenres) formGenres.value = details.genres.map(g => g.name).join(', ');
            } else {
                if (formGenres) formGenres.value = '';
            }
            
            if (details.credits && details.credits.crew) {
                let directors = [];
                if (typePath === 'movie') {
                    directors = details.credits.crew.filter(c => c.job === 'Director').map(c => c.name);
                } else {
                    if (details.created_by && details.created_by.length > 0) {
                        directors = details.created_by.map(c => c.name);
                    }
                }
                if (formDirector) formDirector.value = directors.length > 0 ? directors.join(', ') : '';
            } else if (typePath === 'tv' && details.created_by) {
                const directors = details.created_by.map(c => c.name);
                if (formDirector) formDirector.value = directors.length > 0 ? directors.join(', ') : '';
            } else {
                if (formDirector) formDirector.value = '';
            }
            
            if (formOverview) formOverview.value = details.overview || '';

            let countriesStr = '';
            if (details.origin_country && details.origin_country.length > 0) {
                countriesStr = details.origin_country.map(c => (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c]) || c).join(', ');
            } else if (details.production_countries && details.production_countries.length > 0) {
                countriesStr = details.production_countries.map(c => (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c.iso_3166_1]) || c.name).join(', ');
            }
            window.lastFetchedCountry = countriesStr;
        }
        
    } catch(err) {
        console.error('Erro ao preencher detalhes da sugestão.', err);
    }
}


// Bug #8 fix: Verificações de null em todos os event listeners de elementos DOM,
// evitando TypeError caso algum elemento não exista na página.
if (btnAutoSearch) btnAutoSearch.onclick = performAutoFetch;

let autoFetchTimeout;
if (formAutoTitle) {
    formAutoTitle.addEventListener('input', (e) => {
        clearTimeout(autoFetchTimeout);

        const val = e.target.value;

        // No modo livro, renderiza o grid em vez do dropdown
        if (isBookMode) {
            if (autoSuggestions) {
                autoSuggestions.style.display = 'none';
                autoSuggestions.innerHTML = '';
            }
            if (!val.trim()) {
                if (bookResultsGrid) bookResultsGrid.style.display = 'none';
                return;
            }
            autoFetchTimeout = setTimeout(() => renderBookGrid(val.trim()), val.endsWith(' ') ? 500 : 1200);
            return;
        }

        // Se digitou um espaço (terminou uma palavra), busca mais rápido
        if (val.endsWith(' ')) {
            autoFetchTimeout = setTimeout(() => {
                performAutoFetch();
            }, 500);
        } else {
            // Se ainda está no meio da palavra, espera 1.5 segundos para não gastar a cota da API
            autoFetchTimeout = setTimeout(() => {
                performAutoFetch();
            }, 1500);
        }
    });

    // Busca imediata se o usuário apertar Enter
    formAutoTitle.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(autoFetchTimeout);
            if (isBookMode) { renderBookGrid(formAutoTitle.value.trim()); return; }
            performAutoFetch();
        }
    });
}

// Atualiza também se mudar o tipo
if (formAutoType) {
    formAutoType.addEventListener('change', () => {
        if (formAutoTitle && formAutoTitle.value.trim()) {
            performAutoFetch();
        }
    });
}

// ============================================================
// MODO LIVRO — toggle pill + grid de resultados
// ============================================================
const btnBookMode = document.getElementById('btn-book-mode');
const bookResultsGrid = document.getElementById('book-results-grid');

function setBookMode(active) {
    isBookMode = active;
    if (btnBookMode) btnBookMode.classList.toggle('active', active);

    const fetchFields = document.querySelector('.auto-fetch-fields');
    if (fetchFields) fetchFields.classList.toggle('book-mode-active', active);

    if (active) {
        // Sincroniza o select (usado internamente no save) para 'book'
        if (formAutoType) formAutoType.value = 'book';
        // Troca o placeholder para indicar os modos de busca disponíveis
        if (formAutoTitle) formAutoTitle.placeholder = 'Título, autor ou ISBN...';
        // Oculta o dropdown padrão de sugestões
        if (autoSuggestions) autoSuggestions.style.display = 'none';
        // Se já havia texto digitado, dispara a busca no grid imediatamente
        if (formAutoTitle && formAutoTitle.value.trim()) {
            renderBookGrid(formAutoTitle.value.trim());
        }
    } else {
        // Volta ao estado padrão
        if (formAutoType) formAutoType.value = 'multi';
        if (formAutoTitle) formAutoTitle.placeholder = 'Ex: Oppenheimer, 1984, Ruptura...';
        if (bookResultsGrid) bookResultsGrid.style.display = 'none';
    }
}

if (btnBookMode) {
    btnBookMode.addEventListener('click', () => {
        setBookMode(!isBookMode);
    });
}

async function renderBookGrid(query) {
    if (!bookResultsGrid) return;

    if (autoSuggestions) {
        autoSuggestions.style.display = 'none';
        autoSuggestions.innerHTML = '';
    }

    // Estado de loading
    bookResultsGrid.style.display = 'grid';
    bookResultsGrid.innerHTML = '<div class="book-results-loading">🔍 Buscando livros...</div>';

    try {
        const isIsbn = /^(?:\d{9}[\dXx]|\d{13})$/.test(query.replace(/[-\s]/g, ''));
        const gbQuery = isIsbn
            ? `isbn:${query.replace(/[-\s]/g, '')}`
            : `intitle:${encodeURIComponent(query)}`;
        const olQueryParam = isIsbn
            ? `isbn=${query.replace(/[-\s]/g, '')}`
            : `title=${encodeURIComponent(query)}`;

        const [gbResult, olResult] = await Promise.allSettled([
            fetch(`https://www.googleapis.com/books/v1/volumes?q=${gbQuery}&maxResults=20&key=${googleBooksApiKey}`)
                .then(r => r.ok ? r.json() : Promise.reject(r.status)),
            fetch(`https://openlibrary.org/search.json?${olQueryParam}&limit=15&fields=key,title,author_name,first_publish_year,cover_i,isbn`)
                .then(r => r.ok ? r.json() : Promise.reject(r.status))
        ]);

        let bookResults = [];

        // Google Books
        if (gbResult.status === 'fulfilled' && gbResult.value.items?.length > 0) {
            bookResults = gbResult.value.items.map(item => {
                const info = item.volumeInfo;
                return {
                    id: item.id,
                    title: info.title || '',
                    author: (info.authors || []).join(', '),
                    year: (info.publishedDate || '').substring(0, 4),
                    poster: info.imageLinks?.thumbnail
                        ? info.imageLinks.thumbnail.replace('http:', 'https:')
                        : POSTER_PLACEHOLDER,
                    hasCover: !!(info.imageLinks?.thumbnail),
                    source: 'books',
                    rawData: item
                };
            });
        }

        // OpenLibrary (deduplica por título)
        if (olResult.status === 'fulfilled' && olResult.value.docs?.length > 0) {
            const gbTitles = new Set(bookResults.map(b => b.title.toLowerCase().trim()));
            const olMapped = olResult.value.docs
                .filter(item => item.title && !gbTitles.has(item.title.toLowerCase().trim()))
                .map(item => ({
                    id: item.key.replace('/works/', ''),
                    title: item.title || '',
                    author: (item.author_name || []).join(', '),
                    year: item.first_publish_year ? String(item.first_publish_year) : '',
                    poster: item.cover_i
                        ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
                        : POSTER_PLACEHOLDER,
                    hasCover: !!item.cover_i,
                    source: 'openlibrary',
                    rawData: item
                }));
            bookResults = bookResults.concat(olMapped);
        }

        // Ranquear por relevância (mesma lógica do dropdown padrão)
        const q = query.toLowerCase().trim();
        bookResults.sort((a, b) => {
            const score = item => {
                const t = item.title.toLowerCase();
                let s = 0;
                if (t === q)           s += 100;
                else if (t.startsWith(q)) s += 50;
                else if (t.includes(q))   s += 20;
                if (item.hasCover)     s += 10;
                if (item.source === 'books') s += 5;
                return s;
            };
            return score(b) - score(a);
        });

        if (bookResults.length === 0) {
            bookResultsGrid.innerHTML = '<div class="book-results-loading">Nenhum livro encontrado.</div>';
            return;
        }

        // Renderiza máx. 12 cards
        const slice = bookResults.slice(0, 12);
        bookResultsGrid.innerHTML = slice.map((item, i) => `
            <div class="book-result-card" data-index="${i}" role="button" tabindex="0" title="${sanitizeHtml(item.title)}">
                <img src="${sanitizeHtml(item.poster)}" alt="${sanitizeHtml(item.title)}"
                     onerror="this.src='${POSTER_PLACEHOLDER}'">
                <div class="book-card-info">
                    <div class="book-card-title">${sanitizeHtml(item.title)}</div>
                    ${item.author ? `<div class="book-card-author">${sanitizeHtml(item.author)}</div>` : ''}
                    ${item.year ? `<div class="book-card-year">${sanitizeHtml(item.year)}</div>` : ''}
                </div>
            </div>
        `).join('');

        // Eventos nos cards (clique + teclado)
        slice.forEach((item, i) => {
            const card = bookResultsGrid.querySelector(`[data-index="${i}"]`);
            if (!card) return;
            card.addEventListener('click', () => {
                bookResultsGrid.style.display = 'none';
                selectSuggestion(item.id, 'book', item.rawData, item.source);
            });
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

    } catch (err) {
        console.error('Erro ao buscar livros para o grid:', err);
        if (bookResultsGrid) bookResultsGrid.innerHTML = '<div class="book-results-loading">Erro ao buscar. Tente novamente.</div>';
    }
}


if (formPosterUrl) {
    formPosterUrl.addEventListener('input', () => {
        if (formPosterUrl.value.trim() !== '') {
            if (formPosterPreview) {
                formPosterPreview.src = formPosterUrl.value;
                formPosterPreview.style.display = 'block';
            }
            if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'none';
        } else {
            if (formPosterPreview) formPosterPreview.style.display = 'none';
            if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'block';
        }
    });
}


// Salvar no catálogo
// Bug #8 fix: Null check em btnSaveForm
if (btnSaveForm) btnSaveForm.onclick = () => {
    const title = formAutoTitle.value.trim();
    if (!title) {
        alert('O t\u00EDtulo \u00E9 obrigat\u00F3rio.');
        return;
    }
    
    if (formAutoType.value === 'multi') {
        alert('Por favor, selecione o Tipo (Filme, S\u00E9rie ou Livro) antes de salvar.');
        return;
    }
    
    const id = currentFetchedId || -Date.now(); // se Não buscou, gera manual
    const index = movies.findIndex(m => m.id === id);
    let existingMovie = index !== -1 ? movies[index] : null;

    const typeMap = {
        'movie': 'Filme',
        'tv': 'Série',
        'book': 'Livro'
    };

    const newMovie = {
        id: id,
        title: title,
        originalTitle: (typeof window.lastFetchedOriginalTitle !== 'undefined' && window.lastFetchedOriginalTitle) ? window.lastFetchedOriginalTitle : (existingMovie ? existingMovie.originalTitle : title),
        englishTitle: (typeof window.lastFetchedEnglishTitle !== 'undefined' && window.lastFetchedEnglishTitle) ? window.lastFetchedEnglishTitle : (existingMovie ? existingMovie.englishTitle : ''),
        type: typeMap[formAutoType.value] || 'Filme',
        // Bug #14 fix: Usar POSTER_PLACEHOLDER local em vez de via.placeholder.com (serviço externo instável)
        poster: formPosterUrl.value.trim() || POSTER_PLACEHOLDER,
        status: existingMovie ? existingMovie.status : 'quero-assistir',
        rating: existingMovie ? existingMovie.rating : 0,
        year: formYear.value.trim(),
        director: formDirector.value.trim(),
        // Bug #9 fix: Ao editar, preserva providers do filme existente; genres é salvo como string normalizada
        genres: formGenres.value.trim(),
        country: window.lastFetchedCountry || (existingMovie ? existingMovie.country : ''),
        overview: formOverview.value.trim(),
        notes: formNotes.value.trim(),
        favorite: existingMovie ? existingMovie.favorite : false,
        addedAt: existingMovie ? existingMovie.addedAt : Date.now(),
        updatedAt: Date.now(),
        // Bug #9 fix: Preservar providers existentes ao editar para não perder dados de streaming
        providers: existingMovie ? existingMovie.providers : undefined
    };
    
    // Atualiza se já existir ou adiciona novo
    if (index !== -1) {
        movies[index] = newMovie;
    } else {
        movies.push(newMovie);
    }
    
    localStorage.setItem('myMovies', JSON.stringify(movies));
    renderMovies();
    // Bug #8 fix: Null check em searchModal
    if (searchModal) searchModal.style.display = 'none';
};

// Cancelar Form
// Bug #8 fix: Null check em btnCancelForm
if (btnCancelForm) {
    btnCancelForm.onclick = () => {
        if (searchModal) searchModal.style.display = 'none';
    };
}


let currentMovieIdForRating = null;

// Busca e atualiza as informações de uma obra a partir da API correspondente.
// Livros: Google Books (primário, com API Key) → OpenLibrary (fallback)
// Filmes/Séries: TMDB (pt-BR + credits)
// Retorna true em caso de sucesso, false em caso de erro.
async function fetchAndUpdateObra(movie) {
    try {
        if (movie.type === 'Livro') {
            // --- Google Books (primário) ---
            let info = null;
            try {
                const res = await fetch(
                    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(movie.title)}&maxResults=1&key=${googleBooksApiKey}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.items && data.items.length > 0) {
                        info = data.items[0].volumeInfo;
                        movie.source = 'books';
                    }
                }
            } catch(e) {
                console.log('fetchAndUpdateObra: Google Books falhou, tentando OpenLibrary', e);
            }

            if (info) {
                if (info.title) movie.title = info.title;
                if (info.publishedDate) movie.year = info.publishedDate.substring(0, 4);
                if (info.authors && info.authors.length > 0) movie.director = info.authors.join(', ');
                if (info.categories && info.categories.length > 0) movie.genres = info.categories.join(', ');
                if (info.description) movie.overview = info.description;
                if (info.imageLinks && info.imageLinks.thumbnail) {
                    movie.poster = info.imageLinks.thumbnail.replace('http:', 'https:').replace('zoom=1', 'zoom=3');
                }
            } else {
                // --- OpenLibrary (fallback) ---
                const olRes = await fetch(
                    `https://openlibrary.org/search.json?q=${encodeURIComponent(movie.title)}&limit=1`
                );
                if (!olRes.ok) throw new Error('OpenLibrary falhou');
                const olData = await olRes.json();
                if (olData.docs && olData.docs.length > 0) {
                    const item = olData.docs[0];
                    if (item.title) movie.title = item.title;
                    if (item.first_publish_year) movie.year = item.first_publish_year.toString();
                    if (item.author_name && item.author_name.length > 0) movie.director = item.author_name.join(', ');
                    if (item.subject && item.subject.length > 0) movie.genres = item.subject.slice(0, 3).join(', ');
                    movie.overview = 'Resumo não disponível pela OpenLibrary.';
                    if (item.cover_i) movie.poster = `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg`;
                    movie.source = 'openlibrary';
                }
            }

        } else {
            // --- TMDB (Filmes e Séries) ---
            const typePath = (movie.type === 'Série' || movie.type === 'tv') ? 'tv' : 'movie';
            const detailsRes = await fetch(
                `https://api.themoviedb.org/3/${typePath}/${movie.id}?api_key=${apiKey}&language=pt-BR&append_to_response=credits`
            );
            if (!detailsRes.ok) throw new Error(`TMDB retornou ${detailsRes.status}`);
            const details = await detailsRes.json();

            if (details.poster_path) movie.poster = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
            if (details.overview) movie.overview = details.overview;
            if (details.genres && details.genres.length > 0) movie.genres = details.genres.map(g => g.name).join(', ');

            const releaseDate = details.release_date || details.first_air_date || '';
            if (releaseDate) movie.year = releaseDate.substring(0, 4);

            if (details.original_title || details.original_name) {
                movie.originalTitle = details.original_title || details.original_name;
            }

            if (typePath === 'movie' && details.credits && details.credits.crew) {
                const directors = details.credits.crew.filter(c => c.job === 'Director').map(c => c.name);
                if (directors.length > 0) movie.director = directors.join(', ');
            } else if (typePath === 'tv' && details.created_by && details.created_by.length > 0) {
                movie.director = details.created_by.map(c => c.name).join(', ');
            }

            if (details.origin_country && details.origin_country.length > 0) {
                movie.country = details.origin_country.map(c =>
                    (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c]) || c
                ).join(', ');
            } else if (details.production_countries && details.production_countries.length > 0) {
                movie.country = details.production_countries.map(c =>
                    (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c.iso_3166_1]) || c.name
                ).join(', ');
            }

            // Atualiza providers (streaming)
            movie.providers = undefined;
            await loadProviders(movie);
        }

        movie.updatedAt = Date.now();
        return true;

    } catch(e) {
        console.error('fetchAndUpdateObra: erro ao atualizar obra', movie.title, e);
        return false;
    }
}

// Exibir detalhes
window.showDetails = async function(id) {
    const movie = movies.find(m => String(m.id) === String(id));
    if (!movie) return;

    currentMovieIdForRating = id;

    detailsPoster.onerror = () => { detailsPoster.src = POSTER_PLACEHOLDER; };
    detailsPoster.src = movie.poster || POSTER_PLACEHOLDER;
    // Popup: exibe o mesmo título do card (englishTitle → originalTitle → title)
    const popupDisplayTitle = movie.englishTitle || movie.originalTitle || movie.title || '';
    detailsTitle.innerText = popupDisplayTitle;

    // "Título Original:" — sempre exibido se existir, independente do idioma (inglês, chinês, etc.)
    const origWrap = document.getElementById('details-original-title-wrap');
    if (origWrap) {
        if (movie.originalTitle) {
            detailsOriginalTitle.innerText = movie.originalTitle;
            origWrap.style.display = 'block';
        } else {
            origWrap.style.display = 'none';
        }
    }

    // "AKA:" — inline ao lado do Título Original; aparece quando há título PT diferente do original
    const akaWrap = document.getElementById('details-aka-wrap');
    const ptTitle = movie.title || '';
    if (akaWrap) {
        if (ptTitle && ptTitle !== movie.originalTitle) {
            if (detailsAkaTitle) detailsAkaTitle.innerText = ptTitle;
            akaWrap.style.display = 'inline';
        } else {
            akaWrap.style.display = 'none';
        }
    }

    detailsBadge.innerText = movie.type || 'Filme';
    detailsOverview.innerText = movie.overview || 'Nenhum resumo disponível.';
    
    // Atualiza as estrelas
    updateModalStars(movie.rating || 0);
    
    // Configura Botões de status (assistido) e favorito (ambos botões com ícone, sem texto)
    const isWatched = (movie.status === 'assistido');
    const isBook = (movie.type === 'Livro');

    const updateStatusUI = (watched) => {
        if (!detailsStatusBtn) return;
        detailsStatusBtn.classList.toggle('active', !!watched);
        const titleText = watched 
            ? (isBook ? 'Lido (clique para alterar)' : 'Assistido (clique para alterar)')
            : (isBook ? 'Marcar como lido' : 'Marcar como assistido');
        detailsStatusBtn.setAttribute('title', titleText);
        detailsStatusBtn.setAttribute('aria-label', titleText);
        
        detailsStatusBtn.innerHTML = `
            <svg class="action-icon status-eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="${watched ? 'rgba(0, 224, 84, 0.2)' : 'none'}" stroke="${watched ? '#00e054' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3" fill="${watched ? '#00e054' : 'none'}"></circle>
            </svg>
        `;
    };

    updateStatusUI(isWatched);

    if (detailsStatusBtn) {
        detailsStatusBtn.onclick = () => {
            const willBeWatched = (movie.status !== 'assistido');
            movie.status = willBeWatched ? 'assistido' : 'quero-assistir';
            movie.updatedAt = Date.now();
            updateStatusUI(willBeWatched);
            localStorage.setItem('myMovies', JSON.stringify(movies));
            renderMovies(filterInput ? filterInput.value : '');
            if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
        };
    }

    const updateFavoriteUI = (isFav) => {
        if (!detailsFavoriteBtn) return;
        detailsFavoriteBtn.classList.toggle('active', !!isFav);
        detailsFavoriteBtn.setAttribute('title', isFav ? 'Remover dos favoritos' : 'Favoritar');
        detailsFavoriteBtn.setAttribute('aria-label', isFav ? 'Remover dos favoritos' : 'Favoritar');
        detailsFavoriteBtn.innerHTML = `
            <svg class="fav-heart-icon" viewBox="0 0 24 24" width="20" height="20" fill="${isFav ? '#ff4757' : 'none'}" stroke="${isFav ? '#ff4757' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        `;
    };

    updateFavoriteUI(movie.favorite);

    if (detailsFavoriteBtn) {
        detailsFavoriteBtn.onclick = () => {
            movie.favorite = !movie.favorite;
            movie.updatedAt = Date.now();
            updateFavoriteUI(movie.favorite);
            localStorage.setItem('myMovies', JSON.stringify(movies));
            renderMovies(filterInput ? filterInput.value : '');
            if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
        };
    }

    // Bug #3 fix: Null-checks em detailsEditBtn e elementos do formulário de edição
    if (detailsEditBtn) {
        detailsEditBtn.onclick = () => {
            if (detailsModal) detailsModal.style.display = 'none';
            const formModalTitle = document.getElementById('form-modal-title');
            if (formModalTitle) formModalTitle.innerText = '\u270F\uFE0F Editar Obra';
            
            currentFetchedId = movie.id;
            if (formAutoTitle) formAutoTitle.value = movie.title || '';
            if (formAutoType) formAutoType.value = movie.type === 'Série' ? 'tv' : (movie.type === 'Livro' ? 'book' : 'movie');
            // Ativa ou desativa o modo livro conforme o tipo da obra sendo editada
            setBookMode(movie.type === 'Livro');
            
            if (movie.poster && !movie.poster.includes('via.placeholder.com')) {
                if (formPosterUrl) formPosterUrl.value = movie.poster;
                if (formPosterPreview) { formPosterPreview.src = movie.poster; formPosterPreview.style.display = 'block'; }
                if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'none';
            } else {
                if (formPosterUrl) formPosterUrl.value = '';
                if (formPosterPreview) formPosterPreview.style.display = 'none';
                if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'block';
            }
            
            if (formYear) formYear.value = movie.year || '';
            if (formDirector) formDirector.value = movie.director || '';
            if (formGenres) formGenres.value = movie.genres || '';
            if (formOverview) formOverview.value = movie.overview || '';
            if (formNotes) formNotes.value = movie.notes || '';
            
            if (autoSuggestions) autoSuggestions.style.display = 'none';
            if (searchModal) searchModal.style.display = 'block';
        };
    }

    // Botão Atualizar Informações — busca dados frescos da API para esta obra
    const detailsRefreshBtn = document.getElementById('details-refresh-btn');
    if (detailsRefreshBtn) {
        detailsRefreshBtn.onclick = async () => {
            detailsRefreshBtn.disabled = true;
            detailsRefreshBtn.innerHTML = '<span>Buscando...</span>';

            const sucesso = await fetchAndUpdateObra(movie);

            if (sucesso) {
                // Atualiza campos visuais do popup sem fechar
                detailsPoster.src = movie.poster || POSTER_PLACEHOLDER;
                detailsTitle.innerText = movie.englishTitle || movie.originalTitle || movie.title || '';
                detailsYear.innerText = movie.year ? `(${movie.year})` : '';
                detailsDirector.innerText = movie.director || 'Desconhecido';
                detailsGenres.innerText = movie.genres || 'Não informado';
                detailsOverview.innerText = movie.overview || 'Nenhum resumo disponível.';

                // Atualiza título original e AKA
                const origWrap = document.getElementById('details-original-title-wrap');
                if (origWrap) {
                    if (movie.originalTitle) {
                        detailsOriginalTitle.innerText = movie.originalTitle;
                        origWrap.style.display = 'block';
                    } else {
                        origWrap.style.display = 'none';
                    }
                }

                // Atualiza providers se existirem
                const detailsProviders = document.getElementById('details-providers');
                const detailsProvidersIcons = document.getElementById('details-providers-icons');
                if (movie.providers && movie.providers.length > 0) {
                    detailsProvidersIcons.innerHTML = movie.providers.slice(0, 8).map(p =>
                        `<img src="https://image.tmdb.org/t/p/w45${p.logo}" class="provider-logo" title="Disponível em: ${p.name}" alt="${p.name}">`
                    ).join('');
                    detailsProviders.style.display = 'block';
                } else {
                    detailsProviders.style.display = 'none';
                }

                localStorage.setItem('myMovies', JSON.stringify(movies));
                renderMovies();
                if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
                if (window.showToast) window.showToast('Informações atualizadas com sucesso!', 'success');
            } else {
                if (window.showToast) window.showToast('Erro ao buscar informações. Tente novamente.', 'error');
            }

            detailsRefreshBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                <span>Atualizar</span>
            `;
            detailsRefreshBtn.disabled = false;
        };
    }

    // Bug #3 fix: Null-check em detailsRemoveBtn
    if (detailsRemoveBtn) detailsRemoveBtn.onclick = () => removeMovie(id);

    // Usa dados locais se existirem
    detailsYear.innerText = movie.year ? `(${movie.year})` : '';
    detailsDirector.innerText = movie.director || 'Desconhecido';
    detailsGenres.innerText = movie.genres || 'Não informado';
    
    // Anotações pessoais
    if (movie.notes) {
        detailsNotes.innerText = movie.notes;
        detailsNotesBox.style.display = 'block';
    } else {
        detailsNotesBox.style.display = 'none';
        detailsNotes.innerText = '';
    }
    
    const detailsProviders = document.getElementById('details-providers');
    const detailsProvidersIcons = document.getElementById('details-providers-icons');
    
    if (movie.providers && movie.providers.length > 0) {
        detailsProvidersIcons.innerHTML = movie.providers.slice(0, 8).map(p => 
            `<img src="https://image.tmdb.org/t/p/w45${p.logo}" class="provider-logo" title="Disponível em: ${p.name}" alt="${p.name}">`
        ).join('');
        detailsProviders.style.display = 'block';
    } else {
        detailsProviders.style.display = 'none';
    }

    detailsModal.style.display = 'block';
};

// Event Listeners (Eventos de cliques)
// Bug #8 fix: Null check em btnOpenSearch
if (btnOpenSearch) btnOpenSearch.onclick = () => {
    if (searchModal) searchModal.style.display = 'block';
    const formTitle = document.getElementById('form-modal-title');
    if (formTitle) formTitle.innerText = '\u2795 Adicionar Obra ao catálogo';
    
    setBookMode(false); // garante que sempre abre no modo padrão
    if (formAutoTitle) formAutoTitle.value = '';
    if (formAutoType) formAutoType.value = 'multi';
    if (autoSuggestions) { autoSuggestions.style.display = 'none'; autoSuggestions.innerHTML = ''; }
    if (bookResultsGrid) { bookResultsGrid.style.display = 'none'; bookResultsGrid.innerHTML = ''; }
    if (formPosterUrl) formPosterUrl.value = '';
    if (formPosterPreview) { formPosterPreview.src = ''; formPosterPreview.style.display = 'none'; }
    if (formPosterPlaceholder) formPosterPlaceholder.style.display = 'block';
    if (formYear) formYear.value = '';
    if (formDirector) formDirector.value = '';
    if (formGenres) formGenres.value = '';
    if (formOverview) formOverview.value = '';
    if (formNotes) formNotes.value = '';
    currentFetchedId = null;
    
    setTimeout(() => { if (formAutoTitle) formAutoTitle.focus(); }, 100);
};


// Bug #8 fix: Null checks nos botões de fechar modal
if (closeSearch) {
    closeSearch.onclick = () => {
        if (searchModal) searchModal.style.display = 'none';
    };
}

if (closeDetails) {
    closeDetails.onclick = () => {
        if (detailsModal) detailsModal.style.display = 'none';
    };
}

// Bug #7 fix: Usar addEventListener em vez de window.onclick para não sobrescrever
// o handler da Roleta que também usa window.addEventListener('click', ...).
// Fechar modais ao clicar fora deles
window.addEventListener('click', (event) => {
    if (searchModal && event.target === searchModal) {
        searchModal.style.display = 'none';
    }
    if (detailsModal && event.target === detailsModal) {
        detailsModal.style.display = 'none';
    }
    // Bug #8 fix: Verificação de null em autoSuggestions antes de chamar .contains()
    if (autoSuggestions && event.target !== formAutoTitle && event.target !== autoSuggestions && !autoSuggestions.contains(event.target)) {
        autoSuggestions.style.display = 'none';
    }
});


// Lógica do Menu Hamburger
const btnHamburger = document.getElementById('btn-hamburger');
const hamburgerMenu = document.getElementById('hamburger-menu');

if (btnHamburger && hamburgerMenu) {
    btnHamburger.onclick = (e) => {
        e.stopPropagation();
        hamburgerMenu.style.display = hamburgerMenu.style.display === 'none' ? 'flex' : 'none';
    };

    // Fechar ao clicar fora do menu
    document.addEventListener('click', (e) => {
        if (!hamburgerMenu.contains(e.target) && e.target !== btnHamburger) {
            hamburgerMenu.style.display = 'none';
        }
    });
}

// Lógica de Backup (Importar/Exportar) e Limpeza
const exportBtn = document.getElementById('export-backup');
const importInput = document.getElementById('import-backup');
const clearAllBtn = document.getElementById('clear-all-data');
const btnUpdateObras = document.getElementById('btn-update-obras');

if (exportBtn) {
    exportBtn.onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(movies, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `multiverso_backup_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        if (hamburgerMenu) hamburgerMenu.style.display = 'none';
        if (window.showToast) window.showToast('Backup exportado com sucesso!', 'success');
    };
}

if (importInput) {
    importInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    movies = imported;
                    localStorage.setItem('myMovies', JSON.stringify(movies));
                    renderMovies();
                    if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
                    if (hamburgerMenu) hamburgerMenu.style.display = 'none';
                    if (window.showToast) window.showToast(`${movies.length} obras importadas com sucesso!`, 'success');
                } else {
                    alert('Arquivo de backup inválido.');
                }
            } catch (err) {
                console.error(err);
                alert('Erro ao ler o arquivo de backup.');
            }
        };
        reader.readAsText(file);
    };
}

if (btnUpdateObras) {
    btnUpdateObras.onclick = async () => {
        const totalObras = movies.filter(m => m.type !== 'Livro' && m.id).length;
        if (totalObras === 0) {
            if (window.showToast) window.showToast('Nenhuma obra elegível para atualização.', 'warning');
            return;
        }
        if (!confirm(`Deseja buscar atualizações para ${totalObras} obra(s)? Isso buscará poster, sinopse, gêneros, diretor e streamings do TMDB. Pode levar alguns segundos.`)) return;

        btnUpdateObras.disabled = true;
        btnUpdateObras.innerHTML = '<span>Buscando...</span>';

        let atualizadas = 0;
        let erros = 0;

        for (let m of movies) {
            // Livros e obras sem ID TMDB são ignoradas
            if (m.type === 'Livro' || !m.id) continue;

            try {
                const typePath = (m.type === 'Série' || m.type === 'tv') ? 'tv' : 'movie';

                // Busca detalhes atualizados no TMDB
                const detailsRes = await fetch(
                    `https://api.themoviedb.org/3/${typePath}/${m.id}?api_key=${apiKey}&language=pt-BR&append_to_response=credits`
                );
                if (!detailsRes.ok) throw new Error(`HTTP ${detailsRes.status}`);
                const details = await detailsRes.json();

                // Atualiza poster
                if (details.poster_path) {
                    m.poster = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
                }

                // Atualiza sinopse
                if (details.overview) {
                    m.overview = details.overview;
                }

                // Atualiza gêneros
                if (details.genres && details.genres.length > 0) {
                    m.genres = details.genres.map(g => g.name).join(', ');
                }

                // Atualiza ano
                const releaseDate = details.release_date || details.first_air_date || '';
                if (releaseDate) {
                    m.year = releaseDate.substring(0, 4);
                }

                // Atualiza diretor / criador
                if (typePath === 'movie' && details.credits && details.credits.crew) {
                    const directors = details.credits.crew.filter(c => c.job === 'Director').map(c => c.name);
                    if (directors.length > 0) m.director = directors.join(', ');
                } else if (typePath === 'tv') {
                    if (details.created_by && details.created_by.length > 0) {
                        m.director = details.created_by.map(c => c.name).join(', ');
                    }
                }

                // Atualiza título original
                if (details.original_title || details.original_name) {
                    m.originalTitle = details.original_title || details.original_name;
                }

                // Atualiza título em inglês (campo novo: usado na tela principal)
                try {
                    const enDetailsRes = await fetch(`https://api.themoviedb.org/3/${typePath}/${m.id}?api_key=${apiKey}&language=en-US`);
                    if (enDetailsRes.ok) {
                        const enDetails = await enDetailsRes.json();
                        m.englishTitle = enDetails.title || enDetails.name || m.englishTitle || '';
                    }
                } catch(e) {
                    // Mantém o valor existente em caso de erro
                }

                // Atualiza países de origem
                if (details.origin_country && details.origin_country.length > 0) {
                    m.country = details.origin_country.map(c =>
                        (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c]) || c
                    ).join(', ');
                } else if (details.production_countries && details.production_countries.length > 0) {
                    m.country = details.production_countries.map(c =>
                        (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c.iso_3166_1]) || c.name
                    ).join(', ');
                }

                // Atualiza streaming/providers (força re-busca)
                m.providers = undefined;
                await loadProviders(m);

                m.updatedAt = Date.now();
                atualizadas++;

            } catch (e) {
                console.error(`Erro ao atualizar obra "${m.title || m.id}":`, e);
                erros++;
            }
        }

        localStorage.setItem('myMovies', JSON.stringify(movies));
        renderMovies();
        if (typeof updateDrawerOptions === 'function') updateDrawerOptions();

        btnUpdateObras.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m0 4v.01"/><polyline points="16 2 16 8 22 8"/></svg>
            <span>Buscar Atualizações</span>
        `;
        btnUpdateObras.disabled = false;
        if (hamburgerMenu) hamburgerMenu.style.display = 'none';

        const msg = erros > 0
            ? `${atualizadas} obra(s) atualizada(s), ${erros} com erro.`
            : `${atualizadas} obra(s) atualizada(s) com sucesso!`;
        if (window.showToast) window.showToast(msg, erros > 0 ? 'warning' : 'success');
    };
}

if (clearAllBtn) {
    clearAllBtn.onclick = () => {
        const hasKey = !!localStorage.getItem('jsonbin_api_key');
        if (movies.length === 0 && !hasKey) {
            alert("Sua lista j\u00E1 est\u00E1 vazia!");
            return;
        }
        if (confirm("\u26A0\uFE0F ATEN\u00C7\u00C3O: Tem certeza que deseja APAGAR TODO o seu cat\u00E1logo e resetar a Nuvem? Esta a\u00E7\u00E3o n\u00E3o pode ser desfeita.\n\nRecomendamos exportar um backup antes!")) {
            if (confirm("Voc\u00EA tem CERTEZA ABSOLUTA que deseja resetar a aplicAção?")) {
                movies = [];
                localStorage.removeItem('myMovies');
                localStorage.removeItem('deletedMovies'); // Limpar tombstones junto com os dados
                if (typeof resetJsonBin === 'function') {
                    resetJsonBin(true);
                } else {
                    localStorage.removeItem('jsonbin_api_key');
                    localStorage.removeItem('jsonbin_bin_id');
                }
                if (typeof updateJsonBinUIState === 'function') {
                    updateJsonBinUIState();
                }
                if (typeof setJsonBinStatus === 'function') {
                    setJsonBinStatus('Nuvem Desconectada', 'offline');
                }
                renderMovies(filterInput ? filterInput.value : '');
                if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
                if (hamburgerMenu) hamburgerMenu.style.display = 'none';
                if (window.showToast) {
                    window.showToast('Aplicação e dados da Nuvem resetados com sucesso.', 'info');
                } else {
                    alert("Sua lista e as configurações da nuvem foram apagadas com sucesso.");
                }
            }
        }
    };
}

const starsContainer = document.getElementById('details-stars');

function updateModalStars(rating) {
    // Bug #5 fix: Null-check em starsContainer — o elemento pode não existir no DOM
    if (!starsContainer) return;
    starsContainer.innerHTML = generateStarsHTML(rating);
    const ratingText = document.getElementById('details-rating-text');
    if (ratingText) {
        ratingText.textContent = rating > 0 ? `${rating} / 5` : 'Sem nota';
    }
}

if (starsContainer) {
    starsContainer.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        let rating = (x / width) * 5;
        // Arredonda para o 0.5 mais próximo
        rating = Math.ceil(rating * 2) / 2;
        if (rating < 0.5) rating = 0.5;
        if (rating > 5) rating = 5;
        updateModalStars(rating);
    });
    
    starsContainer.addEventListener('mouseleave', function() {
        if (!currentMovieIdForRating) return;
        const movie = movies.find(m => m.id === currentMovieIdForRating);
        updateModalStars(movie ? (movie.rating || 0) : 0);
    });
    
    starsContainer.addEventListener('click', function(e) {
        if (!currentMovieIdForRating) return;
        const movie = movies.find(m => m.id === currentMovieIdForRating);
        if (!movie) return;
        
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        let val = Math.ceil(((x / width) * 5) * 2) / 2;
        if (val < 0.5) val = 0.5;
        if (val > 5) val = 5;
        
        if (movie.rating === val) val = 0; // Clique na mesma nota remove a nota
        
        movie.rating = val;
        movie.updatedAt = Date.now();
        localStorage.setItem('myMovies', JSON.stringify(movies));
        
        updateModalStars(val);
        renderMovies(filterInput ? filterInput.value : '');
    });
}
// =========================================================
// Lógica da Roleta / Sorteio com Filtros Avançados
// =========================================================
const btnOpenRoulette = document.getElementById('btn-open-roulette');
const rouletteModal = document.getElementById('roulette-modal');
const rouletteModalContent = document.getElementById('roulette-modal-content');
const closeRoulette = document.getElementById('close-roulette');
const btnSpinRoulette = document.getElementById('btn-spin-roulette');
const rouletteTypeSelect = document.getElementById('roulette-type');
const rouletteConfig = document.getElementById('roulette-config');
const rouletteResultContainer = document.getElementById('roulette-result-container');
const rouletteLoading = document.getElementById('roulette-loading');
const rouletteResult = document.getElementById('roulette-result');
const rouletteResultPoster = document.getElementById('roulette-result-poster');
const rouletteResultTitle = document.getElementById('roulette-result-title');
const rouletteResultType = document.getElementById('roulette-result-type');
const btnRouletteDetails = document.getElementById('btn-roulette-details');
const btnRouletteSpinAgain = document.getElementById('btn-roulette-spin-again');

// Novos Controles do Painel Lateral de Filtros da Roleta
const btnToggleRouletteFilters = document.getElementById('btn-toggle-roulette-filters');
const btnSyncRouletteFilters = document.getElementById('btn-sync-roulette-filters');
const btnClearRouletteFilters = document.getElementById('btn-clear-roulette-filters');
const btnCloseRoulettePanel = document.getElementById('btn-close-roulette-panel');
const rouletteFilterBadge = document.getElementById('roulette-filter-badge');
const roulettePoolBar = document.getElementById('roulette-pool-bar');
const roulettePoolCount = document.getElementById('roulette-pool-count');

// Estado Global dos Filtros da Roleta
const rouletteFilters = {
    type: 'multi',          // 'multi', 'Filme', 'Série', 'Livro'
    status: 'unwatched',    // 'unwatched', 'all', 'watched'
    favoritesOnly: false,
    genres: new Set(),
    providers: new Set(),
    countries: new Set()
};

let isRouletteFiltersOpen = false;
let lastRouletteMovie = null;
let currentWheelItems = [];
let currentWinnerIndex = -1;
let currentChosenItem = null;

// Alternar visibilidade do painel lateral de filtros
function toggleRouletteFilters(forceState = null) {
    if (forceState !== null) {
        isRouletteFiltersOpen = forceState;
    } else {
        isRouletteFiltersOpen = !isRouletteFiltersOpen;
    }

    if (rouletteModalContent) {
        if (isRouletteFiltersOpen) {
            rouletteModalContent.classList.add('filters-open');
            if (btnToggleRouletteFilters) btnToggleRouletteFilters.classList.add('active');
        } else {
            rouletteModalContent.classList.remove('filters-open');
            if (btnToggleRouletteFilters) btnToggleRouletteFilters.classList.remove('active');
        }
    }
}

// Calcular obras aptas para sorteio de acordo com os filtros
function getRoulettePool() {
    try {
        movies = JSON.parse(localStorage.getItem('myMovies')) || [];
    } catch(e) {
        movies = [];
    }

    let pool = [...movies];

    // 1. Status (Não Assistidos / Já Assistidos / Qualquer)
    if (rouletteFilters.status === 'unwatched') {
        pool = pool.filter(m => m.status !== 'assistido');
    } else if (rouletteFilters.status === 'watched') {
        pool = pool.filter(m => m.status === 'assistido');
    }

    // 2. Apenas Favoritos
    if (rouletteFilters.favoritesOnly) {
        pool = pool.filter(m => m.favorite === true);
    }

    // 3. Tipo (Filme / Série / Livro / Todos)
    // Bug #4 fix: Usar comparação direta, removendo a heurística frágil includes('S') && includes('rie')
    // que o próprio projeto documentou como Bug #6 fix em renderMovies mas havia ficado aqui.
    if (rouletteFilters.type !== 'multi') {
        const target = rouletteFilters.type;
        pool = pool.filter(m => {
            const mType = m.type || 'Filme';
            return mType === target;
        });
    }

    // 4. Gêneros (Multi-seleção com lógica OR)
    if (rouletteFilters.genres.size > 0) {
        pool = pool.filter(m => {
            if (!m.genres) return false;
            let mGenres = [];
            if (Array.isArray(m.genres)) {
                mGenres = m.genres.map(g => typeof g === 'object' ? g.name : String(g).trim()).filter(Boolean);
            } else if (typeof m.genres === 'string') {
                mGenres = m.genres.split(',').map(g => g.trim()).filter(Boolean);
            }
            return Array.from(rouletteFilters.genres).some(g => mGenres.includes(g));
        });
    }

    // 5. Onde Assistir / Streaming (Multi-seleção com suporte a "Nenhum")
    if (rouletteFilters.providers.size > 0) {
        pool = pool.filter(m => {
            const hasNone = (!m.providers || !Array.isArray(m.providers) || m.providers.length === 0);
            if (rouletteFilters.providers.has('Nenhum') && hasNone) return true;
            if (hasNone) return false;
            return m.providers.some(p => p && rouletteFilters.providers.has(p.name));
        });
    }

    // 6. País de Origem (Multi-seleção)
    if (rouletteFilters.countries.size > 0) {
        const cMap = (typeof window !== 'undefined' && window.COUNTRY_MAP) || (typeof COUNTRY_MAP !== 'undefined' ? COUNTRY_MAP : {});
        pool = pool.filter(m => {
            if (!m.country) return false;
            let mCountries = [];
            if (Array.isArray(m.country)) {
                mCountries = m.country.map(c => cMap[String(c).trim()] || String(c).trim()).filter(Boolean);
            } else if (typeof m.country === 'string') {
                mCountries = m.country.split(',').map(c => cMap[c.trim()] || c.trim()).filter(Boolean);
            }
            return Array.from(rouletteFilters.countries).some(c => mCountries.includes(c));
        });
    }

    return pool;
}

// Atualizar o indicador de contagem e badge de filtros ativos
function updateRouletteBadges(poolCount) {
    let activeFilterCount = 0;
    if (rouletteFilters.type !== 'multi') activeFilterCount++;
    if (rouletteFilters.status !== 'unwatched') activeFilterCount++;
    if (rouletteFilters.favoritesOnly) activeFilterCount++;
    activeFilterCount += rouletteFilters.genres.size;
    activeFilterCount += rouletteFilters.providers.size;
    activeFilterCount += rouletteFilters.countries.size;

    if (rouletteFilterBadge) {
        if (activeFilterCount > 0) {
            rouletteFilterBadge.textContent = activeFilterCount;
            rouletteFilterBadge.style.display = 'inline-block';
        } else {
            rouletteFilterBadge.style.display = 'none';
        }
    }

    if (roulettePoolBar && roulettePoolCount) {
        if (poolCount === 0) {
            roulettePoolBar.classList.add('empty');
            roulettePoolCount.textContent = '⚠️ Nenhuma obra encontrada com estes filtros';
        } else {
            roulettePoolBar.classList.remove('empty');
            roulettePoolCount.textContent = `🎯 ${poolCount} obra${poolCount > 1 ? 's' : ''} para o sorteio`;
        }
    }
}

// Popular dinamicamente as opções de Gêneros, Streamings e Países no painel da roleta
function updateRouletteFilterOptions() {
    try {
        movies = JSON.parse(localStorage.getItem('myMovies')) || [];
    } catch(e) {
        movies = [];
    }

    // A. Gêneros
    const genreCounts = {};
    movies.forEach(m => {
        if (m.genres) {
            let list = [];
            if (Array.isArray(m.genres)) {
                list = m.genres.map(g => typeof g === 'object' ? g.name : String(g).trim()).filter(Boolean);
            } else if (typeof m.genres === 'string') {
                list = m.genres.split(',').map(g => g.trim()).filter(Boolean);
            }
            list.forEach(g => {
                genreCounts[g] = (genreCounts[g] || 0) + 1;
            });
        }
    });

    const genresContainer = document.getElementById('roulette-genres-list');
    if (genresContainer) {
        const sortedGenres = Object.keys(genreCounts).sort((a, b) => a.localeCompare(b));
        if (sortedGenres.length === 0) {
            genresContainer.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum gênero cadastrado</span>';
        } else {
            genresContainer.innerHTML = sortedGenres.map(genre => {
                const isChecked = rouletteFilters.genres.has(genre) ? 'checked' : '';
                return `<label class="filter-option">
                    <span class="filter-option-label">
                        <input type="checkbox" class="chk-roulette-genre" value="${genre}" ${isChecked}> ${genre}
                    </span>
                    <span class="filter-option-count">${genreCounts[genre]}</span>
                </label>`;
            }).join('');

            genresContainer.querySelectorAll('.chk-roulette-genre').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    if (e.target.checked) rouletteFilters.genres.add(e.target.value);
                    else rouletteFilters.genres.delete(e.target.value);
                    initRoulette();
                });
            });
        }
    }

    // B. Onde Assistir (Streamings)
    const providerCounts = {};
    let noneCount = 0;
    movies.forEach(m => {
        if (m.providers && Array.isArray(m.providers) && m.providers.length > 0) {
            m.providers.forEach(p => {
                if (p && p.name) providerCounts[p.name] = (providerCounts[p.name] || 0) + 1;
            });
        } else {
            noneCount++;
        }
    });
    if (noneCount > 0) providerCounts['Nenhum'] = noneCount;

    const providersContainer = document.getElementById('roulette-providers-list');
    if (providersContainer) {
        const sortedProviders = Object.keys(providerCounts).sort((a, b) => {
            if (a === 'Nenhum') return 1;
            if (b === 'Nenhum') return -1;
            return a.localeCompare(b);
        });
        if (sortedProviders.length === 0) {
            providersContainer.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum streaming detectado</span>';
        } else {
            providersContainer.innerHTML = sortedProviders.map(prov => {
                const isChecked = rouletteFilters.providers.has(prov) ? 'checked' : '';
                return `<label class="filter-option">
                    <span class="filter-option-label">
                        <input type="checkbox" class="chk-roulette-provider" value="${prov}" ${isChecked}> ${prov}
                    </span>
                    <span class="filter-option-count">${providerCounts[prov]}</span>
                </label>`;
            }).join('');

            providersContainer.querySelectorAll('.chk-roulette-provider').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    if (e.target.checked) rouletteFilters.providers.add(e.target.value);
                    else rouletteFilters.providers.delete(e.target.value);
                    initRoulette();
                });
            });
        }
    }

    // C. Países de Origem
    const countryCounts = {};
    const cMap = (typeof window !== 'undefined' && window.COUNTRY_MAP) || (typeof COUNTRY_MAP !== 'undefined' ? COUNTRY_MAP : {});
    movies.forEach(m => {
        if (m.country) {
            let list = [];
            if (Array.isArray(m.country)) {
                list = m.country.map(c => cMap[String(c).trim()] || String(c).trim()).filter(Boolean);
            } else if (typeof m.country === 'string') {
                list = m.country.split(',').map(c => cMap[c.trim()] || c.trim()).filter(Boolean);
            }
            list.forEach(c => {
                countryCounts[c] = (countryCounts[c] || 0) + 1;
            });
        }
    });

    const countriesContainer = document.getElementById('roulette-countries-list');
    if (countriesContainer) {
        const sortedCountries = Object.keys(countryCounts).sort((a, b) => a.localeCompare(b));
        if (sortedCountries.length === 0) {
            countriesContainer.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum país cadastrado</span>';
        } else {
            countriesContainer.innerHTML = sortedCountries.map(ctry => {
                const isChecked = rouletteFilters.countries.has(ctry) ? 'checked' : '';
                return `<label class="filter-option">
                    <span class="filter-option-label">
                        <input type="checkbox" class="chk-roulette-country" value="${ctry}" ${isChecked}> ${ctry}
                    </span>
                    <span class="filter-option-count">${countryCounts[ctry]}</span>
                </label>`;
            }).join('');

            countriesContainer.querySelectorAll('.chk-roulette-country').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    if (e.target.checked) rouletteFilters.countries.add(e.target.value);
                    else rouletteFilters.countries.delete(e.target.value);
                    initRoulette();
                });
            });
        }
    }
}

// Sincronizar os controles da UI da roleta com o objeto rouletteFilters
function syncRouletteUIFromFilters() {
    // Pills de Tipo
    document.querySelectorAll('#roulette-type-pills .roulette-pill').forEach(pill => {
        if (pill.dataset.type === rouletteFilters.type) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    if (rouletteTypeSelect) rouletteTypeSelect.value = rouletteFilters.type;

    // Pills de Status
    document.querySelectorAll('#roulette-status-pills .roulette-pill').forEach(pill => {
        if (pill.dataset.status === rouletteFilters.status) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });

    // Pill de Favorito
    const btnFavPill = document.getElementById('btn-roulette-favorite-pill');
    if (btnFavPill) {
        if (rouletteFilters.favoritesOnly) {
            btnFavPill.classList.add('active');
        } else {
            btnFavPill.classList.remove('active');
        }
        btnFavPill.textContent = 'Apenas Favoritos';
    }
}

// Sincronizar com os filtros da página principal
function syncRouletteFromMainScreen() {
    // 1. Tipo
    if (typeof currentTypeFilter !== 'undefined') {
        rouletteFilters.type = currentTypeFilter;
    }

    // 2. Status
    const chkAssistido = document.getElementById('chk-status-assistido');
    const chkNaoAssistido = document.getElementById('chk-status-nao-assistido');
    const chkFavorito = document.getElementById('chk-status-favorito');

    const isWatched = chkAssistido && chkAssistido.checked;
    const isUnwatched = chkNaoAssistido && chkNaoAssistido.checked;

    if (isWatched && !isUnwatched) rouletteFilters.status = 'watched';
    else if (isUnwatched && !isWatched) rouletteFilters.status = 'unwatched';
    else rouletteFilters.status = 'all';

    // 3. Favorito
    rouletteFilters.favoritesOnly = !!(chkFavorito && chkFavorito.checked);

    // 4. Gêneros
    if (typeof selectedDrawerGenres !== 'undefined') {
        rouletteFilters.genres = new Set(selectedDrawerGenres);
    }

    // 5. Streamings
    if (typeof selectedDrawerProviders !== 'undefined') {
        rouletteFilters.providers = new Set(selectedDrawerProviders);
    }

    // 6. Países
    if (typeof selectedDrawerCountries !== 'undefined') {
        rouletteFilters.countries = new Set(selectedDrawerCountries);
    }

    syncRouletteUIFromFilters();
    updateRouletteFilterOptions();
    initRoulette();

    // Abre o painel lateral para o usuário conferir os filtros sincronizados
    toggleRouletteFilters(true);
}

// Limpar todos os filtros da roleta
function clearAllRouletteFilters() {
    rouletteFilters.type = 'multi';
    rouletteFilters.status = 'unwatched';
    rouletteFilters.favoritesOnly = false;
    rouletteFilters.genres.clear();
    rouletteFilters.providers.clear();
    rouletteFilters.countries.clear();

    syncRouletteUIFromFilters();
    updateRouletteFilterOptions();
    initRoulette();
}

// Inicializar e desenhar a Roleta
function initRoulette() {
    const pool = getRoulettePool();
    updateRouletteBadges(pool.length);

    const wheelCanvas = document.getElementById('roulette-wheel');
    const wheelContainer = document.getElementById('roulette-wheel-container');
    const resultContainer = document.getElementById('roulette-result-container');
    const btnSpin = document.getElementById('btn-spin-roulette');

    if (resultContainer) resultContainer.style.display = 'none';
    if (roulettePoolBar) roulettePoolBar.style.display = 'inline-flex';
    const rouletteStageTitle = document.getElementById('roulette-stage-title');
    if (rouletteStageTitle) rouletteStageTitle.style.display = 'block';
    if (wheelContainer) {
        wheelContainer.style.transition = 'none';
        wheelContainer.style.opacity = '1';
        wheelContainer.style.display = 'flex';
    }
    if (wheelCanvas) {
        wheelCanvas.style.transition = 'none';
        wheelCanvas.style.transform = `rotate(0deg)`;
    }

    // Caso nenhum item atenda aos filtros selecionados
    if (pool.length === 0) {
        currentWheelItems = [];
        currentChosenItem = null;
        if (wheelCanvas) {
            const ctx = wheelCanvas.getContext('2d');
            const center = wheelCanvas.width / 2;
            ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
            
            // Desenha um fundo elegante desativado
            ctx.beginPath();
            ctx.fillStyle = '#1c2228';
            ctx.arc(center, center, center - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#2c3440';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Mensagem informativa central
            ctx.fillStyle = '#ffaa66';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Nenhuma obra apta', center, center - 12);
            ctx.fillStyle = '#8899aa';
            ctx.font = '13px sans-serif';
            ctx.fillText('Ajuste ou limpe os filtros', center, center + 14);
        }
        if (btnSpin) btnSpin.disabled = true;
        return;
    }

    if (btnSpin) btnSpin.disabled = false;

    // Define fatias da roleta (mínimo de 4 para ficar visualmente bonito, máximo 12)
    let maxSlices = Math.min(12, Math.max(4, pool.length));
    if (maxSlices % 2 !== 0 && maxSlices < 12) maxSlices++;

    currentWheelItems = [];
    currentWinnerIndex = Math.floor(Math.random() * maxSlices);

    const poolWinnerIndex = Math.floor(Math.random() * pool.length);
    currentChosenItem = pool[poolWinnerIndex];

    let poolCopy = [...pool];
    poolCopy.splice(poolWinnerIndex, 1);
    poolCopy.sort(() => 0.5 - Math.random());

    for (let i = 0; i < maxSlices - 1; i++) {
        let item = poolCopy[i % poolCopy.length];
        if (!item) item = currentChosenItem;
        currentWheelItems.push(item);
    }
    currentWheelItems.splice(currentWinnerIndex, 0, currentChosenItem);

    // Desenhar a roda no canvas
    if (wheelCanvas) {
        const ctx = wheelCanvas.getContext('2d');
        const radius = wheelCanvas.width / 2;
        const arc = (Math.PI * 2) / maxSlices;
        const colors = ['#ff8000', '#202830', '#00e054', '#2c3440', '#40bcf4', '#171c22'];

        ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);

        currentWheelItems.forEach((item, i) => {
            const angle = i * arc;
            ctx.beginPath();
            ctx.fillStyle = colors[i % colors.length];
            ctx.moveTo(radius, radius);
            ctx.arc(radius, radius, radius, angle, angle + arc);
            ctx.fill();

            ctx.save();
            ctx.translate(radius, radius);
            ctx.rotate(angle + arc / 2);
            ctx.textAlign = 'right';

            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';

            let text = item.title;
            if (text.length > 22) text = text.substring(0, 22) + '...';
            ctx.fillText(text, radius - 20, 6, radius - 65);
            ctx.restore();
        });
    }
}

// Girar a Roleta
function spinRoulette() {
    const btnSpin = document.getElementById('btn-spin-roulette');
    if (btnSpin && btnSpin.disabled) {
        alert('Nenhuma obra disponível para o sorteio com estes filtros!');
        return;
    }
    if (currentWheelItems.length === 0 || !currentChosenItem) return;

    // Fechar aba de filtros automaticamente ao iniciar o giro
    toggleRouletteFilters(false);

    if (btnSpin) btnSpin.disabled = true;
    if (btnToggleRouletteFilters) btnToggleRouletteFilters.disabled = true;
    if (btnSyncRouletteFilters) btnSyncRouletteFilters.disabled = true;

    const wheelCanvas = document.getElementById('roulette-wheel');
    if (wheelCanvas) {
        const maxSlices = currentWheelItems.length;
        const arc = (Math.PI * 2) / maxSlices;
        const targetAngleRad = currentWinnerIndex * arc + arc / 2;
        const targetAngleDeg = (targetAngleRad * 180) / Math.PI;

        const spins = 360 * 5;
        const halfSliceDeg = (arc * 180 / Math.PI) / 2;
        const randomOffset = (Math.random() * (halfSliceDeg - 5)) * (Math.random() > 0.5 ? 1 : -1);
        const finalRotation = spins - targetAngleDeg + randomOffset;

        wheelCanvas.style.transition = 'none';
        wheelCanvas.style.transform = `rotate(0deg)`;
        void wheelCanvas.offsetWidth;

        wheelCanvas.style.transition = 'transform 4s cubic-bezier(0.1, 0.7, 0.1, 1)';
        wheelCanvas.style.transform = `rotate(${finalRotation}deg)`;
    }

    lastRouletteMovie = currentChosenItem;

    setTimeout(() => {
        const wheelContainer = document.getElementById('roulette-wheel-container');
        if (wheelContainer) {
            wheelContainer.style.transition = 'opacity 0.5s ease';
            wheelContainer.style.opacity = '0';
        }

        setTimeout(() => {
            if (wheelContainer) wheelContainer.style.display = 'none';
            if (roulettePoolBar) roulettePoolBar.style.display = 'none';
            const rouletteStageTitle = document.getElementById('roulette-stage-title');
            if (rouletteStageTitle) rouletteStageTitle.style.display = 'none';

            const resultContainer = document.getElementById('roulette-result-container');
            if (resultContainer) resultContainer.style.display = 'block';

            if (rouletteResultPoster) {
                rouletteResultPoster.src = currentChosenItem.poster || '';
                rouletteResultPoster.style.display = currentChosenItem.poster ? 'block' : 'none';
            }
            if (rouletteResultTitle) rouletteResultTitle.textContent = currentChosenItem.title;
            if (rouletteResultType) {
                rouletteResultType.textContent = (currentChosenItem.type || 'Filme') + (currentChosenItem.year ? ` • ${currentChosenItem.year}` : '');
            }

            if (rouletteResult) rouletteResult.style.display = 'block';
            if (btnSpin) btnSpin.disabled = false;
            if (btnToggleRouletteFilters) btnToggleRouletteFilters.disabled = false;
            if (btnSyncRouletteFilters) btnSyncRouletteFilters.disabled = false;
        }, 500);
    }, 4500);
}

// Inicializar todos os ouvintes de eventos da Roleta
function initRouletteEvents() {
    // Abrir modal da roleta
    if (btnOpenRoulette) {
        btnOpenRoulette.addEventListener('click', () => {
            rouletteModal.style.display = 'block';
            if (rouletteResultContainer) rouletteResultContainer.style.display = 'none';
            if (rouletteResult) rouletteResult.style.display = 'none';
            if (rouletteLoading) rouletteLoading.style.display = 'none';

            updateRouletteFilterOptions();
            syncRouletteUIFromFilters();
            initRoulette();
        });
    }

    // Fechar modal
    if (closeRoulette) {
        closeRoulette.addEventListener('click', () => {
            rouletteModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === rouletteModal) {
            rouletteModal.style.display = 'none';
        }
    });

    // Toggle painel de filtros lateral
    if (btnToggleRouletteFilters) {
        btnToggleRouletteFilters.addEventListener('click', () => toggleRouletteFilters());
    }

    // Sincronizar com filtros da tela principal
    if (btnSyncRouletteFilters) {
        btnSyncRouletteFilters.addEventListener('click', syncRouletteFromMainScreen);
    }

    // Limpar filtros da roleta
    if (btnClearRouletteFilters) {
        btnClearRouletteFilters.addEventListener('click', clearAllRouletteFilters);
    }

    // Fechar painel no mobile
    if (btnCloseRoulettePanel) {
        btnCloseRoulettePanel.addEventListener('click', () => toggleRouletteFilters(false));
    }

    // Pills de Tipo de Obra
    document.querySelectorAll('#roulette-type-pills .roulette-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#roulette-type-pills .roulette-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            rouletteFilters.type = pill.dataset.type;
            if (rouletteTypeSelect) rouletteTypeSelect.value = pill.dataset.type;
            initRoulette();
        });
    });

    // Pills de Status
    document.querySelectorAll('#roulette-status-pills .roulette-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#roulette-status-pills .roulette-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            rouletteFilters.status = pill.dataset.status;
            initRoulette();
        });
    });

    // Pill de Favorito (Toggle)
    const btnFavPill = document.getElementById('btn-roulette-favorite-pill');
    if (btnFavPill) {
        btnFavPill.addEventListener('click', () => {
            rouletteFilters.favoritesOnly = !rouletteFilters.favoritesOnly;
            if (rouletteFilters.favoritesOnly) {
                btnFavPill.classList.add('active');
            } else {
                btnFavPill.classList.remove('active');
            }
            btnFavPill.textContent = 'Apenas Favoritos';
            initRoulette();
        });
    }

    // Accordions internos do painel da roleta
    document.querySelectorAll('#roulette-filter-panel .roulette-accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const item = header.closest('.accordion-item');
            if (item) item.classList.toggle('open');
        });
    });

    // Girar botão central
    if (btnSpinRoulette) {
        btnSpinRoulette.addEventListener('click', spinRoulette);
    }

    // Sortear de novo
    if (btnRouletteSpinAgain) {
        btnRouletteSpinAgain.addEventListener('click', () => {
            if (rouletteResultContainer) rouletteResultContainer.style.display = 'none';
            initRoulette();
            setTimeout(spinRoulette, 50);
        });
    }

    // Ver detalhes da obra sorteada
    if (btnRouletteDetails) {
        btnRouletteDetails.addEventListener('click', () => {
            rouletteModal.style.display = 'none';
            if (lastRouletteMovie && typeof showDetails === 'function') {
                showDetails(lastRouletteMovie.id);
            }
        });
    }
}

// Inicializar eventos assim que o script for executado
initRouletteEvents();





// Inicializar o aplicativo ao carregar a pagina
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}



















