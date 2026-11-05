// Builds cv.pdf from cv.md: a plain, recruiter-style CV with its own wording (the site's text lives in profile.md).
// Run: node make-cv.mjs   (needs Microsoft Edge, which prints the PDF). Fails if the CV runs past 2 pages.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// reversed pieces, so the address isn't readable in this repo; cv.md has {email} where it goes
const MAIL = ['moc.liamg', '7991.nonabel.miharbi'].map(x => [...x].reverse().join('')).reverse().join('@');
const PDF = fileURLToPath(new URL('cv.pdf', import.meta.url));

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace('{email}', `<a href="mailto:${MAIL}">${MAIL}</a>`)
  .replace(/\+961[\d ]+\d/, m => `<a href="tel:${m.replace(/ /g, '')}">${m}</a>`)
  .replace(/\b((?:ibrahim-jaafar\.github\.io|linkedin\.com\/in)[^\s·,]*)/g, '<a href="https://$1">$1</a>');

// the few markdown shapes cv.md uses: # name, ## section, ### job | dates, - bullet, plain lines
let html = '', list = false;
for (const line of readFileSync(new URL('cv.md', import.meta.url), 'utf8').replace(/\r/g, '').split('\n')) {
  if (list && !line.startsWith('- ')) { html += '</ul>'; list = false; }
  if (!line.trim()) continue;
  let m;
  if ((m = line.match(/^# (.*)/))) html += `<h1>${esc(m[1])}</h1>`;
  else if ((m = line.match(/^## (.*)/))) html += `<h2>${esc(m[1])}</h2>`;
  else if ((m = line.match(/^### (.*?)(?: \| (.*))?$/))) html += `<div class="job"><h3>${inline(m[1])}</h3><span>${esc(m[2] ?? '')}</span></div>`;
  else if (line.startsWith('- ')) { html += `${list ? '' : '<ul>'}<li>${inline(line.slice(2))}</li>`; list = true; }
  else if (/^\*\*\w+:\*\* /.test(line)) html += `<p class="c">${inline(line)}</p>`; // contact lines: **Label:** value
  else html += `<p>${inline(line)}</p>`;
}
if (list) html += '</ul>';
if (html.includes('{email}')) throw new Error('{email} was not filled in');

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ibrahim Jaafar, CV</title><style>
@page { size: A4; margin: 14mm 16mm; }
body { font: 9.8pt/1.38 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
a { color: inherit; text-decoration: none; white-space: nowrap; }
h1 { font-size: 20pt; margin: 0 0 2px; }
h1 + p { font-size: 10.5pt; font-weight: bold; margin: 0 0 2px; }
p.c { color: #333; margin: 0; }
p.c b { display: inline-block; width: 70px; color: #111; }
h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #111; padding-bottom: 1px; margin: 11px 0 5px; break-after: avoid; }
h3 { font-size: 10pt; margin: 0; }
.job { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; break-after: avoid; }
.job span { white-space: nowrap; }
p { margin: 0 0 3px; }
ul { margin: 2px 0 4px; padding-left: 15px; }
li { margin-bottom: 2px; }
.qr { position: absolute; top: 0; right: 0; width: 24mm; display: block; }
</style></head><body><a class="qr" href="https://ibrahim-jaafar.github.io/">${readFileSync(new URL('img/cv-qr.svg', import.meta.url), 'utf8')}</a>${html}</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'cv-'));
try {
  writeFileSync(join(dir, 'cv.html'), page);
  execFileSync(EDGE, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${join(dir, 'edge')}`,
    `--print-to-pdf=${PDF}`, pathToFileURL(join(dir, 'cv.html')).href], { stdio: 'ignore' });
} finally { rmSync(dir, { recursive: true, force: true }); }
const pages = (readFileSync(PDF, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
if (pages > 2) throw new Error(`cv.pdf is ${pages} pages; it must stay at 2`);
console.log(`cv.pdf written (${pages} pages)`);
