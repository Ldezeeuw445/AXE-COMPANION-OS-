export interface OpenSkyConfig {
  username: string;
  password: string;
}

export class OpenSkyProvider {
  private username: string;
  private password: string;

  constructor(config: OpenSkyConfig) {
    this.username = config.username;
    this.password = config.password;
  }

  async fetchStatesAll(): Promise<any[]> {
    if (!this.username || !this.password) throw new Error('missing_opensky_credentials');
    const basic = btoa(`${this.username}:${this.password}`);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch('https://opensky-network.org/api/states/all', {
        headers: { Authorization: `Basic ${basic}` },
        signal: ctrl.signal,
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError' || (e instanceof Error && /abort/i.test(e.message))) {
        throw new Error('opensky_timeout');
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) throw new Error(`opensky_error_${res.status}`);
    const json = await res.json();
    return Array.isArray(json.states) ? json.states : [];
  }
}

