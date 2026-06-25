const hubUrl = new URL('../src/lib/broker/hub/adapters/AXE-COMPANION-OS-/alpaca-live-ready/api/hub.js', import.meta.url).href;
(async () => {
  try {
    const mod = await import(hubUrl);
    const hub = mod?.default ?? mod;
    console.log('Loaded hub module:', !!hub);
    if (hub && typeof hub.connect === 'function') {
      const res = await hub.connect({ userId: 'smoke-test' });
      console.log('Connect result:', res);
      process.exit(0);
    }
    console.error('Hub missing connect()');
    process.exit(2);
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(3);
  }
})();
