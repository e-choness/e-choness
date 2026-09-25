// scripts/build.mjs — rebuild the profile README's images and lists from live
// data, so nothing here is typed by hand twice:
//   • EchoOS content.json  → hero, terminal + skills windows, posts, projects
//   • public contribution calendar → the 3D activity skyline
// Writes assets/generated/*.svg (a light and a dark copy of each) and the
// marked sections of README.md. No dependencies: `node scripts/build.mjs`.
// Run daily by .github/workflows/refresh.yml.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const USER = 'e-choness';
const SITE = 'https://e-choness.github.io/portfolio-site/';
const root = new URL('../', import.meta.url);
const out = new URL('assets/generated/', root);

// Two short lines the site doesn't carry in a form that fits a terminal row.
const PATH = 'enterprise systems → online games → applied AI';
const WORK = 'RAG pipelines · MCP tooling · LLM gateways';

// ── EchoOS design tokens (portfolio-site/_sass/abstracts/_tokens.scss) ──────
const THEMES = {
  dark: {
    bg: '#0f0f19', surface: '#1c1a31', surface2: '#272443', ink: '#ecebf5', inkSoft: '#d2cfe2',
    muted: '#a09bbb', line: 'rgba(214,204,255,.13)', accent: '#a597f2', glow: 'rgba(150,130,240,.13)',
    glassHi: 'rgba(255,255,255,.17)', sheen: 'rgba(255,255,255,.07)', glass: 'rgba(28,26,49,.6)',
    shadow: 'rgba(0,0,0,.6)', starL: 76, starA: 0.55, lineA: 0.12,
  },
  light: {
    bg: '#e6e1ef', surface: '#f6f3fb', surface2: '#ebe7f5', ink: '#1d1a2c', inkSoft: '#35314a',
    muted: '#645f7b', line: 'rgba(58,44,120,.14)', accent: '#6a5ad6', glow: 'rgba(106,90,214,.10)',
    glassHi: 'rgba(255,255,255,.75)', sheen: 'rgba(255,255,255,.42)', glass: 'rgba(246,243,251,.55)',
    shadow: 'rgba(40,30,90,.28)', starL: 36, starA: 0.4, lineA: 0.09,
  },
};
const SANS = `'Archivo','Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif`;
const MONO = `'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
const CW = 0.6; // monospace advance, em; typed lines pin it with textLength

// ── small helpers ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const len = (s) => [...s].length;
const r1 = (n) => Math.round(n * 10) / 10;
const clip = (s, n) => (len(s) > n ? [...s].slice(0, n - 1).join('').trimEnd() + '…' : s);
function rng(seed) { // mulberry32: same data in → same SVG out, so diffs mean something
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const svg = (w, h, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}</svg>\n`;

