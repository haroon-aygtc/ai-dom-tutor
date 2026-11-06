import { Config, Language, Settings } from '../utils/types';

class AdminPanel {
  private config: Config | null = null;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    await this.loadConfig();
    this.setupTabs();
    this.renderLanguages();
    this.renderProviders();
    this.setupEventListeners();
    this.loadSettings(); // reads from config.settings, not DOM defaults
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, (response) => {
        if (chrome.runtime.lastError) {
          this.showStatus('Could not connect to extension background', 'error');
          resolve();
          return;
        }
        this.config = response?.config ?? null;
        resolve();
      });
    });
  }

  async saveConfig(): Promise<void> {
    if (!this.config) return;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'updateConfig', config: this.config }, (response) => {
        if (chrome.runtime.lastError) {
          this.showStatus('Failed to save configuration', 'error');
        } else if (response?.success) {
          this.showStatus('Configuration saved', 'success');
        }
        resolve();
      });
    });
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  setupTabs(): void {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = (tab as HTMLElement).dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        if (tabName) {
          document.getElementById(`${tabName}-tab`)?.classList.remove('hidden');
        }
      });
    });
  }

  // ─── Languages Tab ─────────────────────────────────────────────────────────

  renderLanguages(): void {
    if (!this.config) return;

    const container = document.getElementById('languages-list');
    if (!container) return;

    const defaultLang = this.config.language;

    container.innerHTML = this.config.languages.map(lang => `
      <div class="language-item">
        <div class="language-info">
          <span class="language-code">${lang.code}</span>
          <span>${lang.label}</span>
          ${lang.rtl ? '<span class="badge-rtl">RTL</span>' : ''}
          ${lang.code === defaultLang ? '<span class="badge-default">Default</span>' : ''}
        </div>
        <div class="actions">
          <button class="icon-btn" data-action="set-default" data-lang="${lang.code}" title="Set as default" aria-label="Set ${lang.label} as default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          </button>
          <button class="icon-btn icon-btn--danger" data-action="remove" data-lang="${lang.code}" title="Remove language" aria-label="Remove ${lang.label}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-action="set-default"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).dataset.lang;
        if (lang) this.setDefaultLanguage(lang);
      });
    });

    container.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lang = (e.currentTarget as HTMLElement).dataset.lang;
        if (lang) this.removeLanguage(lang);
      });
    });
  }

  async addLanguage(): Promise<void> {
    if (!this.config) return;

    const codeInput  = document.getElementById('new-lang-code')  as HTMLInputElement;
    const labelInput = document.getElementById('new-lang-label') as HTMLInputElement;

    const code  = codeInput.value.trim().toLowerCase();
    const label = labelInput.value.trim();

    if (!code || !label) {
      this.showStatus('Please enter both a code and a label', 'error');
      return;
    }
    if (!/^[a-z]{2,8}$/.test(code)) {
      this.showStatus('Language code must be 2–8 lowercase letters (e.g. "es", "zh-tw")', 'error');
      return;
    }
    if (this.config.languages.find(l => l.code === code)) {
      this.showStatus(`Language code "${code}" already exists`, 'error');
      return;
    }

    const RTL_CODES = new Set(['ar', 'ur', 'he', 'fa', 'yi', 'dv', 'ku']);
    const newLanguage: Language = {
      code,
      label,
      ttsVoice: null,
      rtl: RTL_CODES.has(code),
    };

    this.config.languages.push(newLanguage);
    await this.saveConfig();
    this.renderLanguages();

    codeInput.value  = '';
    labelInput.value = '';
  }

  async removeLanguage(code: string): Promise<void> {
    if (!this.config) return;

    if (this.config.languages.length <= 1) {
      this.showStatus('Cannot remove the last language', 'error');
      return;
    }
    if (this.config.language === code) {
      this.showStatus('Cannot remove the active default language. Set another as default first.', 'error');
      return;
    }

    this.config.languages = this.config.languages.filter(l => l.code !== code);
    await this.saveConfig();
    this.renderLanguages();
  }

  async setDefaultLanguage(code: string): Promise<void> {
    if (!this.config) return;
    this.config.language = code;
    await this.saveConfig();
    this.renderLanguages(); // re-render to update "Default" badge
  }

  // ─── Providers Tab ─────────────────────────────────────────────────────────

  renderProviders(): void {
    if (!this.config) return;

    const activeSelect = document.getElementById('active-provider') as HTMLSelectElement | null;
    if (activeSelect) activeSelect.value = this.config.activeProvider;

    const container = document.getElementById('providers-list');
    if (!container) return;

    container.innerHTML = Object.entries(this.config.providers).map(([key, provider]) => `
      <div class="provider-item">
        <div class="provider-info">
          <div>
            <strong>${provider.name}</strong>
            <div class="provider-model">${provider.model}</div>
          </div>
          <input type="password"
                 class="api-key-input"
                 id="api-key-${key}"
                 placeholder="Enter API key"
                 autocomplete="off"
                 aria-label="${provider.name} API key">
        </div>
        <div class="actions">
          <button class="test-btn" data-provider="${key}" aria-label="Test ${provider.name}">Test</button>
        </div>
      </div>
    `).join('');

    // Set key values programmatically — NOT via HTML attribute (security fix)
    Object.entries(this.config.providers).forEach(([key, provider]) => {
      const input = document.getElementById(`api-key-${key}`) as HTMLInputElement | null;
      if (input) input.value = provider.apiKey;
    });

    container.querySelectorAll('.test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = (e.currentTarget as HTMLElement).dataset.provider;
        if (key) this.testProvider(key);
      });
    });

    container.querySelectorAll('.api-key-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const el  = e.target as HTMLInputElement;
        const key = el.id.replace('api-key-', '');
        this.updateApiKey(key, el.value);
      });
    });
  }

  async updateApiKey(providerKey: string, apiKey: string): Promise<void> {
    if (!this.config?.providers[providerKey]) return;
    this.config.providers[providerKey].apiKey = apiKey;
    await this.saveConfig();
  }

  async testProvider(providerKey: string): Promise<void> {
    const resultEl = document.getElementById('test-result');
    if (!resultEl) return;

    resultEl.classList.remove('hidden');
    resultEl.className = 'status';
    resultEl.textContent = '⏳ Testing provider…';

    // Save the latest API key before testing
    const input = document.getElementById(`api-key-${providerKey}`) as HTMLInputElement | null;
    if (input && this.config?.providers[providerKey]) {
      this.config.providers[providerKey].apiKey = input.value;
      await this.saveConfig();
    }

    chrome.runtime.sendMessage({ action: 'testProvider', providerKey }, (response) => {
      if (chrome.runtime.lastError) {
        resultEl.textContent = `❌ Error: ${chrome.runtime.lastError.message}`;
        resultEl.className = 'status error';
        return;
      }
      if (response?.error) {
        resultEl.textContent = `❌ Error: ${response.error}`;
        resultEl.className = 'status error';
      } else if (response?.result?.success) {
        const preview = (response.result.explanation as string).substring(0, 120);
        resultEl.textContent = `✅ ${preview}…`;
        resultEl.className = 'status success';
      } else {
        resultEl.textContent = '❌ Unexpected response from provider';
        resultEl.className = 'status error';
      }
    });
  }

  // ─── Settings Tab ──────────────────────────────────────────────────────────

  /**
   * Reads settings from config.settings (persisted), not HTML defaults.
   */
  loadSettings(): void {
    if (!this.config?.settings) return;

    const s = this.config.settings;

    const rateSlider = document.getElementById('speech-rate') as HTMLInputElement | null;
    const rateValue  = document.getElementById('speech-rate-value');
    if (rateSlider) {
      rateSlider.value = String(s.speechRate);
      if (rateValue) rateValue.textContent = String(s.speechRate);
    }

    const colorPicker = document.getElementById('highlight-color') as HTMLInputElement | null;
    if (colorPicker) colorPicker.value = s.highlightColor;

    const autoActivate = document.getElementById('auto-activate') as HTMLInputElement | null;
    if (autoActivate) autoActivate.checked = s.autoActivate;

    const voiceGuidance = document.getElementById('voice-guidance') as HTMLInputElement | null;
    if (voiceGuidance) voiceGuidance.checked = s.voiceGuidance;
  }

  async saveSettings(): Promise<void> {
    if (!this.config) return;

    const rateSlider    = document.getElementById('speech-rate')      as HTMLInputElement | null;
    const colorPicker   = document.getElementById('highlight-color')  as HTMLInputElement | null;
    const autoActivate  = document.getElementById('auto-activate')    as HTMLInputElement | null;
    const voiceGuidance = document.getElementById('voice-guidance')   as HTMLInputElement | null;

    const newSettings: Settings = {
      speechRate:     rateSlider    ? parseFloat(rateSlider.value)   : 1.0,
      highlightColor: colorPicker   ? colorPicker.value              : '#3b82f6',
      autoActivate:   autoActivate  ? autoActivate.checked           : false,
      voiceGuidance:  voiceGuidance ? voiceGuidance.checked          : true,
    };

    this.config.settings = newSettings;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'updateSettings', settings: newSettings }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          this.showStatus('Failed to save settings', 'error');
        } else {
          this.showStatus('Settings saved', 'success');
        }
        resolve();
      });
    });
  }

  // ─── Event Listeners ───────────────────────────────────────────────────────

  setupEventListeners(): void {
    // Active provider dropdown
    document.getElementById('active-provider')?.addEventListener('change', (e) => {
      if (this.config) {
        this.config.activeProvider = (e.target as HTMLSelectElement).value;
        this.saveConfig();
      }
    });

    // Add language
    document.getElementById('add-language-btn')?.addEventListener('click', () => this.addLanguage());

    // Save settings
    document.getElementById('save-settings-btn')?.addEventListener('click', () => this.saveSettings());

    // Speech rate live preview
    document.getElementById('speech-rate')?.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      const display = document.getElementById('speech-rate-value');
      if (display) display.textContent = val;
    });

    // Allow Enter key in language inputs
    document.getElementById('new-lang-label')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.addLanguage();
    });
  }

  // ─── Status Toast ──────────────────────────────────────────────────────────

  showStatus(message: string, type: 'success' | 'error' | 'warning'): void {
    let toast = document.getElementById('status-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'status-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'padding:10px 16px',
        'border-radius:8px',
        'font-size:13px',
        'font-weight:500',
        'z-index:10000',
        'max-width:280px',
        'transition:opacity 0.3s ease',
        'color:#fff',
        'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      ].join(';');
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    const colors: Record<string, string> = {
      success: '#10b981',
      error:   '#ef4444',
      warning: '#f59e0b',
    };
    toast.style.background = colors[type] ?? colors.success;

    clearTimeout((toast as any)._timer);
    (toast as any)._timer = setTimeout(() => {
      toast!.style.opacity = '0';
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AdminPanel());
} else {
  new AdminPanel();
}
