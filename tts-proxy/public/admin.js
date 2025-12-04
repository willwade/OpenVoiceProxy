// Admin Panel JavaScript
let adminApiKey = '';
let apiKeys = [];
let isDevelopmentMode = false;
let currentConfigKeyId = null;
let availableEngines = [];

// Engine definitions with their configuration requirements
const ENGINE_DEFINITIONS = {
    espeak: { name: 'eSpeak', type: 'free', requiresKey: false, description: 'Free, open-source speech synthesizer' },
    azure: { name: 'Azure TTS', type: 'paid', requiresKey: true, keyFields: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'], description: 'Microsoft Azure Cognitive Services' },
    elevenlabs: { name: 'ElevenLabs', type: 'paid', requiresKey: true, keyFields: ['ELEVENLABS_API_KEY'], description: 'High-quality AI voices' },
    openai: { name: 'OpenAI TTS', type: 'paid', requiresKey: true, keyFields: ['OPENAI_API_KEY'], description: 'OpenAI text-to-speech' },
    google: { name: 'Google Cloud TTS', type: 'paid', requiresKey: true, keyFields: ['GOOGLE_API_KEY'], description: 'Google Cloud Text-to-Speech' },
    polly: { name: 'AWS Polly', type: 'paid', requiresKey: true, keyFields: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'], description: 'Amazon Polly TTS' },
    watson: { name: 'IBM Watson', type: 'paid', requiresKey: true, keyFields: ['WATSON_API_KEY', 'WATSON_SERVICE_URL'], description: 'IBM Watson Text to Speech' },
    playht: { name: 'PlayHT', type: 'paid', requiresKey: true, keyFields: ['PLAYHT_API_KEY', 'PLAYHT_USER_ID'], description: 'PlayHT voice generation' },
    witai: { name: 'Wit.ai', type: 'free', requiresKey: true, keyFields: ['WITAI_API_KEY'], description: 'Facebook Wit.ai TTS' },
    sherpaonnx: { name: 'SherpaOnnx', type: 'free', requiresKey: false, description: 'Local neural TTS (Kokoro voices)' }
};

// Check if server is in development mode (allows bypassing auth)
async function checkDevelopmentMode() {
    try {
        // Try to access admin API without credentials - if it works, we're in dev mode
        const response = await fetch('/admin/api/keys');
        if (response.ok) {
            isDevelopmentMode = true;
            console.log('🔧 Development mode detected - authentication bypassed');
            return true;
        }
    } catch (error) {
        console.log('Production mode - authentication required');
    }
    return false;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const devMode = await checkDevelopmentMode();
    if (devMode) {
        // Auto-authenticate in development mode
        document.getElementById('authSection').innerHTML = `
            <div class="alert alert-success">
                <strong>🔧 Development Mode</strong><br>
                Authentication is bypassed in local development.
                <small>Set <code>NODE_ENV=production</code> or <code>API_KEY_REQUIRED=true</code> to enable auth.</small>
            </div>
        `;
        document.getElementById('mainContent').style.display = 'block';
        await loadDashboard();
    }
});

// Authentication
async function authenticate() {
    const keyInput = document.getElementById('adminApiKey');
    adminApiKey = keyInput.value.trim();

    if (!adminApiKey) {
        showAuthError('Please enter an admin API key');
        return;
    }

    try {
        // Test the admin API key by trying to list keys
        const response = await fetch('/admin/api/keys', {
            headers: {
                'X-API-Key': adminApiKey
            }
        });

        if (response.ok) {
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            await loadDashboard();
        } else {
            showAuthError('Invalid admin API key or insufficient permissions');
        }
    } catch (error) {
        showAuthError('Connection error. Please check if the server is running.');
    }
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

// Helper to get fetch headers (only include API key if set)
function getHeaders(includeContentType = false) {
    const headers = {};
    if (adminApiKey) {
        headers['X-API-Key'] = adminApiKey;
    }
    if (includeContentType) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

// Dashboard loading
async function loadDashboard() {
    await Promise.all([
        loadUsageStats(),
        loadApiKeys()
    ]);
}

// Usage Statistics
async function loadUsageStats() {
    try {
        const response = await fetch('/admin/api/usage', {
            headers: getHeaders()
        });

        if (response.ok) {
            const data = await response.json();
            displayUsageStats(data.usage);
        }
    } catch (error) {
        console.error('Error loading usage stats:', error);
    }
}

function displayUsageStats(stats) {
    const statsGrid = document.getElementById('statsGrid');
    
    const totalKeys = apiKeys.length;
    const activeKeys = apiKeys.filter(key => key.active).length;
    const adminKeys = apiKeys.filter(key => key.isAdmin).length;
    
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.totalRequests}</div>
            <div class="stat-label">Total Requests (7 days)</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalKeys}</div>
            <div class="stat-label">Total API Keys</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${activeKeys}</div>
            <div class="stat-label">Active Keys</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${adminKeys}</div>
            <div class="stat-label">Admin Keys</div>
        </div>
    `;
}

// API Key Management
async function loadApiKeys() {
    try {
        const response = await fetch('/admin/api/keys', {
            headers: getHeaders()
        });

        if (response.ok) {
            const data = await response.json();
            apiKeys = data.keys;
            displayApiKeys();
        }
    } catch (error) {
        console.error('Error loading API keys:', error);
    }
}

function displayApiKeys() {
    const tbody = document.getElementById('keysTableBody');

    tbody.innerHTML = apiKeys.map(key => `
        <tr>
            <td>${escapeHtml(key.name)}</td>
            <td>
                <span class="key-hint" title="Last 8 characters of API key">
                    ${key.keySuffix ? `tts_••••••••...${escapeHtml(key.keySuffix)}` : '<span class="text-muted">N/A</span>'}
                </span>
                ${key.keySuffix ? `<button class="btn btn-sm btn-copy" onclick="copyToClipboard('...${escapeHtml(key.keySuffix)}')" title="Copy hint">📋</button>` : ''}
            </td>
            <td>
                ${key.isAdmin ? '<span class="admin-badge">Admin</span>' : 'Regular'}
            </td>
            <td>
                <span class="${key.active ? 'status-active' : 'status-inactive'}">
                    ${key.active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${formatDate(key.createdAt)}</td>
            <td>${key.lastUsed ? formatDate(key.lastUsed) : 'Never'}</td>
            <td>${key.requestCount || 0}</td>
            <td>
                <button class="btn btn-configure" onclick="openEngineConfigModal('${key.id}', '${escapeHtml(key.name)}')">
                    ⚙️ Configure
                </button>
                <button class="btn" onclick="toggleKeyStatus('${key.id}', ${!key.active})">
                    ${key.active ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-danger" onclick="deleteApiKey('${key.id}')">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

async function createApiKey() {
    const name = document.getElementById('keyName').value.trim();
    const isAdmin = document.getElementById('isAdmin').checked;

    if (!name) {
        showKeyMessage('Please enter a name for the API key', 'error');
        return;
    }

    try {
        const response = await fetch('/admin/api/keys', {
            method: 'POST',
            headers: getHeaders(true),
            body: JSON.stringify({
                name,
                isAdmin
            })
        });

        if (response.ok) {
            const data = await response.json();

            // Show success message with copy button
            const messageDiv = document.getElementById('keyMessage');
            messageDiv.className = 'alert alert-success';
            messageDiv.innerHTML = `
                <div class="key-display">
                    <div class="key-display-header">
                        <span class="warning-icon">⚠️</span>
                        <strong>API Key Created - Save this now! It won't be shown again.</strong>
                    </div>
                    <div class="key-value-container">
                        <code id="newKeyValue">${data.key.key}</code>
                        <button class="btn btn-copy" onclick="copyApiKey('${data.key.key}', this)">
                            📋 Copy
                        </button>
                    </div>
                    <p style="margin-top: 10px; font-size: 12px; color: #666;">
                        Key name: <strong>${escapeHtml(data.key.name)}</strong> |
                        Type: ${data.key.isAdmin ? 'Admin' : 'Regular'}
                    </p>
                </div>
            `;
            messageDiv.classList.remove('hidden');

            // Clear form
            document.getElementById('keyName').value = '';
            document.getElementById('isAdmin').checked = false;

            // Reload keys
            await loadApiKeys();
            await loadUsageStats();
        } else {
            const error = await response.json();
            showKeyMessage(`Error creating API key: ${error.message}`, 'error');
        }
    } catch (error) {
        showKeyMessage('Error creating API key. Please try again.', 'error');
    }
}

// Copy API key to clipboard
async function copyApiKey(key, button) {
    try {
        await navigator.clipboard.writeText(key);
        const originalText = button.innerHTML;
        button.innerHTML = '✅ Copied!';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('copied');
        }, 2000);
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = key;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        button.innerHTML = '✅ Copied!';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = '📋 Copy';
            button.classList.remove('copied');
        }, 2000);
    }
}

