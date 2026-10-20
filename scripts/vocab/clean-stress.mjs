#!/usr/bin/env node
/**
 * Removes model-generated pitch accents that were not confirmed by Wiktionary.
 * The generator stores Kaikki/Wiktionary matches in data/review/words.tsv.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const REVIEW = path.join(DATA, 'review', 'words.tsv');

if (!fs.existsSync(REVIEW)) {
  console.error('Missing data/review/words.tsv; run generate-words.mjs first.');
  process.exit(1);
}

const rows = fs.readFileSync(REVIEW, 'utf8').split(/\r?\n/).filter(Boolean);
const header = rows.shift().split('\t');
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const bySr = new Map();
for (const row of rows) {
  const c = row.split('\t');
  const sr = c[idx.sr];
  if (!sr) continue;
  bySr.set(sr.toLowerCase(), {
    kaikki: c[idx.kaikki] === '1',
    srStress: c[idx.srStress] || ''
  });
}

function plain(s) {
  const vowels = new Set('aeiouAEIOUrR');
  let out = '';
  let prev = '';
  for (const ch of String(s || '').normalize('NFD')) {
    const cp = ch.codePointAt(0);
    // Remove combining marks from vowels/r (these are stress marks), but keep
    // č, ć, š, ž, đ — their marks are part of the letter.
    if (cp >= 0x0300 && cp <= 0x036f && vowels.has(prev)) continue;
    out += ch;
    prev = ch;
  }
  return out.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanTheme(t) {
  for (const w of t.words || []) {
    const info = bySr.get(String(w.sr || '').toLowerCase());
    // Base/imported words are not in the generated TSV; keep their authored
    // stress marks. Generated words only keep a Kaikki mark that matches the
    // word itself, which catches bad Kaikki homonym matches (e.g. spanać).
    if (!info) continue;
    if (info.kaikki && info.srStress && plain(info.srStress) === plain(w.sr)) {
      let stress = info.srStress;
      if (/^[a-zčćšžđ]/.test(w.sr) && /^[A-ZČĆŠŽĐ]/.test(stress)) {
        stress = stress[0].toLowerCase() + stress.slice(1);
      }
      w.srStress = stress;
    } else {
      delete w.srStress;
    }
  }
}

const words = JSON.parse(fs.readFileSync(path.join(DATA, 'words.json'), 'utf8'));
for (const t of words) cleanTheme(t);
fs.writeFileSync(path.join(DATA, 'words.json'), JSON.stringify(words, null, 2) + '\n');

const genFile = path.join(DATA, 'words.generated.json');
if (fs.existsSync(genFile)) {
  const gen = JSON.parse(fs.readFileSync(genFile, 'utf8'));
  for (const t of gen) cleanTheme(t);
  fs.writeFileSync(genFile, JSON.stringify(gen, null, 2) + '\n');
}

const total = words.reduce((n, t) => n + (t.words || []).length, 0);
const stressed = words.reduce((n, t) => n + (t.words || []).filter(w => w.srStress).length, 0);
console.log(`Stress marks: ${stressed}/${total} words confirmed by Wiktionary.`);
