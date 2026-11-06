import { AIProvider, ElementData } from '../utils/types';

// Language-specific phrase lookup for prompt construction
// Using a data table instead of 9 duplicated template literals
const LANG_PHRASES: Record<string, { intro: string; typeLabel: string; placeholderLabel: string; closing: string }> = {
  en: {
    intro: 'Explain this web form element in simple, helpful terms',
    typeLabel: 'Type',
    placeholderLabel: 'Placeholder',
    closing: 'Provide a brief, clear explanation of what this field is for and how to fill it correctly.',
  },
  ar: {
    intro: 'اشرح عنصر نموذج الويب هذا بعبارات بسيطة ومفيدة',
    typeLabel: 'النوع',
    placeholderLabel: 'النص التوضيحي',
    closing: 'قدم شرحًا موجزًا وواضحًا عن الغرض من هذا الحقل وكيفية ملئه بشكل صحيح.',
  },
  hi: {
    intro: 'इस वेब फॉर्म एलिमेंट को सरल, उपयोगी शब्दों में समझाएं',
    typeLabel: 'प्रकार',
    placeholderLabel: 'प्लेसहोल्डर',
    closing: 'इस फ़ील्ड का उद्देश्य और इसे सही तरीके से कैसे भरना है, इसकी संक्षिप्त, स्पष्ट व्याख्या प्रदान करें।',
  },
  ur: {
    intro: 'اس ویب فارم کے عنصر کو سادہ، مفید الفاظ میں سمجھائیں',
    typeLabel: 'قسم',
    placeholderLabel: 'پلیس ہولڈر',
    closing: 'اس فیلڈ کا مقصد اور اسے صحیح طریقے سے کیسے بھرنا ہے، اس کی مختصر، واضح وضاحت فراہم کریں۔',
  },
  es: {
    intro: 'Explique este elemento del formulario web en términos simples y útiles',
    typeLabel: 'Tipo',
    placeholderLabel: 'Marcador de posición',
    closing: 'Proporcione una explicación breve y clara de para qué sirve este campo y cómo completarlo correctamente.',
  },
  fr: {
    intro: 'Expliquez cet élément de formulaire web en termes simples et utiles',
    typeLabel: 'Type',
    placeholderLabel: 'Placeholder',
    closing: 'Fournissez une explication brève et claire de la fonction de ce champ et de la manière de le remplir correctement.',
  },
  de: {
    intro: 'Erklären Sie dieses Webformularelement in einfachen, hilfreichen Begriffen',
    typeLabel: 'Typ',
    placeholderLabel: 'Platzhalter',
    closing: 'Geben Sie eine kurze, klare Erklärung dafür, wofür dieses Feld gedacht ist und wie es richtig ausgefüllt wird.',
  },
  ja: {
    intro: 'このWebフォーム要素をシンプルで役立つ言葉で説明してください',
    typeLabel: 'タイプ',
    placeholderLabel: 'プレースホルダー',
    closing: 'このフィールドの目的と正しい入力方法について、簡潔で明確な説明を提供してください。',
  },
  ko: {
    intro: '이 웹 폼 요소를 간단하고 유용한 용어로 설명하세요',
    typeLabel: '유형',
    placeholderLabel: '플레이스홀더',
    closing: '이 필드의 용도와 올바른 작성 방법에 대한 간결하고 명확한 설명을 제공하세요.',
  },
};

export class AIProviderManager {

  async getExplanation(
    elementData: ElementData,
    language: string,
    providerConfig: AIProvider,
    providerKey: string
  ): Promise<string> {
    const prompt = this.buildPrompt(elementData, language);

    // Route on stable config key, not display name (avoids rename fragility)
    switch (providerKey) {
      case 'openai':
      case 'groq':
        return await this.callOpenAIFormat(prompt, providerConfig);
      case 'gemini':
        return await this.callGemini(prompt, providerConfig);
      case 'claude':
        return await this.callClaude(prompt, providerConfig);
      default:
        throw new Error(`Unsupported provider: ${providerKey}`);
    }
  }

  // ─── API Integrations (using fetch — no external dependencies) ────────────

  private async callOpenAIFormat(prompt: string, provider: AIProvider): Promise<string> {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any;
      throw new Error(`OpenAI API error: ${err?.error?.message ?? response.statusText}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content.trim();
  }

  private async callGemini(prompt: string, provider: AIProvider): Promise<string> {
    const url = `${provider.endpoint}?key=${provider.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any;
      throw new Error(`Gemini API error: ${err?.error?.message ?? response.statusText}`);
    }

    const data = await response.json() as any;
    return data.candidates[0].content.parts[0].text.trim();
  }

  private async callClaude(prompt: string, provider: AIProvider): Promise<string> {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any;
      throw new Error(`Claude API error: ${err?.error?.message ?? response.statusText}`);
    }

    const data = await response.json() as any;
    return data.content[0].text.trim();
  }

  // ─── Prompt Builder ────────────────────────────────────────────────────────

  private buildPrompt(elementData: ElementData, language: string): string {
    const phrases = LANG_PHRASES[language] ?? LANG_PHRASES['en'];

    // Sanitize inputs to prevent prompt injection
    const safeLabel = this.sanitizeInput(elementData.label);
    const safeType = this.sanitizeInput(elementData.type || elementData.tagName);
    const safePlaceholder = elementData.placeholder
      ? this.sanitizeInput(elementData.placeholder)
      : null;

    const placeholderPart = safePlaceholder
      ? `${phrases.placeholderLabel}: "${safePlaceholder}". `
      : '';

    return (
      `${phrases.intro}: "${safeLabel}". ` +
      `${phrases.typeLabel}: ${safeType}. ` +
      `${placeholderPart}` +
      `${phrases.closing}`
    );
  }

  /**
   * Strip characters that could be used for prompt injection.
   * Removes backticks, angle brackets, and control characters.
   */
  private sanitizeInput(input: string): string {
    return input
      .replace(/[`<>]/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .substring(0, 200) // cap length
      .trim();
  }
}
