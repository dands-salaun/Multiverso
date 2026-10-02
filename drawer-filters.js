// Mapeamento de Códigos ISO de Países para Nomes em Português com Bandeiras
const COUNTRY_MAP = {
    'US': 'Estados Unidos',
    'BR': 'Brasil',
    'KR': 'Coreia do Sul',
    'JP': 'Japão',
    'GB': 'Reino Unido',
    'FR': 'França',
    'DE': 'Alemanha',
    'ES': 'Espanha',
    'IT': 'Itália',
    'CA': 'Canadá',
    'MX': 'México',
    'AR': 'Argentina',
    'AU': 'Austrália',
    'IN': 'Índia',
    'CN': 'China',
    'PT': 'Portugal',
    'CL': 'Chile',
    'CO': 'Colômbia',
    'SE': 'Suécia',
    'NO': 'Noruega',
    'DK': 'Dinamarca',
    'NL': 'Holanda',
    'BE': 'Bélgica',
    'IE': 'Irlanda',
    'NZ': 'Nova Zelândia',
    'SU': 'União Soviética',
    'TH': 'Tailândia',
    'AT': 'Áustria',
    'CH': 'Suíça',
    'PL': 'Polônia',
    'RU': 'Rússia',
    'TR': 'Turquia',
    'HK': 'Hong Kong',
    'TW': 'Taiwan',
    'ZA': 'África do Sul',
    'IL': 'Israel',
    'NG': 'Nigéria',
    'HU': 'Hungria',
    'CZ': 'República Tcheca',
    'RO': 'Romênia',
    'GR': 'Grécia',
    'FI': 'Finlândia',
    'PH': 'Filipinas',
    'ID': 'Indonésia',
    'MY': 'Malásia',
    'SG': 'Singapura',
    'VN': 'Vietnã',
    'EG': 'Egito',
    'SA': 'Arábia Saudita',
    'AE': 'Emirados Árabes Unidos',
    'IR': 'Irã',
    'PK': 'Paquistão',
    'BD': 'Bangladesh',
    'UA': 'Ucrânia',
    'BY': 'Bielorrússia',
    'SK': 'Eslováquia',
    'HR': 'Croácia',
    'RS': 'Sérvia',
    'BA': 'Bósnia e Herzegovina',
    'BG': 'Bulgária',
    'LT': 'Lituânia',
    'LV': 'Letônia',
    'EE': 'Estônia',
    'IS': 'Islândia',
    'LU': 'Luxemburgo',
    'MT': 'Malta',
    'CY': 'Chipre',
    'PE': 'Peru',
    'VE': 'Venezuela',
    'EC': 'Equador',
    'UY': 'Uruguai',
    'BO': 'Bolívia',
    'PY': 'Paraguai',
    'CR': 'Costa Rica',
    'CU': 'Cuba',
    'DO': 'República Dominicana',
    'GT': 'Guatemala',
    'MA': 'Marrocos',
    'DZ': 'Argélia',
    'TN': 'Tunísia',
    'GH': 'Gana',
    'KE': 'Quênia',
    'ET': 'Etiópia',
    'TZ': 'Tanzânia',
    'MX': 'México',
    'NP': 'Nepal',
    'LK': 'Sri Lanka',
    'MM': 'Myanmar',
    'KH': 'Camboja',
    'AF': 'Afeganistão',
    'IQ': 'Iraque',
    'SY': 'Síria',
    'JO': 'Jordânia',
    'LB': 'Líbano',
    'KZ': 'Cazaquistão',
    'UZ': 'Uzbequistão',
    'GE': 'Geórgia',
    'AM': 'Armênia',
    'AZ': 'Azerbaijão',
    'MN': 'Mongólia'
};
if (typeof window !== 'undefined') {
    window.COUNTRY_MAP = COUNTRY_MAP;
}

// Estado Global dos Filtros do Drawer
let selectedDrawerGenres = new Set();
let selectedDrawerCountries = new Set();
let selectedDrawerProviders = new Set();

