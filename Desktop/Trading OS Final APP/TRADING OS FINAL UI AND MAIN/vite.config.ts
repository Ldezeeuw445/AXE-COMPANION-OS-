import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function spaHistoryFallback() {
  return {
    name: 'spa-history-fallback',
    configureServer(server: any) {
      server.middlewares.use((req: any, _res: any, next: any) => {
        if (!req?.url || req.method !== 'GET') return next();

        const pathname = String(req.url).split('?')[0] ?? '/';
        // Let Vite handle assets, virtual modules, proxied paths, and real files.
        const isViteInternal =
          pathname.startsWith('/@') ||
          pathname.startsWith('/__') ||
          pathname.startsWith('/assets/') ||
          pathname.startsWith('/favicon') ||
          pathname.startsWith('/src/');
        const looksLikeFile = pathname.includes('.') || pathname.endsWith('/');
        if (pathname === '/' || isViteInternal || looksLikeFile) return next();

        // Rewrite deep-links like `/axe-companion` to `/` so index.html is served.
        req.url = '/';
        return next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  appType: 'spa',
  // Compile-time app flavour. Do not use import.meta.env.VITE_APP_MODE for routing:
  // Vite's env injection can override `define` on import.meta.env and keep AXE on "terminal".
  define: {
    __TOS_APP_MODE__: JSON.stringify(mode === 'axe' ? 'axe' : 'terminal'),
  },
  // In dev (vite serve), we need absolute asset paths so deep links like `/axe-companion`
  // don't resolve `./assets/*` relative to the route and white-screen.
  // In build, keep relative base for static file hosting.
  base: command === 'serve' ? '/' : './',
  plugins: [spaHistoryFallback(), inspectAttr(), react()],
  server: {
    proxy: {
      '/__polymarket_gamma': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__polymarket_gamma/, ''),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));