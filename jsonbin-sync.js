// Configurações do JSONBin.io API
let JSONBIN_API_KEY = localStorage.getItem('jsonbin_api_key') || '';
let JSONBIN_BIN_ID = localStorage.getItem('jsonbin_bin_id') || '';

let isJsonBinConnected = false;
let jsonBinStatusIndicator;
let btnJsonBinSync;

// Bug #11 fix: Flag de reentrância para evitar loop infinito
let _isInsideSetItem = false;

// Interceptor para salvar no JSONBin sempre que o localStorage for atualizado
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    if (key === 'myMovies' && !_isInsideSetItem && typeof triggerAutoJsonBinBackup === 'function') {
        _isInsideSetItem = true;
        try {
            triggerAutoJsonBinBackup();
        } finally {
            _isInsideSetItem = false;
        }
    }
};

// 1. Comparador Inteligente de Listas (evita falsos conflitos)
function areMovieListsEqual(listA, listB) {
    if (!Array.isArray(listA) || !Array.isArray(listB)) return false;
    if (listA.length !== listB.length) return false;
    if (listA.length === 0 && listB.length === 0) return true;
    
    // Bug #7 fix: Usar m.status (campo real do projeto) em vez de m.watched (que era sempre undefined)
    // Inclui updatedAt no fingerprint para detectar mudanças mesmo sem alteração de status/rating/favorite
    const getFingerprint = (list) => list.map(m => String(m.id || m.title || '') + '|' + String(m.status || '') + '|' + String(m.favorite || '') + '|' + String(m.rating || '') + '|' + String(m.updatedAt || '')).sort().join(';;');
    return getFingerprint(listA) === getFingerprint(listB);
}

// 2. Merge Inteligente por Data de Modificação
// Resolve todos os conflitos obra por obra, preservando a versão mais recente de cada campo.
function mergeMovieLists(localList, remoteList) {
    const localTombstones = (typeof window.getDeletedTombstones === 'function') ? window.getDeletedTombstones() : [];
    const remoteTombstones = remoteList._tombstones || [];
    
    // Merge dos tombstones dos dois lados (union com vencedor pelo deletedAt mais recente)
    const mergedTombstones = (typeof window.mergeTombstones === 'function')
        ? window.mergeTombstones(localTombstones, remoteTombstones)
        : localTombstones;
    
    // Salvar tombstones mesclados localmente
    localStorage.setItem('deletedMovies', JSON.stringify(mergedTombstones));
    
    const tombstoneMap = new Map();
    mergedTombstones.forEach(t => tombstoneMap.set(String(t.id), t.deletedAt));

    // Indexar listas por ID para lookup O(1)
    const localMap = new Map();
    (localList || []).forEach(m => localMap.set(String(m.id), m));

    const remoteMap = new Map();
    (remoteList || []).forEach(m => {
        if (m && !m._placeholder && !m._tombstones) remoteMap.set(String(m.id), m);
    });

    // Fallback: detectar obras manuais duplicadas por título normalizado + ano
    // (obras adicionadas manualmente em dois dispositivos antes de sincronizar)
    const titleYearKey = (m) => `${String(m.title || '').toLowerCase().trim()}::${String(m.year || '')}`;
    const localByTitleYear = new Map();
    localMap.forEach(m => localByTitleYear.set(titleYearKey(m), m));

    const result = new Map();

    // Processar todas as obras do local
    localMap.forEach((localMovie, id) => {
        const tombstone = tombstoneMap.get(id);
        const remoteMovie = remoteMap.get(id);

        if (remoteMovie) {
            // Existe nos dois lados: merge por campo
            result.set(id, mergeMovieFields(localMovie, remoteMovie, tombstone));
        } else {
            // Só existe no local
            // Verificar se foi deletada remotamente via tombstone
            if (tombstone) {
                // Se o tombstone é mais recente que o updatedAt local, a obra foi deletada intencionalmente
                const localUpdatedAt = localMovie.updatedAt || localMovie.addedAt || 0;
                if (tombstone > localUpdatedAt) {
                    return; // descarta: deleção remota é mais recente
                }
            }
            result.set(id, localMovie);
        }
    });

    // Processar obras que só existem no remoto
    remoteMap.forEach((remoteMovie, id) => {
        if (result.has(id)) return; // já processada acima

        const tombstone = tombstoneMap.get(id);
        if (tombstone) {
            // A obra foi deletada localmente
            const remoteUpdatedAt = remoteMovie.updatedAt || remoteMovie.addedAt || 0;
            if (tombstone > remoteUpdatedAt) {
                return; // descarta: deleção local é mais recente que a versão remota
            }
        }

        // Fallback: verificar se é uma duplicata de obra manual por título+ano
        const key = titleYearKey(remoteMovie);
        if (localByTitleYear.has(key)) {
            // Já existe uma obra local com o mesmo título+ano mas ID diferente (adicionada manualmente nos dois lados)
            // O merge por ID já a processou — não duplicar
            return;
        }

        result.set(id, remoteMovie);
    });

    return Array.from(result.values());
}

