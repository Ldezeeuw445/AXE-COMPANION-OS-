/** Set by Vite `define` from `--mode` (see vite.config.ts). Not env-based — avoids dev/prod drift. */
declare const __TOS_APP_MODE__: 'terminal' | 'axe';

export type AppMode = 'terminal' | 'axe';

export function getAppMode(): AppMode {
  return __TOS_APP_MODE__ === 'axe' ? 'axe' : 'terminal';
}

