// State & constants
let supabaseClient = null;
let currentSessionId = localStorage.getItem('hf_session_id');
if (!currentSessionId) {
    currentSessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'sess_' + Date.now();
    localStorage.setItem('hf_session_id', currentSessionId);
}
let hfApiKey = localStorage.getItem('hf_api_key') || '';
let hfChatHistory = [];
const HF_MODEL = 'openai/gpt-oss-120b';
const HF_API_BASE = 'https://router.huggingface.co/v1/chat/completions';
const FLUX_MODEL = 'black-forest-labs/FLUX.1-schnell';
const FLUX_API_URL = `https://router.huggingface.co/hf-inference/models/${FLUX_MODEL}`;

// Toast container setup
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

async function loadEnvAndInitSupabase() {
    try {
        const supabaseUrl = 'https://vfyqsldgdnlttsgdxqja.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmeXFzbGRnZG5sdHRzZ2R4cWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NTIyMTEsImV4cCI6MjA5MTEyODIxMX0.5AOrYStbOt7XHkwLuH1w0GDPUvJovvcA54W2DZ553gI';
        
        if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
            if (window.supabase) {
                supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
                console.log('Supabase client initialized');
                showNotification('Supabase Connected! ⚡', 'success');
                await loadChatHistory();
            } else {
                showNotification('Supabase library not loaded.', 'error');
            }
        } else {
            console.warn('Missing or invalid SUPABASE_URL / SUPABASE_ANON_KEY in .env');
        }
    } catch (e) {
        console.warn('Error loading configuration:', e);
    }
}

async function loadChatHistory() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .select('*')
            .eq('session_id', currentSessionId)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            const messagesDiv = document.getElementById('hf-messages');
            messagesDiv.innerHTML = '';
            hfChatHistory = [];
            
            data.forEach(msg => {
                appendMessage(msg.role, msg.content, msg.role === 'assistant');
                hfChatHistory.push({ role: msg.role, content: msg.content });
            });
        }
    } catch (err) {
        console.error('Error loading history from Supabase:', err);
    }
}

async function saveMessageToSupabase(role, content) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('chat_messages')
            .insert([{ session_id: currentSessionId, role: role, content: content }]);
            
        if (error) {
            console.error('Supabase Error:', error);
            showNotification('DB Save Error: ' + error.message, 'error');
        }
    } catch (err) {
        console.error('Error saving message to Supabase:', err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadEnvAndInitSupabase();
    // Populate API key if available
    const apiKeyInput = document.getElementById('hf-api-key');
    if (hfApiKey) {
        apiKeyInput.value = hfApiKey;
    }

    // Configure marked.js
    if (window.marked) {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    // Sidebar navigation logic
    const navItems = document.querySelectorAll('.nav-item');
    const viewContainers = document.querySelectorAll('.view-container');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active from all nav items
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active to clicked nav item
            item.classList.add('active');

            const targetId = item.getAttribute('data-target');
            
            // Switch views
            viewContainers.forEach(view => {
                if (view.id === targetId) {
                    view.classList.remove('hidden');
                    // Small delay to allow display block to apply before animation
                    setTimeout(() => view.classList.add('active'), 10);
                } else {
                    view.classList.add('hidden');
                    view.classList.remove('active');
                }
            });
        });
    });

    // HF Key save
    document.getElementById('save-hf-key').addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            hfApiKey = key;
            localStorage.setItem('hf_api_key', key);
            showNotification('API Key saved successfully!', 'success');
        } else {
            showNotification('Please enter a valid key.', 'error');
        }
    });

    // GPT-OSS-120B Chat logic
    const chatInput = document.getElementById('hf-user-input');
    const sendBtn = document.getElementById('hf-send-btn');
    const messagesDiv = document.getElementById('hf-messages');
    const clearBtn = document.getElementById('clear-hf-chat');

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendHfMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });

    sendBtn.addEventListener('click', sendHfMessage);

    clearBtn.addEventListener('click', () => {
        hfChatHistory = [];
        messagesDiv.innerHTML = '';
        appendMessage('assistant', '🗑️ Chat cleared!', false);
    });

    // FLUX.1-schnell Image Generation logic
    const generateBtn = document.getElementById('img-generate-btn');
    const promptInput = document.getElementById('img-prompt');

    generateBtn.addEventListener('click', generateImage);
    
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            generateImage();
        }
    });
});

