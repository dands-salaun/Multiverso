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

// 1. Resetar / Desconectar Nuvem
function resetJsonBin(silent = false) {
    clearTimeout(autoSaveJsonBinTimeout);
    localStorage.removeItem('jsonbin_api_key');
    localStorage.removeItem('jsonbin_bin_id');
    JSONBIN_API_KEY = '';
    JSONBIN_BIN_ID = '';
    isJsonBinConnected = false;
    updateJsonBinUIState();
    setJsonBinStatus('Nuvem Desconectada', 'offline');
    if (!silent && window.showToast) {
        window.showToast('Configuração da Nuvem removida com sucesso.', 'info');
    }
}

// 2. Modal do JSONBin
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

// 3. Criar um Bin Privado Automático
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

// 4. Testar Conexão e Sincronizar (Carregar ou Salvar)
async function testAndSyncJsonBin(customKey, customBinId) {
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
                remoteMovies = remoteMovies.filter(item => !item || !item._placeholder);
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

            // Se local está vazio e remoto tem dados, restaura automaticamente
            if (localMovies.length === 0 && remoteMovies.length > 0) {
                localStorage.setItem('myMovies', JSON.stringify(remoteMovies));
                if (window.movies) window.movies = remoteMovies;
                if (typeof renderMovies === 'function') renderMovies();
                setJsonBinStatus('Nuvem Restaurada', 'success');
                if (window.showToast) {
                    window.showToast(`${remoteMovies.length} obras restauradas da Nuvem!`, 'success');
                } else {
                    alert('Sua lista foi restaurada automaticamente da Nuvem!');
                }
            } else if (localMovies.length > 0 && remoteMovies.length > 0 && JSON.stringify(localMovies) !== JSON.stringify(remoteMovies)) {
                const loadRemote = confirm(`Encontramos ${remoteMovies.length} obras na nuvem e você tem ${localMovies.length} obras locais.\n\nDeseja CARREGAR as obras da nuvem?\n\n- [OK]: Substituir catálogo local pelo da Nuvem\n- [Cancelar]: Manter obras locais e atualizar a Nuvem`);
                if (loadRemote) {
                    localStorage.setItem('myMovies', JSON.stringify(remoteMovies));
                    if (window.movies) window.movies = remoteMovies;
                    if (typeof renderMovies === 'function') renderMovies();
                    setJsonBinStatus('Nuvem Restaurada', 'success');
                    if (window.showToast) window.showToast('Lista da Nuvem carregada com sucesso!', 'success');
                } else {
                    saveToJsonBin(localMovies);
                    setJsonBinStatus('Nuvem Conectada', 'success');
                }
            } else {
                setJsonBinStatus('Nuvem Conectada', 'success');
            }

            closeJsonBinModal();
            return true;
        } else {
            console.error('Falha ao conectar no Bin:', data);
            alert('Falha ao acessar o Bin ID informado. Verifique se o ID e a Chave estão corretos. (Erro: ' + (data.message || 'Não encontrado') + ')');
            setJsonBinStatus('Erro no Bin', 'error');
            return false;
        }
    } catch (err) {
        console.error('Erro ao buscar dados do JSONBin:', err);
        setJsonBinStatus('Erro na Nuvem', 'error');
        alert('Erro ao conectar com o servidor do JSONBin. Verifique sua conexão.');
        return false;
    }
}

// 5. Salvar Alterações no JSONBin
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

// 6. Interface de Usuário
function updateJsonBinUIState() {
    btnJsonBinSync = document.getElementById('btn-jsonbin-sync');

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

    jsonBinStatusIndicator.innerHTML = `
        <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${dotColor}; box-shadow: 0 0 8px ${dotColor};"></span>
        <span style="color:${dotColor}; font-size:12px; font-weight:500;">${text}</span>
    `;
}

// Inicialização dos eventos do modal
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
                await testAndSyncJsonBin(key, binId);
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
                if (inputKey) inputKey.value = '';
                if (inputBinId) inputBinId.value = '';
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
        testAndSyncJsonBin();
    } else {
        setJsonBinStatus('Nuvem Desconectada', 'offline');
    }
});
