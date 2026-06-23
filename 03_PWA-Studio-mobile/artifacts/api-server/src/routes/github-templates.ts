export interface TemplateContext {
  name: string;
  slug: string;
  description: string;
}

export interface TemplateFile {
  path: string;
  content: string;
}

const GITIGNORE = `# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
dist-ssr/
*.local

# Editor
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store

# Env
.env
.env.local
.env.*.local
`;

function pwaManifest(ctx: TemplateContext): string {
  return JSON.stringify(
    {
      name: ctx.name,
      short_name: ctx.slug,
      description: ctx.description,
      theme_color: "#6366f1",
      background_color: "#ffffff",
      display: "standalone",
      scope: "/",
      start_url: "/",
      icons: [
        { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
    null,
    2,
  );
}

// ─── React + Vite + Tailwind + PWA ───────────────────────────────────────────
function buildReactPwa(ctx: TemplateContext): TemplateFile[] {
  const { name, slug, description } = ctx;
  return [
    { path: ".gitignore", content: GITIGNORE },
    {
      path: "README.md",
      content: `# ${name}

${description}

## Stack

- ⚛️  React 18 + TypeScript
- ⚡ Vite 6
- 🎨 Tailwind CSS 3
- 📱 PWA via \`vite-plugin-pwa\`

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build   # produces dist/
npm run preview # serves the built PWA locally
\`\`\`

---
Scaffolded by [APP Studio](https://github.com)
`,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            preview: "vite preview",
          },
          dependencies: {
            react: "^18.3.1",
            "react-dom": "^18.3.1",
          },
          devDependencies: {
            "@types/react": "^18.3.12",
            "@types/react-dom": "^18.3.1",
            "@vitejs/plugin-react": "^4.3.4",
            autoprefixer: "^10.4.20",
            postcss: "^8.4.47",
            tailwindcss: "^3.4.16",
            typescript: "~5.7.2",
            vite: "^6.0.3",
            "vite-plugin-pwa": "^0.21.1",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            isolatedModules: true,
            moduleDetection: "force",
            noEmit: true,
            jsx: "react-jsx",
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: '${name}',
        short_name: '${slug}',
        description: '${description}',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
`,
    },
    {
      path: "tailwind.config.js",
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
`,
    },
    {
      path: "postcss.config.js",
      content: `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
`,
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#6366f1" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "src/vite-env.d.ts",
      content: `/// <reference types="vite/client" />\n/// <reference types="vite-plugin-pwa/client" />\n`,
    },
    {
      path: "src/main.tsx",
      content: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
    },
    {
      path: "src/App.tsx",
      content: `import './App.css'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="max-w-lg w-full space-y-6 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          ${name}
        </h1>
        <p className="text-gray-500 text-xl leading-relaxed">
          ${description}
        </p>
        <p className="text-sm text-indigo-500 font-medium">
          ⚡ React · Vite · Tailwind · PWA
        </p>
      </div>
    </div>
  )
}
`,
    },
    { path: "src/App.css", content: `/* Component styles */\n` },
    {
      path: "src/index.css",
      content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n*, *::before, *::after { box-sizing: border-box; }\nhtml, body { margin: 0; padding: 0; }\n`,
    },
    { path: "public/manifest.json", content: pwaManifest(ctx) },
  ];
}

// ─── PWABuilder pwa-starter (Lit + TypeScript) ───────────────────────────────
function buildPwaStarter(ctx: TemplateContext): TemplateFile[] {
  const { name, slug, description } = ctx;
  return [
    { path: ".gitignore", content: GITIGNORE },
    {
      path: "README.md",
      content: `# ${name}

${description}

## Stack

- 🔥 Lit 3 Web Components
- ⚡ Vite 6
- 📱 PWA via \`vite-plugin-pwa\` (PWABuilder pwa-starter pattern)

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
npm run preview
\`\`\`

---
Scaffolded by [APP Studio](https://github.com) using the [PWABuilder pwa-starter](https://github.com/pwa-builder/pwa-starter) pattern
`,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            preview: "vite preview",
          },
          dependencies: {
            lit: "^3.2.1",
          },
          devDependencies: {
            typescript: "~5.7.2",
            vite: "^6.0.3",
            "vite-plugin-pwa": "^0.21.1",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2021",
            useDefineForClassFields: false,
            lib: ["ES2021", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            isolatedModules: true,
            moduleDetection: "force",
            noEmit: true,
            strict: true,
            experimentalDecorators: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: '${name}',
        short_name: '${slug}',
        description: '${description}',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
`,
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#6366f1" />
    <title>${name}</title>
    <link rel="stylesheet" href="/src/styles/global.css" />
  </head>
  <body>
    <app-index></app-index>
    <script type="module" src="/src/app-index.ts"></script>
  </body>
</html>
`,
    },
    {
      path: "src/app-index.ts",
      content: `import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('app-index')
export class AppIndex extends LitElement {
  static styles = css\`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f0f0ff 0%, #fff 50%, #f5f0ff 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 3rem;
      max-width: 480px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.07);
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: #0f0f1a;
      margin: 0 0 0.75rem;
    }
    p {
      color: #64748b;
      font-size: 1.1rem;
      margin: 0 0 2rem;
      line-height: 1.6;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 1rem;
      background: #f0f0ff;
      color: #4040e0;
      border-radius: 99px;
      font-size: 0.875rem;
      font-weight: 600;
    }
  \`

  render() {
    return html\`
      <div class="card">
        <h1>${name}</h1>
        <p>${description}</p>
        <span class="badge">⚡ PWABuilder Starter</span>
      </div>
    \`
  }
}
`,
    },
    {
      path: "src/styles/global.css",
      content: `*, *::before, *::after { box-sizing: border-box; }\nhtml, body { margin: 0; padding: 0; }\n`,
    },
    { path: "public/manifest.json", content: pwaManifest(ctx) },
  ];
}

// ─── Vue 3 + Vite + PWA ──────────────────────────────────────────────────────
function buildVuePwa(ctx: TemplateContext): TemplateFile[] {
  const { name, slug, description } = ctx;
  return [
    { path: ".gitignore", content: GITIGNORE },
    {
      path: "README.md",
      content: `# ${name}\n\n${description}\n\n## Stack\n\n- 💚 Vue 3 + TypeScript\n- ⚡ Vite 6\n- 📱 PWA via \`vite-plugin-pwa\`\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n---\nScaffolded by [APP Studio](https://github.com)\n`,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "vue-tsc -b && vite build",
            preview: "vite preview",
          },
          dependencies: { vue: "^3.5.13" },
          devDependencies: {
            "@vitejs/plugin-vue": "^5.2.1",
            typescript: "~5.7.2",
            vite: "^6.0.3",
            "vite-plugin-pwa": "^0.21.1",
            "vue-tsc": "^2.2.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            isolatedModules: true,
            moduleDetection: "force",
            noEmit: true,
            jsx: "preserve",
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
          },
          include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: '${name}',
        short_name: '${slug}',
        description: '${description}',
        theme_color: '#42b883',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
`,
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#42b883" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    },
    {
      path: "src/main.ts",
      content: `import { createApp } from 'vue'\nimport './style.css'\nimport App from './App.vue'\n\ncreateApp(App).mount('#app')\n`,
    },
    {
      path: "src/App.vue",
      content: `<template>
  <main class="container">
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
    <p class="badge">💚 Vue 3 · Vite · PWA</p>
  </main>
</template>

<script setup lang="ts">
const title = '${name}'
const description = '${description}'
<\/script>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
h1 { font-size: 3rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 0.5rem; }
p { color: #64748b; font-size: 1.1rem; }
.badge { font-size: 0.875rem; color: #42b883; font-weight: 600; }
</style>
`,
    },
    {
      path: "src/style.css",
      content: `*, *::before, *::after { box-sizing: border-box; }\nhtml, body { margin: 0; padding: 0; }\n`,
    },
    { path: "public/manifest.json", content: pwaManifest(ctx) },
  ];
}

// ─── Svelte + Vite + PWA ─────────────────────────────────────────────────────
function buildSveltePwa(ctx: TemplateContext): TemplateFile[] {
  const { name, slug, description } = ctx;
  return [
    { path: ".gitignore", content: GITIGNORE },
    {
      path: "README.md",
      content: `# ${name}\n\n${description}\n\n## Stack\n\n- 🔴 Svelte 5 + TypeScript\n- ⚡ Vite 6\n- 📱 PWA via \`vite-plugin-pwa\`\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n---\nScaffolded by [APP Studio](https://github.com)\n`,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
          },
          dependencies: { svelte: "^5.16.0" },
          devDependencies: {
            "@sveltejs/vite-plugin-svelte": "^5.0.0",
            typescript: "~5.7.2",
            vite: "^6.0.3",
            "vite-plugin-pwa": "^0.21.1",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            isolatedModules: true,
            noEmit: true,
            strict: true,
          },
          include: ["src/**/*.ts", "src/**/*.svelte"],
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: '${name}',
        short_name: '${slug}',
        description: '${description}',
        theme_color: '#ff3e00',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
`,
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ff3e00" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    },
    {
      path: "src/main.ts",
      content: `import { mount } from 'svelte'\nimport './app.css'\nimport App from './App.svelte'\n\nmount(App, { target: document.getElementById('app')! })\n`,
    },
    {
      path: "src/App.svelte",
      content: `<script lang="ts">
  const title = '${name}'
  const description = '${description}'
<\/script>

<main>
  <h1>{title}</h1>
  <p>{description}</p>
  <p class="badge">🔴 Svelte · Vite · PWA</p>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #fff5f2 0%, #fff 50%, #fff5f0 100%);
  }
  h1 { font-size: 3rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 0.5rem; color: #0f0f1a; }
  p { color: #64748b; font-size: 1.1rem; }
  .badge { font-size: 0.875rem; color: #ff3e00; font-weight: 600; }
</style>
`,
    },
    {
      path: "src/app.css",
      content: `*, *::before, *::after { box-sizing: border-box; }\nhtml, body { margin: 0; padding: 0; }\n`,
    },
    { path: "public/manifest.json", content: pwaManifest(ctx) },
  ];
}

// ─── Router ───────────────────────────────────────────────────────────────────
export function buildTemplate(
  framework: string,
  ctx: TemplateContext,
): TemplateFile[] {
  switch (framework) {
    case "pwa-starter":
      return buildPwaStarter(ctx);
    case "vue-vite-pwa":
      return buildVuePwa(ctx);
    case "svelte-vite-pwa":
      return buildSveltePwa(ctx);
    case "react-vite-pwa":
    default:
      return buildReactPwa(ctx);
  }
}