function appendMessage(role, content, parseMarkdown = true) {
    const messagesDiv = document.getElementById('hf-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (parseMarkdown && window.marked) {
        contentDiv.innerHTML = marked.parse(content);
        // Apply Prism syntax highlighting
        if (window.Prism) {
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                Prism.highlightElement(block);
            });
        }
    } else {
        const p = document.createElement('p');
        p.textContent = content;
        contentDiv.appendChild(p);
    }
    
    msgDiv.appendChild(contentDiv);
    messagesDiv.appendChild(msgDiv);
    
    // Auto scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendHfMessage() {
    const chatInput = document.getElementById('hf-user-input');
    const text = chatInput.value.trim();
    
    if (!text) return;
    
    if (!hfApiKey) {
        showNotification('Please set your HF API token in the sidebar first.', 'error');
        return;
    }

    // Reset input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    appendMessage('user', text, false);
    hfChatHistory.push({ role: 'user', content: text });
    saveMessageToSupabase('user', text);

    // Typing indicator
    const messagesDiv = document.getElementById('hf-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<div class="message-content"><span></span><span></span><span></span></div>';
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const reply = await callHfApi(hfChatHistory);
        document.getElementById('typing-indicator')?.remove();
        
        appendMessage('assistant', reply, true);
        hfChatHistory.push({ role: 'assistant', content: reply });
        saveMessageToSupabase('assistant', reply);
    } catch (err) {
        document.getElementById('typing-indicator')?.remove();
        showNotification(err.message, 'error');
    }
}

async function callHfApi(history) {
    const messages = [
        { role: 'system', content: 'You are a helpful AI assistant. Format your responses with markdown.' },
        ...history
    ];

    const body = {
        model: HF_MODEL,
        messages: messages,
        max_tokens: 2048,
        temperature: 0.7,
        stream: false
    };

    const res = await fetch(HF_API_BASE, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${hfApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API Error: ${res.status}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
}

function setImgLoading(isLoading) {
    const btn = document.getElementById('img-generate-btn');
    const outputDiv = document.getElementById('img-output');
    
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = '<div class="btn-spinner"></div> Generating...';
        
        // Show FLUX loader
        outputDiv.className = 'img-output-placeholder';
        outputDiv.innerHTML = `
            <div class="flux-loader">
                <div class="flux-bar"></div>
                <div class="flux-bar"></div>
                <div class="flux-bar"></div>
                <div class="flux-bar"></div>
            </div>
        `;
    } else {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Generate Image';
    }
}

async function generateImage() {
    const prompt = document.getElementById('img-prompt').value.trim();
    const steps = document.getElementById('img-steps').value;
    const seed = document.getElementById('img-seed').value;
    
    if (!prompt) {
        showNotification('Please enter a prompt to generate an image.', 'error');
        return;
    }
    
    if (!hfApiKey) {
        showNotification('Please set your HF API token in the sidebar first.', 'error');
        return;
    }

    setImgLoading(true);
    document.getElementById('img-actions').classList.add('hidden');
    
    const body = {
        inputs: prompt,
        parameters: {
            num_inference_steps: parseInt(steps)
        }
    };
    
    if (seed) {
        body.parameters.seed = parseInt(seed);
    }

    try {
        const res = await fetch(FLUX_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hfApiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'image/png'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorText = await res.text();
            let errMsg = `API Error: ${res.status}`;
            try {
                const errObj = JSON.parse(errorText);
                errMsg = errObj.error || errMsg;
            } catch(e) {}
            throw new Error(errMsg);
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        
        const outputDiv = document.getElementById('img-output');
        outputDiv.className = 'img-output-result';
        outputDiv.innerHTML = '';
        
        const img = document.createElement('img');
        img.className = 'generated-image';
        img.src = objectUrl;
        img.alt = prompt;
        
        outputDiv.appendChild(img);
        
        const downloadBtn = document.getElementById('img-download');
        downloadBtn.href = objectUrl;
        downloadBtn.download = `flux-${Date.now()}.png`;
        
        document.getElementById('img-actions').classList.remove('hidden');
        showNotification('Image generated! \uD83C\uDFA8', 'success');
        
    } catch (err) {
        const outputDiv = document.getElementById('img-output');
        outputDiv.className = 'img-output-placeholder';
        outputDiv.innerHTML = `
            <div class="placeholder-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <p style="color: #ef4444; max-width: 80%; text-align: center;">${err.message}</p>
            </div>
        `;
        showNotification('Failed to generate image.', 'error');
    } finally {
        setImgLoading(false);
    }
}

function showNotification(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.querySelector('.toast-container').appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
