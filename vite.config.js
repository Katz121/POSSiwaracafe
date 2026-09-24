import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vendor chunking. The important split is Firestore (full SDK, ~95 KB gzip)
// vs app/auth/functions: the customer pages (/order, /member) read via
// firestore/lite and only load the full SDK lazily, which only works if the
// full SDK is NOT bundled into the same chunk as firebase/app + firebase/auth.
const nm = (re) => new RegExp(`[\\\\/]node_modules[\\\\/]${re}[\\\\/]`)
const VENDOR_CHUNKS = [
  ['vendor-react', nm('(react|react-dom|scheduler)')],
  // firestore/lite: its own small chunk (customer pages only).
  ['vendor-firestore-lite', /[\\/]node_modules[\\/](firebase[\\/]firestore[\\/]lite|@firebase[\\/]firestore[\\/]dist[\\/]lite)[\\/]/],
  // (webchannel-wrapper/bloom-blob is shared with lite → falls through to vendor-firebase)
  ['vendor-firestore', nm('(firebase[\\\\/]firestore|@firebase[\\\\/]firestore|@firebase[\\\\/]webchannel-wrapper[\\\\/]dist[\\\\/]webchannel-blob)')],
  ['vendor-firebase', nm('(firebase|@firebase[\\\\/][^\\\\/]+|idb)')],
  ['vendor-ui', nm('(framer-motion|motion-dom|motion-utils|lucide-react)')],
]

// Route-aware early preload. main.jsx lazy-loads the page component for
// /order and /member, so without this the browser only discovers those chunks
// after the entry chunk (react-dom) has downloaded, parsed and executed — one
// extra network round trip on the customer's phone. This injects a tiny inline
// script that adds <link rel="modulepreload"> for the route's chunk + its static
// imports right away, in parallel with the entry chunk. Build-only.
function routeModulePreload(routes) {
  let base = '/'
  return {
    name: 'route-modulepreload',
    apply: 'build',
    configResolved(config) { base = config.base || '/' },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const chunks = Object.values(ctx.bundle).filter((c) => c.type === 'chunk')
        const byFile = Object.fromEntries(chunks.map((c) => [c.fileName, c]))
        const entryFiles = new Set()
        for (const c of chunks) if (c.isEntry) { entryFiles.add(c.fileName); for (const f of c.imports) entryFiles.add(f) }
        const map = {}
        for (const [path, source] of Object.entries(routes)) {
          const root = chunks.find((c) => c.facadeModuleId && c.facadeModuleId.replace(/\\/g, '/').endsWith(source))
          if (!root) continue
          const files = new Set()
          const walk = (f) => { if (files.has(f) || entryFiles.has(f)) return; files.add(f); for (const i of byFile[f]?.imports || []) walk(i) }
          walk(root.fileName)
          map[path] = [...files]
        }
        const script = `<script>(function(){var m=${JSON.stringify(map)};var p=location.pathname.replace(/\\/+$/,'')||'/';var l=m[p];if(!l)return;for(var i=0;i<l.length;i++){var e=document.createElement('link');e.rel='modulepreload';e.crossOrigin='';e.href='${base}'+l[i];document.head.appendChild(e);}})();</script>`
        return html.replace('</head>', `    ${script}\n  </head>`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    routeModulePreload({ '/order': 'src/customer/CustomerOrderApp.jsx', '/member': 'src/customer/MemberCardApp.jsx' }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // /api/* are Cloudflare Pages Functions (image upload → R2 etc.) and only
    // exist on the deployed site; forward them there so uploads work in dev.
    proxy: {
      '/api': { target: 'https://possiwaracafe.pages.dev', changeOrigin: true, secure: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          for (const [name, re] of VENDOR_CHUNKS) if (re.test(id)) return name
          return undefined
        },
      },
    },
  },
})
