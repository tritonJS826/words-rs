#!/usr/bin/env node
/**
 * Generates the built-in vocabulary for levels A1–C1.
 *
 * Sources (downloaded into .cache/, see README in this folder):
 *   - CEFR-J Vocabulary Profile 1.5 (A1–B2)
 *   - Octanove Vocabulary Profile 1.0 (C1)
 *   - HermitDave FrequencyWords Serbian 50k
 *   - Kaikki/Wiktionary Serbo-Croatian extract (optional accent validation)
 *
 * Translation is done with a local Ollama model (default: gemma4:31b-cloud).
 * No npm dependencies are required.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = path.join(ROOT, '.cache');
const DATA = path.join(ROOT, 'data');
const REVIEW = path.join(DATA, 'review');
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const BATCH = Number(process.env.BATCH || 100);
const ONLY_LEVEL = process.env.LEVEL || '';
const LIMIT = Number(process.env.LIMIT || 0);

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const TOPICS = [
  'people', 'family', 'body', 'health', 'food', 'drinks', 'animals', 'nature',
  'weather', 'home', 'city', 'transport', 'travel', 'work', 'school', 'shopping',
  'money', 'time', 'clothes', 'colors', 'emotions', 'communication',
  'technology', 'sports', 'culture', 'society', 'abstract', 'actions',
  'descriptions', 'grammar'
];
const TOPIC_SET = new Set(TOPICS);
const TOPIC_META = {
  people:        { name: 'Люди',                 emoji: '👥' },
  family:        { name: 'Семья',                emoji: '👨‍👩‍👧' },
  body:          { name: 'Тело',                 emoji: '🧍' },
  health:        { name: 'Здоровье',             emoji: '🩺' },
  food:          { name: 'Еда',                  emoji: '🍽️' },
  drinks:        { name: 'Напитки',              emoji: '🥤' },
  animals:       { name: 'Животные',             emoji: '🐾' },
  nature:        { name: 'Природа',              emoji: '🌿' },
  weather:       { name: 'Погода',               emoji: '🌦️' },
  home:          { name: 'Дом',                  emoji: '🏠' },
  city:          { name: 'Город',                emoji: '🏙️' },
  transport:     { name: 'Транспорт',            emoji: '🚗' },
  travel:        { name: 'Путешествия',          emoji: '✈️' },
  work:          { name: 'Работа',               emoji: '💼' },
  school:        { name: 'Учёба',                emoji: '🎓' },
  shopping:      { name: 'Покупки',              emoji: '🛍️' },
  money:         { name: 'Деньги',               emoji: '💰' },
  time:          { name: 'Время',                emoji: '⏰' },
  clothes:       { name: 'Одежда',              emoji: '👕' },
  colors:        { name: 'Цвета',                emoji: '🎨' },
  emotions:      { name: 'Эмоции',               emoji: '😊' },
  communication: { name: 'Общение',              emoji: '💬' },
  technology:    { name: 'Технологии',           emoji: '💻' },
  sports:        { name: 'Спорт',                emoji: '⚽' },
  culture:       { name: 'Культура',             emoji: '🎭' },
  society:       { name: 'Общество',             emoji: '🏛️' },
  abstract:      { name: 'Абстрактные понятия',  emoji: '🧠' },
  actions:       { name: 'Действия',             emoji: '🏃' },
  descriptions:  { name: 'Признаки',             emoji: '✨' },
  grammar:       { name: 'Грамматика',           emoji: '📐' }
};
const TOPIC_ALIASES = {
  person: 'people', persons: 'people', humans: 'people', relationships: 'family',
  relative: 'family', relatives: 'family', bodyparts: 'body', 'body parts': 'body',
  medicine: 'health', medical: 'health', illness: 'health', diseases: 'health',
  meals: 'food', cooking: 'food', kitchen: 'food', beverage: 'drinks',
  beverages: 'drinks', plants: 'nature', environment: 'nature', geography: 'nature',
  climate: 'weather', house: 'home', housing: 'home', buildings: 'city',
  places: 'city', vehicles: 'transport', vehicle: 'transport', movement: 'actions',
  occupations: 'work', jobs: 'work', profession: 'work', professions: 'work',
  education: 'school', study: 'school', learning: 'school', commerce: 'shopping',
  shopping: 'shopping', finance: 'money', numbers: 'abstract', quantity: 'abstract',
  calendar: 'time', dates: 'time', clothing: 'clothes', colour: 'colors',
  color: 'colors', feelings: 'emotions', emotion: 'emotions', mind: 'emotions',
  language: 'communication', media: 'communication', speech: 'communication',
  computers: 'technology', internet: 'technology', science: 'technology',
  games: 'sports', art: 'culture', music: 'culture', religion: 'culture',
  politics: 'society', law: 'society', community: 'society', social: 'society',
  ideas: 'abstract', concepts: 'abstract', state: 'abstract', states: 'abstract',
  verbs: 'actions', activity: 'actions', activities: 'actions',
  adjectives: 'descriptions', adverbs: 'descriptions', qualities: 'descriptions',
  grammar: 'grammar', function: 'grammar', pronouns: 'grammar',
  prepositions: 'grammar', conjunctions: 'grammar', articles: 'grammar'
};
const GRAMMAR_POS = new Set([
  'pronoun', 'preposition', 'conjunction', 'determiner', 'modal auxiliary',
  'be-verb', 'do-verb', 'have-verb', 'infinitive-to', 'article'
]);
const ALLOWED_POS = new Set([
  'noun', 'verb', 'adjective', 'adverb', 'number', 'interjection',
  ...GRAMMAR_POS
]);
const CROATIAN_TO_SERBIAN = {
  jučer: 'juče', gdje: 'gde', ovdje: 'ovde', ondje: 'onde', mlijeko: 'mleko',
  vrijeme: 'vreme', srijeda: 'sreda', lijep: 'lep', dijete: 'dete', tko: 'ko',
  nitko: 'niko', išta: 'išta', tisuća: 'hiljada', tisuće: 'hiljade',
  zrak: 'vazduh', zrakoplov: 'avion', kolodvor: 'stanica', vlak: 'voz',
  kazalište: 'pozorište', knjižnica: 'biblioteka', točno: 'tačno',
  točka: 'tačka', uopće: 'uopšte', van: 'napolju', unutra: 'unutra'
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function normalizeLevel(v) {
  const s = String(v || '').trim().toUpperCase();
  return LEVELS.includes(s) ? s : null;
}

function cleanHeadword(h) {
  return String(h || '').trim().replace(/\s+/g, ' ');
}

function isUsableHeadword(h) {
  if (!h || h.length > 40) return false;
  // Keep letters, apostrophes, hyphens and internal spaces; drop slashes,
  // dots, parentheses and other dictionary markup.
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]*$/.test(h);
}

function key(s) {
  return String(s || '').toLowerCase().normalize('NFC');
}

function plainKey(s) {
  return key(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zčćšžđ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSerbianStress(s) {
  return /[\u0200-\u0213]/.test(String(s || ''));
}

function cyrToLat(s) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z',
    'и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o',
    'п':'p','р':'r','с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c',
    'ч':'č','џ':'dž','ш':'š',
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z',
    'И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O',
    'П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C',
    'Ч':'Č','Џ':'Dž','Ш':'Š'
  };
  return String(s || '').replace(/[а-шА-Ш]/g, c => map[c] || c);
}

function cleanSr(value) {
  let s = String(value || '').normalize('NFC').trim();
  s = s.replace(/^[\s"'“”„«»()[\]{}-]+|[\s"'“”„«»()[\]{}.]+$/g, '');
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ');
  s = s.split(/\s*[;/]\s*/)[0];
  s = s.split(/\s*,\s*/)[0];
  s = s.replace(/\s+/g, ' ').trim();
  if (/[а-шА-Ш]/.test(s) && !/[a-zčćšžđ]/i.test(s)) s = cyrToLat(s);
  return s;
}