let filterStatusAssistido = false;
let filterStatusNaoAssistido = false;
let filterStatusFavorito = false;
let currentDrawerSort = 'recent';

// 1. Inicializar Eventos do Drawer e Accordions
function initDrawerEvents() {
    const btnOpenDrawer = document.getElementById('btn-open-drawer');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    const btnApplyFilters = document.getElementById('btn-apply-filters');
    const btnClearFilters = document.getElementById('btn-clear-filters');
    const drawerBackdrop = document.getElementById('drawer-backdrop');
    const filterDrawer = document.getElementById('filter-drawer');

    if (btnOpenDrawer) {
        btnOpenDrawer.addEventListener('click', openFilterDrawer);
    }

    if (btnCloseDrawer) {
        btnCloseDrawer.addEventListener('click', closeFilterDrawer);
    }

    if (btnApplyFilters) {
        btnApplyFilters.addEventListener('click', closeFilterDrawer);
    }

    if (drawerBackdrop) {
        drawerBackdrop.addEventListener('click', closeFilterDrawer);
    }

    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', clearAllDrawerFilters);
    }

    // Tecla ESC para fechar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && filterDrawer && filterDrawer.classList.contains('active')) {
            closeFilterDrawer();
        }
    });

    // Accordions expandir/recolher
    document.querySelectorAll('#filter-drawer .accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.accordion-item');
            if (item) {
                item.classList.toggle('open');
            }
        });
    });

    // Eventos de Checkbox Fixos (Status e Favoritos)
    const chkAssistido = document.getElementById('chk-status-assistido');
    const chkNaoAssistido = document.getElementById('chk-status-nao-assistido');
    const chkFavorito = document.getElementById('chk-status-favorito');

    if (chkAssistido) {
        chkAssistido.addEventListener('change', (e) => {
            filterStatusAssistido = e.target.checked;
            applyDrawerFilters();
        });
    }

    if (chkNaoAssistido) {
        chkNaoAssistido.addEventListener('change', (e) => {
            filterStatusNaoAssistido = e.target.checked;
            applyDrawerFilters();
        });
    }

    if (chkFavorito) {
        chkFavorito.addEventListener('change', (e) => {
            filterStatusFavorito = e.target.checked;
            applyDrawerFilters();
        });
    }

    // Eventos de Tipo de Obra
    ['chk-type-filme', 'chk-type-serie', 'chk-type-livro'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                applyDrawerFilters();
            });
        }
    });

}

function openFilterDrawer() {
    const backdrop = document.getElementById('drawer-backdrop');
    const drawer = document.getElementById('filter-drawer');
    if (backdrop) backdrop.classList.add('active');
    if (drawer) drawer.classList.add('active');
    updateDrawerOptions();
}

function closeFilterDrawer() {
    const backdrop = document.getElementById('drawer-backdrop');
    const drawer = document.getElementById('filter-drawer');
    if (backdrop) backdrop.classList.remove('active');
    if (drawer) drawer.classList.remove('active');
}

