import { AIProviderManager } from '../providers/provider-manager';
import { Config, ElementData, MessageRequest, MessageResponse, Settings } from '../utils/types';

const DEFAULT_SETTINGS: Settings = {
  speechRate: 1.0,
  highlightColor: '#3b82f6',
  autoActivate: false,
  voiceGuidance: true,
};

const DEFAULT_CONFIG: Config = {
  activeProvider: 'openai',
  language: 'en',
  settings: DEFAULT_SETTINGS,
  providers: {
    openai: {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-3.5-turbo',
      apiKey: '',
      supportedLanguages: ['en', 'ar', 'hi', 'ur', 'es', 'fr', 'de'],
    },
    gemini: {
      name: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
      model: 'gemini-pro',
      apiKey: '',
      supportedLanguages: ['en', 'ar', 'hi', 'ur', 'es', 'fr', 'de', 'ja', 'ko'],
    },
    claude: {
      name: 'Anthropic Claude',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-sonnet-20240229',
      apiKey: '',
      supportedLanguages: ['en', 'ar', 'hi', 'ur', 'es', 'fr', 'de'],
    },
    groq: {
      name: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama3-70b-8192',
      apiKey: '',
      supportedLanguages: ['en', 'ar', 'hi', 'ur', 'es', 'fr', 'de'],
    },
  },
  languages: [
    { code: 'en', label: 'English',  ttsVoice: null, rtl: false },
    { code: 'ar', label: 'Arabic',   ttsVoice: null, rtl: true  },
    { code: 'hi', label: 'Hindi',    ttsVoice: null, rtl: false },
    { code: 'ur', label: 'Urdu',     ttsVoice: null, rtl: true  },
    { code: 'es', label: 'Spanish',  ttsVoice: null, rtl: false },
    { code: 'fr', label: 'French',   ttsVoice: null, rtl: false },
    { code: 'de', label: 'German',   ttsVoice: null, rtl: false },
    { code: 'ja', label: 'Japanese', ttsVoice: null, rtl: false },
    { code: 'ko', label: 'Korean',   ttsVoice: null, rtl: false },
  ],
};

class BackgroundService {
  private config: Config;
  private aiProviderManager: AIProviderManager;

  constructor() {
    // Start with a full valid default so no window exists where config is broken
    this.config = structuredClone(DEFAULT_CONFIG);
    this.aiProviderManager = new AIProviderManager();
    this.init();
  }

  async init(): Promise<void> {
    await this.loadConfig();
    this.setupMessageHandlers();
  }

  // ─── Config Persistence ────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['config']);
      if (result.config) {
        // Deep merge: preserve defaults for any missing nested keys
        this.config = this.deepMerge(structuredClone(DEFAULT_CONFIG), result.config);
      } else {
        await this.saveConfig();
      }
    } catch (error) {
      console.error('[AI DOM Tutor] Error loading config:', error);
      // Keep the default config already set in constructor
    }
  }

  async saveConfig(): Promise<void> {
    try {
      await chrome.storage.sync.set({ config: this.config });
    } catch (error) {
      console.error('[AI DOM Tutor] Error saving config:', error);
    }
  }

  /**
   * Deep merge: source values override target, but missing keys fall back to target.
   * Ensures stored configs from older versions still work after adding new fields.
   */
  private deepMerge(target: any, source: any): any {
    if (typeof source !== 'object' || source === null) return source;
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null
      ) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // ─── Message Handlers ──────────────────────────────────────────────────────

  setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener(
      (request: MessageRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {

        switch (request.action) {

          case 'getConfig':
            sendResponse({ config: this.config });
            return false; // synchronous

          case 'updateConfig':
            if (request.config) {
              this.config = this.deepMerge(this.config, request.config);
            }
            this.saveConfig().then(() => sendResponse({ success: true }));
            return true; // async

          case 'updateSettings':
            if (request.settings) {
              this.config.settings = { ...this.config.settings, ...request.settings };
            }
            this.saveConfig().then(() => sendResponse({ success: true }));
            return true;

          case 'getAIExplanation':
            this.getAIExplanation(request.elementData!, request.language!)
              .then(explanation => sendResponse({ explanation }))
              .catch(error => sendResponse({ error: (error as Error).message }));
            return true;

          case 'testProvider':
            this.testProvider(request.providerKey!)
              .then(result => sendResponse({ result }))
              .catch(error => sendResponse({ error: (error as Error).message }));
            return true;

          default:
            sendResponse({ error: `Unknown action: ${request.action}` });
            return false;
        }
      }
    );
  }

  // ─── AI Explanation ────────────────────────────────────────────────────────

  async getAIExplanation(elementData: ElementData, language: string): Promise<string> {
    const providerKey = this.config.activeProvider;
    const provider = this.config.providers[providerKey];

    if (!provider) {
      throw new Error(`Provider "${providerKey}" not found in configuration.`);
    }
    if (!provider.apiKey) {
      throw new Error('AI provider not configured. Please add your API key in the extension settings.');
    }

    try {
      return await this.aiProviderManager.getExplanation(elementData, language, provider, providerKey);
    } catch (error) {
      console.error('[AI DOM Tutor] AI explanation error:', error);
      throw new Error(`Failed to get explanation: ${(error as Error).message}`);
    }
  }

  // ─── Provider Test ─────────────────────────────────────────────────────────

  async testProvider(providerKey: string): Promise<{ success: boolean; message: string; explanation: string }> {
    const provider = this.config.providers[providerKey];

    if (!provider) {
      throw new Error(`Provider "${providerKey}" not found.`);
    }
    if (!provider.apiKey) {
      throw new Error('API key not configured for this provider.');
    }

    const testElementData: ElementData = {
      label: 'Email Address',
      type: 'email',
      placeholder: 'Enter your email',
      tagName: 'INPUT',
      name: 'email',
      id: 'email-field',
    };

    const explanation = await this.aiProviderManager.getExplanation(
      testElementData,
      this.config.language,
      provider,
      providerKey
    );

    return {
      success: true,
      message: 'Provider test successful',
      explanation,
    };
  }
}

// Initialize the background service
const backgroundService = new BackgroundService();

export { backgroundService, BackgroundService };
