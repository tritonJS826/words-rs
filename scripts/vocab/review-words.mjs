#!/usr/bin/env node
/**
 * AI review pass over the generated vocabulary.
 *
 * 1. A reviewer model flags entries whose Serbian/Russian translation does not
 *    match the English headword, part of speech or level.
 * 2. Flagged entries are re-translated from scratch with JSON ids (safe against
 *    column drift), validated, and written back to data/review/words.tsv.
 *
 * Run `node scripts/vocab/rebuild-words.mjs` afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const TSV = path.join(DATA, 'review', 'words.tsv');
const FLAGGED_TSV = path.join(DATA, 'review', 'flagged.tsv');
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const REVIEW_BATCH = Number(process.env.REVIEW_BATCH || 80);
const FIX_BATCH = Number(process.env.FIX_BATCH || 20);

const TOPICS = [
  'people', 'family', 'body', 'health', 'food', 'drinks', 'animals', 'nature',
  'weather', 'home', 'city', 'transport', 'travel', 'work', 'school', 'shopping',
  'money', 'time', 'clothes', 'colors', 'emotions', 'communication',
  'technology', 'sports', 'culture', 'society', 'abstract', 'actions',
  'descriptions', 'grammar'
];

const rows = fs.readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean);
const header = rows.shift().split('\t');
if (!header.includes('reviewed')) {
  header.push('reviewed');
  for (let i = 0; i < rows.length; i++) rows[i] += '\t';
}
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const parsed = rows.map(row => ({ cells: row.split('\t') })).filter(x => x.cells[idx.en] !== 'pH');
const PENDING = path.join(DATA, 'review', 'flagged-pending.json');
let pendingFlags = [];
if (fs.existsSync(PENDING)) {
  try { pendingFlags = JSON.parse(fs.readFileSync(PENDING, 'utf8')); } catch {}
}

async function ollama(prompt, numPredict = 8000) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT || 180000)),
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.05, num_predict: numPredict }
    })
  });
  if (!res.ok) throw new Error('Ollama HTTP ' + res.status + ': ' + await res.text());
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.response || '';
}

function parseJson(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

function cleanSr(s) {
  return String(s || '').normalize('NFC').trim()
    .replace(/^[\s"'“”„«»()[\]{}-]+|[\s"'“”„«»()[\]{}.]+$/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split(/\s*[;/]\s*/)[0]
    .split(/\s*,\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function valid(result) {
  const sr = cleanSr(result?.sr);
  const ru = String(result?.ru || '').trim();
  return !!sr && !/\(/.test(sr) && /[а-яё]/i.test(ru) && TOPICS.includes(result?.topic);
}

async function review(items) {
  const prompt = `You are a meticulous Serbian and Russian lexicographer reviewing a CEFR vocabulary list. For each entry, decide whether BOTH translations match the English headword, its part of speech and level. Flag entries where the Serbian or Russian translation has a different meaning, wrong gender/aspect/number, an English word instead of Serbian, or a Russian translation that is actually Serbian. Do not flag acceptable synonyms or minor style differences. Return JSON exactly: {"entries":[{"id":1,"ok":true,"why":""}]}. No extra text.

Input:
${JSON.stringify(items)}`;
  const data = parseJson(await ollama(prompt, 6000));
  return Array.isArray(data.entries) ? data.entries : [];
}

async function translate(items) {
  const prompt = `You are a Serbian and Russian lexicographer. Translate each English word into standard Serbian and standard Russian.
Return JSON exactly in this shape: {"entries":[{"id":1,"sr":"...","ru":"...","topic":"..."}]}
Rules:
- sr: Serbian Latin script, Ekavian, nominative singular for nouns, infinitive for verbs, masculine singular for adjectives. Do not return the English word unless it is a standard Serbian loanword.
- ru: Russian Cyrillic script, nominative singular for nouns, infinitive for verbs, masculine singular for adjectives.
- topic: one of ${TOPICS.join(', ')}. Use grammar for function words.
- Keep the same id for each input.
- No extra text, only JSON.

Input:
${JSON.stringify(items)}`;
  const data = parseJson(await ollama(prompt, 8000));
  return Array.isArray(data.entries) ? data.entries : [];
}

const pending = parsed.filter(x => x.cells[idx.reviewed] !== '1');
console.log(`Unreviewed rows: ${pending.length}/${parsed.length}`);
const flagged = [];
for (const f of pendingFlags) {
  const target = parsed.find(x =>
    x.cells[idx.en] === f.en && x.cells[idx.pos] === f.pos &&
    x.cells[idx.level] === f.level && x.cells[idx.sr] === f.sr
  );
  if (target) flagged.push({ ...f, target });
}
for (let i = 0; i < pending.length; i += REVIEW_BATCH) {
  const chunk = pending.slice(i, i + REVIEW_BATCH);
  const items = chunk.map((x, j) => ({
    id: j + 1,
    en: x.cells[idx.en],
    pos: x.cells[idx.pos],
    level: x.cells[idx.level],
    sr: x.cells[idx.sr],
    ru: x.cells[idx.ru],
    topic: x.cells[idx.topic]
  }));
  process.stdout.write(`  review ${i + 1}-${i + chunk.length}/${pending.length} ... `);
  let out = [];
  try {
    out = await review(items);
  } catch (err) {
    console.log('failed: ' + err.message);
  }
  const byId = new Map(out.map(x => [Number(x.id), x]));
  let n = 0;
  for (let j = 0; j < chunk.length; j++) {
    const x = byId.get(j + 1);
    if (!x) continue;
    const changed = (x.sr && x.sr !== items[j].sr) || (x.ru && x.ru !== items[j].ru);
    if (x.ok === false || changed) {
      const item = {
        en: items[j].en,
        pos: items[j].pos,
        level: items[j].level,
        sr: items[j].sr,
        why: x.why || ''
      };
      flagged.push({ ...item, target: chunk[j] });
      pendingFlags.push(item);
      n++;
    }
  }
  for (const x of chunk) x.cells[idx.reviewed] = '1';
  fs.writeFileSync(TSV, [header.join('\t'), ...parsed.map(x => x.cells.join('\t'))].join('\n') + '\n');
  fs.writeFileSync(PENDING, JSON.stringify(pendingFlags, null, 2) + '\n');
  console.log(`${n}/${chunk.length} flagged`);
}

console.log(`Flagged ${flagged.length} entries; re-translating.`);
const fixRows = [];
for (let i = 0; i < flagged.length; i += FIX_BATCH) {
  const chunk = flagged.slice(i, i + FIX_BATCH);
  const items = chunk.map((x, j) => ({
    id: j + 1,
    en: x.target.cells[idx.en],
    pos: x.target.cells[idx.pos],
    level: x.target.cells[idx.level]
  }));
  process.stdout.write(`  fix ${i + 1}-${i + chunk.length}/${flagged.length} ... `);
  let out = [];
  try {
    out = await translate(items);
  } catch (err) {
    console.log('failed: ' + err.message);
  }
  const byId = new Map(out.map(x => [Number(x.id), x]));
  let n = 0;
  for (let j = 0; j < chunk.length; j++) {
    const r = byId.get(j + 1);
    const c = chunk[j].target.cells;
    const old = { sr: c[idx.sr], ru: c[idx.ru], topic: c[idx.topic] };
    if (!valid(r)) {
      fixRows.push({ ...chunk[j], old, next: old, status: 'invalid' });
      continue;
    }
    const next = { sr: cleanSr(r.sr), ru: String(r.ru).trim(), topic: r.topic };
    if (next.sr === old.sr && next.ru === old.ru) {
      fixRows.push({ ...chunk[j], old, next, status: 'unchanged' });
      continue;
    }
    c[idx.sr] = next.sr;
    c[idx.ru] = next.ru;
    c[idx.topic] = next.topic;
    c[idx.srStress] = '';
    c[idx.kaikki] = '';
    c[idx.croatian] = '';
    fixRows.push({ ...chunk[j], old, next, status: 'fixed' });
    n++;
  }
  console.log(`${n}/${chunk.length} fixed`);
}

fs.writeFileSync(TSV, [header.join('\t'), ...parsed.map(x => x.cells.join('\t'))].join('\n') + '\n');
fs.writeFileSync(
  FLAGGED_TSV,
  ['en\tpos\tlevel\told_sr\told_ru\tnew_sr\tnew_ru\tstatus\treason\n',
    ...fixRows.map(x =>
      [x.en, x.pos, x.level, x.old.sr, x.old.ru, x.next.sr, x.next.ru, x.status, String(x.why).replace(/\t/g, ' ')].join('\t')
    )
  ].join('\n')
);
try { fs.rmSync(PENDING, { force: true }); } catch {}
console.log(`Review done. Flagged: ${flagged.length}, fixed: ${fixRows.filter(x => x.status === 'fixed').length}.`);
