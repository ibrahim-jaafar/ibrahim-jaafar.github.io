// Builds cv.pdf from profile.md, so the CV always says what the site says.
// Run: node make-cv.mjs   (needs Microsoft Edge, which prints the PDF)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// What goes in the CV, by heading in profile.md. A renamed heading stops the build instead of vanishing from the CV.
const TOOLS = ['Ecosystem: one platform for the whole company', 'Task Manager', 'Mail', 'Chat', 'SRT Cleaner (co-developed)',
  'Admin panel', 'HR', 'Newsroom engine (working MVP)'];
const PROJECTS = ['Agency report automation (live demo)', 'Hermes multi-agent system on Telegram', 'Furniture CAD-to-render pipeline',
  'MoneyPrinterTurbo Extended: AI short-video generator', 'PromptForge: multi-provider AI image platform'];
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// same reversed pieces as index.html, so the address isn't readable in the source
const MAIL = ['moc.liamg', '7991.nonabel.miharbi'].map(x => [...x].reverse().join('')).reverse().join('@');

const md = readFileSync(new URL('profile.md', import.meta.url), 'utf8').replace(/\r/g, '');

// heading text -> the lines under it, up to the next heading of any level
const blocks = new Map();
let cur = null;
for (const line of md.split('\n')) {
  const h = line.match(/^#+ (.*)/);
  if (h) blocks.set(cur = h[1], []);
  else if (cur) blocks.get(cur).push(line);
}
const block = name => { if (!blocks.has(name)) throw new Error(`profile.md has no heading "${name}"`); return blocks.get(name); };
const paras = name => block(name).filter(l => l && !l.startsWith('- ') && !/^\d+\. /.test(l));
const bullets = name => block(name).filter(l => l.startsWith('- ')).map(l => l.slice(2));
const labelled = (name, label) => bullets(name).find(b => b.startsWith(`**${label}:**`))?.replace(`**${label}:** `, '');
const tech = name => bullets(name).find(b => b.startsWith('Tech: '))?.slice(6);
// a number pulled from a sentence in profile.md; a reworded sentence fails loudly instead of leaving a stale tile
const grab = (re, text) => { const m = text.match(re); if (!m) throw new Error(`profile.md no longer matches ${re}`); return m; };

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/https:\/\/([^\s·,)]+)/g, (u, bare) => `<a href="${u}">${bare.replace(/\/$/, '')}</a>`);
const cap = s => s[0].toUpperCase() + s.slice(1);
const short = name => name.split(':')[0].replace(/ \(.*\)$/, '');
const chips = s => `<div class="chips">${s.replace(/\.$/, '').split(', ').map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>`;
const job = (head, when, body) => `<div class="item"><div class="role"><h3>${esc(head)}</h3><span class="when">${esc(when)}</span></div>${body}</div>`;

const [title] = [...blocks.keys()];
const [name, role] = title.split(', ');
const [tagline, links, pitch] = paras(title);
const roleHead = [...blocks.keys()].find(k => k.startsWith('Current role: '));
const [roleIntro, roleOwn] = paras(roleHead);
const scale = bullets(TOOLS[0]).find(b => b.startsWith('Scale: '));
const [, shipped, weeks] = grab(/shipped (\d+) tools to production in my first (\w+) weeks/, roleIntro);
const [, daily] = grab(/On a typical day ([\d–]+) staff use the platform/, roleIntro);
const [, loc] = grab(/about ([\d,]+) lines of code/, scale);
const [, tests] = grab(/([\d,]+\+?) automated tests/, scale);
const stats = [[shipped, `tools shipped in ${weeks} weeks`], [daily, 'daily platform users'],
  [loc, 'lines of code I own'], [tests, 'automated tests']];