function cleanStress(value, sr) {
  let s = String(value || '').normalize('NFC').trim();
  s = s.replace(/^[\s"'“”„«»()[\]{}-]+|[\s"'“”„«»()[\]{}.]+$/g, '');
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ');
  s = s.split(/\s*[;/]\s*/)[0];
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || s === '-' || s === '—' || s === '–') return '';
  if (!hasSerbianStress(s)) return '';
  return s;
}

function cleanRu(value) {
  let s = String(value || '').normalize('NFC').trim();
  s = s.replace(/[\u0300\u0301]/g, '');
  s = s.replace(/^[\s"'“”„«»()[\]{}-]+|[\s"'“”„«»()[\]{}.]+$/g, '');
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ');
  s = s.split(/\s*;\s*/)[0];
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function normalizeTopic(topic, pos) {
  let t = key(topic).replace(/[^a-z ]/g, '').trim();
  t = TOPIC_ALIASES[t] || t;
  if (GRAMMAR_POS.has(pos)) return 'grammar';
  if (TOPIC_SET.has(t)) return t;
  if (pos === 'verb') return 'actions';
  if (pos === 'adjective' || pos === 'adverb') return 'descriptions';
  return 'abstract';
}

function loadFrequency() {
  const file = path.join(CACHE, 'sr_50k.txt');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const w = plainKey(line.split(/\s+/)[0]);
    if (w && !map.has(w)) map.set(w, i + 1);
  });
  return map;
}

function loadSources() {
  const rows = [];
  const cefrj = path.join(CACHE, 'cefrj.csv');
  const octanove = path.join(CACHE, 'octanove.csv');
  if (fs.existsSync(cefrj)) {
    for (const r of parseCsv(fs.readFileSync(cefrj, 'utf8')).slice(1)) {
      if (r.length < 3) continue;
      rows.push({ headword: r[0], pos: key(r[1]), level: normalizeLevel(r[2]), source: 'cefrj' });
    }
  }
  if (fs.existsSync(octanove)) {
    for (const r of parseCsv(fs.readFileSync(octanove, 'utf8')).slice(1)) {
      if (r.length < 3) continue;
      rows.push({ headword: r[0], pos: key(r[1]), level: normalizeLevel(r[2]), source: 'octanove' });
    }
  }
  // De-duplicate by headword+pos, keeping the easiest level.
  const map = new Map();
  for (const row of rows) {
    const h = cleanHeadword(row.headword);
    const pos = row.pos;
    if (!row.level || row.level === 'C2' || !ALLOWED_POS.has(pos)) continue;
    if (!isUsableHeadword(h)) continue;
    const k = key(h) + '|' + pos;
    const old = map.get(k);
    if (!old || LEVEL_ORDER[row.level] < LEVEL_ORDER[old.level]) map.set(k, { ...row, headword: h });
  }
  const list = [...map.values()];
  list.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
    a.headword.localeCompare(b.headword) || a.pos.localeCompare(b.pos));
  return list;
}

function buildPrompt(entries) {
  const lines = entries.map(e => `${e.headword} (${e.pos})`);
  return `You are a Serbian and Russian lexicographer. For each English word with its part of speech, give a standard Serbian translation, the same Serbian word with pitch/stress marks, a standard Russian translation, and one topic.

Topics: ${TOPICS.join(', ')}.

Rules:
- Serbian: Latin script, Ekavian, standard language; nouns in nominative singular, verbs in infinitive, adjectives in masculine singular. No Croatian variants, diminutives, plurals or explanations.
- Serbian stress: use Serbian pitch/stress marks (e.g. vòda, knjȉga, zdrȁvo). If you are not sure, repeat the plain word without marks.
- Russian: standard translation, nouns in nominative singular, verbs in infinitive, adjectives in masculine singular.
- Topic must be exactly one word from the list above. For pronouns, prepositions, conjunctions, determiners and other grammar words use "grammar".
- If an English grammar word has no direct Serbian equivalent (e.g. "the"), write "-" for Serbian.
- Output exactly one line per input in the format en|sr|srStress|ru|topic, in the same order.
- Every line MUST begin with the English headword exactly as given, followed by a pipe.
- No numbering, no explanations, no markdown, no extra text.

Example:
water|voda|vòda|вода|food

${lines.join('\n')}`;
}

async function ollama(prompt, numPredict = 12000) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.05, num_predict: numPredict }
    })
  });
  if (!res.ok) throw new Error('Ollama HTTP ' + res.status + ': ' + await res.text());
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.response || '';
}

