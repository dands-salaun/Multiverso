// Configurações do JSONBin.io API
let JSONBIN_API_KEY = localStorage.getItem('jsonbin_api_key') || '';
let JSONBIN_BIN_ID = localStorage.getItem('jsonbin_bin_id') || '';

let isJsonBinConnected = false;
let jsonBinStatusIndicator;
let btnJsonBinSync;

// Bug #11 fix: Flag de reentrância para evitar loop infinito caso saveToJsonBin
// ou qualquer outro código futuro chame localStorage.setItem('myMovies') durante o backup.
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


// 1. Configurar / Alterar Chaves
function configureJsonBin() {
    const currentKey = localStorage.getItem('jsonbin_api_key') || '';
    const key = prompt('Cole aqui a sua X-Master-Key do JSONBin.io:\n(Você encontra essa chave no painel do jsonbin.io > API Keys)', currentKey);
    
    if (key === null) return; // Cancelou

    const trimmedKey = key.trim();

    if (!trimmedKey) {
        // Se deixou em branco, limpa as configurações
        localStorage.removeItem('jsonbin_api_key');
        localStorage.removeItem('jsonbin_bin_id');
        JSONBIN_API_KEY = '';
        JSONBIN_BIN_ID = '';
        isJsonBinConnected = false;
        updateJsonBinUIState();
        alert('Configuração da Nuvem (JSONBin) removida com sucesso.');
        return;
    }

    JSONBIN_API_KEY = trimmedKey;
    localStorage.setItem('jsonbin_api_key', JSONBIN_API_KEY);

    // Se já tem Bin ID salvo, apenas testa a conexão
    if (JSONBIN_BIN_ID) {
        testAndSyncJsonBin();
    } else {
        // Se não tem Bin ID, cria um novo Bin privado automaticamente!
        createNewBin();
    }
}

// 2. Criar um Bin Privado Automático
async function createNewBin() {
    if (!JSONBIN_API_KEY) return;

    setJsonBinStatus('Criando arquivo na Nuvem...', 'syncing');

    const localMovies = JSON.parse(localStorage.getItem('myMovies')) || [];
    const dataToSave = localMovies.length === 0 ? [{"_placeholder": true}] : localMovies;

    try {
        const response = await fetch('https://api.jsonbin.io/v3/b', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY,
                'X-Bin-Private': 'true',
                'X-Bin-Name': 'multiverso_backup'
            },
            body: JSON.stringify(dataToSave)
        });

        const data = await response.json();

        if (response.ok && data.metadata && data.metadata.id) {
            JSONBIN_BIN_ID = data.metadata.id;
            localStorage.setItem('jsonbin_bin_id', JSONBIN_BIN_ID);
            isJsonBinConnected = true;
            updateJsonBinUIState();
            setJsonBinStatus('Nuvem Ativa', 'success');
            alert('✅ Nuvem configurada com sucesso! Um arquivo privado foi criado no JSONBin para armazenar seu catálogo.');
        } else {
            console.error('Erro ao criar Bin:', data);
            alert('Falha ao conectar com o JSONBin. Verifique se a sua X-Master-Key está correta. (Erro: ' + (data.message || 'Chave inválida') + ')');
            setJsonBinStatus('Chave Inválida', 'error');
        }
    } catch (err) {
        console.error('Erro de rede ao conectar JSONBin:', err);
        setJsonBinStatus('Erro de Conexão', 'error');
        alert('Erro ao conectar com o servidor do JSONBin. Verifique sua conexão.');
    }
}

// 3. Testar Conexão e Sincronizar (Carregar ou Salvar)
async function testAndSyncJsonBin() {
    if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) {
        updateJsonBinUIState();
        return;
    }

    setJsonBinStatus('Verificando Nuvem...', 'syncing');

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
            method: 'GET',
            headers: {
                'X-Master-Key': JSONBIN_API_KEY
            }
        });

        const data = await response.json();

        if (response.ok && data.record) {
            isJsonBinConnected = true;
            updateJsonBinUIState();

            let remoteMovies = data.record;
            if (Array.isArray(remoteMovies) && remoteMovies.length === 1 && remoteMovies[0]._placeholder) {
                remoteMovies = [];
            }
            
            const localMovies = JSON.parse(localStorage.getItem('myMovies')) || [];

            // Se o local estiver vazio e o remoto tiver dados, restaura automaticamente
            if (localMovies.length === 0 && Array.isArray(remoteMovies) && remoteMovies.length > 0) {
                localStorage.setItem('myMovies', JSON.stringify(remoteMovies));
                if (window.movies) window.movies = remoteMovies;
                if (typeof renderMovies === 'function') renderMovies();
                setJsonBinStatus('Nuvem Restaurada', 'success');
                alert('Sua lista foi restaurada automaticamente da Nuvem!');
            } else {
                setJsonBinStatus('Nuvem Conectada', 'success');
            }
        } else {
            // Se falhou ao buscar o Bin existente, tenta criar um novo
            createNewBin();
        }
    } catch (err) {
        console.error('Erro ao buscar dados do JSONBin:', err);
        setJsonBinStatus('Erro na Nuvem', 'error');
    }
}

// 4. Salvar Alterações no JSONBin
async function saveToJsonBin(moviesData) {
    if (!JSONBIN_API_KEY || !JSONBIN_BIN_ID) return;

    setJsonBinStatus('Salvando na Nuvem...', 'syncing');

    const dataToSave = moviesData || JSON.parse(localStorage.getItem('myMovies')) || [];
    const finalData = dataToSave.length === 0 ? [{"_placeholder": true}] : dataToSave;

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

// 5. Interface de Usuário
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
        btnJsonBinSync.innerHTML = `${cloudIcon}<span>Configurações da Nuvem</span>`;
    } else if (JSONBIN_API_KEY) {
        btnJsonBinSync.innerHTML = `${cloudIcon}<span>Reconectar Nuvem</span>`;
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

// Inicialização automática ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    updateJsonBinUIState();
    if (JSONBIN_API_KEY && JSONBIN_BIN_ID) {
        testAndSyncJsonBin();
    } else {
        setJsonBinStatus('Nuvem Desconectada', 'offline');
    }
});