const tools = TOOLS.map(t => `<div class="tool"><h4>${esc(short(t))}</h4><p>${inline(cap(labelled(t, 'After') ?? `${paras(t)[0]} ${bullets(t)[0]}`))}</p></div>`).join('');
const projects = PROJECTS.map(p => {
  const [text] = paras(p).filter(l => !l.startsWith('Demo: '));
  const demo = paras(p).find(l => l.startsWith('Demo: '));
  return `<div class="item project"><h3>${esc(short(p))}${demo ? `<span class="live">Live demo: ${inline(demo.slice(6))}</span>` : ''}</h3><p>${inline(text)}</p>${tech(p) ? chips(tech(p)) : ''}</div>`;
}).join('');
const pastJobs = ['Freelance Software Developer, Independent', 'Product Designer & Machinist, Ghandour Solutions'].map(r => {
  const b = bullets('Experience').find(b => b.startsWith(`**${r}**`));
  if (!b) throw new Error(`no "${r}" line under "Experience"`);
  const [, when, text] = b.match(/^\*\*.+?\*\* \((.+?)\): (.*)$/);
  return job(r, when, `<p>${inline(cap(text))}</p>`);
}).join('');
const skills = bullets('Skills').map(b => { const [, k, v] = b.match(/^\*\*(.+?):\*\* (.*)$/); return `<div><b>${esc(k)}</b><span>${inline(cap(v))}</span></div>`; }).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ibrahim Jaafar, CV</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=block" rel="stylesheet">
<style>
/* same accent colours and fonts as index.html, on white for print */
:root { --ink: #12141c; --body: #2f3446; --muted: #5a6075; --line: #e3e6ef; --soft: #f5f6fb;
  --a1: #7c5cff; --a2: #3fa9ff; --a3: #22d3ee; --grad: linear-gradient(120deg, var(--a1), var(--a2) 55%, var(--a3)); }
@page { size: A4; margin: 11mm 13mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font: 8.7pt/1.4 Inter, "Segoe UI", sans-serif; color: var(--body); margin: 0; }
h1, h2, h3, h4, .stat b, .role-title { font-family: "Space Grotesk", Inter, sans-serif; color: var(--ink); margin: 0; }
p { margin: 0 0 4px; }
a { color: var(--a1); text-decoration: none; white-space: nowrap; }
header { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 3px solid; border-image: var(--grad) 1; }
h1 { font-size: 25pt; line-height: 1.05; letter-spacing: -0.02em; }
.role-title { font-size: 12.5pt; font-weight: 600; width: fit-content; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tagline { color: var(--muted); }
.links { display: flex; flex-wrap: wrap; gap: 6px; }
.links a { font-size: 8.2pt; font-weight: 500; padding: 2px 9px; border-radius: 99px; background: var(--soft); border: 1px solid var(--line); }
.pitch { font-size: 9.6pt; color: var(--ink); margin: 9px 0 4px; }
ul.lead { margin: 0 0 8px; padding-left: 14px; color: var(--muted); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.stat { background: var(--soft); border-radius: 10px; padding: 7px 10px; border-left: 3px solid var(--a1); }
.stat:nth-child(2) { border-color: var(--a2); } .stat:nth-child(3) { border-color: var(--a3); } .stat:nth-child(4) { border-color: #4ade80; }
.stat b { display: block; font-size: 15pt; line-height: 1.15; } .stat span { font-size: 7.8pt; color: var(--muted); }
h2 { font-size: 9.8pt; text-transform: uppercase; letter-spacing: 0.12em; margin: 11px 0 5px; display: flex; align-items: center; gap: 8px; break-after: avoid; }
h2::before { content: ""; width: 18px; height: 4px; border-radius: 2px; background: var(--grad); }
h2::after { content: ""; flex: 1; height: 1px; background: var(--line); }
h3 { font-size: 10.3pt; } h4 { font-size: 8.9pt; }
.role { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 2px; }
.when { font-size: 8pt; font-weight: 600; color: var(--a1); white-space: nowrap; }
.item { margin-bottom: 7px; } .project { break-inside: avoid; } p { orphans: 2; widows: 2; }
.tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0; }
.tool { border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; break-inside: avoid; }
.tool p { margin: 1px 0 0; font-size: 8pt; line-height: 1.35; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.chip { font-size: 7.5pt; font-weight: 500; padding: 1px 7px; border-radius: 99px; background: var(--soft); border: 1px solid var(--line); color: #3b4157; }
.live { font-family: Inter, sans-serif; font-size: 8pt; font-weight: 500; color: var(--muted); margin-left: 8px; }
.skills { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
.skills b { display: block; font-size: 8.4pt; color: var(--ink); } .skills span { font-size: 8.2pt; }
.foot { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; break-inside: avoid; }
</style></head><body>
<header>
  <h1>${esc(name)}</h1>
  <div class="role-title">${esc(role)}</div>
  <p class="tagline">${inline(tagline)}</p>
  <div class="links"><a href="mailto:${MAIL}">${MAIL}</a>${links.match(/https:\/\/\S+/g).map(inline).join('')}</div>
</header>
<p class="pitch">${inline(pitch)}</p>
<!-- the Blue House summary line is skipped: Experience says it in full -->
<ul class="lead">${bullets(title).filter(b => !b.startsWith('AI Specialist at ')).map(b => `<li>${inline(b)}</li>`).join('')}</ul>
<div class="stats">${stats.map(([n, l]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div>
<h2>Experience</h2>
${job(roleHead.replace('Current role: ', '').replace(/ \(.*\)$/, ''), roleHead.match(/\((.*)\)/)[1],
  `<p>${inline(roleIntro)}</p><p>${inline(roleOwn)}</p><div class="tools">${tools}</div>${chips(tech(TOOLS[0]))}`)}
${pastJobs}
<h2>Selected AI projects</h2>${projects}
<h2>Skills</h2><div class="skills">${skills}</div>
<div class="foot">
  <div><h2>Education</h2><p>${inline(paras('Education')[0])}</p><h2>Languages</h2><p>${inline(paras('Languages')[0])}</p></div>
  <div><h2>Certifications</h2><p>${paras('Certifications')[0].split(' · ').map(esc).join('<br>')}</p></div>
</div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'cv-'));
try {
  writeFileSync(join(dir, 'cv.html'), html);
  // the time budget lets the web fonts load before Edge prints
  execFileSync(EDGE, ['--headless', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=10000', `--user-data-dir=${join(dir, 'edge')}`,
    `--print-to-pdf=${fileURLToPath(new URL('cv.pdf', import.meta.url))}`, pathToFileURL(join(dir, 'cv.html')).href], { stdio: 'ignore' });
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('cv.pdf written');