// 2. Escanear a biblioteca e montar dinamicamente os Checkboxes (Gêneros, Países, Streaming)
function updateDrawerOptions() {
    try {
        const movies = JSON.parse(localStorage.getItem('myMovies')) || [];

        // Contadores Fixos
        const assistidosCount = movies.filter(m => m.status === 'assistido').length;
        const naoAssistidosCount = movies.filter(m => m.status !== 'assistido').length;
        const favoritosCount = movies.filter(m => m.favorite === true).length;
        const filmeCount = movies.filter(m => (m.type || 'Filme') === 'Filme').length;
        const serieCount = movies.filter(m => m.type === 'Série').length;
        const livroCount = movies.filter(m => m.type === 'Livro').length;

        const elAssistido = document.getElementById('count-status-assistido');
        const elNaoAssistido = document.getElementById('count-status-nao-assistido');
        const elFavorito = document.getElementById('count-status-favorito');
        const elFilme = document.getElementById('count-type-filme');
        const elSerie = document.getElementById('count-type-serie');
        const elLivro = document.getElementById('count-type-livro');

        if (elAssistido) elAssistido.innerText = assistidosCount;
        if (elNaoAssistido) elNaoAssistido.innerText = naoAssistidosCount;
        if (elFavorito) elFavorito.innerText = favoritosCount;
        if (elFilme) elFilme.innerText = filmeCount;
        if (elSerie) elSerie.innerText = serieCount;
        if (elLivro) elLivro.innerText = livroCount;

        // --- A. GÊNEROS ---
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

        const genresContainer = document.getElementById('drawer-genres-list');
        if (genresContainer) {
            const sortedGenres = Object.keys(genreCounts).sort((a, b) => a.localeCompare(b));
            if (sortedGenres.length === 0) {
                genresContainer.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum g\u00EAnero encontrado</span>';
            } else {
                genresContainer.innerHTML = sortedGenres.map(genre => {
                    const isChecked = selectedDrawerGenres.has(genre) ? 'checked' : '';
                    return '<label class="filter-option">' +
                           '<span class="filter-option-label">' +
                           '<input type="checkbox" class="chk-drawer-genre" value="' + genre + '" ' + isChecked + '> ' + genre +
                           '</span>' +
                           '<span class="filter-option-count">' + genreCounts[genre] + '</span>' +
                           '</label>';
                }).join('');

                genresContainer.querySelectorAll('.chk-drawer-genre').forEach(chk => {
                    chk.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            selectedDrawerGenres.add(e.target.value);
                        } else {
                            selectedDrawerGenres.delete(e.target.value);
                        }
                        applyDrawerFilters();
                    });
                });
            }
        }

        // --- B. PAÍSES DE ORIGEM ---
        const countryCounts = {};
        movies.forEach(m => {
            if (m.country) {
                let list = [];
                if (Array.isArray(m.country)) {
                    list = m.country.map(c => (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[String(c).trim()]) || String(c).trim()).filter(Boolean);
                } else if (typeof m.country === 'string') {
                    list = m.country.split(',').map(c => (typeof COUNTRY_MAP !== 'undefined' && COUNTRY_MAP[c.trim()]) || c.trim()).filter(Boolean);
                }
                list.forEach(c => {
                    countryCounts[c] = (countryCounts[c] || 0) + 1;
                });
            }
        });

        const countriesContainer = document.getElementById('drawer-countries-list');
        if (countriesContainer) {
            const sortedCountries = Object.keys(countryCounts).sort((a, b) => a.localeCompare(b));
            if (sortedCountries.length === 0) {
                countriesContainer.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum pa\u00EDs cadastrado</span>';
            } else {
                countriesContainer.innerHTML = sortedCountries.map(country => {
                    const isChecked = selectedDrawerCountries.has(country) ? 'checked' : '';
                    return '<label class="filter-option">' +
                           '<span class="filter-option-label">' +
                           '<input type="checkbox" class="chk-drawer-country" value="' + country + '" ' + isChecked + '> ' + country +
                           '</span>' +
                           '<span class="filter-option-count">' + countryCounts[country] + '</span>' +
                           '</label>';
                }).join('');

                countriesContainer.querySelectorAll('.chk-drawer-country').forEach(chk => {
                    chk.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            selectedDrawerCountries.add(e.target.value);
                        } else {
                            selectedDrawerCountries.delete(e.target.value);
                        }
                        applyDrawerFilters();
                    });
                });
            }
        }

        // --- C. ONDE ASSISTIR (STREAMINGS) ---
        const providerCounts = {};
        let noneCount = 0;
        movies.forEach(m => {
            if (m.providers && Array.isArray(m.providers) && m.providers.length > 0) {
                m.providers.forEach(p => {
                    if (p && p.name) {
                        providerCounts[p.name] = (providerCounts[p.name] || 0) + 1;
                    }
                });
            } else {
                noneCount++;
            }
        });

        if (noneCount > 0) {
            providerCounts['Nenhum'] = noneCount;
        }

        const providersContainer = document.getElementById('drawer-providers-list');
        if (providersContainer) {
            const sortedProviders = Object.keys(providerCounts).sort((a, b) => {
                if (a === 'Nenhum') return 1;
                if (b === 'Nenhum') return -1;
                return a.localeCompare(b);
            });
            if (sortedProviders.length === 0) {
                providersContainer.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum streaming detectado</span>';
            } else {
                providersContainer.innerHTML = sortedProviders.map(provider => {
                    const isChecked = selectedDrawerProviders.has(provider) ? 'checked' : '';
                    return '<label class="filter-option">' +
                           '<span class="filter-option-label">' +
                           '<input type="checkbox" class="chk-drawer-provider" value="' + provider + '" ' + isChecked + '> ' + provider +
                           '</span>' +
                           '<span class="filter-option-count">' + providerCounts[provider] + '</span>' +
                           '</label>';
                }).join('');

                providersContainer.querySelectorAll('.chk-drawer-provider').forEach(chk => {
                    chk.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            selectedDrawerProviders.add(e.target.value);
                        } else {
                            selectedDrawerProviders.delete(e.target.value);
                        }
                        applyDrawerFilters();
                    });
                });
            }
        }
    } catch(err) {
        console.error('Erro em updateDrawerOptions:', err);
    }
}

