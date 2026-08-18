import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Vite yapılandırması tarayıcıda değil Node'da çalışıyor: proxy hedefi
  // process.env'den okunabiliyor (VITE_API_TARGET), tarayıcı globalleri yetmez.
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
])
