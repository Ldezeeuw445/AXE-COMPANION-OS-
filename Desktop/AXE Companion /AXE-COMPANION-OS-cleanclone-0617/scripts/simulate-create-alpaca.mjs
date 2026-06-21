const hubUrl = new URL('../src/lib/broker/hub/adapters/AXE-COMPANION-OS-/alpaca-live-ready/api/hub.js', import.meta.url).href;
const stubUrl = new URL('../src/lib/broker/hub/adapters/AXE-COMPANION-OS-/alpaca-live-ready/api/hub.js', import.meta.url).href; // hub.js exists as shim

(async () => {
  try {
    console.log('Simulating Alpaca create flow (dry-run)');
    let mod;
    try {
      mod = await import(hubUrl);
    } catch (e) {
      console.warn('Alpaca hub import failed; falling back to stub. Error:', e && e.message);
      mod = await import(stubUrl);
    }
    const hub = mod?.default ?? mod;
    if (!hub || typeof hub.connect !== 'function') {
      console.error('Alpaca hub missing connect()');
      process.exit(2);
    }

    const stagedRow = {
      id: 'staged_alpaca_1',
      userId: 'user_alpaca_test',
      broker: 'alpaca',
      environment: 'paper',
      authMode: 'api_keys',
      metadata: { alpaca: { createdFrom: 'accounts_hub' } },
    };

    console.log('Staged row (dry-run):', stagedRow);
    const result = await hub.connect({ userId: stagedRow.userId, environment: stagedRow.environment, authMode: stagedRow.authMode, metadata: stagedRow.metadata });
    console.log('Hub connect result:', result);

    const updatedMetadata = {
      ...stagedRow.metadata,
      alpaca: {
        ...stagedRow.metadata.alpaca,
        hubConnectionId: result.id,
        hubStatus: result.status || 'connected',
      },
    };
    console.log('Would update `user_broker_accounts.metadata` with:', updatedMetadata);
    process.exit(0);
  } catch (err) {
    console.error('Simulation failed:', err);
    process.exit(3);
  }
})();
