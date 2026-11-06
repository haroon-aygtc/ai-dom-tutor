// AI Provider interface
export interface AIProvider {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  supportedLanguages: string[];
}

// Language interface
export interface Language {
  code: string;
  label: string;
  ttsVoice: string | null;
  rtl: boolean;
}

// Settings interface (separate from provider config)
export interface Settings {
  speechRate: number;
  highlightColor: string;
  autoActivate: boolean;
  voiceGuidance: boolean;
}

// Configuration interface
export interface Config {
  activeProvider: string;
  language: string;
  providers: Record<string, AIProvider>;
  languages: Language[];
  settings: Settings;
}

// Element data interface
export interface ElementData {
  tagName: string;
  type: string;
  label: string;
  placeholder: string;
  name: string;
  id: string;
  // value intentionally omitted — never send user input to AI (privacy/security)
}

// Message request interface
export interface MessageRequest {
  action: string;
  config?: Partial<Config>;
  settings?: Partial<Settings>;
  elementData?: ElementData;
  language?: string;
  providerKey?: string;
}

// Message response interface
export interface MessageResponse {
  success?: boolean;
  error?: string;
  explanation?: string;
  config?: Config;
  result?: any;
}
