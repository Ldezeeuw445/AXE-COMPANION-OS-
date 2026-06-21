export interface AISStreamConfig {
  apiKey: string;
}

export class AISStreamProvider {
  private apiKey: string;

  constructor(config: AISStreamConfig) {
    this.apiKey = config.apiKey;
  }

  async fetchSnapshot(): Promise<any[]> {
    if (!this.apiKey) throw new Error('missing_aisstream_api_key');

    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    const messages: any[] = [];

    const done = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve();
      }, 2500);

      ws.onopen = () => {
        const subscriptionMessage = {
          APIKey: this.apiKey,
          BoundingBoxes: [
            // Strait of Hormuz
            [[24.5, 54.6], [26.9, 57.6]],
            // Suez Canal
            [[29.2, 31.0], [31.6, 33.2]],
            // Bab-el-Mandeb
            [[11.8, 41.5], [13.6, 43.7]],
          ],
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        };
        ws.send(JSON.stringify(subscriptionMessage));
      };

      ws.onmessage = (evt) => {
        try {
          const json = JSON.parse(String(evt.data));
          messages.push(json);
          if (messages.length >= 120) {
            clearTimeout(timeout);
            try {
              ws.close();
            } catch {
              // ignore
            }
            resolve();
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('aisstream_ws_error'));
      };
    });

    await done;
    return messages;
  }
}

