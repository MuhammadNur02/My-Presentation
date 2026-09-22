/** CSS untuk halaman hasil ekspor (sampul, HUD, catatan pembicara). Tanpa font/CDN eksternal. */
export const RUNTIME_CSS = /* css */ `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;background:var(--bg1,#0b0b1a);color:var(--fg,#f5f5f7);
  font-family:"SF Pro Display","Segoe UI Variable Display","Segoe UI",Inter,system-ui,-apple-system,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;touch-action:pan-y}
#app{position:fixed;inset:0}
#stage{position:absolute;inset:0;background:var(--bg1,#000)}
#stage canvas{display:block;width:100%;height:100%}
button{font:inherit;color:inherit;cursor:pointer}

#cover{position:absolute;inset:0;display:grid;place-items:center;text-align:center;
  background:radial-gradient(ellipse at 50% 40%,rgba(0,0,0,.35),rgba(0,0,0,.72));
  backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);
  transition:opacity .7s ease,visibility .7s ease}
body.presenting #cover{opacity:0;visibility:hidden;pointer-events:none}
.cover-card{max-width:min(900px,90vw);padding:2rem}
.eyebrow{letter-spacing:.26em;text-transform:uppercase;font-size:.72rem;color:var(--muted)}
#cover-title{margin:1.1rem 0 .6rem;font-size:clamp(2rem,5.4vw,4.4rem);line-height:1.05;font-weight:800;letter-spacing:-.02em;
  background:linear-gradient(90deg,var(--fg),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
#cover-meta{color:var(--muted);font-size:1rem}
#start{margin-top:1.8rem;padding:.95rem 2.2rem;border:0;border-radius:999px;font-weight:700;font-size:1rem;color:#fff;
  background:linear-gradient(90deg,var(--accent),var(--accent2));box-shadow:0 10px 40px -10px var(--accent);transition:transform .2s}
#start:hover{transform:translateY(-2px) scale(1.03)}
.hint{margin-top:1.4rem;font-size:.78rem;color:var(--muted);line-height:1.7}

#hud{position:absolute;left:0;right:0;bottom:0;padding:2.4rem 1.2rem 1rem;display:none;opacity:0;pointer-events:none;
  background:linear-gradient(transparent,rgba(0,0,0,.55));transition:opacity .3s}
body.presenting #hud{display:block}
body.hud-on #hud{opacity:1;pointer-events:auto}
body.presenting:not(.hud-on){cursor:none}
#bar{height:3px;border-radius:3px;background:rgba(255,255,255,.2);overflow:hidden}
#bar-fill{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .5s ease}
.hud-row{display:flex;align-items:center;gap:.5rem;margin-top:.7rem;font-size:.8rem;color:#fff}
.hud-row .spacer{flex:1}
#counter{font-variant-numeric:tabular-nums;opacity:.85}
.hud-row button{padding:.35rem .8rem;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);
  backdrop-filter:blur(8px);font-size:.75rem}
.hud-row button:hover{background:rgba(255,255,255,.2)}

#notes{position:absolute;right:1rem;bottom:4.6rem;width:min(420px,calc(100vw - 2rem));max-height:46vh;display:none;flex-direction:column;
  padding:1rem 1.1rem;border-radius:18px;background:rgba(18,18,22,.82);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.12);color:#f5f5f7}
body.presenting.notes-on #notes{display:flex}
.notes-head{display:flex;justify-content:space-between;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:#a1a1aa;margin-bottom:.5rem}
#notes-body{font-size:.95rem;line-height:1.55;overflow:auto;white-space:pre-wrap}
#notes-next{margin-top:.7rem;padding-top:.6rem;border-top:1px solid rgba(255,255,255,.1);font-size:.75rem;color:#a1a1aa}

#toast{position:absolute;left:50%;bottom:5.4rem;transform:translate(-50%,10px);padding:.6rem 1.1rem;border-radius:999px;font-size:.82rem;
  background:rgba(18,18,22,.86);color:#fff;border:1px solid rgba(255,255,255,.12);opacity:0;pointer-events:none;transition:.3s;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
#toast.on{opacity:1;transform:translate(-50%,0)}
`;