// Monospace text whose advance is pinned, so typed reveals and carets line up
// whatever monospace font the viewer ends up with.
const mono = (x, y, s, size, fill, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" fill="${fill}" textLength="${r1(len(s) * CW * size)}" lengthAdjust="spacing" ${extra}>${esc(s)}</text>`;

// SMIL with discrete steps: [[seconds, value], …] over a loop of D seconds.
function steps(attr, pairs, D, { type, repeat = 'indefinite' } = {}) {
  const pts = new Map();
  for (const [t, v] of pairs) pts.set(Math.min(D, Math.max(0, t)), v);
  if (!pts.has(0)) pts.set(0, pairs[0][1]);
  const list = [...pts].sort((a, b) => a[0] - b[0]);
  const kt = list.map(([t]) => +(t / D).toFixed(5)).join(';');
  const vals = list.map(([, v]) => v).join(';');
  const tag = type ? `animateTransform attributeName="transform" type="${type}"` : `animate attributeName="${attr}"`;
  return `<${tag} calcMode="discrete" dur="${D}s" repeatCount="${repeat}" keyTimes="${kt}" values="${vals}"/>`;
}

// ── shared chrome ─────────────────────────────────────────────────────────────
function defs(T, id) {
  return `<defs>
<filter id="${id}sh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="${T.shadow}" flood-opacity="1"/></filter>
<linearGradient id="${id}sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.sheen}"/><stop offset=".65" stop-color="${T.sheen}" stop-opacity="0"/></linearGradient>
<radialGradient id="${id}blob"><stop offset="0" stop-color="${T.glow}"/><stop offset="1" stop-color="${T.glow}" stop-opacity="0"/></radialGradient>
</defs>`;
}

// The EchoOS wallpaper: drifting glow blobs, a starfield, faint constellation
// lines between near neighbours, a few stars twinkling.
function wallpaper(T, id, W, H, seed, { count = 90, top = 0, rx = 16 } = {}) {
  const rand = rng(seed);
  let s = `<rect width="${W}" height="${H}" rx="${rx}" fill="${T.bg}"/>`;
  s += `<g>`;
  for (let i = 0; i < 3; i++) {
    const x = r1(rand() * W), y = r1(rand() * H), r = 180 + i * 90;
    const dx = r1(30 + rand() * 30), dy = r1(20 + rand() * 20);
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id}blob)"><animateTransform attributeName="transform" type="translate" dur="${28 + i * 9}s" repeatCount="indefinite" values="0 0;${dx} ${-dy};${-dx} ${dy};0 0" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/></circle>`;
  }
  s += `</g>`;
  const pts = Array.from({ length: count }, () => ({
    x: rand() * W, y: top + rand() * (H - top), r: 0.8 + rand() * 1.5, h: 240 + rand() * 40,
  }));
  let lines = '';
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d2 = dx * dx + dy * dy;
    if (d2 < 8100) {
      const a = ((1 - d2 / 8100) * T.lineA).toFixed(3);
      lines += `<line x1="${r1(pts[i].x)}" y1="${r1(pts[i].y)}" x2="${r1(pts[j].x)}" y2="${r1(pts[j].y)}" stroke="hsla(${Math.round((pts[i].h + pts[j].h) / 2)},42%,${T.starL - 6}%,${a})"/>`;
    }
  }
  let dots = '';
  for (const p of pts) {
    const tw = rand() < 0.35
      ? `<animate attributeName="opacity" values="1;.25;1" dur="${r1(3 + rand() * 4)}s" begin="-${r1(rand() * 6)}s" repeatCount="indefinite"/>` : '';
    dots += `<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${r1(p.r)}" fill="hsla(${Math.round(p.h)},46%,${T.starL}%,${T.starA})">${tw}</circle>`;
  }
  s += `<g><animateTransform attributeName="transform" type="translate" dur="60s" repeatCount="indefinite" values="0 0;14 -8;0 0" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>${lines}${dots}</g>`;
  return `<clipPath id="${id}wp"><rect width="${W}" height="${H}" rx="${rx}"/></clipPath><g clip-path="url(#${id}wp)">${s}</g>`;
}

// An EchoOS window: solid body, glass title bar with dot + mono caption.
function win(T, id, x, y, w, h, caption) {
  return `<g filter="url(#${id}sh)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${T.surface}"/></g>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="${T.line}"/>
<path d="M${x} ${y + 42}V${y + 14}a14 14 0 0 1 14-14H${x + w - 14}a14 14 0 0 1 14 14V${y + 42}Z" fill="url(#${id}sheen)"/>
<line x1="${x}" y1="${y + 42.5}" x2="${x + w}" y2="${y + 42.5}" stroke="${T.line}"/>
<circle cx="${x + 22}" cy="${y + 21}" r="4" fill="${T.accent}"/>
<text x="${x + 36}" y="${y + 25.5}" font-family="${MONO}" font-size="12" font-weight="600" letter-spacing="2" fill="${T.inkSoft}">${esc(caption.toUpperCase())}</text>
<rect x="${x + w - 46}" y="${y + 10}" width="30" height="22" rx="6" fill="none" stroke="${T.line}"/>
<path d="M${x + w - 36} ${y + 16}h9v9h-9Z M${x + w - 36} ${y + 18.5}h9" fill="none" stroke="${T.muted}" stroke-width="1.2"/>`;
}

