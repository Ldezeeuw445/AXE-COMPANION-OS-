const fs = require('fs');
const path = require('path');

const iconB64 = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../public/axe-icon.png')).toString('base64');

function buildHtml(includeFrame) {
  const frameOpen = includeFrame ? `
  <div class="phone">
    <div class="phone-notch"></div>
    <div class="screen">` : `<div class="screen" style="width:390px;height:844px;border-radius:0;position:relative;overflow:hidden;display:flex;flex-direction:column;background:#07080a">`;

  const frameClose = includeFrame ? `    </div>
  </div>` : `</div>`;

  const outerBg = includeFrame
    ? `background:#06070a;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden`
    : `background:#07080a;display:flex;align-items:center;justify-content:center;min-height:100vh`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AXE Companion${includeFrame ? ' — App Demo' : ' — Screen'}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{${outerBg};font-family:Inter,system-ui,sans-serif}
${includeFrame ? `.phone{position:relative;width:min(340px,85vw);aspect-ratio:9/19.5;background:#13161e;border-radius:46px;padding:3px;box-shadow:0 48px 96px -24px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.10);flex-shrink:0}
.phone-notch{position:absolute;top:3px;left:50%;transform:translateX(-50%);width:35%;height:26px;background:#13161e;border-radius:0 0 18px 18px;z-index:50}` : ''}
.screen{width:100%;height:100%;background:#07080a;border-radius:${includeFrame ? '41px' : '0'};overflow:hidden;position:relative;border:${includeFrame ? '1px solid rgba(0,0,0,.5)' : 'none'};display:flex;flex-direction:column}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;transform:translateY(16px);transition:opacity .5s ease,transform .5s cubic-bezier(.16,1,.3,1);pointer-events:none}
.scene.active{opacity:1;transform:translateY(0);pointer-events:auto}
.scene.exit{opacity:0;transform:translateY(-8px)}
.glass{position:relative;overflow:hidden;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055);border-radius:14px;box-shadow:0 8px 24px -8px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05)}
.glass.glow{background:linear-gradient(135deg,rgba(255,255,255,.055) 0%,rgba(255,255,255,.02) 100%);box-shadow:0 8px 24px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07),0 0 32px -20px rgba(46,196,182,.18)}
.glass.glow::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.10) 30%,rgba(46,196,182,.25) 55%,transparent)}
.bnav{padding:0 8px 8px;flex-shrink:0}
.bnav-inner{background:linear-gradient(180deg,rgba(19,22,28,.72) 0%,rgba(7,8,10,.75) 100%);border:1px solid rgba(255,255,255,.09);border-radius:22px;display:flex;gap:2px;padding:6px 4px;box-shadow:0 8px 28px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.08)}
.sbar{display:flex;justify-content:space-between;align-items:center;padding:10px 18px 7px;font-size:11px;font-weight:500;color:#eef0f5}
.chip{display:inline-flex;align-items:center;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;border:1px solid}
.inputbar{display:flex;align-items:center;gap:6px;background:#0c0e12;border:1px solid rgba(255,255,255,.055);border-radius:14px;padding:6px 8px}
.field{background:#101216;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px 12px;font-size:13px;color:#eef0f5;box-shadow:inset 0 1px 3px rgba(0,0,0,.45)}
.cta{border-radius:12px;padding:12px;text-align:center;font-size:14px;font-weight:600;background:linear-gradient(135deg,#3d7dd6 0%,#2f64b8 100%);color:#fff;box-shadow:0 4px 14px -4px rgba(61,125,214,.55)}
.cta.tapped{animation:tap .4s ease}
@keyframes tap{0%{transform:scale(1)}40%{transform:scale(.95)}70%{transform:scale(1.02)}100%{transform:scale(1)}}
${includeFrame ? `.tagline{position:absolute;bottom:18px;text-align:center;z-index:20;padding:0 24px;transition:opacity .5s}
.tl-label{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
.tl-text{font-size:13px;font-weight:300;color:#eef0f5;opacity:.85}` : ''}
</style>
</head>
<body>
${includeFrame ? '<div id="glow" style="position:absolute;width:480px;height:480px;border-radius:50%;filter:blur(80px);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;background:radial-gradient(circle,rgba(46,196,182,.18),transparent 70%);transition:background 1.2s"></div>' : ''}

${frameOpen}

  <!-- SCENE 1: LOGIN -->
  <div class="scene active" id="sc1" style="background:#07080a;align-items:center;justify-content:center;flex-direction:column;padding:0 18px">
    <div style="position:absolute;top:0;left:0;right:0;height:220px;background:radial-gradient(ellipse 85% 55% at 50% -12%,rgba(46,196,182,.28),transparent 55%)"></div>
    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:28px;position:relative;z-index:1">
      <img src="${iconB64}" alt="AXE" style="width:52px;height:52px;border-radius:13px;object-fit:contain;margin-bottom:10px">
      <div style="font-size:10px;font-weight:600;color:#2ec4b6;letter-spacing:.24em;text-transform:uppercase">TradingOS</div>
      <div style="font-size:18px;font-weight:700;color:#eef0f5;margin-top:3px;letter-spacing:-.02em">Companion</div>
    </div>
    <div class="glass glow" style="width:100%;padding:16px 14px;position:relative;z-index:1">
      <div style="font-size:13px;font-weight:700;color:#eef0f5">Sign in</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px">Invitation-only. Access is granted by the operator.</div>
      <div style="margin-top:13px">
        <div style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px">Email</div>
        <div class="field" style="display:flex;align-items:center"><span id="typed-email" style="font-family:monospace"></span><span id="cursor" style="color:#2ec4b6">|</span></div>
      </div>
      <div style="margin-top:9px">
        <div style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px">Password</div>
        <div class="field" style="color:#94a3b8">••••••••</div>
      </div>
      <div id="cta-btn" class="cta" style="margin-top:13px">Enter companion</div>
    </div>
  </div>

  <!-- SCENE 2: SPLASH -->
  <div class="scene" id="sc2" style="background:#000">
    <canvas id="splash-canvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
  </div>

  <!-- SCENE 3: CHAT -->
  <div class="scene" id="sc3" style="background:#07080a">
    <div class="sbar"><span>9:41</span><div style="display:flex;align-items:center;gap:5px"><span style="color:#64748b;font-size:8px">●●●</span><svg width="16" height="10" viewBox="0 0 18 11" fill="none"><rect x=".5" y="6" width="3" height="4" rx=".8" fill="#94a3b8"/><rect x="5" y="4.5" width="3" height="5.5" rx=".8" fill="#94a3b8"/><rect x="9.5" y="3" width="3" height="7" rx=".8" fill="#94a3b8"/><rect x="14" y="1" width="3" height="9" rx=".8" fill="#2ec4b6"/></svg></div></div>
    <div style="flex:1;padding:0 14px;display:flex;flex-direction:column;gap:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <img src="${iconB64}" alt="" style="width:26px;height:26px;border-radius:6px;object-fit:contain;margin-top:2px">
          <div><div style="font-size:14px;font-weight:700;color:#eef0f5">Assistant</div><div style="font-size:9px;color:#94a3b8">Direct channel</div></div>
        </div>
        <span class="chip" style="color:#2ec4b6;background:rgba(46,196,182,.14);border-color:rgba(46,196,182,.33)">Secure</span>
      </div>
      <div class="glass glow" style="padding:9px 10px;flex-shrink:0">
        <div style="font-size:8px;font-weight:600;color:#2ec4b6;text-transform:uppercase;letter-spacing:.10em">Pinned context</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:3px;line-height:1.5">XAUUSD · 3242–3248 defense band · invalidation: 5m close below 3242.00</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;overflow:hidden">
        <div style="align-self:flex-end;max-width:86%;background:rgba(46,196,182,.14);border:1px solid rgba(46,196,182,.22);border-radius:14px 14px 3px 14px;padding:9px 12px;font-size:13px;color:#eef0f5;line-height:1.5"><span id="chat-user"></span><span id="chat-cursor" style="color:#2ec4b6;opacity:.6">|</span></div>
        <div id="axe-bubble" style="display:none;align-self:flex-start;max-width:90%;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055);border-radius:14px 14px 14px 3px;padding:9px 12px;font-size:13px;color:#eef0f5;line-height:1.55;flex-direction:row;gap:7px;align-items:flex-start">
          <img src="${iconB64}" alt="" style="width:17px;height:17px;border-radius:4px;object-fit:contain;flex-shrink:0;margin-top:2px">
          <div><span id="chat-axe"></span><span id="axe-cursor" style="color:#2ec4b6">|</span></div>
        </div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.055);padding-top:8px;padding-bottom:4px;flex-shrink:0">
        <div class="inputbar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <div style="flex:1;font-size:12px;color:#64748b">Message…</div>
          <div style="width:30px;height:30px;border-radius:9px;background:#2ec4b6;display:flex;align-items:center;justify-content:center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#07080a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </div>
        </div>
      </div>
    </div>
    <div class="bnav"><div class="bnav-inner" id="nav3"></div></div>
  </div>

  <!-- SCENE 4: ALERTS -->
  <div class="scene" id="sc4" style="background:#07080a">
    <div class="sbar"><span>9:41</span><div style="display:flex;align-items:center;gap:5px"><span style="color:#64748b;font-size:8px">●●●</span><svg width="16" height="10" viewBox="0 0 18 11" fill="none"><rect x=".5" y="6" width="3" height="4" rx=".8" fill="#94a3b8"/><rect x="5" y="4.5" width="3" height="5.5" rx=".8" fill="#94a3b8"/><rect x="9.5" y="3" width="3" height="7" rx=".8" fill="#94a3b8"/><rect x="14" y="1" width="3" height="9" rx=".8" fill="#2ec4b6"/></svg></div></div>
    <div style="flex:1;padding:0 14px;display:flex;flex-direction:column;gap:10px;overflow:hidden;padding-bottom:6px">
      <div><div style="font-size:14px;font-weight:700;color:#eef0f5">Alerts</div><div style="font-size:10px;color:#94a3b8;margin-top:1px">Terminal &rarr; companion</div></div>
      <div style="display:flex;gap:6px">
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:500;background:rgba(46,196,182,.14);border:1px solid rgba(46,196,182,.35);color:#2ec4b6">All</span>
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;border:1px solid rgba(255,255,255,.055);color:#64748b">Price</span>
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;border:1px solid rgba(255,255,255,.055);color:#64748b">Risk</span>
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;border:1px solid rgba(255,255,255,.055);color:#64748b">News</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1">
        <div class="glass" style="padding:10px 12px"><div style="display:flex;align-items:center;gap:7px"><span class="chip" style="color:#d4b84a;background:rgba(212,184,74,.12);border-color:rgba(212,184,74,.35)">Price</span><span style="width:5px;height:5px;border-radius:50%;background:#2ec4b6;display:inline-block"></span><span style="font-family:monospace;font-size:9px;color:#64748b;margin-left:auto">06:05</span></div><div style="font-size:12px;font-weight:500;color:#eef0f5;margin-top:5px;line-height:1.4">XAUUSD &middot; 3242.50 touched</div><div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.5">Liquidity sweep at prior VAH. Observation only &mdash; no auto execution.</div></div>
        <div class="glass" style="padding:10px 12px"><div style="display:flex;align-items:center;gap:7px"><span class="chip" style="color:#e85d5d;background:rgba(232,93,93,.12);border-color:rgba(232,93,93,.30)">Risk</span><span style="width:5px;height:5px;border-radius:50%;background:#2ec4b6;display:inline-block"></span><span style="font-family:monospace;font-size:9px;color:#64748b;margin-left:auto">05:40</span></div><div style="font-size:12px;font-weight:500;color:#eef0f5;margin-top:5px;line-height:1.4">Daily budget &middot; 41% used</div><div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.5">TradingOS pacing intact. AXE will not propose size-ups today.</div></div>
        <div class="glass" style="padding:10px 12px"><div style="display:flex;align-items:center;gap:7px"><span class="chip" style="color:#38bdf8;background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.35)">News</span><span style="font-family:monospace;font-size:9px;color:#64748b;margin-left:auto">05:15</span></div><div style="font-size:12px;font-weight:500;color:#eef0f5;margin-top:5px;line-height:1.4">Fed minutes &middot; rates unchanged</div><div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.5">No structural change. AXE flagged to watch USD reaction vs 3220.</div></div>
      </div>
    </div>
    <div class="bnav"><div class="bnav-inner" id="nav4"></div></div>
  </div>

  <!-- SCENE 5: VAULT -->
  <div class="scene" id="sc5" style="background:#07080a">
    <div class="sbar"><span>9:41</span><div style="display:flex;align-items:center;gap:5px"><span style="color:#64748b;font-size:8px">●●●</span><svg width="16" height="10" viewBox="0 0 18 11" fill="none"><rect x=".5" y="6" width="3" height="4" rx=".8" fill="#94a3b8"/><rect x="5" y="4.5" width="3" height="5.5" rx=".8" fill="#94a3b8"/><rect x="9.5" y="3" width="3" height="7" rx=".8" fill="#94a3b8"/><rect x="14" y="1" width="3" height="9" rx=".8" fill="#2ec4b6"/></svg></div></div>
    <div style="flex:1;padding:0 14px;display:flex;flex-direction:column;gap:9px;overflow:hidden;padding-bottom:6px">
      <div><div style="font-size:14px;font-weight:700;color:#eef0f5">Vault</div><div style="font-size:10px;color:#94a3b8;margin-top:1px">Notes &middot; screenshots &middot; voice</div></div>
      <div style="background:#0c0e12;border:1px solid rgba(255,255,255,.055);border-radius:11px;padding:8px 12px;font-size:12px;color:#64748b">Search 3242, VAH, invalidation&hellip;</div>
      <div style="display:flex;gap:6px">
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:500;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.35);color:#a78bfa">All</span>
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;border:1px solid rgba(255,255,255,.055);color:#64748b">Notes</span>
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;border:1px solid rgba(255,255,255,.055);color:#64748b">Images</span>
        <span style="padding:3px 10px;border-radius:20px;font-size:10px;border:1px solid rgba(255,255,255,.055);color:#64748b">Voice</span>
      </div>
      <div style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em">Notes</div>
      <div class="glass" style="padding:10px 12px"><div style="display:flex;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><div><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:500;color:#eef0f5">NY open checklist</span><span class="chip" style="color:#94a3b8;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.10)">XAUUSD</span></div><div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.45">No new swing unless A+ reclaim + 5m close.</div><div style="margin-top:5px;display:inline-block;background:rgba(255,255,255,.06);border-radius:4px;padding:2px 6px;font-size:9px;color:#64748b">#routine</div></div></div></div>
      <div class="glass" style="padding:10px 12px"><div style="display:flex;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><div><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:500;color:#eef0f5">Invalidation language</span><span class="chip" style="color:#94a3b8;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.10)">XAUUSD</span></div><div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.45">Wick through &ne; exit. Need body close below 3242.</div><div style="margin-top:5px;display:inline-block;background:rgba(255,255,255,.06);border-radius:4px;padding:2px 6px;font-size:9px;color:#64748b">#rules</div></div></div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">
        <div class="glass" style="padding:0;overflow:hidden"><div style="aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(0,0,0,.35) 100%)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span style="font-size:8px;color:#94a3b8;text-align:center;padding:0 3px;line-height:1.3">3242 &middot; 15m</span></div><div style="border-top:1px solid rgba(255,255,255,.055);padding:4px 7px"><span style="font-family:monospace;font-size:9px;color:#a78bfa">XAUUSD</span></div></div>
        <div class="glass" style="padding:0;overflow:hidden"><div style="aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(0,0,0,.35) 100%)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span style="font-size:8px;color:#94a3b8;text-align:center;padding:0 3px;line-height:1.3">Depth &middot; 3248</span></div><div style="border-top:1px solid rgba(255,255,255,.055);padding:4px 7px"><span style="font-family:monospace;font-size:9px;color:#a78bfa">XAUUSD</span></div></div>
        <div class="glass" style="padding:0;overflow:hidden"><div style="aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,rgba(0,0,0,.35) 100%)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span style="font-size:8px;color:#94a3b8;text-align:center;padding:0 3px;line-height:1.3">DXY &middot; OR</span></div><div style="border-top:1px solid rgba(255,255,255,.055);padding:4px 7px"><span style="font-family:monospace;font-size:9px;color:#a78bfa">XAUUSD</span></div></div>
      </div>
    </div>
    <div class="bnav"><div class="bnav-inner" id="nav5"></div></div>
  </div>

  <!-- SCENE 6: ACTIONS -->
  <div class="scene" id="sc6" style="background:#07080a">
    <div class="sbar"><span>9:41</span><div style="display:flex;align-items:center;gap:5px"><span style="color:#64748b;font-size:8px">●●●</span><svg width="16" height="10" viewBox="0 0 18 11" fill="none"><rect x=".5" y="6" width="3" height="4" rx=".8" fill="#94a3b8"/><rect x="5" y="4.5" width="3" height="5.5" rx=".8" fill="#94a3b8"/><rect x="9.5" y="3" width="3" height="7" rx=".8" fill="#94a3b8"/><rect x="14" y="1" width="3" height="9" rx=".8" fill="#2ec4b6"/></svg></div></div>
    <div style="flex:1;padding:0 14px;display:flex;flex-direction:column;gap:10px;overflow:hidden;padding-bottom:6px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between"><div><div style="font-size:14px;font-weight:700;color:#eef0f5">Actions</div><div style="font-size:10px;color:#94a3b8;margin-top:1px">AXE proposes &middot; you approve</div></div><span class="chip" style="color:#60a5fa;background:rgba(96,165,250,.12);border-color:rgba(96,165,250,.33)">2 pending</span></div>
      <div class="glass glow" style="padding:12px 13px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><div style="display:flex;align-items:center;gap:7px"><span style="font-size:14px;font-weight:700;color:#eef0f5">XAUUSD</span><span class="chip" style="color:#12b87a;background:rgba(18,184,122,.12);border-color:rgba(18,184,122,.30)">Long</span></div><span style="font-family:monospace;font-size:9px;color:#64748b">06:28</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 0;margin-bottom:11px">
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Entry</span><br><span style="font-size:12px;font-weight:600;color:#eef0f5;font-family:monospace">3228.50</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Stop</span><br><span style="font-size:12px;font-weight:600;color:#e85d5d;font-family:monospace">3219.00</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Target</span><br><span style="font-size:12px;font-weight:600;color:#12b87a;font-family:monospace">3252.00</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Size</span><br><span style="font-size:12px;font-weight:600;color:#94a3b8;font-family:monospace">0.5 lot</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Risk/R</span><br><span style="font-size:12px;font-weight:600;color:#d4b84a;font-family:monospace">2.5R</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Status</span><br><span style="font-size:12px;font-weight:600;color:#60a5fa;font-family:monospace">Proposed</span></div>
        </div>
        <div style="display:flex;gap:8px"><div style="flex:1;padding:8px;border-radius:9px;background:rgba(18,184,122,.18);border:1px solid rgba(18,184,122,.35);text-align:center;font-size:12px;font-weight:600;color:#12b87a">Approve</div><div style="flex:1;padding:8px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.055);text-align:center;font-size:12px;font-weight:600;color:#94a3b8">Skip</div></div>
      </div>
      <div class="glass" style="padding:12px 13px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><div style="display:flex;align-items:center;gap:7px"><span style="font-size:14px;font-weight:700;color:#eef0f5">DXY</span><span class="chip" style="color:#e85d5d;background:rgba(232,93,93,.12);border-color:rgba(232,93,93,.30)">Short</span></div><span style="font-family:monospace;font-size:9px;color:#64748b">06:14</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 0;margin-bottom:11px">
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Entry</span><br><span style="font-size:12px;font-weight:600;color:#eef0f5;font-family:monospace">103.85</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Stop</span><br><span style="font-size:12px;font-weight:600;color:#e85d5d;font-family:monospace">104.20</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Target</span><br><span style="font-size:12px;font-weight:600;color:#12b87a;font-family:monospace">103.10</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Size</span><br><span style="font-size:12px;font-weight:600;color:#94a3b8;font-family:monospace">&mdash;</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Risk/R</span><br><span style="font-size:12px;font-weight:600;color:#d4b84a;font-family:monospace">2.1R</span></div>
          <div><span style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Status</span><br><span style="font-size:12px;font-weight:600;color:#94a3b8;font-family:monospace">Awaiting</span></div>
        </div>
        <div style="display:flex;gap:8px"><div style="flex:1;padding:8px;border-radius:9px;background:rgba(18,184,122,.18);border:1px solid rgba(18,184,122,.35);text-align:center;font-size:12px;font-weight:600;color:#12b87a">Approve</div><div style="flex:1;padding:8px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.055);text-align:center;font-size:12px;font-weight:600;color:#94a3b8">Skip</div></div>
      </div>
    </div>
    <div class="bnav"><div class="bnav-inner" id="nav6"></div></div>
  </div>

  <!-- SCENE 7: COCKPIT -->
  <div class="scene" id="sc7" style="background:#07080a">
    <div class="sbar"><span>9:41</span><div style="display:flex;align-items:center;gap:5px"><span style="color:#64748b;font-size:8px">●●●</span><svg width="16" height="10" viewBox="0 0 18 11" fill="none"><rect x=".5" y="6" width="3" height="4" rx=".8" fill="#94a3b8"/><rect x="5" y="4.5" width="3" height="5.5" rx=".8" fill="#94a3b8"/><rect x="9.5" y="3" width="3" height="7" rx=".8" fill="#94a3b8"/><rect x="14" y="1" width="3" height="9" rx=".8" fill="#2ec4b6"/></svg></div></div>
    <div style="flex:1;padding:0 14px;display:flex;flex-direction:column;gap:9px;overflow:hidden;padding-bottom:6px">
      <div><div style="font-size:14px;font-weight:700;color:#eef0f5">Cockpit</div><div style="font-size:10px;color:#94a3b8;margin-top:1px">Performance &middot; alignment &middot; behavior</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="glass glow" style="padding:10px 11px"><div style="font-size:8px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em">Alignment</div><div style="font-family:monospace;font-size:20px;font-weight:700;color:#eef0f5;margin-top:3px">82</div><div style="font-size:9px;color:#2ec4b6;margin-top:1px">+3 pts</div></div>
        <div class="glass" style="padding:10px 11px"><div style="font-size:8px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em">Kept rate</div><div style="font-family:monospace;font-size:20px;font-weight:700;color:#eef0f5;margin-top:3px">71%</div><div style="font-size:9px;color:#94a3b8;margin-top:1px">of signals</div></div>
        <div class="glass" style="padding:10px 11px"><div style="font-size:8px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em">Avg R (30d)</div><div style="font-family:monospace;font-size:20px;font-weight:700;color:#eef0f5;margin-top:3px">+0.38R</div><div style="font-size:9px;color:#d4b84a;margin-top:1px">paper book</div></div>
        <div class="glass" style="padding:10px 11px"><div style="font-size:8px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em">Max DD</div><div style="font-family:monospace;font-size:20px;font-weight:700;color:#eef0f5;margin-top:3px">-1.2%</div><div style="font-size:9px;color:#e85d5d;margin-top:1px">30-day peak</div></div>
      </div>
      <div class="glass" style="padding:11px 12px;flex:1"><div style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em;margin-bottom:10px">Weekly R (paper)</div><div style="display:flex;align-items:flex-end;gap:8px;height:52px" id="wchart"></div></div>
      <div class="glass glow" style="padding:10px 12px"><div style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.10em">Setups reviewed</div><div style="font-family:monospace;font-size:20px;font-weight:700;color:#eef0f5;margin-top:2px">38</div><div style="font-size:9px;color:#94a3b8;margin-top:1px">This month &middot; paper book</div></div>
    </div>
    <div class="bnav"><div class="bnav-inner" id="nav7"></div></div>
  </div>

${frameClose}

${includeFrame ? `<div id="tg" style="position:absolute;bottom:18px;text-align:center;z-index:20;padding:0 24px;opacity:0;transition:opacity .5s"><div id="tg-label" style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px"></div><div id="tg-text" style="font-size:13px;font-weight:300;color:#eef0f5;opacity:.85"></div></div>` : ''}

<script>
const ICON = '${iconB64}';
const TAB_COLORS = {chat:'#2ec4b6',alerts:'#d4b84a',vault:'#a78bfa',actions:'#60a5fa',cockpit:'#4f8fea',settings:'#64748b'};
const TABS = [{id:'chat',l:'Chat'},{id:'alerts',l:'Alerts'},{id:'vault',l:'Vault'},{id:'actions',l:'Actions'},{id:'cockpit',l:'Cockpit'},{id:'settings',l:'Settings'}];
const PATHS = {
  chat:    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  alerts:  'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  vault:   'M5 4h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm7 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM3 14h18M8 14v4m8-4v4',
  actions: 'M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 3l-4 4-4-4M8 21l4-4 4 4',
  cockpit: 'M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.83A2.5 2.5 0 0 1 9.5 2zm5 0a2.5 2.5 0 0 1 2.5 2.45 2.5 2.5 0 0 1 1.32 4.8 3 3 0 0 1-.34 5.59 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 19.5V4.5a2.5 2.5 0 0 1 2.5-2.5z',
  settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};
const SCENES = [
  {id:1,tab:null,     label:null,      tagline:null,                        dur:5000},
  {id:2,tab:null,     label:null,      tagline:null,                        dur:9500},
  {id:3,tab:'chat',   label:'Chat',    tagline:'Your edge. Always on call.',dur:7000},
  {id:4,tab:'alerts', label:'Alerts',  tagline:'Never miss a signal.',      dur:5000},
  {id:5,tab:'vault',  label:'Vault',   tagline:'Your trading memory.',      dur:5000},
  {id:6,tab:'actions',label:'Actions', tagline:'Propose. Review. Execute.', dur:5000},
  {id:7,tab:'cockpit',label:'Cockpit', tagline:'Know your edge.',           dur:6000},
];

function buildNav(id, activeTab) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = TABS.map(t => {
    const on = t.id === activeTab;
    const c = on ? TAB_COLORS[t.id] : '#64748b';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 2px;border-radius:14px;background:' + (on ? TAB_COLORS[t.id] + '18' : 'transparent') + '">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="' + (on ? 2.25 : 1.65) + '" stroke-linecap="round" stroke-linejoin="round"><path d="' + PATHS[t.id] + '"/></svg>' +
      '<span style="font-size:9px;font-weight:' + (on ? 600 : 400) + ';color:' + c + ';letter-spacing:.03em">' + t.l + '</span></div>';
  }).join('');
}
[3,4,5,6,7].forEach(i => buildNav('nav' + i, SCENES[i-1].tab));

// Weekly chart
(function(){
  const data=[0.6,0.2,-0.4,0.45],labs=['Mar 3','Mar 10','Mar 17','Mar 24'],maxA=Math.max(...data.map(Math.abs),.01),h=52;
  const c=document.getElementById('wchart');
  if(!c)return;
  c.innerHTML=data.map((r,i)=>{
    const bh=(Math.abs(r)/maxA)*(h-18);
    const col=r>=0?'#2ec4b6':'#94a3b8';
    const bg=r>=0?'linear-gradient(to top,rgba(46,196,182,.20),rgba(46,196,182,.75))':'linear-gradient(to top,rgba(255,255,255,.08),rgba(255,255,255,.22))';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:70%;border-radius:3px 3px 0 0;height:'+bh+'px;min-height:6px;background:'+bg+'"></div><span style="font-size:8px;font-family:monospace;color:#64748b">'+labs[i].slice(4)+'</span><span style="font-size:9px;font-family:monospace;color:'+col+'">'+(r>=0?'+':'')+r.toFixed(1)+'R</span></div>';
  }).join('');
})();

// Scene manager
let current=1,timer=null,splashDone=false,chatDone=false;
function goTo(n){
  const prev=document.getElementById('sc'+current);
  const next=document.getElementById('sc'+n);
  if(prev){prev.classList.remove('active');prev.classList.add('exit');setTimeout(()=>prev.classList.remove('exit'),600);}
  if(next)next.classList.add('active');
  const sc=SCENES[n-1];
  ${includeFrame ? `
  const glow=document.getElementById('glow');
  if(glow)glow.style.background=sc.tab?'radial-gradient(circle,'+TAB_COLORS[sc.tab]+'28,transparent 70%)':'radial-gradient(circle,rgba(46,196,182,.18),transparent 70%)';
  const tg=document.getElementById('tg');
  if(sc.tagline&&tg){document.getElementById('tg-label').textContent=sc.label;document.getElementById('tg-label').style.color=TAB_COLORS[sc.tab];document.getElementById('tg-text').textContent=sc.tagline;tg.style.opacity='1';}
  else if(tg)tg.style.opacity='0';` : ''}
  current=n;
  if(n===2&&!splashDone){splashDone=true;startSplash();}
  if(n===3&&!chatDone){chatDone=true;startChat();}
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>goTo(n<7?n+1:1),sc.dur);
}

// Login typewriter
setTimeout(()=>{
  const el=document.getElementById('typed-email');
  const cur=document.getElementById('cursor');
  const btn=document.getElementById('cta-btn');
  if(!el)return;
  let i=0,target='axe@tradingos.com';
  const iv=setInterval(()=>{
    if(i<target.length){el.textContent=target.slice(0,++i);}
    else{clearInterval(iv);if(cur)cur.style.opacity='0';setTimeout(()=>{if(btn)btn.classList.add('tapped');},600);}
  },52);
},300);

// Splash canvas
function startSplash(){
  const canvas=document.getElementById('splash-canvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||340,H=canvas.offsetHeight||780;
  canvas.width=W*2;canvas.height=H*2;ctx.scale(2,2);
  const T=[46,196,182],nodes=Array.from({length:55},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.15,r:.8+Math.random()*1.4,o:.3+Math.random()*.5}));
  let t=0;
  const lines=[{text:'INITIALIZING AXE ENGINE',s:800,e:2200},{text:'AXE COMPANION OS',s:2600,e:5000}];
  function draw(){
    t+=16;ctx.clearRect(0,0,W,H);ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<80){ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.strokeStyle='rgba('+T+','+(1-d/80)*.18+')';ctx.lineWidth=.5;ctx.stroke();}}
    nodes.forEach(n=>{n.x+=n.vx;n.y+=n.vy;if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle='rgba('+T+','+n.o+')';ctx.fill();});
    ctx.font='bold 11px JetBrains Mono,monospace';ctx.textAlign='center';
    lines.forEach((l,li)=>{if(t>l.s&&t<l.e+800){const p=Math.min(1,(t-l.s)/600),fade=t>l.e?Math.max(0,1-(t-l.e)/500):1;ctx.globalAlpha=p*fade;ctx.fillStyle='rgba('+T+',1)';ctx.fillText(l.text.slice(0,Math.floor(p*l.text.length)),W/2,H/2+(li===1?16:-10));ctx.globalAlpha=1;}});
    const grd=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,120);const gp=Math.sin(t/1000)*.5+.5;grd.addColorStop(0,'rgba('+T+','+(gp*.08)+')');grd.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
    if(current===2)requestAnimationFrame(draw);
  }
  draw();
}

