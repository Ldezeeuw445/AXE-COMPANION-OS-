/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AXE_COMPANION_URL?: string;
  /** When `true`, AXE free-tier AI counter is off (dev/internal; restart dev server after change). */
  readonly VITE_AXE_AI_UNLIMITED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
