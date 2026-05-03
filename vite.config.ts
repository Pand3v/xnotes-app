import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'inline',
        includeAssets: ['icon-192.png', 'icon-512.png', 'icon.svg'],
        manifestFilename: 'manifest.json',
        manifest: {
          id: 'com.xnotes.app',
          name: 'xnotes',
          short_name: 'xnotes',
          description: 'Modern Neon Notes App',
          start_url: '/',
          scope: '/',
          theme_color: '#FF1744',
          background_color: '#0A0A0E',
          display: 'standalone',
          orientation: 'portrait',
          lang: 'pt-BR',
          dir: 'ltr',
          categories: ['productivity', 'utilities'],
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          screenshots: [
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              form_factor: 'wide',
              label: 'xnotes Desktop'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'xnotes Mobile'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
