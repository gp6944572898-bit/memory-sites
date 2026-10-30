// IMPORTANT (Macaly agent): Do not change or remove anything in this file unless you 100% understand it.
// This config wires up Macaly-specific behavior (Visual Edits tagger, allowed hosts, dev build, prerender).
// Modifying it without full understanding can break Macaly app functionality for the user.

import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import errorOverlay from "@visulima/vite-overlay"

const config = defineConfig({
  ...(process.env.DEV_BUILD && {
    build: {
      target: 'esnext',
      minify: false,
      cssMinify: false,
      sourcemap: false,
      reportCompressedSize: false,
      modulePreload: {
        polyfill: false,
      },
    },
  }),
  plugins: [
    devtools({ injectSource: { enabled: false } }),
    errorOverlay({
      forwardConsole: true,
      forwardedConsoleMethods: ["error", "warn"],
    }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        // Keep prerender enabled for DEV_BUILD (preview) otherwise preview will not work!
        enabled: !!process.env.DEV_BUILD,
        autoSubfolderIndex: true,
        autoStaticPathsDiscovery: true,
        crawlLinks: false,
        failOnError: true,
      },
    }),
    // IMPORTANT: Do not remove nitro() — required for production build. Do NOT create nitro.config.ts; it breaks both production and preview builds.
    nitro(),
    viteReact(),
  ],
})

export default config
