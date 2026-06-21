// Simulate server-action createIbkrAccountActionWithHub behavior (dry-run)
// Sets required env vars locally, imports the IBKR hub shim and calls connect().

process.env.BROKER_HUB_ENCRYPTION_KEY = process.env.BROKER_HUB_ENCRYPTION_KEY || 'dev-test-key-please-change';
process.env.ENABLE_IBKR_LIVE = '1';
process.env.IBKR_ENABLE_LIVE_TRADING = 'false';

const hubUrl = new URL('../src/lib/broker/hub/adapters/AXE-COMPANION-OS-/ibkr-live-ready/api/hub.js', import.meta.url).href;

(async () => {
  try {
    console.log('ENV: ENABLE_IBKR_LIVE=', process.env.ENABLE_IBKR_LIVE);
    console.log('ENV: BROKER_HUB_ENCRYPTION_KEY present=', !!process.env.BROKER_HUB_ENCRYPTION_KEY);

    let mod;
    try {
      mod = await import(hubUrl);
    } catch (e) {
      // fallback to stub if real hub (TS) cannot be loaded in this environment
      const stubUrl = new URL('../src/lib/broker/hub/adapters/AXE-COMPANION-OS-/ibkr-live-ready/api/hub.stub.js', import.meta.url).href;
      console.warn('Real IBKR hub import failed; falling back to stub. Error:', e && e.message);
      mod = await import(stubUrl);
    }
    const hub = mod?.default ?? mod;
    if (!hub || typeof hub.connect !== 'function') {
      console.error('IBKR hub not available or missing connect()');
      process.exit(2);
    }

    // Simulate staged DB row that the server-action would insert into `user_broker_accounts`.
    const stagedRow = {
      id: 'staged_test_row_1',
      userId: 'user_smoke_test',
      broker: 'ibkr',
      environment: 'paper',
      authMode: 'local_gateway',
      metadata: { ibkr: { accountId: 'TEST_ACCOUNT_123', createdFrom: 'accounts_hub' } },
    };

    console.log('Staged row (dry-run):', stagedRow);

    // Attempt to connect via hub
    const result = await hub.connect({ userId: stagedRow.userId, environment: stagedRow.environment, authMode: stagedRow.authMode, metadata: stagedRow.metadata });
    console.log('Hub connect result:', result);

    // Simulate DB metadata update that server-action would perform
    const updatedMetadata = {
      ...stagedRow.metadata,
      ibkr: {
        ...stagedRow.metadata.ibkr,
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
