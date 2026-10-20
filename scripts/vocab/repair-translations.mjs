#!/usr/bin/env node
/**
 * Repairs rows where the line-based translation batch lost the English column:
 * in those rows `sr` contains an English word and `ru` contains the Serbian
 * translation. Re-translates the affected English headwords with JSON mode,
 * where every item has an explicit id, then rebuilds the review TSV.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const TSV = path.join(DATA, 'review', 'words.tsv');
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const BATCH = Number(process.env.BATCH || 20);

const TOPICS = [
  'people', 'family', 'body', 'health', 'food', 'drinks', 'animals', 'nature',
  'weather', 'home', 'city', 'transport', 'travel', 'work', 'school', 'shopping',
  'money', 'time', 'clothes', 'colors', 'emotions', 'communication',
  'technology', 'sports', 'culture', 'society', 'abstract', 'actions',
  'descriptions', 'grammar'
];

const rows = fs.readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean);
const header = rows.shift().split('\t');
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const parsed = rows.map((row, i) => ({ i, cells: row.split('\t') }));

const FORCE_REPAIR = new Set([
  'me|pronoun',
  'inevitable|adjective',
  'benign|adjective',
  'ghostly|adjective'
]);

function needsRepair(c) {
  const en = (c[idx.en] || '').toLowerCase();
  const sr = c[idx.sr] || '';
  const ru = c[idx.ru] || '';
  const pos = (c[idx.pos] || '').toLowerCase();
  if (!sr || !ru) return true;
  if (/\(/.test(sr)) return true;
  if (FORCE_REPAIR.has(en + '|' + pos)) return true;
  // Russian must be Cyrillic. A Latin-only line means the columns were lost.
  // Keep real acronyms (CD, DVD, HIV) out of this check.
  if (!/[а-яё]/i.test(ru) && /[a-zčćšžđ]/i.test(ru) && !/^[A-Z0-9 .-]+$/.test(ru)) return true;
  // An English pronoun/adverb/verb left in the Serbian column is not a
  // standard loanword. Nouns/adjectives are handled by the Latin-ru check
  // above so that album, sport and similar borrowings stay untouched.
  if (sr.toLowerCase() === en && /^(pronoun|conjunction|preposition|adverb|verb|modal auxiliary|auxiliary verb)$/.test(pos)) return true;
  return false;
}

const broken = parsed.filter(x => needsRepair(x.cells));
console.log(`Rows needing repair: ${broken.length}/${parsed.length}`);
if (!broken.length) process.exit(0);

async function ollama(prompt, numPredict = 8000) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const data = parseJson(await ollama(prompt));
  return Array.isArray(data.entries) ? data.entries : [];
}

let done = 0;
for (let i = 0; i < broken.length; i += BATCH) {
  const chunk = broken.slice(i, i + BATCH);
  const items = chunk.map((x, j) => ({
    id: j + 1,
    en: x.cells[idx.en],
    pos: x.cells[idx.pos],
    level: x.cells[idx.level]
  }));
  process.stdout.write(`  repair ${i + 1}-${i + chunk.length}/${broken.length} ... `);
  let results = [];
  try {
    results = await translate(items);
  } catch (err) {
    console.log('failed: ' + err.message);
  }
  const byId = new Map(results.map(r => [Number(r.id), r]));
  let ok = 0;
  for (let j = 0; j < chunk.length; j++) {
    const target = chunk[j];
    let r = byId.get(j + 1);
    if (!valid(r)) {
      try {
        const one = await translate([items[j]]);
        r = one[0];
      } catch { /* keep trying below */ }
    }
    if (!valid(r)) {
      console.log(`\n  unresolved: ${items[j].en} (${items[j].pos})`);
      continue;
    }
    const c = target.cells;
    c[idx.sr] = cleanSr(r.sr);
    c[idx.ru] = String(r.ru).trim();
    c[idx.topic] = r.topic;
    // Old stress belonged to a different word; leave it for Kaikki enrichment.
    c[idx.srStress] = '';
    c[idx.kaikki] = '';
    c[idx.croatian] = '';
    target.cells = c;
    ok++;
    done++;
  }
  console.log(`${ok}/${chunk.length}`);
}

fs.writeFileSync(TSV, [header.join('\t'), ...parsed.map(x => x.cells.join('\t'))].join('\n') + '\n');
console.log(`Repaired ${done}/${broken.length} rows.`);