// Merge de campos individuais de uma obra presente nos dois lados
// Estratégia: winner-takes-all pelo updatedAt, mas preserva campos não-conflitantes
function mergeMovieFields(local, remote, tombstoneDeletedAt) {
    const localTs  = local.updatedAt  || local.addedAt  || 0;
    const remoteTs = remote.updatedAt || remote.addedAt || 0;

    // Se há tombstone mais recente que ambas as versões, a obra não deveria existir
    // (esse caso é tratado no chamador, mas por segurança mantemos a lógica aqui também)
    if (tombstoneDeletedAt && tombstoneDeletedAt > localTs && tombstoneDeletedAt > remoteTs) {
        return null; // sinaliza remoção (filtrado após o merge)
    }

    // Winner-takes-all: a versão mais recente prevalece como base
    const winner = localTs >= remoteTs ? local : remote;
    const loser  = localTs >= remoteTs ? remote : local;

    // Merge de campos individuais: se o loser tem dado e o winner não, preserva o do loser
    return {
        ...winner,
        // Preservar notas: concatenar se ambos têm notas diferentes (evitar perda silenciosa)
        notes: mergeNotes(local.notes, remote.notes, localTs, remoteTs),
        // Para campos críticos: sempre usa o winner (mais recente)
        status:   winner.status,
        rating:   winner.rating,
        favorite: winner.favorite,
        // Metadados: preservar o addedAt original (mais antigo)
        addedAt: Math.min(local.addedAt || Date.now(), remote.addedAt || Date.now()),
        updatedAt: Math.max(localTs, remoteTs),
        // Providers: union dos dois lados (preserva dados de streaming de ambos)
        providers: mergeProviders(local.providers, remote.providers),
    };
}

// Merge de notas: se os dois lados têm notas diferentes, concatena com separador
function mergeNotes(localNotes, remoteNotes, localTs, remoteTs) {
    const ln = (localNotes || '').trim();
    const rn = (remoteNotes || '').trim();
    if (!ln && !rn) return '';
    if (!ln) return rn;
    if (!rn) return ln;
    if (ln === rn) return ln;
    // Notas diferentes em ambos os lados: usa a mais recente
    // (evitar concatenação confusa; o usuário pode ver e editar manualmente)
    return localTs >= remoteTs ? ln : rn;
}