// ── hero: menu bar, name, a cycling status line, a rotating point-cloud globe ─
function hero(T, id, c) {
  const W = 1200, H = 470;
  const p = c.profile, s = c.site;
  const city = p.location.split(',')[0];
  const games = Object.keys(c.gameNames || {}).length;
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Edmonton' });

  let b = defs(T, id) + wallpaper(T, id, W, H, 17, { top: 40 });
  // menu bar
  b += `<rect width="${W}" height="40" fill="${T.glass}"/><line x1="0" y1="40.5" x2="${W}" y2="40.5" stroke="${T.line}"/>
<rect x="22" y="14" width="12" height="12" rx="3.5" fill="${T.accent}"/>
<text x="44" y="25" font-family="${SANS}" font-size="14" font-weight="700" fill="${T.ink}">EchoOS</text>
<text x="112" y="25" font-family="${MONO}" font-size="11" letter-spacing="1.6" fill="${T.muted}">ABOUT</text>
<rect x="${W - 190}" y="10" width="34" height="20" rx="6" fill="none" stroke="${T.line}"/>
<text x="${W - 173}" y="24.5" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${T.inkSoft}">⌘K</text>
<text x="${W - 22}" y="25" text-anchor="end" font-family="${MONO}" font-size="12" fill="${T.muted}">${esc(date)}</text>`;

  // identity
  const tag = p.tagline.match(/^(.{1,42})\s(.*)$/) || [0, p.tagline, ''];
  b += `<text x="64" y="138" font-family="${MONO}" font-size="15" font-weight="600" letter-spacing="2.4" fill="${T.accent}">${esc(`${p.title} · ${city}`.toUpperCase())}</text>
<text x="60" y="222" font-family="${SANS}" font-size="84" font-weight="800" letter-spacing="-2" fill="${T.ink}">${esc(p.name)}</text>
<text font-family="${SANS}" font-size="23" fill="${T.inkSoft}"><tspan x="64" y="272">${esc(tag[1])}</tspan><tspan x="64" y="302">${esc(tag[2])}</tspan></text>`;

  // cycling status line: each entry types in, holds, clears
  const latest = c.posts[0];
  const lines = [
    `¶  latest post: ${clip(latest.title, 40)}`,
    `{} ${s.projects} projects · ${s.posts} posts · ${s.words.toLocaleString('en-US')} words`,
    `▲  ${games} games in the Arcade, drawn in code`,
  ];
  const fs = 16, cw = CW * fs, D = 7 * lines.length, bx = 64, by = 356;
  const boxW = Math.max(...lines.map(len)) * cw + 70;
  b += `<rect x="${bx}" y="${by}" width="${r1(boxW)}" height="46" rx="11" fill="${T.surface2}" fill-opacity=".7" stroke="${T.line}"/>
<text x="${bx + 18}" y="${by + 29}" font-family="${MONO}" font-size="${fs}" font-weight="600" fill="${T.accent}">➜</text>`;
  const caret = [];
  lines.forEach((ln, i) => {
    const t0 = i * 7 + 0.3, n = len(ln), dt = 1.4 / n, tx = bx + 42;
    const w = [[0, 0], [t0, 0]];
    for (let k = 1; k <= n; k++) { w.push([t0 + k * dt, r1(k * cw)]); caret.push([t0 + k * dt, `${r1(k * cw)} 0`]); }
    w.push([i * 7 + 6.6, 0]);
    caret.push([t0, '0 0']);
    b += `<clipPath id="${id}ty${i}"><rect x="${tx}" y="${by + 8}" height="32" width="0">${steps('width', w, D)}</rect></clipPath>`;
    b += `<g clip-path="url(#${id}ty${i})">${mono(tx, by + 29, ln, fs, T.ink)}</g>`;
  });
  caret.sort((a, b2) => a[0] - b2[0]);
  b += `<g><rect x="${bx + 44}" y="${by + 14}" width="9" height="19" rx="1.5" fill="${T.accent}"><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect>${steps(0, [[0, '0 0'], ...caret], D, { type: 'translate' })}</g>`;

  b += globe(T, id, 918, 262, 138);
  return svg(W, H, `${p.name}: ${p.title}, ${p.location}. ${p.tagline}.`, b);
}