function applyDrawerFilters() {
    let activeFilterCount = 0;

    const chkAssistido = document.getElementById('chk-status-assistido');
    const chkNaoAssistido = document.getElementById('chk-status-nao-assistido');
    const chkFavorito = document.getElementById('chk-status-favorito');
    const chkFilme = document.getElementById('chk-type-filme');
    const chkSerie = document.getElementById('chk-type-serie');
    const chkLivro = document.getElementById('chk-type-livro');

    if (chkAssistido && chkAssistido.checked) activeFilterCount++;
    if (chkNaoAssistido && chkNaoAssistido.checked) activeFilterCount++;
    if (chkFavorito && chkFavorito.checked) activeFilterCount++;
    if (chkFilme && chkFilme.checked) activeFilterCount++;
    if (chkSerie && chkSerie.checked) activeFilterCount++;
    if (chkLivro && chkLivro.checked) activeFilterCount++;

    activeFilterCount += selectedDrawerGenres.size;
    activeFilterCount += selectedDrawerCountries.size;
    activeFilterCount += selectedDrawerProviders.size;

    // Atualizar Badge no Botão Principal
    const badge = document.getElementById('filter-badge');
    const btnTrigger = document.getElementById('btn-open-drawer');
    if (badge) {
        if (activeFilterCount > 0) {
            badge.innerText = activeFilterCount;
            badge.style.display = 'inline-block';
            if (btnTrigger) btnTrigger.classList.add('active');
        } else {
            badge.style.display = 'none';
            if (btnTrigger) btnTrigger.classList.remove('active');
        }
    }

    if (typeof renderMovies === 'function') {
        const filterInput = document.getElementById('filter-input');
        renderMovies(filterInput ? filterInput.value : '');
    }
}

// 4. Limpar Todos os Filtros do Drawer
function clearAllDrawerFilters() {
    selectedDrawerGenres.clear();
    selectedDrawerCountries.clear();
    selectedDrawerProviders.clear();

    const chkAssistido = document.getElementById('chk-status-assistido');
    const chkNaoAssistido = document.getElementById('chk-status-nao-assistido');
    const chkFavorito = document.getElementById('chk-status-favorito');
    const chkFilme = document.getElementById('chk-type-filme');
    const chkSerie = document.getElementById('chk-type-serie');
    const chkLivro = document.getElementById('chk-type-livro');

    if (chkAssistido) chkAssistido.checked = false;
    if (chkNaoAssistido) chkNaoAssistido.checked = false;
    if (chkFavorito) chkFavorito.checked = false;
    if (chkFilme) chkFilme.checked = false;
    if (chkSerie) chkSerie.checked = false;
    if (chkLivro) chkLivro.checked = false;


    updateDrawerOptions();
    applyDrawerFilters();
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    initDrawerEvents();
    updateDrawerOptions();
});
