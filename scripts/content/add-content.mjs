#!/usr/bin/env node
/**
 * Adds a few extra lesson courses and dialogs to the already-merged app data.
 *
 * The original generator expected data/*.base.json and data/*.generated.json.
 * Those build-only files are no longer shipped, so this script is intentionally
 * additive: it reads data/lessons.json and data/dialogs.json, generates new
 * content with Ollama, validates it, and appends it with unique ids.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const ONLY = process.env.ONLY || 'all';

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}
function writeJson(name, value) {
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(value, null, 2) + '\n');
}

async function ollama(prompt, numPredict = 18000) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT || 240000)),
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.25, num_predict: numPredict }
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

function cleanHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

const COURSES = [
  {
    id: 'a1-course-2',
    level: 'A1',
    emoji: '🧺',
    title: 'Сербский A1: первые недели',
    description: 'Практический курс для первых недель в Сербии: знакомство, магазин, транспорт, кафе, врач и повседневные дела.',
    grammar: 'present tense, basic accusative/locative, questions, numbers, polite phrases, everyday vocabulary',
    blocks: [
      'Знакомство и вежливость',
      'В магазине и на рынке',
      'Транспорт и город',
      'В кафе и ресторане',
      'У врача и в аптеке',
      'Дом и повседневные дела'
    ]
  },
  {
    id: 'a2-course-2',
    level: 'A2',
    emoji: '🧳',
    title: 'Сербский A2: путешествия и здоровье',
    description: 'Расширяем A2: неправильный перфект, локатив, генитив, планы на будущее и язык путешествий.',
    grammar: 'irregular perfekat, lokativ, genitiv, futur I, introduction to verbal aspect, travel and health situations',
    blocks: [
      'Перфект: неправильные глаголы',
      'Локатив и направление',
      'Генитив: количество и принадлежность',
      'Футур I в планах',
      'Виды глагола: первые шаги',
      'В путешествии и у врача'
    ]
  },
  {
    id: 'b1-course-2',
    level: 'B1',
    emoji: '💼',
    title: 'Сербский B1: работа и общество',
    description: 'B1 для работы и повседневной жизни: вид глагола, вежливые просьбы, пассив, придаточные и аргументация.',
    grammar: 'verbal aspect in context, conditional for polite requests, passive and participles, relative clauses, connectors, work and society topics',
    blocks: [
      'Глагольный вид в контексте',
      'Условное наклонение в вежливых просьбах',
      'Пассив и причастия',
      'Относительные придаточные',
      'Связки для мнения и аргумента',
      'Работа, собеседование, общество'
    ]
  },
  {
    id: 'b2-course-2',
    level: 'B2',
    emoji: '📰',
    title: 'Сербский B2: медиа и аргументация',
    description: 'B2 для новостей и дискуссий: косвенная речь, пассив, отглагольные существительные и структура аргумента.',
    grammar: 'reported speech, passive in news, verbal nouns, complex conditionals and concessives, argument structure, media register',
    blocks: [
      'Косвенная речь',
      'Пассив в новостях',
      'Отглагольные существительные',
      'Сложные условия и уступки',
      'Структура аргумента',
      'Дебаты и медиа'
    ]
  },
  {
    id: 'c1-course-2',
    level: 'C1',
    emoji: '🎭',
    title: 'Сербский C1: стиль и нюансы',
    description: 'C1 для точной и стилистически уместной речи: нюансы вида, клитики, регистр, идиомы и связность текста.',
    grammar: 'aspect nuance, clitics and word order, formal/informal register, idioms and metaphor, nominalization, cohesion and rhetoric',
    blocks: [
      'Вид глагола: тонкие различия',
      'Клитики и порядок слов',
      'Регистр: формальный и разговорный',
      'Идиомы и метафоры',
      'Номинализация и плотность текста',
      'Связность, стиль, риторика'
    ]
  }
];

const DIALOG_LEVELS = [
  {
    level: 'A1',
    emoji: '🛒',
    plan: [
      { id: 'a1-extra-market', situation: 'на рынке: покупка фруктов, вопрос о цене и оплата' }
    ]
  },
  {
    level: 'A2',
    emoji: '💊',
    plan: [
      { id: 'a2-extra-pharmacy', situation: 'в аптеке: описание симптомов, покупка лекарства и вопрос о дозировке' }
    ]
  },
  {
    level: 'B1',
    emoji: '🏦',
    plan: [
      { id: 'b1-extra-bank', situation: 'в банке: проблема с картой, проверка счёта и заказ новой карты' },
      { id: 'b1-extra-job-search', situation: 'звонок по объявлению о работе: опыт, условия и договорённость о встрече' }
    ]
  },
  {
    level: 'B2',
    emoji: '🏫',
    plan: [
      { id: 'b2-extra-university', situation: 'в университете: требования к курсу, дедлайн и академическая нагрузка' },
      { id: 'b2-extra-environment', situation: 'соседи обсуждают сортировку мусора и обустройство площадки для переработки' }
    ]
  },
  {
    level: 'C1',
    emoji: '🗞️',
    plan: [
      { id: 'c1-extra-education', situation: 'дебаты о реформе образования: качество, доступность и роль учителя' },
      { id: 'c1-extra-media', situation: 'разговор о медиаграмотности, фейковых новостях и ответственности платформ' }
    ]
  }
];

function validateCourse(c, plan) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['not an object'];
  if (c.id !== plan.id) errs.push(`id must be ${plan.id}`);
  if (c.level !== plan.level) errs.push(`level must be ${plan.level}`);
  if (!c.title || !c.description) errs.push('missing title/description');
  if (!Array.isArray(c.blocks) || c.blocks.length !== 6) errs.push('need exactly 6 blocks');
  for (const [i, b] of (c.blocks || []).entries()) {
    if (!b.title) errs.push(`block ${i + 1}: missing title`);
    if (!b.content) errs.push(`block ${i + 1}: missing content`);
    if (!Array.isArray(b.quiz) || b.quiz.length !== 3) errs.push(`block ${i + 1}: need exactly 3 questions`);
    for (const [j, q] of (b.quiz || []).entries()) {
      if (!q.q || !Array.isArray(q.opts) || q.opts.length !== 3) errs.push(`block ${i + 1}, q${j + 1}: need 3 options`);
      if (typeof q.a !== 'number' || q.a < 0 || q.a >= (q.opts || []).length) errs.push(`block ${i + 1}, q${j + 1}: bad answer index`);
    }
  }
  return errs;
}

function validateDialogs(dialogs, level, plan) {
  const errs = [];
  if (!Array.isArray(dialogs) || dialogs.length !== plan.length) {
    return [`expected ${plan.length} dialog(s)`];
  }
  const ids = new Set();
  for (const [i, d] of dialogs.entries()) {
    const expected = plan[i];
    if (d.level !== level) errs.push(`${expected.id}: level must be ${level}`);
    if (d.id !== expected.id) errs.push(`${expected.id}: id must be ${expected.id}`);
    if (ids.has(d.id)) errs.push(`${expected.id}: duplicate id`);
    ids.add(d.id);
    if (!d.name) errs.push(`${expected.id}: missing name`);
    if (!Array.isArray(d.lines) || d.lines.length < 6) errs.push(`${expected.id}: need at least 6 lines`);
    const turns = (d.lines || []).filter(l => l.you);
    if (turns.length < 2) errs.push(`${expected.id}: need at least 2 learner turns`);
    for (const [j, l] of (d.lines || []).entries()) {
      if (!l.ru || !/[а-яё]/i.test(l.ru)) errs.push(`${expected.id}, line ${j + 1}: missing Cyrillic ru`);
      if (l.you) {
        if (l.sr) errs.push(`${expected.id}, line ${j + 1}: learner line must not have sr`);
        if (!Array.isArray(l.alt) || !Array.isArray(l.extra)) errs.push(`${expected.id}, line ${j + 1}: alt/extra must be arrays`);
      } else if (!l.sr) {
        errs.push(`${expected.id}, line ${j + 1}: missing sr`);
      }
    }
  }
  return errs;
}

async function generateCourse(plan) {
  const prompt = `Create one Serbian language course for CEFR level ${plan.level} in strict JSON.

Schema:
{"id":"${plan.id}","level":"${plan.level}","emoji":"${plan.emoji}","title":"${plan.title}","description":"...","blocks":[{"title":"...","description":"...","content":"<h2>...</h2><p>...</p><ul><li>...</li></ul>","quiz":[{"q":"...","opts":["...","...","..."],"a":0}]}]}

Requirements:
- Exactly 6 blocks, in this order: ${plan.blocks.join('; ')}.
- Target grammar: ${plan.grammar}.
- Explain in Russian; give Serbian examples in Latin script and Russian translations.
- Each block: 2–4 short HTML paragraphs/lists/table rows, then exactly 3 quiz questions.
- Allowed HTML tags: h2, h3, p, ul, ol, li, b, i, table, tr, th, td. No CSS, no scripts.
- Quiz: exactly 3 options, "a" is the 0-based index of the correct option.
- Natural, level-appropriate Serbian in Latin script; Ekavian; no Croatian variants.
- No stress marks in the Serbian examples.
- Return only the JSON object. No markdown.`;

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    process.stdout.write(`lesson ${plan.id} attempt ${attempt} ... `);
    try {
      const course = parseJson(await ollama(prompt, 20000));
      course.id = plan.id;
      course.level = plan.level;
      course.emoji = course.emoji || plan.emoji;
      for (const b of course.blocks || []) b.content = cleanHtml(b.content);
      const errs = validateCourse(course, plan);
      if (!errs.length) {
        console.log('ok');
        return course;
      }
      lastErr = errs.join('; ');
      console.log('invalid: ' + lastErr);
    } catch (err) {
      lastErr = err.message;
      console.log('failed: ' + lastErr);
    }
  }
  throw new Error(`Course ${plan.id} failed: ${lastErr}`);
}

async function generateDialogs(level, emoji, plan) {
  const lines = plan.map(x => `- ${x.id}: ${x.situation}`).join('\n');
  const prompt = `Create exactly ${plan.length} Serbian dialogue(s) for CEFR level ${level} in strict JSON.

Schema:
{"dialogs":[{"id":"${plan[0].id}","level":"${level}","name":"Название по-русски","emoji":"${emoji}","lines":[{"sr":"Serbian line spoken by the other person","ru":"Russian translation"},{"you":"Serbian phrase the learner says","ru":"Russian translation","alt":["another correct variant"],"extra":["distractor","words","here"]}]}]}

Situations and required ids:
${lines}

Requirements:
- Exactly ${plan.length} dialogue(s), in the order above, with exactly these ids.
- Each dialogue: 8–10 lines.
- 2–3 lines per dialogue are learner turns. A learner turn has "you", "alt" (1–2 alternatives), "extra" (3–5 distractor words), and "ru" translating the learner phrase. A learner turn must NOT contain "sr".
- Every non-learner line has "sr" and "ru". Its "ru" translates that "sr".
- The conversation must make sense in order: non-learner lines set up the situation; learner turns answer the preceding line.
- Serbian Latin script, natural level-appropriate language, no Croatian variants, no stress marks.
- Return only the JSON object. No markdown.`;

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    process.stdout.write(`dialogs ${level} attempt ${attempt} ... `);
    try {
      const data = parseJson(await ollama(prompt, 16000));
      const dialogs = Array.isArray(data.dialogs) ? data.dialogs : [];
      for (const [i, d] of dialogs.entries()) {
        if (plan[i]) d.id = plan[i].id;
        d.level = level;
        d.emoji = d.emoji || emoji;
        for (const l of d.lines || []) {
          delete l.srStress;
          delete l.youStress;
        }
      }
      const errs = validateDialogs(dialogs, level, plan);
      if (!errs.length) {
        console.log('ok');
        return dialogs;
      }
      lastErr = errs.join('; ');
      console.log('invalid: ' + lastErr);
    } catch (err) {
      lastErr = err.message;
      console.log('failed: ' + lastErr);
    }
  }
  throw new Error(`Dialogs ${level} failed: ${lastErr}`);
}

async function main() {
  const lessons = ONLY === 'dialogs' ? readJson('lessons.json') : readJson('lessons.json');
  const dialogs = readJson('dialogs.json');
  const lessonIds = new Set(lessons.map(x => x.id));
  const dialogIds = new Set(dialogs.map(x => x.id));

  if (ONLY !== 'dialogs') {
    for (const plan of COURSES) {
      if (lessonIds.has(plan.id)) {
        console.log(`skip existing lesson ${plan.id}`);
        continue;
      }
      const course = await generateCourse(plan);
      lessons.push(course);
      lessonIds.add(course.id);
      writeJson('lessons.json', lessons);
      console.log(`wrote lesson ${course.id}; total ${lessons.length}`);
    }
  }

  if (ONLY !== 'lessons') {
    for (const group of DIALOG_LEVELS) {
      if (group.plan.every(x => dialogIds.has(x.id))) {
        console.log(`skip existing dialogs ${group.level}`);
        continue;
      }
      const generated = await generateDialogs(group.level, group.emoji, group.plan);
      const fresh = generated.filter(d => !dialogIds.has(d.id));
      dialogs.push(...fresh);
      for (const d of fresh) dialogIds.add(d.id);
      writeJson('dialogs.json', dialogs);
      console.log(`wrote ${fresh.length} ${group.level} dialogs; total ${dialogs.length}`);
    }
  }

  console.log('done');
}

await main();