// A sphere of points turning about a tilted axis. Each latitude is a circle
// that rotates, squashed into an ellipse by scale(1, sin tilt); each dot
// counter-rotates and is pre-stretched so it stays round. Opacity follows depth.
function globe(T, id, cx, cy, R) {
  const tilt = (24 * Math.PI) / 180, k = Math.sin(tilt), kc = Math.cos(tilt), D = 48;
  const rand = rng(5);
  let g = `<radialGradient id="${id}orb" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${T.accent}" stop-opacity=".22"/><stop offset=".6" stop-color="${T.accent}" stop-opacity=".06"/><stop offset="1" stop-color="${T.accent}" stop-opacity="0"/></radialGradient>
<circle cx="${cx}" cy="${cy}" r="${R * 1.9}" fill="url(#${id}blob)"/>`;

  // orbit ring, back half first
  const ox = 222, oy = 50, rot = -14;
  const arc = (sweep) => `M${cx + ox} ${cy}A${ox} ${oy} 0 0 ${sweep} ${cx - ox} ${cy}`;
  g += `<path d="${arc(0)}" transform="rotate(${rot} ${cx} ${cy})" fill="none" stroke="${T.accent}" stroke-opacity=".22" stroke-dasharray="2 6"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}orb)" stroke="${T.accent}" stroke-opacity=".28"/>`;

  // faint latitude rings
  const lats = [-72, -54, -36, -18, 0, 18, 36, 54, 72];
  for (const L of lats) {
    const lr = (L * Math.PI) / 180, rl = R * Math.cos(lr), yl = cy - R * Math.sin(lr) * kc;
    g += `<ellipse cx="${cx}" cy="${r1(yl)}" rx="${r1(rl)}" ry="${r1(rl * k)}" fill="none" stroke="${T.accent}" stroke-opacity=".09"/>`;
  }
  const spin = (from, to) => `<animateTransform attributeName="transform" type="rotate" from="${from}" to="${to}" dur="${D}s" repeatCount="indefinite" additive="sum"/>`;
  for (const L of lats) {
    const lr = (L * Math.PI) / 180, rl = R * Math.cos(lr), yl = cy - R * Math.sin(lr) * kc;
    const n = Math.max(6, Math.round(26 * Math.cos(lr)));
    const off = rand() * 360;
    g += `<g transform="translate(${cx} ${r1(yl)}) scale(1 ${k.toFixed(4)})"><g>${spin(0, 360)}`;
    for (let i = 0; i < n; i++) {
      const a0 = off + (360 * i) / n;
      const hot = rand() < 0.07;
      const op = [];
      for (let j = 0; j <= 24; j++) {
        const a = ((a0 + 15 * j) * Math.PI) / 180;
        const z = (R * Math.sin(lr) * k + rl * kc * Math.sin(a)) / R; // -1 back … 1 front
        op.push(Math.max(0.07, 0.07 + 0.9 * ((z + 1) / 2) ** 1.6).toFixed(2));
      }
      const rr = hot ? 3.2 : 1.9;
      g += `<g transform="rotate(${r1(a0)}) translate(${r1(rl)} 0) rotate(${r1(-a0)})"><g>${spin(0, -360)}<ellipse rx="${rr}" ry="${r1(rr / k)}" fill="${hot ? T.ink : T.accent}"><animate attributeName="opacity" values="${op.join(';')}" dur="${D}s" repeatCount="indefinite"/></ellipse></g></g>`;
    }
    g += `</g></g>`;
  }

  // orbit ring front half, and a moon that dims while it passes behind
  g += `<path d="${arc(1)}" transform="rotate(${rot} ${cx} ${cy})" fill="none" stroke="${T.accent}" stroke-opacity=".45"/>`;
  const MD = 16, mk = oy / ox, mop = [];
  for (let j = 0; j <= 36; j++) {
    const a = (j * 10 * Math.PI) / 180;
    const behind = Math.sin(a) < 0 && Math.abs(ox * Math.cos(a)) < R * 0.95;
    mop.push(behind ? '.15' : '1');
  }
  g += `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(1 ${mk.toFixed(4)})"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${MD}s" repeatCount="indefinite"/><g transform="translate(${ox} 0)"><g><animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="${MD}s" repeatCount="indefinite"/><g transform="rotate(${-rot})"><ellipse rx="5.5" ry="${r1(5.5 / mk)}" fill="${T.ink}" transform="rotate(${rot})"/></g></g></g><animate attributeName="opacity" values="${mop.join(';')}" dur="${MD}s" repeatCount="indefinite" calcMode="discrete"/></g></g>`;
  return g;
}

