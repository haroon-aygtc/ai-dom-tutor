import { Config, ElementData, Settings } from '../utils/types';

// Elements that should never be explained (security + relevance)
const SKIP_INPUT_TYPES = new Set(['password', 'hidden', 'submit', 'reset', 'button', 'image', 'file']);
// Tags we actually care about for form assistance
const INTERACTIVE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

class DOMTutorEngine {
  private config: Config | null = null;
  private isActive: boolean = false;
  private currentTooltip: HTMLElement | null = null;
  private launcher: HTMLElement | null = null;
  private explainDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    await this.loadConfig();
    this.injectFloatingButton();
    this.setupEventListeners();

    // Auto-activate if the user configured it
    if (this.config?.settings?.autoActivate) {
      this.toggleTutor(true);
    }
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[AI DOM Tutor] Could not load config:', chrome.runtime.lastError.message);
          resolve();
          return;
        }
        this.config = response?.config ?? null;
        resolve();
      });
    });
  }

  private getSettings(): Settings {
    return this.config?.settings ?? {
      speechRate: 1.0,
      highlightColor: '#3b82f6',
      autoActivate: false,
      voiceGuidance: true,
    };
  }

  // ─── Floating Button ───────────────────────────────────────────────────────

  injectFloatingButton(): void {
    document.getElementById('ai-tutor-launcher')?.remove();

    if (!this.config?.languages?.length) {
      console.warn('[AI DOM Tutor] No languages in config — button not injected');
      return;
    }

    const launcher = document.createElement('div');
    launcher.id = 'ai-tutor-launcher';
    launcher.className = 'ai-tutor-launcher';
    launcher.setAttribute('role', 'complementary');
    launcher.setAttribute('aria-label', 'AI DOM Tutor');

    const languageOptions = this.config.languages
      .map(lang => `<div class="language-option" data-lang="${lang.code}" role="menuitem" tabindex="0">${lang.label}</div>`)
      .join('');

    launcher.innerHTML = `
      <button class="tutor-btn" aria-label="AI Tutor — click to select language" aria-haspopup="true" aria-expanded="false">
        <svg class="tutor-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      </button>
      <div class="language-dropdown hidden" role="menu" aria-label="Select language">
        ${languageOptions}
      </div>
    `;

    document.body.appendChild(launcher);
    this.launcher = launcher;
    this.setupButtonEvents();
  }

  setupButtonEvents(): void {
    if (!this.launcher) return;

    const button = this.launcher.querySelector('.tutor-btn') as HTMLButtonElement;
    const dropdown = this.launcher.querySelector('.language-dropdown') as HTMLElement;

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      dropdown.classList.toggle('hidden', isOpen);
      button.setAttribute('aria-expanded', String(!isOpen));
    });

    dropdown.querySelectorAll('.language-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedLang = (e.target as HTMLElement).getAttribute('data-lang');
        if (selectedLang && this.config) {
          this.config.language = selectedLang;
          // Persist the language choice back to storage
          chrome.runtime.sendMessage({
            action: 'updateConfig',
            config: { language: selectedLang }
          });
          this.toggleTutor(true);
          dropdown.classList.add('hidden');
          button.setAttribute('aria-expanded', 'false');
        }
      });

      // Keyboard support for dropdown items
      option.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          (option as HTMLElement).click();
        }
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  // ─── Event Listeners ───────────────────────────────────────────────────────

  setupEventListeners(): void {
    document.addEventListener('focus', this.handleElementFocus.bind(this), true);
    document.addEventListener('blur',  this.handleElementBlur.bind(this),  true);
  }

  private handleElementFocus(event: FocusEvent): void {
    if (!this.isActive || !this.config) return;

    const element = event.target as HTMLElement;
    if (!this.isExplainableElement(element)) return;

    // Debounce: wait 350ms before firing API call (prevents spam on tab-through)
    if (this.explainDebounceTimer) clearTimeout(this.explainDebounceTimer);
    this.explainDebounceTimer = setTimeout(() => {
      this.highlightAndExplain(element).catch(err => {
        this.showTooltip(element, `⚠️ ${(err as Error).message}`, true);
      });
    }, 350);
  }

  private handleElementBlur(_event: FocusEvent): void {
    if (this.explainDebounceTimer) {
      clearTimeout(this.explainDebounceTimer);
      this.explainDebounceTimer = null;
    }
    this.removeHighlight();
    this.hideTooltip();
  }

  /**
   * Only explain actual form controls — not every focusable element on the page.
   * Skips password/hidden/submit inputs for security and relevance.
   */
  private isExplainableElement(element: HTMLElement): boolean {
    if (!INTERACTIVE_TAGS.has(element.tagName)) return false;
    if (element.tagName === 'INPUT') {
      const type = ((element as HTMLInputElement).type || 'text').toLowerCase();
      if (SKIP_INPUT_TYPES.has(type)) return false;
    }
    return true;
  }

  // ─── Highlight & Explain ───────────────────────────────────────────────────

  private async highlightAndExplain(element: HTMLElement): Promise<void> {
    this.highlightElement(element);

    const elementData = this.extractElementData(element);
    const explanation = await this.getAIExplanation(elementData);

    const isRtl = this.config?.languages.find(l => l.code === this.config?.language)?.rtl ?? false;
    this.showTooltip(element, explanation, isRtl);

    if (this.getSettings().voiceGuidance) {
      this.speakExplanation(explanation);
    }
  }

  private highlightElement(element: HTMLElement): void {
    this.removeHighlight();
    const color = this.getSettings().highlightColor;
    element.classList.add('ai-tutor-highlight');
    element.style.setProperty('--highlight-color', color, 'important');
  }

  private removeHighlight(): void {
    const highlighted = document.querySelector('.ai-tutor-highlight');
    if (highlighted) {
      highlighted.classList.remove('ai-tutor-highlight');
      (highlighted as HTMLElement).style.removeProperty('--highlight-color');
    }
  }

  // ─── Element Data Extraction ───────────────────────────────────────────────

  private extractElementData(element: HTMLElement): ElementData {
    return {
      tagName: element.tagName,
      type: (element as HTMLInputElement).type || '',
      label: this.getElementLabel(element),
      placeholder: (element as HTMLInputElement).placeholder || '',
      name: (element as HTMLInputElement).name || '',
      id: element.id || '',
      // value is intentionally NOT collected — privacy protection
    };
  }

  private getElementLabel(element: HTMLElement): string {
    const inputEl = element as HTMLInputElement;

    // 1. Prefer explicit label associations
    if (inputEl.labels && inputEl.labels.length > 0) {
      const text = inputEl.labels[0].textContent?.trim();
      if (text) return text;
    }

    // 2. label[for=id]
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      const text = label?.textContent?.trim();
      if (text) return text;
    }

    // 3. aria-label
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;

    // 4. aria-labelledby
    const labelledById = element.getAttribute('aria-labelledby');
    if (labelledById) {
      const text = document.getElementById(labelledById)?.textContent?.trim();
      if (text) return text;
    }

    // 5. Fallback chain
    return inputEl.placeholder || inputEl.name || inputEl.type || element.tagName.toLowerCase();
  }

  // ─── AI Explanation ────────────────────────────────────────────────────────

  private getAIExplanation(elementData: ElementData): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.config) {
        reject(new Error('Configuration not loaded'));
        return;
      }

      chrome.runtime.sendMessage(
        { action: 'getAIExplanation', elementData, language: this.config.language },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response?.explanation ?? '');
          }
        }
      );
    });
  }

  // ─── Tooltip ───────────────────────────────────────────────────────────────

  private showTooltip(element: HTMLElement, text: string, isRtl: boolean = false): void {
    this.hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'ai-tutor-tooltip';
    tooltip.textContent = text;
    tooltip.setAttribute('role', 'tooltip');
    if (isRtl) tooltip.setAttribute('data-rtl', 'true');

    // Position relative to viewport, accounting for scroll
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let top = rect.bottom + scrollY + 8;
    let left = rect.left + scrollX;

    // Keep tooltip within viewport width
    const maxLeft = window.innerWidth - 320;
    left = Math.max(8, Math.min(left, maxLeft));

    // If tooltip would go below viewport, show above element instead
    if (rect.bottom + 120 > window.innerHeight) {
      top = rect.top + scrollY - 120;
      tooltip.classList.add('ai-tutor-tooltip--above');
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;
  }

  private hideTooltip(): void {
    this.currentTooltip?.remove();
    this.currentTooltip = null;
  }

  // ─── Text-to-Speech ────────────────────────────────────────────────────────

  private speakExplanation(explanation: string): void {
    if (!('speechSynthesis' in window) || !this.config) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(explanation);
    utterance.lang = this.config.language;
    utterance.rate = this.getSettings().speechRate;

    // Use configured voice if one was set for this language
    const langConfig = this.config.languages.find(l => l.code === this.config?.language);
    if (langConfig?.ttsVoice) {
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === langConfig.ttsVoice);
      if (voice) utterance.voice = voice;
    }

    speechSynthesis.speak(utterance);
  }

  // ─── Toggle ────────────────────────────────────────────────────────────────

  private toggleTutor(active: boolean): void {
    this.isActive = active;

    if (this.launcher) {
      this.launcher.classList.toggle('active', active);
      const btn = this.launcher.querySelector('.tutor-btn') as HTMLButtonElement | null;
      if (btn) btn.setAttribute('aria-pressed', String(active));
    }

    if (!active) {
      this.removeHighlight();
      this.hideTooltip();
      speechSynthesis.cancel();
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DOMTutorEngine());
} else {
  new DOMTutorEngine();
}