async function toggleKeyStatus(keyId, newStatus) {
    try {
        const response = await fetch(`/admin/api/keys/${keyId}`, {
            method: 'PUT',
            headers: getHeaders(true),
            body: JSON.stringify({
                active: newStatus
            })
        });

        if (response.ok) {
            showKeyMessage(`API key ${newStatus ? 'enabled' : 'disabled'} successfully`, 'success');
            await loadApiKeys();
        } else {
            const error = await response.json();
            showKeyMessage(`Error updating API key: ${error.message}`, 'error');
        }
    } catch (error) {
        showKeyMessage('Error updating API key. Please try again.', 'error');
    }
}

async function deleteApiKey(keyId) {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/admin/api/keys/${keyId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        
        if (response.ok) {
            showKeyMessage('API key deleted successfully', 'success');
            await loadApiKeys();
            await loadUsageStats();
        } else {
            const error = await response.json();
            showKeyMessage(`Error deleting API key: ${error.message}`, 'error');
        }
    } catch (error) {
        showKeyMessage('Error deleting API key. Please try again.', 'error');
    }
}

// Utility functions
function showKeyMessage(message, type) {
    const messageDiv = document.getElementById('keyMessage');
    messageDiv.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
    messageDiv.textContent = message;
    messageDiv.classList.remove('hidden');
    
    // Hide message after 5 seconds
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh every 30 seconds
setInterval(async () => {
    if (adminApiKey && document.getElementById('mainContent').style.display !== 'none') {
        await loadUsageStats();
    }
}, 30000);

// Engine Configuration Modal Functions
async function openEngineConfigModal(keyId, keyName) {
    currentConfigKeyId = keyId;
    document.getElementById('configKeyName').textContent = keyName;

    // Load current engine config for this key
    try {
        const response = await fetch(`/admin/api/keys/${keyId}/engines`, {
            headers: getHeaders()
        });

        let currentConfig = {};
        if (response.ok) {
            const data = await response.json();
            currentConfig = data.engineConfig || {};
        }

        renderEngineConfigList(currentConfig);
        document.getElementById('engineConfigModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading engine config:', error);
        showKeyMessage('Error loading engine configuration', 'error');
    }
}

function closeEngineConfigModal() {
    document.getElementById('engineConfigModal').style.display = 'none';
    currentConfigKeyId = null;
}

function renderEngineConfigList(currentConfig) {
    const container = document.getElementById('engineConfigList');

    container.innerHTML = Object.entries(ENGINE_DEFINITIONS).map(([engineId, engine]) => {
        const config = currentConfig[engineId] || {};
        const isEnabled = config.enabled !== false; // Default to enabled if not set
        const hasCustomKey = config.apiKey || config.credentials;

        return `
            <div class="engine-config-item ${isEnabled ? 'enabled' : ''}" id="engine-${engineId}">
                <div class="engine-config-header">
                    <label>
                        <input type="checkbox"
                               id="enable-${engineId}"
                               ${isEnabled ? 'checked' : ''}
                               onchange="toggleEngineConfig('${engineId}')">
                        ${engine.name}
                    </label>
                    <span class="engine-badge ${engine.type}">${engine.type}</span>
                    ${hasCustomKey ? '<span class="engine-badge" style="background:#27ae60;">Custom Key</span>' : ''}
                </div>
                <p style="font-size: 12px; color: #666; margin: 5px 0;">${engine.description}</p>

                <div class="engine-config-details">
                    ${engine.requiresKey ? renderKeyFields(engineId, engine, config) : `
                        <p style="color: #27ae60; font-size: 13px;">
                            ✓ This engine doesn't require API credentials
                        </p>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function renderKeyFields(engineId, engine, config) {
    const credentials = config.credentials || {};

    return `
        <p style="font-size: 13px; margin-bottom: 10px;">
            <strong>Custom API Credentials</strong> (leave blank to use system defaults)
        </p>
        <div class="config-row">
            ${engine.keyFields.map(field => `
                <div class="form-group">
                    <label for="${engineId}-${field}">${field}</label>
                    <input type="password"
                           id="${engineId}-${field}"
                           placeholder="Enter ${field}"
                           value="${credentials[field] || ''}"
                           autocomplete="off">
                    <p class="help-text">Leave blank to use system default</p>
                </div>
            `).join('')}
        </div>
    `;
}

function toggleEngineConfig(engineId) {
    const checkbox = document.getElementById(`enable-${engineId}`);
    const container = document.getElementById(`engine-${engineId}`);

    if (checkbox.checked) {
        container.classList.add('enabled');
    } else {
        container.classList.remove('enabled');
    }
}

async function saveEngineConfig() {
    if (!currentConfigKeyId) return;

    const engineConfig = {};

    Object.entries(ENGINE_DEFINITIONS).forEach(([engineId, engine]) => {
        const enabled = document.getElementById(`enable-${engineId}`).checked;
        const config = { enabled };

        if (engine.requiresKey && enabled) {
            const credentials = {};
            let hasCredentials = false;

            engine.keyFields.forEach(field => {
                const input = document.getElementById(`${engineId}-${field}`);
                if (input && input.value.trim()) {
                    credentials[field] = input.value.trim();
                    hasCredentials = true;
                }
            });

            if (hasCredentials) {
                config.credentials = credentials;
            }
        }

        engineConfig[engineId] = config;
    });

    try {
        const response = await fetch(`/admin/api/keys/${currentConfigKeyId}/engines`, {
            method: 'PUT',
            headers: getHeaders(true),
            body: JSON.stringify({ engineConfig })
        });

        if (response.ok) {
            showKeyMessage('Engine configuration saved successfully', 'success');
            closeEngineConfigModal();
            await loadApiKeys();
        } else {
            const error = await response.json();
            showKeyMessage(`Error saving configuration: ${error.message}`, 'error');
        }
    } catch (error) {
        console.error('Error saving engine config:', error);
        showKeyMessage('Error saving engine configuration', 'error');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('engineConfigModal');
    if (event.target === modal) {
        closeEngineConfigModal();
    }
};

// Utility function to copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showKeyMessage('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showKeyMessage('Copied to clipboard!', 'success');
    }
}
