// Admin Panel JavaScript
let adminApiKey = '';
let apiKeys = [];

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
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
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
            headers: {
                'X-API-Key': adminApiKey
            }
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
            headers: {
                'X-API-Key': adminApiKey
            }
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
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': adminApiKey
            },
            body: JSON.stringify({
                name,
                isAdmin
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            showKeyMessage(`API key created successfully!`, 'success');
            
            // Show the new API key
            const keyDisplay = document.createElement('div');
            keyDisplay.className = 'key-display';
            keyDisplay.innerHTML = `
                <strong>New API Key (save this, it won't be shown again):</strong><br>
                <code>${data.key.key}</code>
            `;
            document.getElementById('keyMessage').appendChild(keyDisplay);
            
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

async function toggleKeyStatus(keyId, newStatus) {
    try {
        const response = await fetch(`/admin/api/keys/${keyId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': adminApiKey
            },
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
            headers: {
                'X-API-Key': adminApiKey
            }
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