// ── desktop: echo-sh running neofetch, overlapped by the Skills monitor ───────
function desktop(T, id, c) {
  const W = 1200, H = 420, D = 18, END = 16.6;
  const s = c.site, exp = c.experience;
  const games = Object.keys(c.gameNames || {}).length;
  const role = (e) => `${e.role}, ${e.company.split(' / ')[0]}`;
  const deployed = new Date(s.lastCommit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rows = [
    ['uptime', `${c.profile.stats[0].display} years in software`],
    ['path', PATH],
    ['work', WORK],
    ['recent', clip(role(exp[0]), 60)],
    ['site', `${s.posts} posts · ${s.projects} projects · ${games} games`],
    ['deployed', deployed],
  ];

  let b = defs(T, id) + wallpaper(T, id, W, H, 29, { count: 70 });
  const tx = 26, ty = 24, tw = 716, th = 372, fs = 15, lh = 25, cw = CW * fs;
  b += win(T, id, tx, ty, tw, th, 'terminal — echo-sh');
  const x0 = tx + 24;
  let y = ty + 42 + 34;
  b += mono(x0, y, 'EchoOS terminal — type `help` to see commands.', fs, T.muted);
  y += lh;
  const cmdY = y, cmd = 'neofetch', px = x0 + 26;
  b += `<text x="${x0}" y="${y}" font-family="${MONO}" font-size="${fs}" font-weight="700" fill="${T.accent}">➜</text>`;
  const cw0 = [[0, 0], [0.8, 0]];
  const caret = [[0, `${px} ${cmdY}`]];
  for (let k = 1; k <= cmd.length; k++) { const t = 0.8 + k * 0.09; cw0.push([t, r1(k * cw)]); caret.push([t, `${r1(px + k * cw)} ${cmdY}`]); }
  cw0.push([END, 0]);
  b += `<clipPath id="${id}cmd"><rect x="${px}" y="${cmdY - 16}" height="22" width="0">${steps('width', cw0, D)}</rect></clipPath>`;
  b += `<g clip-path="url(#${id}cmd)">${mono(px, y, cmd, fs, T.ink, 'font-weight="700"')}</g>`;

  const out = [];
  y += lh;
  out.push(mono(x0, y, `echo@${USER}`, fs, T.accent, 'font-weight="700"'));
  y += lh;
  out.push(mono(x0, y, '─'.repeat(len(`echo@${USER}`)), fs, T.muted));
  for (const [key, val] of rows) {
    y += lh;
    out.push(`${mono(x0, y, key, fs, T.accent)}${mono(x0 + 10 * cw, y, val, fs, T.ink)}`);
  }
  const t1 = 2.0;
  out.forEach((o, i) => {
    b += `<g opacity="0">${steps('opacity', [[0, 0], [t1 + i * 0.06, 1], [END, 0]], D)}${o}</g>`;
  });
  y += lh * 1.6;
  const tEnd = t1 + out.length * 0.06 + 0.1;
  b += `<g opacity="0">${steps('opacity', [[0, 0], [tEnd, 1], [END, 0]], D)}<text x="${x0}" y="${r1(y)}" font-family="${MONO}" font-size="${fs}" font-weight="700" fill="${T.accent}">➜</text></g>`;
  caret.push([tEnd, `${px} ${r1(y)}`], [END, `${px} ${cmdY}`]);
  b += `<g><rect x="1" y="-15" width="${r1(cw - 1)}" height="19" rx="1.5" fill="${T.accent}"><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect>${steps(0, caret, D, { type: 'translate' })}</g>`;

  // Skills monitor: the top two skills of each group by years, bars fill in
  const skills = c.skills.flatMap((g) => [...g.items].sort((a, b2) => b2.years - a.years).slice(0, 2))
    .sort((a, b2) => b2.years - a.years);
  const maxY = Math.max(...skills.map((k) => k.years));
  const sx = 690, sy = 62, sw = 484, rh = 26, sh = 42 + 26 + skills.length * rh + 14;
  b += win(T, id, sx, sy, sw, sh, 'skills — years used');
  const lx = sx + 22, bx0 = sx + 190, bw = sw - 190 - 64;
  skills.forEach((k, i) => {
    const yy = sy + 42 + 30 + i * rh, full = r1((bw * k.years) / maxY), t0 = t1 + 0.4 + i * 0.08, t2 = t0 + 1.1;
    b += `<text x="${lx}" y="${yy + 4.5}" font-family="${MONO}" font-size="13" fill="${T.inkSoft}">${esc(clip(k.name, 20))}</text>
<rect x="${bx0}" y="${yy - 5}" width="${bw}" height="10" rx="5" fill="${T.surface2}"/>
<rect x="${bx0}" y="${yy - 5}" height="10" rx="5" width="0" fill="${T.accent}"><animate attributeName="width" dur="${D}s" repeatCount="indefinite" values="0;0;${full};${full};0;0" keyTimes="0;${(t0 / D).toFixed(4)};${(t2 / D).toFixed(4)};${((END - 0.5) / D).toFixed(4)};${((END + 0.3) / D).toFixed(4)};1" calcMode="spline" keySplines="0 0 1 1;.2 .8 .2 1;0 0 1 1;.4 0 .6 1;0 0 1 1"/></rect>
<text x="${sx + sw - 22}" y="${yy + 4.5}" text-anchor="end" font-family="${MONO}" font-size="13" font-weight="600" fill="${T.muted}">${k.years}y</text>`;
  });
  return svg(W, H, `Terminal running neofetch: ${rows.map((r) => r.join(' ')).join('; ')}. Skills by years used: ${skills.map((k) => `${k.name} ${k.years}`).join(', ')}.`, b);
}

// ── activity skyline: the last year of contributions as isometric bars ────────
async function contributions() {
  const html = await (await fetch(`https://github.com/users/${USER}/contributions`)).text();
  const tips = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = m[2].match(/^(\d[\d,]*) contribution/);
    tips.set(m[1], n ? +n[1].replace(/,/g, '') : 0);
  }
  const days = [];
  for (const m of html.matchAll(/<td[^>]*data-date="([^"]+)"[^>]*id="([^"]+)"[^>]*data-level="(\d)"/g)) {
    days.push({ date: m[1], level: +m[3], count: tips.get(m[2]) ?? 0 });
  }
  if (days.length < 300) throw new Error(`contribution calendar: parsed only ${days.length} days`);
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function skyline(T, id, days) {
  const W = 1200, H = 440;
  const first = new Date(days[0].date + 'T00:00:00Z');
  const start = first.getTime() - first.getUTCDay() * 864e5;
  const cells = days.map((d) => {
    const t = new Date(d.date + 'T00:00:00Z');
    return { ...d, w: Math.floor((t - start) / 864e5 / 7), d: t.getUTCDay(), t };
  });
  const total = cells.reduce((a, c) => a + c.count, 0);
  const max = Math.max(1, ...cells.map((c) => c.count));
  const best = cells.reduce((a, c) => (c.count > a.count ? c : a), cells[0]);
  let longest = 0, run = 0;
  for (const c of cells) { run = c.count ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].count) current++;
    else if (i === cells.length - 1) continue; // today may not have started yet
    else break;
  }
  const byDay = Array(7).fill(0);
  for (const c of cells) byDay[c.d] += c.count;
  const topDay = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][byDay.indexOf(Math.max(...byDay))];

  // projection: weeks run right and slightly down, weekdays run left and down
  const u = [13.4, 3.4], v = [-9.6, 7.2], f = 0.8, O = [462, 176];
  const P = (w, d) => [O[0] + w * u[0] + d * v[0], O[1] + w * u[1] + d * v[1]];
  const pt = (p) => `${r1(p[0])},${r1(p[1])}`;
  const shade = (col, t) => mix(col, T.bg, t);

  let b = defs(T, id) + wallpaper(T, id, W, H, 41, { count: 60 });
  b += `<style>
.b{transform-box:fill-box;transform-origin:50% 100%;animation:rise 1s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--w)*24ms + .2s)}
.g{fill:var(--c);animation:glint 10s calc(var(--w)*50ms + 2.5s) infinite}
@keyframes rise{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
@keyframes glint{0%,6%,100%{fill:var(--c)}3%{fill:#fff}}
@media (prefers-reduced-motion:reduce){.b,.g{animation:none}}
</style>`;
  b += `<text x="40" y="70" font-family="${MONO}" font-size="13" font-weight="600" letter-spacing="2.4" fill="${T.accent}">LAST 12 MONTHS</text>
<text x="37" y="136" font-family="${SANS}" font-size="64" font-weight="800" letter-spacing="-1.5" fill="${T.ink}">${total.toLocaleString('en-US')}</text>
<text x="40" y="164" font-family="${SANS}" font-size="18" fill="${T.inkSoft}">contributions on GitHub</text>`;
  const facts = [
    ['busiest day', `${best.t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${best.count}`],
    ['longest streak', `${longest} day${longest === 1 ? '' : 's'}`],
    ['current streak', `${current} day${current === 1 ? '' : 's'}`],
    ['most active on', topDay],
  ];
  facts.forEach(([k, val], i) => {
    const yy = 232 + i * 36;
    b += `<line x1="40" y1="${yy - 22}" x2="300" y2="${yy - 22}" stroke="${T.line}"/>
<text x="40" y="${yy}" font-family="${MONO}" font-size="13" fill="${T.muted}">${esc(k)}</text>
<text x="300" y="${yy}" text-anchor="end" font-family="${MONO}" font-size="14" font-weight="600" fill="${T.ink}">${esc(val)}</text>`;
  });

  // month labels along the front edge, following the week axis
  const ang = r1((Math.atan2(u[1], u[0]) * 180) / Math.PI);
  let lastM = -1;
  for (const c of cells) {
    const m = c.t.getUTCMonth();
    if (c.d === 0 && m !== lastM && c.t.getUTCDate() <= 7) {
      lastM = m;
      const [lx, ly] = P(c.w, 7.9);
      b += `<text x="${r1(lx)}" y="${r1(ly + 12)}" transform="rotate(${ang} ${r1(lx)} ${r1(ly + 12)})" font-family="${MONO}" font-size="11" fill="${T.muted}">${c.t.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`;
    }
  }

  // back-to-front so nearer bars cover farther ones
  const order = [...cells].sort((a, c) => (a.w * u[1] + a.d * v[1]) - (c.w * u[1] + c.d * v[1]) || a.w - c.w);
  for (const c of order) {
    const p0 = P(c.w, c.d), p1 = [p0[0] + u[0] * f, p0[1] + u[1] * f], p3 = [p0[0] + v[0] * f, p0[1] + v[1] * f];
    const p2 = [p1[0] + v[0] * f, p1[1] + v[1] * f];
    const h = c.count ? 5 + 118 * Math.sqrt(c.count / max) : 2;
    const up = (p) => [p[0], p[1] - h];
    const top = c.count ? mix(T.surface2, T.accent, 0.35 + 0.65 * Math.min(1, c.level / 4)) : T.surface2;
    b += `<g class="b" style="--w:${c.w}"><polygon points="${pt(p3)} ${pt(p2)} ${pt(up(p2))} ${pt(up(p3))}" fill="${shade(top, 0.42)}"/><polygon points="${pt(p1)} ${pt(p2)} ${pt(up(p2))} ${pt(up(p1))}" fill="${shade(top, 0.25)}"/><polygon${c.count ? ` class="g" style="--c:${top}"` : ''} points="${pt(up(p0))} ${pt(up(p1))} ${pt(up(p2))} ${pt(up(p3))}" fill="${top}"/></g>`;
  }
  return svg(W, H, `${total} GitHub contributions in the last 12 months. Busiest day ${facts[0][1]}; longest streak ${longest} days.`, b);
}