// Merge de providers: union sem duplicatas por nome
function mergeProviders(localProviders, remoteProviders) {
    if (!localProviders && !remoteProviders) return undefined;
    const all = [...(localProviders || []), ...(remoteProviders || [])];
    const seen = new Set();
    return all.filter(p => {
        const key = (p.name || '').split(' ')[0].toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}


// 2. Resetar / Desconectar Nuvem
function resetJsonBin(silent = false) {
    clearTimeout(autoSaveJsonBinTimeout);
    localStorage.removeItem('jsonbin_api_key');
    localStorage.removeItem('jsonbin_bin_id');
    JSONBIN_API_KEY = '';
    JSONBIN_BIN_ID = '';
    isJsonBinConnected = false;
    
    const inputKey = document.getElementById('jsonbin-input-api-key');
    const inputBinId = document.getElementById('jsonbin-input-bin-id');
    if (inputKey) inputKey.value = '';
    if (inputBinId) inputBinId.value = '';

    const btnCopy = document.getElementById('btn-copy-bin-id');
    const btnDisconnect = document.getElementById('btn-disconnect-jsonbin');
    const statusBox = document.getElementById('jsonbin-modal-status-box');
    if (btnCopy) btnCopy.style.display = 'none';
    if (btnDisconnect) btnDisconnect.style.display = 'none';
    if (statusBox) statusBox.style.display = 'none';

    updateJsonBinUIState();
    setJsonBinStatus('Nuvem Desconectada', 'offline');
    if (!silent && window.showToast) {
        window.showToast('Configuração da Nuvem removida com sucesso.', 'info');
    }
}

// 3. Modal do JSONBin
function openJsonBinModal() {
    const modal = document.getElementById('jsonbin-modal');
    if (!modal) return;

    const inputKey = document.getElementById('jsonbin-input-api-key');
    const inputBinId = document.getElementById('jsonbin-input-bin-id');
    const btnCopy = document.getElementById('btn-copy-bin-id');
    const btnDisconnect = document.getElementById('btn-disconnect-jsonbin');
    const statusBox = document.getElementById('jsonbin-modal-status-box');
    const statusText = document.getElementById('jsonbin-modal-status-text');
    const countText = document.getElementById('jsonbin-modal-count-text');

    if (inputKey) inputKey.value = JSONBIN_API_KEY;
    if (inputBinId) inputBinId.value = JSONBIN_BIN_ID;

    const isConfigured = !!(JSONBIN_API_KEY && JSONBIN_BIN_ID);
    if (btnCopy) btnCopy.style.display = JSONBIN_BIN_ID ? 'inline-flex' : 'none';
    if (btnDisconnect) btnDisconnect.style.display = isConfigured ? 'block' : 'none';
    if (statusBox) {
        statusBox.style.display = isConfigured ? 'block' : 'none';
        if (isConfigured) {
            statusText.textContent = isJsonBinConnected ? 'Conectado e Ativo' : 'Configurado (Verificando...)';
            statusText.style.color = isJsonBinConnected ? 'var(--success)' : 'var(--warning)';
            const localMovies = JSON.parse(localStorage.getItem('myMovies')) || [];
            countText.textContent = `${localMovies.length} obras locais`;
        }
    }

    modal.style.display = 'block';

    const hamburgerMenu = document.getElementById('hamburger-menu');
    if (hamburgerMenu) hamburgerMenu.style.display = 'none';
}

function closeJsonBinModal() {
    const modal = document.getElementById('jsonbin-modal');
    if (modal) modal.style.display = 'none';
}

function configureJsonBin() {
    openJsonBinModal();
}

// 4. Criar um Bin Privado Automático
async function createNewBin(customKey) {
    const keyToUse = (customKey || JSONBIN_API_KEY || '').trim();
    if (!keyToUse) {
        alert('Por favor, informe a sua X-Master-Key primeiro.');
        return false;
    }

    setJsonBinStatus('Criando arquivo na Nuvem...', 'syncing');

    let localMovies = [];
    try {
        const stored = localStorage.getItem('myMovies');
        if (stored) localMovies = JSON.parse(stored) || [];
    } catch (e) {
        localMovies = [];
    }

    // Usar placeholder seguro para evitar "Bin cannot be blank"
    const dataToSave = (Array.isArray(localMovies) && localMovies.length > 0)
        ? localMovies
        : [{ _placeholder: true }];

    try {
        const response = await fetch('https://api.jsonbin.io/v3/b', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': keyToUse,
                'X-Bin-Private': 'true',
                'X-Bin-Name': 'multiverso_backup'
            },
            body: JSON.stringify(dataToSave)
        });

        const data = await response.json();

        if (response.ok && data.metadata && data.metadata.id) {
            JSONBIN_API_KEY = keyToUse;
            JSONBIN_BIN_ID = data.metadata.id;
            localStorage.setItem('jsonbin_api_key', JSONBIN_API_KEY);
            localStorage.setItem('jsonbin_bin_id', JSONBIN_BIN_ID);
            isJsonBinConnected = true;
            updateJsonBinUIState();
            setJsonBinStatus('Nuvem Ativa', 'success');
            
            const inputBinId = document.getElementById('jsonbin-input-bin-id');
            if (inputBinId) inputBinId.value = JSONBIN_BIN_ID;
            
            closeJsonBinModal();
            if (window.showToast) {
                window.showToast('✅ Nuvem configurada com sucesso! Novo Bin criado.', 'success');
            } else {
                alert('✅ Nuvem configurada com sucesso! Um arquivo privado foi criado no JSONBin para armazenar seu catálogo.');
            }
            return true;
        } else {
            console.error('Erro ao criar Bin:', data);
            alert('Falha ao conectar com o JSONBin. Verifique se a sua X-Master-Key está correta. (Erro: ' + (data.message || 'Chave inválida') + ')');
            setJsonBinStatus('Chave Inválida', 'error');
            return false;
        }
    } catch (err) {
        console.error('Erro de rede ao conectar JSONBin:', err);
        setJsonBinStatus('Erro de Conexão', 'error');
        alert('Erro ao conectar com o servidor do JSONBin. Verifique sua conexão.');
        return false;
    }
}

