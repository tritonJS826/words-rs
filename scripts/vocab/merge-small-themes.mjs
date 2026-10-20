#!/usr/bin/env node
/**
 * Merges very small generated themes (1–2 words) into a level-level "Разное"
 * theme. Tiny themes make the picture/text quiz impossible to build because
 * it needs at least three answer options.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const BASE_IDS = new Set(['greetings', 'family', 'food', 'drinks', 'numbers', 'verbs']);
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

const words = JSON.parse(fs.readFileSync(path.join(DATA, 'words.json'), 'utf8'));
const base = words.filter(t => BASE_IDS.has(t.id));
let generated = words.filter(t => !BASE_IDS.has(t.id));

for (const level of LEVELS) {
  const levelThemes = generated.filter(t => t.level === level);
  const small = levelThemes.filter(t => (t.words || []).length < 3);
  if (!small.length) continue;
  const smallIds = new Set(small.map(t => t.id));
  const smallWords = small.flatMap(t => t.words || []);
  generated = generated.filter(t => !smallIds.has(t.id));

  const miscId = `${level.toLowerCase()}-misc`;
  let misc = generated.find(t => t.id === miscId);
  if (misc) {
    misc.words.push(...smallWords);
  } else if (smallWords.length >= 3) {
    misc = { id: miscId, level, name: 'Разное', emoji: '📦', words: smallWords };
    generated.push(misc);
  } else {
    // A level with only a couple of words: append them to the largest theme
    // instead of leaving a quiz with fewer than three options.
    const largest = generated
      .filter(t => t.level === level)
      .sort((a, b) => (b.words || []).length - (a.words || []).length)[0];
    if (largest) largest.words.push(...smallWords);
    else if (smallWords.length) {
      misc = { id: miscId, level, name: 'Разное', emoji: '📦', words: smallWords };
      generated.push(misc);
    }
  }
}

// Keep words unique inside a theme and sort the merged tail.
for (const t of generated) {
  const seen = new Set();
  t.words = (t.words || []).filter(w => {
    const k = String(w.sr || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const levelOrder = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
generated.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || a.name.localeCompare(b.name, 'ru'));

// The original six themes already have progress in localStorage. Where a
// generated A1 theme covers the same ground, append to the old theme and keep
// its id instead of showing two themes with the same name.
const baseMerge = { family: 'a1-family', food: 'a1-food', drinks: 'a1-drinks' };
for (const [baseId, generatedId] of Object.entries(baseMerge)) {
  const old = base.find(t => t.id === baseId);
  const extra = generated.find(t => t.id === generatedId);
  if (old && extra) {
    old.words.push(...extra.words);
    generated = generated.filter(t => t.id !== generatedId);
  }
}

const final = [...base, ...generated];
fs.writeFileSync(path.join(DATA, 'words.json'), JSON.stringify(final, null, 2) + '\n');
fs.writeFileSync(path.join(DATA, 'words.generated.json'), JSON.stringify(generated, null, 2) + '\n');
console.log(`Merged small themes. Themes: ${final.length}, generated: ${generated.length}`);
