import 'server-only';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { chromium, type Browser } from 'playwright-core';
import QRCode from 'qrcode';
import { env } from '../env';

/**
 * Card print files (PRODUCT.md §4.1 step 5): an HTML/SVG template (card-templates/) rendered by
 * headless Chromium into a PDF per member, front and back, CR80 + 3 mm bleed. Text, the QR and
 * SVG artwork stay vector; raster artwork must be 300 dpi at its printed size (the template
 * README says how). pdf-lib then sets TrimBox/BleedBox so a vendor's preflight sees the trim.
 */

const MM_TO_PT = 72 / 25.4;
/** CR80 85.6 × 54 mm + 3 mm bleed. */
const PAGE_MM = [91.6, 60] as const;

export interface TemplateMeta {
  name: string;
  version: number;
  trimMm: [number, number];
  bleedMm: number;
  safeMm: number;
}

export interface CardPrintData {
  fullName: string;
  nim: string;
  /** The card URL the QR encodes. */
  url: string;
}

export function templateDir(): string {
  const dir = env().CARD_TEMPLATE_DIR ?? 'card-templates/placeholder';
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let cached: { dir: string; html: string; meta: TemplateMeta } | null = null;

/** The template with its assets inlined. Cached per process; the folder is read once. */
export async function loadTemplate(): Promise<{ html: string; meta: TemplateMeta }> {
  const dir = templateDir();
  if (cached?.dir === dir && process.env.NODE_ENV === 'production') return cached;
  const [rawWithComments, metaRaw] = await Promise.all([readFile(path.join(dir, 'template.html'), 'utf8'), readFile(path.join(dir, 'template.json'), 'utf8')]);
  const meta = JSON.parse(metaRaw) as TemplateMeta;
  // Comments document the slots; they must not be treated as slots themselves.
  const raw = rawWithComments.replace(/<!--[\s\S]*?-->/g, '');
  const assets = new Map<string, string>();
  for (const m of raw.matchAll(/\{\{asset:([^}]+)\}\}/g)) {
    const rel = m[1]!.trim();
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Template asset outside its folder: ${rel}`);
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    assets.set(m[0], `data:${type};base64,${(await readFile(file)).toString('base64')}`);
  }
  let html = raw;
  for (const [marker, uri] of assets) html = html.split(marker).join(uri);
  cached = { dir, html, meta };
  return cached;
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#001836', light: '#ffffff' } });
}

/** Trim (red) and safe-area (blue) guides drawn over each page, for proofs only. */
function proofOverlay(meta: TemplateMeta): string {
  const b = meta.bleedMm;
  const s = meta.bleedMm + meta.safeMm;
  return `<style>
    .pats-proof { position: absolute; pointer-events: none; z-index: 99; }
    .pats-proof.trim { inset: ${b}mm; border: 0.2mm solid #ef4444; border-radius: 3.18mm; }
    .pats-proof.safe { inset: ${s}mm; border: 0.2mm dashed #2563eb; }
  </style>`;
}

export async function cardHtml(data: CardPrintData, opts: { proof?: boolean } = {}): Promise<string> {
  const { html, meta } = await loadTemplate();
  let out = html
    .split('{{fullName}}').join(escapeHtml(data.fullName))
    .split('{{nim}}').join(escapeHtml(data.nim))
    .split('{{qr}}').join(await qrSvg(data.url));
  if (opts.proof) {
    out = out
      .replace('</head>', `${proofOverlay(meta)}</head>`)
      .replace(/<section class="page([^"]*)">/g, '<section class="page$1"><div class="pats-proof trim"></div><div class="pats-proof safe"></div>');
  }
  return out;
}

// ─── Chromium ─────────────────────────────────────────────────────────────────

/** CHROMIUM_PATH, else Playwright's own browser, else the newest one in Playwright's cache (dev). */
function chromiumPath(): string | undefined {
  const fromEnv = env().CHROMIUM_PATH;
  if (fromEnv) return fromEnv;
  try {
    const own = chromium.executablePath();
    if (own && existsSync(own)) return undefined;
  } catch {
    // fall through to the cache scan
  }
  for (const root of [path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright')]) {
    if (!existsSync(root)) continue;
    const shells = readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
    for (const d of shells) {
      for (const bin of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
        const p = path.join(root, d, bin);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/** One shared browser, closed after a minute without work so it doesn't sit on memory. */
async function browser(): Promise<Browser> {
  if (idleTimer) clearTimeout(idleTimer);
  browserPromise ??= chromium.launch({ executablePath: chromiumPath(), args: ['--disable-dev-shm-usage', '--font-render-hinting=none'] }).catch((err) => {
    browserPromise = null;
    throw err;
  });
  return browserPromise;
}

function scheduleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const p = browserPromise;
    browserPromise = null;
    void p?.then((b) => b.close()).catch(() => undefined);
  }, 60_000);
  idleTimer.unref?.();
}

/**
 * Shrinks elements marked data-fit="lines:N;min:PT" until their text fits. Runs in the page; kept
 * as a string so no bundler or transpiler rewrites it on the way.
 */
const FIT_SCRIPT = `(() => {
  for (const el of document.querySelectorAll('[data-fit]')) {
    const opts = Object.fromEntries((el.dataset.fit || '').split(';').map((kv) => kv.split(':').map((s) => s.trim())));
    const lines = Number(opts.lines || 1);
    const min = Number(opts.min || 6);
    el.style.maxHeight = 'none';
    let size = parseFloat(getComputedStyle(el).fontSize) * 0.75;
    const fits = () => el.scrollHeight <= parseFloat(getComputedStyle(el).lineHeight) * lines + 0.5 && el.scrollWidth <= el.clientWidth + 0.5;
    while (!fits() && size > min) {
      size = Math.max(min, size - 0.25);
      el.style.fontSize = size + 'pt';
    }
  }
})()`;

export async function renderPdf(html: string): Promise<Uint8Array> {
  const b = await browser();
  const context = await b.newContext();
  try {
    const page = await context.newPage();
    // The sheet is 1 mm larger than the card page (see below); the template's own @page would be
    // centred on it, so this override pins the content to the top-left corner.
    const sheet = `<style>@page { size: ${PAGE_MM[0] + 1}mm ${PAGE_MM[1] + 1}mm; margin: 0; }</style>`;
    await page.setContent(html.includes('</head>') ? html.replace('</head>', `${sheet}</head>`) : sheet + html, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready.then(() => true)');
    await page.evaluate(FIT_SCRIPT);
    // Chromium rounds page sizes to whole points (91.6 mm comes out as 91.69 mm), so it renders on
    // a slightly larger sheet and finalizePdf crops the exact card size from the top-left corner.
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    return new Uint8Array(pdf);
  } finally {
    await context.close();
    scheduleClose();
  }
}

/**
 * Crops each page to exactly 91.6 × 60 mm from its top-left corner (MediaBox = CropBox = BleedBox)
 * and sets TrimBox (and ArtBox) to the 85.6 × 54 mm card, plus document info.
 */
export async function finalizePdf(bytes: Uint8Array, meta: TemplateMeta, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const bleed = meta.bleedMm * MM_TO_PT;
  const w = PAGE_MM[0] * MM_TO_PT;
  const h = PAGE_MM[1] * MM_TO_PT;
  for (const page of doc.getPages()) {
    const top = page.getMediaBox().height;
    const y = top - h;
    page.setMediaBox(0, y, w, h);
    page.setCropBox(0, y, w, h);
    page.setBleedBox(0, y, w, h);
    page.setTrimBox(bleed, y + bleed, w - 2 * bleed, h - 2 * bleed);
    page.setArtBox(bleed, y + bleed, w - 2 * bleed, h - 2 * bleed);
  }
  doc.setTitle(title);
  doc.setCreator(`PATS University card template: ${meta.name}`);
  doc.setProducer('PATS University');
  return doc.save();
}

export async function renderCardPdf(data: CardPrintData, opts: { proof?: boolean } = {}): Promise<Uint8Array> {
  const { meta } = await loadTemplate();
  const pdf = await renderPdf(await cardHtml(data, opts));
  return finalizePdf(pdf, meta, `KTM ${data.nim} ${data.fullName}`);
}

/** Every member's pages in order (front, back, front, back, …). */
export async function mergePdfs(files: Uint8Array[], title: string): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await PDFDocument.load(bytes);
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
  }
  out.setTitle(title);
  out.setProducer('PATS University');
  return out.save();
}

export { manifestCsv, type ManifestRow } from './manifest';