// Chat typewriter
function startChat(){
  const userEl=document.getElementById('chat-user'),chatCur=document.getElementById('chat-cursor'),bubble=document.getElementById('axe-bubble'),axeEl=document.getElementById('chat-axe'),axeCur=document.getElementById('axe-cursor');
  if(!userEl)return;
  const uMsg='Hey AXE, what are you reading on XAUUSD?',aMsg='Structure break confirmed below 3242 on the 5m close. Volume expanded \u2014 first target 3225. Watching for continuation, next level 3208.';
  let u=0;
  const ui=setInterval(()=>{if(u<uMsg.length){userEl.textContent=uMsg.slice(0,++u);}else{clearInterval(ui);if(chatCur)chatCur.style.opacity='0';setTimeout(()=>{if(bubble)bubble.style.display='flex';let a=0;const ai=setInterval(()=>{if(a<aMsg.length){axeEl.textContent=aMsg.slice(0,++a);}else{clearInterval(ai);if(axeCur)axeCur.style.opacity='0';}},26);},600);}},40);
}

// Start
timer=setTimeout(()=>goTo(2),5000);
</script>
</body>
</html>`;
}

// Write full version (with iPhone frame)
const fullHtml = buildHtml(true);
fs.writeFileSync(path.join(__dirname, '../exports/axe-companion-demo.html'), fullHtml, 'utf8');
console.log('Full version:', fs.statSync(path.join(__dirname, '../exports/axe-companion-demo.html')).size, 'bytes');

// Write screen-only version (390x844, no frame)
const screenHtml = buildHtml(false);
fs.writeFileSync(path.join(__dirname, '../exports/axe-companion-screen.html'), screenHtml, 'utf8');
console.log('Screen version:', fs.statSync(path.join(__dirname, '../exports/axe-companion-screen.html')).size, 'bytes');