// ── dock: one linked tile per app, like the EchoOS dock ──────────────────────
const DOCK = [
  ['about', 'id', 'About', `${SITE}#/about`],
  ['projects', '{}', 'Projects', `${SITE}#/proj`],
  ['blog', '¶', 'Blog', `${SITE}#/blog`],
  ['arcade', '▲', 'Arcade', `${SITE}#/arcade`],
  ['terminal', '>_', 'Terminal', `${SITE}#/term`],
  ['resume', 'cv', 'Résumé', `${SITE}assets/resume.pdf`],
  ['linkedin', 'in', 'LinkedIn', 'https://www.linkedin.com/in/echoyin0451/'],
  ['x', 'x', 'X', 'https://x.com/_echo_yin'],
  ['email', '@', 'Email', 'mailto:echoybl1123@gmail.com'],
];
function tile(T, id, glyph, label) {
  const b = `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.sheen}"/><stop offset=".65" stop-color="${T.sheen}" stop-opacity="0"/></linearGradient></defs>
<rect x="10.5" y="4.5" width="55" height="55" rx="14" fill="${T.surface2}" stroke="${T.line}"/>
<rect x="10.5" y="4.5" width="55" height="55" rx="14" fill="url(#${id}g)"/>
<path d="M24 5.5h28" stroke="${T.glassHi}"/>
<text x="38" y="38" text-anchor="middle" font-family="${MONO}" font-size="17" font-weight="600" fill="${T.ink}">${esc(glyph)}</text>
<text x="38" y="78" text-anchor="middle" font-family="${SANS}" font-size="12" font-weight="600" fill="${T.muted}">${esc(label)}</text>`;
  return svg(76, 86, label, b);
}

