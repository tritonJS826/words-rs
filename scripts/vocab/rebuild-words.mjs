#!/usr/bin/env node
/**
 * Rebuilds data/words.json from the reviewed TSV. Useful after repairing
 * translations, changing topic assignment, or re-running stress validation.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const TSV = path.join(DATA, 'review', 'words.tsv');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const TOPICS = [
  'people', 'family', 'body', 'health', 'food', 'drinks', 'animals', 'nature',
  'weather', 'home', 'city', 'transport', 'travel', 'work', 'school', 'shopping',
  'money', 'time', 'clothes', 'colors', 'emotions', 'communication',
  'technology', 'sports', 'culture', 'society', 'abstract', 'actions',
  'descriptions', 'grammar'
];
const TOPIC_META = {
  people: { name: 'Люди', emoji: '👥' }, family: { name: 'Семья', emoji: '👨‍👩‍👧' },
  body: { name: 'Тело', emoji: '🧍' }, health: { name: 'Здоровье', emoji: '🩺' },
  food: { name: 'Еда', emoji: '🍽️' }, drinks: { name: 'Напитки', emoji: '🥤' },
  animals: { name: 'Животные', emoji: '🐾' }, nature: { name: 'Природа', emoji: '🌿' },
  weather: { name: 'Погода', emoji: '🌦️' }, home: { name: 'Дом', emoji: '🏠' },
  city: { name: 'Город', emoji: '🏙️' }, transport: { name: 'Транспорт', emoji: '🚗' },
  travel: { name: 'Путешествия', emoji: '✈️' }, work: { name: 'Работа', emoji: '💼' },
  school: { name: 'Учёба', emoji: '🎓' }, shopping: { name: 'Покупки', emoji: '🛍️' },
  money: { name: 'Деньги', emoji: '💰' }, time: { name: 'Время', emoji: '⏰' },
  clothes: { name: 'Одежда', emoji: '👕' }, colors: { name: 'Цвета', emoji: '🎨' },
  emotions: { name: 'Эмоции', emoji: '😊' }, communication: { name: 'Общение', emoji: '💬' },
  technology: { name: 'Технологии', emoji: '💻' }, sports: { name: 'Спорт', emoji: '⚽' },
  culture: { name: 'Культура', emoji: '🎭' }, society: { name: 'Общество', emoji: '🏛️' },
  abstract: { name: 'Абстрактные понятия', emoji: '🧠' }, actions: { name: 'Действия', emoji: '🏃' },
  descriptions: { name: 'Признаки', emoji: '✨' }, grammar: { name: 'Грамматика', emoji: '📐' }
};
const BASE_IDS = new Set(['greetings', 'family', 'food', 'drinks', 'numbers', 'verbs']);

const rows = fs.readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean);
const header = rows.shift().split('\t');
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const entries = [];
for (const row of rows) {
  const c = row.split('\t');
  const sr = c[idx.sr];
  const ru = c[idx.ru];
  if (!sr || !ru || !/[а-яё]/i.test(ru)) continue;
  entries.push({
    level: c[idx.level],
    en: c[idx.en],
    pos: c[idx.pos],
    sr,
    srStress: c[idx.kaikki] === '1' ? (c[idx.srStress] || '') : '',
    ru,
    topic: TOPICS.includes(c[idx.topic]) ? c[idx.topic] : 'abstract',
    freq: Number(c[idx.freq]) || 999999
  });
}

const base = JSON.parse(fs.readFileSync(path.join(DATA, 'words.base.json'), 'utf8'));
const baseSr = new Set(base.flatMap(t => t.words || []).map(w => String(w.sr).toLowerCase()));
const seen = new Set(baseSr);
const unique = [];
for (const e of entries) {
  const k = String(e.sr).toLowerCase();
  if (!k || seen.has(k)) continue;
  seen.add(k);
  unique.push(e);
}

const groups = new Map();
for (const e of unique) {
  const k = e.level + '|' + e.topic;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

const generated = [];
for (const level of LEVELS) {
  for (const topic of TOPICS) {
    const list = (groups.get(level + '|' + topic) || [])
      .sort((a, b) => a.freq - b.freq || a.sr.localeCompare(b.sr));
    if (!list.length) continue;
    const meta = TOPIC_META[topic];
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const part = Math.floor(i / 50) + 1;
      const total = Math.ceil(list.length / 50);
      generated.push({
        id: `${level.toLowerCase()}-${topic}${total > 1 ? '-' + part : ''}`,
        level,
        name: meta.name + (total > 1 ? ` ${part}` : ''),
        emoji: meta.emoji,
        words: chunk.map(e => {
          const w = { ru: e.ru, sr: e.sr };
          if (e.srStress) w.srStress = e.srStress;
          return w;
        })
      });
    }
  }
}

// Merge the original A1 themes that overlap with generated topics, preserving
// the ids that already have progress in localStorage.
const baseMerge = { family: 'a1-family', food: 'a1-food', drinks: 'a1-drinks' };
let gen = generated;
for (const [baseId, generatedId] of Object.entries(baseMerge)) {
  const old = base.find(t => t.id === baseId);
  const extra = gen.find(t => t.id === generatedId);
  if (old && extra) {
    old.words.push(...extra.words);
    gen = gen.filter(t => t.id !== generatedId);
  }
}

// Merge 1–2 word themes so the quiz always has at least three options.
for (const level of LEVELS) {
  const small = gen.filter(t => t.level === level && (t.words || []).length < 3);
  if (!small.length) continue;
  const smallIds = new Set(small.map(t => t.id));
  const smallWords = small.flatMap(t => t.words || []);
  gen = gen.filter(t => !smallIds.has(t.id));
  const miscId = `${level.toLowerCase()}-misc`;
  let misc = gen.find(t => t.id === miscId);
  if (misc) misc.words.push(...smallWords);
  else if (smallWords.length >= 3) {
    misc = { id: miscId, level, name: 'Разное', emoji: '📦', words: smallWords };
    gen.push(misc);
  } else {
    const largest = gen.filter(t => t.level === level).sort((a, b) => b.words.length - a.words.length)[0];
    if (largest) largest.words.push(...smallWords);
    else if (smallWords.length) gen.push({ id: miscId, level, name: 'Разное', emoji: '📦', words: smallWords });
  }
}

const sortLevel = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
gen.sort((a, b) => sortLevel[a.level] - sortLevel[b.level] || a.name.localeCompare(b.name, 'ru'));
for (const t of gen) {
  const local = new Set();
  t.words = t.words.filter(w => {
    const k = String(w.sr).toLowerCase();
    if (local.has(k)) return false;
    local.add(k);
    return true;
  });
}

const final = [...base, ...gen];
fs.writeFileSync(path.join(DATA, 'words.json'), JSON.stringify(final, null, 2) + '\n');
fs.writeFileSync(path.join(DATA, 'words.generated.json'), JSON.stringify(gen, null, 2) + '\n');
console.log(`Rebuilt ${final.length} themes, ${final.reduce((n, t) => n + t.words.length, 0)} words.`);
