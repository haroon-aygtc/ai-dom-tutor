# AI DOM Tutor

A multilingual browser extension that provides real-time AI-powered assistance for web form elements. The extension helps users understand the purpose and proper usage of form fields through contextual explanations, visual highlighting, and text-to-speech functionality.

## Features

- **Multilingual AI-powered explanations** in 9 languages (English, Arabic, Hindi, Urdu, Spanish, French, German, Japanese, Korean)
- **Visual element highlighting** with customizable colors
- **Text-to-speech functionality** with adjustable speech rate
- **Multiple AI provider support** (OpenAI, Google Gemini, Anthropic Claude, Groq)
- **Language translation capabilities** with RTL (Right-to-Left) support
- **Real-time DOM interaction** with form elements
- **Comprehensive admin panel** for configuration

## Technology Stack

- **TypeScript** for type-safe development
- **Manifest V3** browser extension API
- **Chrome Extension APIs** for storage and messaging
- **Web Speech API** for text-to-speech
- **Modern CSS** with animations and responsive design

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ai-dom-tutor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

### Loading the Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `dist` folder generated during build

## Configuration

### AI Providers

The extension supports multiple AI providers:

1. **OpenAI** - GPT-3.5-turbo model
2. **Google Gemini** - Gemini Pro model
3. **Anthropic Claude** - Claude 3 Sonnet model
4. **Groq** - Llama3 70b model

To configure a provider:
1. Click the extension icon to open the admin panel
2. Navigate to the "AI Providers" tab
3. Enter your API key for the desired provider
4. Select the provider as active
5. Test the provider configuration

### Languages

The extension supports 9 languages with automatic RTL support for Arabic and Urdu. You can add custom languages through the admin panel.

## Usage

1. Navigate to any webpage with form elements
2. Click the floating AI Tutor button in the bottom-right corner
3. Select your preferred language from the dropdown
4. Click the button to activate tutoring
5. Focus on any form element (input, select, textarea, button)
6. Receive an AI-generated explanation via tooltip and voice

## Development

### Project Structure

```
ai-dom-tutor/
├── src/                    # Source files
│   ├── background/         # Background service worker
│   ├── content/            # Content scripts and styles
│   ├── popup/              # Admin panel interface
│   ├── providers/          # AI provider integration
│   ├── utils/              # Utility functions and types
│   └── manifest.json       # Extension manifest
├── dist/                   # Built extension files
├── package.json            # NPM package configuration
├── tsconfig.json           # TypeScript configuration
└── build.js                # Build script
```

### Scripts

- `npm run build` - Compile TypeScript and build the extension
- `npm run dev` - Compile TypeScript in watch mode

## API Integration

The extension integrates with multiple AI service providers through their respective REST APIs:

- OpenAI Chat Completions API
- Google Gemini API
- Anthropic Messages API
- Groq Chat Completions API

## Security

- All API keys are stored locally in Chrome storage
- No user data or browsing history is collected or transmitted
- Direct communication with AI provider endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.