// ── README sections ──────────────────────────────────────────────────────────
function postsMd(c) {
  return c.posts.slice(0, 5).map((p) =>
    `- **[${p.title}](${SITE}#/blog/${p.slug})**  \n  <sub>${p.date} · ${p.readTime ? `${p.readTime} min read` : p.categories?.[0] ?? ''}</sub>`).join('\n');
}
function projectsMd(c) {
  const rows = c.projects.filter((p) => p.featured).map((p) => {
    const links = [
      p.repo && `[code](${p.repo})`,
      p.demo && !p.demoPending && `[live](${p.demo})`,
      p.docs && `[docs](${p.docs})`,
    ].filter(Boolean).join(' · ');
    const desc = (p.desc.match(/^.*?[.!?](\s|$)/) || [p.desc])[0].trim();
    return `| [**${p.title}**](${SITE}#/proj/${p.slug}) | ${desc} | ${p.tech.slice(0, 4).join(', ')} | ${links} |`;
  });
  return ['| Project | What it is | Stack | Links |', '|---|---|---|---|', ...rows].join('\n');
}
function dockMd() {
  return DOCK.map(([key, , label, href]) =>
    `<a href="${href}"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/generated/dock-${key}-dark.svg"><img src="assets/generated/dock-${key}-light.svg" alt="${label}" width="76" height="86"></picture></a>`).join('\n');
}
const splice = (md, key, body) =>
  md.replace(new RegExp(`(<!-- ${key}:START -->)[\\s\\S]*?(<!-- ${key}:END -->)`), `$1\n${body}\n$2`);

// ── main ─────────────────────────────────────────────────────────────────────
const content = await (await fetch(`${SITE}assets/data/content.json`)).json();
const days = await contributions();
await mkdir(out, { recursive: true });
const files = {};
for (const [name, T] of Object.entries(THEMES)) {
  const id = name[0];
  files[`hero-${name}.svg`] = hero(T, `h${id}`, content);
  files[`desktop-${name}.svg`] = desktop(T, `d${id}`, content);
  files[`skyline-${name}.svg`] = skyline(T, `s${id}`, days);
  for (const [key, glyph, label] of DOCK) files[`dock-${key}-${name}.svg`] = tile(T, `t${id}`, glyph, label);
}
for (const [f, body] of Object.entries(files)) await writeFile(new URL(f, out), body);

const readmeUrl = new URL('README.md', root);
let md = await readFile(readmeUrl, 'utf8');
md = splice(md, 'DOCK', dockMd());
md = splice(md, 'LATEST-POSTS', postsMd(content));
md = splice(md, 'PROJECTS', projectsMd(content));
await writeFile(readmeUrl, md);
console.log(`wrote ${Object.keys(files).length} SVGs · ${days.length} days · ${content.posts.length} posts`);