// 5. Testar Conexão e Sincronizar (Carregar ou Salvar)
async function testAndSyncJsonBin(customKey, customBinId, isManual = false) {
    const keyToUse = (customKey || JSONBIN_API_KEY || '').trim();
    const binIdToUse = (customBinId || JSONBIN_BIN_ID || '').trim();

    if (!keyToUse || !binIdToUse) {
        updateJsonBinUIState();
        return false;
    }

    setJsonBinStatus('Verificando Nuvem...', 'syncing');

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binIdToUse}/latest`, {
            method: 'GET',
            headers: {
                'X-Master-Key': keyToUse
            }
        });

        const data = await response.json();

        if (response.ok && data.record) {
            JSONBIN_API_KEY = keyToUse;
            JSONBIN_BIN_ID = binIdToUse;
            localStorage.setItem('jsonbin_api_key', JSONBIN_API_KEY);
            localStorage.setItem('jsonbin_bin_id', JSONBIN_BIN_ID);
            isJsonBinConnected = true;
            updateJsonBinUIState();

            let remoteMovies = data.record;
            if (Array.isArray(remoteMovies)) {
                remoteMovies = remoteMovies.filter(item => item && !item._placeholder);
            } else {
                remoteMovies = [];
            }
            
            let localMovies = [];
            try {
                const stored = localStorage.getItem('myMovies');
                if (stored) localMovies = JSON.parse(stored) || [];
            } catch (e) {
                localMovies = [];
            }

            const areEqual = areMovieListsEqual(localMovies, remoteMovies);

            // 1. Se local está vazio e remoto tem dados → restaura automaticamente
            if (localMovies.length === 0 && remoteMovies.length > 0) {
                const merged = mergeMovieLists(localMovies, remoteMovies).filter(Boolean);
                localStorage.setItem('myMovies', JSON.stringify(merged));
                if (window.movies) window.movies = merged;
                if (typeof renderMovies === 'function') renderMovies();
                if (typeof updateDrawerOptions === 'function') updateDrawerOptions();
                setJsonBinStatus('Nuvem Restaurada', 'success');
                if (window.showToast) {
                    window.showToast(`${merged.length} obras restauradas da Nuvem!`, 'success');
                }
            }
            // 2. Se as listas são idênticas → nada a fazer
            else if (areEqual) {
                setJsonBinStatus('Nuvem Sincronizada', 'success');
            }
            // 3. Conflito real → merge automático por data de modificação
            else {
                setJsonBinStatus('Mesclando dados...', 'syncing');
                const merged = mergeMovieLists(localMovies, remoteMovies).filter(Boolean);

                const added   = merged.length - localMovies.length;
                const changed = merged.filter(m => {
                    const local = localMovies.find(l => String(l.id) === String(m.id));
                    return local && local.updatedAt !== m.updatedAt;
                }).length;

                localStorage.setItem('myMovies', JSON.stringify(merged));
                if (window.movies) window.movies = merged;
                if (typeof renderMovies === 'function') renderMovies();
                if (typeof updateDrawerOptions === 'function') updateDrawerOptions();

                // Salvar resultado do merge na nuvem para manter consistência
                saveToJsonBin(merged);
                setJsonBinStatus('Nuvem Sincronizada', 'success');

                if (window.showToast) {
                    const parts = [];
                    if (added > 0) parts.push(`${added} nova(s)`);
                    if (changed > 0) parts.push(`${changed} atualizada(s)`);
                    const summary = parts.length ? ` (${parts.join(', ')})` : '';
                    window.showToast(`✅ Merge concluído${summary}`, 'success');
                }
            }

            if (isManual) closeJsonBinModal();
            return true;
        } else {
            console.error('Falha ao conectar no Bin:', data);
            if (isManual) {
                alert('Falha ao acessar o Bin ID informado. Verifique se o ID e a Chave estão corretos. (Erro: ' + (data.message || 'Não encontrado') + ')');
            }
            setJsonBinStatus('Erro no Bin', 'error');
            return false;
        }
    } catch (err) {
        console.error('Erro ao buscar dados do JSONBin:', err);
        setJsonBinStatus('Erro na Nuvem', 'error');
        if (isManual) {
            alert('Erro ao conectar com o servidor do JSONBin. Verifique sua conexão.');
        }
        return false;
    }
}

// 6. Salvar Alterações no JSONBin
async function saveToJsonBin(moviesData) {
    if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) return;

    setJsonBinStatus('Salvando na Nuvem...', 'syncing');

    let dataToSave = moviesData;
    if (!dataToSave) {
        try {
            const stored = localStorage.getItem('myMovies');
            if (stored) dataToSave = JSON.parse(stored) || [];
            else dataToSave = [];
        } catch (e) {
            dataToSave = [];
        }
    }

    const finalData = (Array.isArray(dataToSave) && dataToSave.length > 0)
        ? dataToSave
        : [{ _placeholder: true }];

    // Incluir tombstones no payload para sincronizar deleções entre dispositivos
    const tombstones = (typeof window.getDeletedTombstones === 'function') ? window.getDeletedTombstones() : [];
    if (tombstones.length > 0) {
        // Adiciona como item especial no array (filtrado no momento do merge)
        finalData._tombstones = tombstones;
    }

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(finalData)
        });

        if (response.ok) {
            setJsonBinStatus('Nuvem Sincronizada', 'success');
        } else {
            const errData = await response.json();
            console.error('Erro ao salvar no JSONBin:', errData);
            setJsonBinStatus('Erro ao Salvar', 'error');
        }
    } catch (err) {
        console.error('Erro de conexão ao salvar no JSONBin:', err);
        setJsonBinStatus('Sem Conexão', 'error');
    }
}

// Debounce para salvamento automático (salva 1.5s após a última alteração)
let autoSaveJsonBinTimeout = null;
function triggerAutoJsonBinBackup() {
    if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) return;
    setJsonBinStatus('Pendência de sync...', 'syncing');
    clearTimeout(autoSaveJsonBinTimeout);
    autoSaveJsonBinTimeout = setTimeout(() => {
        saveToJsonBin();
    }, 1500);
}

// 7. Interface de Usuário
function updateJsonBinUIState() {
    btnJsonBinSync = document.getElementById('btn-jsonbin-sync');
    jsonBinStatusIndicator = document.getElementById('jsonbin-status-indicator');

    if (jsonBinStatusIndicator && !jsonBinStatusIndicator.dataset.bound) {
        jsonBinStatusIndicator.dataset.bound = 'true';
        jsonBinStatusIndicator.title = 'Configurações da Nuvem (JSONBin)';
        jsonBinStatusIndicator.onclick = function(e) {
            e.preventDefault();
            configureJsonBin();
        };
    }

    if (btnJsonBinSync && !btnJsonBinSync.dataset.bound) {
        btnJsonBinSync.dataset.bound = 'true';
        btnJsonBinSync.onclick = function(e) {
            e.preventDefault();
            configureJsonBin();
        };
    }

    if (!btnJsonBinSync) return;

    const cloudIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>';
    if (JSONBIN_API_KEY && JSONBIN_BIN_ID && isJsonBinConnected) {
        btnJsonBinSync.innerHTML = `${cloudIcon}<span>Nuvem Conectada</span>`;
    } else if (JSONBIN_API_KEY) {
        btnJsonBinSync.innerHTML = `${cloudIcon}<span>Configurar Nuvem</span>`;
    } else {
        btnJsonBinSync.innerHTML = `${cloudIcon}<span>Configurar Nuvem (JSONBin)</span>`;
    }
}

function setJsonBinStatus(text, state = 'info') {
    jsonBinStatusIndicator = document.getElementById('jsonbin-status-indicator');
    if (!jsonBinStatusIndicator) return;

    let dotColor = 'var(--text-faint)';
    if (state === 'syncing') dotColor = 'var(--warning)';
    else if (state === 'success') dotColor = 'var(--success)';
    else if (state === 'error') dotColor = 'var(--danger)';
    else if (state === 'offline') dotColor = 'var(--text-faint)';

    jsonBinStatusIndicator.innerHTML = `
        <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${dotColor}; box-shadow: 0 0 8px ${dotColor};"></span>
        <span style="color:${dotColor}; font-size:12px; font-weight:500;">${text}</span>
    `;
}

// 8. Inicialização dos eventos do modal
function initJsonBinModalEvents() {
    const modal = document.getElementById('jsonbin-modal');
    const closeBtn = document.getElementById('close-jsonbin-modal');
    const btnSave = document.getElementById('btn-save-jsonbin');
    const btnCreate = document.getElementById('btn-create-new-bin');
    const btnDisconnect = document.getElementById('btn-disconnect-jsonbin');
    const btnCopy = document.getElementById('btn-copy-bin-id');
    const inputKey = document.getElementById('jsonbin-input-api-key');
    const inputBinId = document.getElementById('jsonbin-input-bin-id');

    if (closeBtn) {
        closeBtn.onclick = () => closeJsonBinModal();
    }

    if (modal) {
        window.addEventListener('click', (e) => {
            if (e.target === modal) closeJsonBinModal();
        });
    }

    if (btnCopy) {
        btnCopy.onclick = () => {
            const binId = inputBinId ? inputBinId.value.trim() : JSONBIN_BIN_ID;
            if (binId) {
                navigator.clipboard.writeText(binId).then(() => {
                    if (window.showToast) window.showToast('Bin ID copiado para a área de transferência!', 'success');
                    else alert('Bin ID copiado!');
                });
            }
        };
    }

    if (btnSave) {
        btnSave.onclick = async () => {
            const key = inputKey ? inputKey.value.trim() : '';
            const binId = inputBinId ? inputBinId.value.trim() : '';

            if (!key) {
                alert('Por favor, insira a sua X-Master-Key.');
                return;
            }

            if (binId) {
                // Conectar ao Bin ID informado
                btnSave.disabled = true;
                btnSave.textContent = 'Conectando...';
                await testAndSyncJsonBin(key, binId, true);
                btnSave.disabled = false;
                btnSave.textContent = 'Salvar e Conectar';
            } else {
                // Criar novo Bin
                btnSave.disabled = true;
                btnSave.textContent = 'Criando Bin...';
                await createNewBin(key);
                btnSave.disabled = false;
                btnSave.textContent = 'Salvar e Conectar';
            }
        };
    }

    if (btnCreate) {
        btnCreate.onclick = async () => {
            const key = inputKey ? inputKey.value.trim() : '';
            if (!key) {
                alert('Por favor, informe a sua X-Master-Key primeiro.');
                return;
            }
            if (JSONBIN_BIN_ID && !confirm('Você já possui um Bin ID configurado. Deseja criar um NOVO Bin separado no JSONBin?')) {
                return;
            }
            btnCreate.disabled = true;
            btnCreate.textContent = 'Criando...';
            await createNewBin(key);
            btnCreate.disabled = false;
            btnCreate.textContent = 'Criar Novo Bin';
        };
    }

    if (btnDisconnect) {
        btnDisconnect.onclick = () => {
            if (confirm('Deseja realmente desconectar a Nuvem deste dispositivo? Os dados locais não serão apagados.')) {
                resetJsonBin();
                closeJsonBinModal();
            }
        };
    }
}

// Inicialização automática ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    initJsonBinModalEvents();
    updateJsonBinUIState();
    if (JSONBIN_API_KEY && JSONBIN_BIN_ID) {
        testAndSyncJsonBin(undefined, undefined, false);
    } else {
        setJsonBinStatus('Nuvem Desconectada', 'offline');
    }
});