function parseResponse(text, entries) {
  const byEn = new Map();
  entries.forEach((e, idx) => {
    e._idx = idx;
    const k = key(e.headword);
    if (!byEn.has(k)) byEn.set(k, []);
    byEn.get(k).push(e);
  });
  const used = new Set();
  const out = [];
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (let line of lines) {
    line = line.replace(/^`+|`+$/g, '').replace(/^[-*]\s+/, '');
    if (!line || line.startsWith('#') || line.startsWith('Here') || line.startsWith('```')) continue;
    let parts = line.split('|').map(s => s.trim());
    let e = null;
    let positional = false;
    if (parts.length >= 5) {
      const en = key(parts[0]);
      const queue = (byEn.get(en) || []).filter(x => !used.has(x._idx));
      e = queue[0];
    } else if (parts.length === 4) {
      // Some models omit the echoed English headword; align by input order.
      positional = true;
      e = entries.find(x => !used.has(x._idx));
      if (e) parts = [e.headword, ...parts];
    }
    if (!e || used.has(e._idx)) continue;
    if (positional) used.add(e._idx);
    const topic = parts[parts.length - 1];
    const ru = parts.slice(3, -1).join('|');
    const sr = cleanSr(parts[1]);
    const stress = cleanStress(parts[2], sr);
    const ruClean = cleanRu(ru);
    if (!sr || sr === '-' || sr === '—' || sr === '–' || !ruClean) continue;
    used.add(e._idx);
    out.push({
      ...e,
      sr,
      srStress: stress,
      ru: ruClean,
      topic: normalizeTopic(topic, e.pos)
    });
  }
  return out;
}

async function translate(entries, attempt = 1) {
  if (!entries.length) return [];
  const got = [];
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    process.stdout.write(`  batch ${i + 1}-${i + chunk.length} / ${entries.length} ... `);
    const started = Date.now();
    let response = '';
    try {
      response = await ollama(buildPrompt(chunk));
    } catch (err) {
      console.error('FAILED:', err.message);
    }
    if (process.env.DEBUG) console.log('\nRAW:', JSON.stringify(response.slice(0, 800)));
    const parsed = parseResponse(response, chunk);
    got.push(...parsed);
    console.log(`${parsed.length}/${chunk.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (parsed.length < chunk.length && attempt < 2) {
      const missing = chunk.filter(x => !parsed.some(p => p.headword === x.headword && p.pos === x.pos));
      const retried = await translate(missing, attempt + 1);
      got.push(...retried);
    }
  }
  return got;
}

function applySerbianVariant(sr, freq) {
  const k = plainKey(sr);
  if (!k || freq.has(k)) return sr;
  const alt = CROATIAN_TO_SERBIAN[k];
  if (alt && freq.has(plainKey(alt))) return alt;
  return sr;
}

function mergeKaikki(entries) {
  const file = path.join(CACHE, 'sh.jsonl');
  if (!fs.existsSync(file)) return Promise.resolve(new Map());
  const wanted = new Set(entries.map(e => plainKey(e.sr)));
  const map = new Map();
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    let n = 0;
    rl.on('line', line => {
      n++;
      if (!line.trim()) return;
      let d;
      try { d = JSON.parse(line); } catch { return; }
      if (d.lang_code !== 'sh' || !d.word) return;
      const k = plainKey(d.word);
      if (!wanted.has(k)) return;
      const forms = Array.isArray(d.forms) ? d.forms : [];
      const canonical = forms.find(f => (f.tags || []).includes('canonical') && /[a-zčćšžđ]/i.test(f.form || '') && !/[а-ш]/i.test(f.form || ''));
      const head = d.head_templates?.[0]?.args?.['1'];
      const accent = canonical?.form || (head && /[\u0200-\u0213]/.test(head) ? head : '');
      const senseTags = new Set((d.senses || []).flatMap(s => s.tags || []));
      const rec = {
        word: d.word,
        pos: d.pos,
        accent,
        ipa: d.sounds?.find(s => s.ipa)?.ipa || '',
        audio: d.sounds?.find(s => s.mp3_url)?.mp3_url || '',
        croatian: senseTags.has('Croatian') || senseTags.has('Croatia'),
        bosnian: senseTags.has('Bosnian'),
        serbian: senseTags.has('Serbian')
      };
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(rec);
      if (n % 100000 === 0) process.stderr.write(`\r  kaikki: ${n} lines`);
    });
    rl.on('close', () => {
      process.stderr.write(`\r  kaikki: ${n} lines\n`);
      resolve(map);
    });
    rl.on('error', err => { console.error('Kaikki read failed:', err.message); resolve(map); });
  });
}

function themeChunks(words) {
  const chunks = [];
  for (let i = 0; i < words.length; i += 50) chunks.push(words.slice(i, i + 50));
  return chunks;
}

async function main() {
  ensureDir(REVIEW);
  const baseFile = path.join(DATA, 'words.base.json');
  const base = fs.existsSync(baseFile)
    ? JSON.parse(fs.readFileSync(baseFile, 'utf8'))
    : JSON.parse(fs.readFileSync(path.join(DATA, 'words.json'), 'utf8'));
  for (const t of base) if (!t.level) t.level = 'A1';

  let entries = loadSources();
  if (ONLY_LEVEL) entries = entries.filter(e => e.level === ONLY_LEVEL);
  if (LIMIT) entries = entries.slice(0, LIMIT);
  console.log(`CEFR entries to translate: ${entries.length}`);
  const byLevel = Object.fromEntries(LEVELS.map(l => [l, entries.filter(e => e.level === l).length]));
  console.log('By level:', byLevel);

  const freq = loadFrequency();
  const translated = await translate(entries);
  console.log(`Translated: ${translated.length}/${entries.length}`);

  // Frequency-based cleanups and dedupe.
  const baseSr = new Set(base.flatMap(t => t.words || []).map(w => plainKey(w.sr)));
  const seen = new Set(baseSr);
  const unique = [];
  for (const e of translated) {
    e.sr = applySerbianVariant(e.sr, freq);
    const k = plainKey(e.sr);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    e.freq = freq.get(k) || 999999;
    unique.push(e);
  }
  console.log(`Unique new words: ${unique.length}`);

  // Optional Wiktionary accent validation.
  const kaikki = await mergeKaikki(unique);
  for (const e of unique) {
    const recs = kaikki.get(plainKey(e.sr)) || [];
    const exact = recs.find(r => r.pos === e.pos) || recs[0];
    if (exact) {
      e.kaikki = true;
      e.croatian = !!exact.croatian;
      e.srStress = exact.accent || '';
      e.audio = exact.audio || '';
      e.ipa = exact.ipa || '';
    } else {
      e.kaikki = false;
      e.croatian = false;
      // Do not ship model-generated stress marks: Serbian pitch accent is easy
      // to get wrong, and a missing mark is safer than a misleading one.
      e.srStress = '';
    }
  }

  // Group by level + topic, then split oversized topics.
  const groups = new Map();
  for (const e of unique) {
    const gk = e.level + '|' + e.topic;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(e);
  }
  const generated = [];
  for (const level of LEVELS) {
    for (const topic of TOPICS) {
      const list = (groups.get(level + '|' + topic) || [])
        .sort((a, b) => a.freq - b.freq || a.sr.localeCompare(b.sr));
      if (!list.length) continue;
      const meta = TOPIC_META[topic];
      const chunks = themeChunks(list);
      chunks.forEach((chunk, i) => {
        const suffix = chunks.length > 1 ? ` ${i + 1}` : '';
        generated.push({
          id: `${level.toLowerCase()}-${topic}${chunks.length > 1 ? '-' + (i + 1) : ''}`,
          level,
          name: meta.name + suffix,
          emoji: meta.emoji,
          words: chunk.map(e => {
            const w = { ru: e.ru, sr: e.sr };
            if (e.srStress) w.srStress = e.srStress;
            // No per-word emoji for generated vocabulary: the UI falls back to
            // text quizzes for words without an emoji.
            return w;
          })
        });
      });
    }
  }

  const all = [...base, ...generated];
  fs.writeFileSync(path.join(DATA, 'words.json'), JSON.stringify(all, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'words.generated.json'), JSON.stringify(generated, null, 2) + '\n');

  const header = ['level', 'en', 'pos', 'sr', 'srStress', 'ru', 'topic', 'source', 'freq', 'kaikki', 'croatian', 'ipa', 'audio'];
  const tsv = [header.join('\t')];
  for (const e of unique.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.headword.localeCompare(b.headword))) {
    tsv.push([e.level, e.headword, e.pos, e.sr, e.srStress || '', e.ru, e.topic, e.source, e.freq === 999999 ? '' : e.freq, e.kaikki ? '1' : '', e.croatian ? '1' : '', e.ipa || '', e.audio || ''].join('\t'));
  }
  fs.writeFileSync(path.join(REVIEW, 'words.tsv'), tsv.join('\n') + '\n');
  fs.writeFileSync(path.join(REVIEW, 'summary.json'), JSON.stringify({
    model: MODEL,
    generatedAt: new Date().toISOString(),
    cefrEntries: entries.length,
    translated: translated.length,
    unique: unique.length,
    themes: generated.length,
    byLevel: Object.fromEntries(LEVELS.map(l => [l, unique.filter(e => e.level === l).length])),
    byTopic: Object.fromEntries(TOPICS.map(t => [t, unique.filter(e => e.topic === t).length])),
    kaikkiMatched: unique.filter(e => e.kaikki).length,
    croatianFlagged: unique.filter(e => e.croatian).length
  }, null, 2) + '\n');
  console.log('Wrote data/words.json, data/words.generated.json, data/review/words.tsv');
  console.log('Themes:', generated.length, 'Words:', unique.length);
}

main().catch(err => { console.error(err); process.exit(1); });
