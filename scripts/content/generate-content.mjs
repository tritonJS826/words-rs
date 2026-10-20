#!/usr/bin/env node
/**
 * Generates the A2–C1 lesson courses and the A1–C1 dialogs.
 * Uses the local Ollama API with JSON mode. No npm dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');
const REVIEW = path.join(DATA, 'review');
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const COURSE_PLAN = {
  A2: {
    emoji: '🌿',
    grammar: 'perfekat (past), futur I, cases (dativ, instrumental, lokativ), modal verbs, comparison, introduction to verbal aspect, everyday situations',
    blocks: [
      'Прошедшее время (perfekat)',
      'Будущее время (futur I)',
      'Датив: кому? чему?',
      'Инструментал: с кем? чем?',
      'Модальные глаголы',
      'Сравнение прилагательных'
    ]
  },
  B1: {
    emoji: '🚀',
    grammar: 'verbal aspect pairs, adjective declension, conditionals, participles, motion verbs, futur II, relative clauses, expressing opinions',
    blocks: [
      'Глагольный вид: совершенный и несовершенный',
      'Склонение прилагательных',
      'Условное наклонение',
      'Причастия и пассив',
      'Глаголы движения',
      'Футур II и относительные придаточные'
    ]
  },
  B2: {
    emoji: '🧭',
    grammar: 'reported speech, passive voice, verbal nouns, complex conditionals, relative clauses, register, connectors, argumentation',
    blocks: [
      'Косвенная речь',
      'Пассивный залог',
      'Отглагольные существительные',
      'Сложные условные предложения',
      'Относительные придаточные',
      'Связки и структура текста'
    ]
  },
  C1: {
    emoji: '🎓',
    grammar: 'aspect nuance, clitics, formal and informal register, idioms, nominalization, discourse markers, style, sophisticated argumentation',
    blocks: [
      'Нюансы глагольного вида',
      'Клитики и порядок слов',
      'Формальный и разговорный регистр',
      'Идиомы и устойчивые выражения',
      'Номинализация',
      'Связность и стиль текста'
    ]
  }
};

const DIALOG_PLAN = {
  A1: { emoji: '🌱', situations: 'greeting a neighbour, buying bread, asking for the time, introducing a friend' },
  A2: { emoji: '🌿', situations: 'booking a room, taking a bus, ordering lunch, calling a doctor' },
  B1: { emoji: '🚀', situations: 'renting an apartment, discussing weekend plans, returning a purchase, asking for directions to a museum' },
  B2: { emoji: '🧭', situations: 'a job interview, discussing the news, complaining about a service, planning a trip with friends' },
  C1: { emoji: '🎓', situations: 'a debate about city transport, a cultural review, a formal complaint, a discussion about work-life balance' }
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function ollama(prompt, numPredict = 16000) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

function validateLesson(course) {
  const errs = [];
  if (!course || typeof course !== 'object') return ['not an object'];
  if (!course.id || !course.level || !course.title) errs.push('missing id/level/title');
  if (!Array.isArray(course.blocks) || course.blocks.length < 5) errs.push('need at least 5 blocks');
  for (const [i, b] of (course.blocks || []).entries()) {
    if (!b.title) errs.push(`block ${i + 1}: missing title`);
    if (!b.content) errs.push(`block ${i + 1}: missing content`);
    if (!Array.isArray(b.quiz) || b.quiz.length < 2) errs.push(`block ${i + 1}: need at least 2 questions`);
    for (const [j, q] of (b.quiz || []).entries()) {
      if (!q.q || !Array.isArray(q.opts) || q.opts.length < 2) errs.push(`block ${i + 1}, q${j + 1}: bad question`);
      if (typeof q.a !== 'number' || q.a < 0 || q.a >= (q.opts || []).length) errs.push(`block ${i + 1}, q${j + 1}: bad answer index`);
    }
  }
  return errs;
}

function validateDialog(d) {
  const errs = [];
  if (!d.id || !d.level || !d.name) errs.push('missing id/level/name');
  if (!Array.isArray(d.lines) || d.lines.length < 6) errs.push('need at least 6 lines');
  const turns = (d.lines || []).filter(l => l.you);
  if (turns.length < 2) errs.push('need at least 2 learner turns');
  for (const [i, l] of (d.lines || []).entries()) {
    if (!l.ru) errs.push(`line ${i + 1}: missing ru`);
    if (!l.sr && !l.you) errs.push(`line ${i + 1}: missing sr/you`);
    if (l.you && (!Array.isArray(l.alt) || !Array.isArray(l.extra))) errs.push(`line ${i + 1}: you needs alt/extra arrays`);
  }
  return errs;
}

async function generateCourse(level, plan) {
  const prompt = `Create a Serbian language course for CEFR level ${level} in strict JSON.

Schema:
{"id":"${level.toLowerCase()}-course","level":"${level}","emoji":"${plan.emoji}","title":"Сербский ${level}","description":"...","blocks":[{"title":"...","description":"...","content":"<h2>...</h2><p>...</p><ul><li>...</li></ul>","quiz":[{"q":"...","opts":["...","...","..."],"a":0}]}]}

Requirements:
- Exactly ${plan.blocks.length} blocks, in this order: ${plan.blocks.join('; ')}.
- Target grammar: ${plan.grammar}.
- Explain in Russian; give Serbian examples in Latin script and Russian translations.
- Each block: 2–4 short HTML paragraphs/lists/table rows, then exactly 3 quiz questions.
- Allowed HTML tags: h2, h3, p, ul, ol, li, b, i, table, tr, th, td. No CSS, no scripts.
- Quiz: exactly 3 options, "a" is the 0-based index of the correct option.
- Natural, level-appropriate Serbian; avoid Croatian variants.
- No stress marks in the Serbian examples.
- Return only the JSON object. No markdown.`;

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    process.stdout.write(`  lesson ${level} attempt ${attempt} ... `);
    try {
      const text = await ollama(prompt);
      const course = parseJson(text);
      course.level = level;
      course.id = `${level.toLowerCase()}-course`;
      course.emoji = course.emoji || plan.emoji;
      for (const b of course.blocks || []) b.content = cleanHtml(b.content);
      const errs = validateLesson(course);
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
  throw new Error(`Course ${level} failed: ${lastErr}`);
}

async function generateDialogs(level, plan) {
  const prompt = `Create 4 Serbian dialogues for CEFR level ${level} in strict JSON.

Schema:
{"dialogs":[{"id":"${level.toLowerCase()}-situation","level":"${level}","name":"Название по-русски","emoji":"☕","lines":[{"sr":"Serbian line spoken by the other person","ru":"Russian translation of that line"},{"you":"Serbian phrase the learner says","ru":"Russian translation of the learner phrase","alt":["another correct variant"],"extra":["distractor","words","here"]}]}]}

Requirements:
- Situations: ${plan.situations}.
- Each dialogue: 8–10 lines.
- 2–3 lines per dialogue are learner turns. A learner turn has "you", "alt" (1–2 alternatives), "extra" (3–5 distractor words), and "ru" translating the learner phrase. A learner turn must NOT contain "sr".
- Every non-learner line has "sr" and "ru". Its "ru" translates that "sr".
- The conversation must make sense in order: non-learner lines set up the situation; learner turns answer the preceding line.
- Serbian Latin script, natural level-appropriate language, no Croatian variants, no stress marks.
- Return only the JSON object. No markdown.`;

  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    process.stdout.write(`  dialogs ${level} attempt ${attempt} ... `);
    try {
      const text = await ollama(prompt);
      const data = parseJson(text);
      const dialogs = Array.isArray(data.dialogs) ? data.dialogs : [];
      for (const d of dialogs) {
        d.level = level;
        if (!d.id) d.id = `${level.toLowerCase()}-${(d.name || 'dialog').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (d.id && !d.id.startsWith(level.toLowerCase() + '-')) d.id = `${level.toLowerCase()}-${d.id}`;
        d.id = d.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        d.emoji = d.emoji || plan.emoji;
        for (const l of d.lines || []) {
          // Do not let the model invent Serbian pitch accents.
          delete l.srStress;
          delete l.youStress;
        }
      }
      const errs = dialogs.flatMap(d => validateDialog(d).map(e => `${d.id}: ${e}`));
      const ids = new Set(dialogs.map(d => d.id));
      if (ids.size !== dialogs.length) errs.push('duplicate dialog ids');
      if (dialogs.length !== 4) errs.push(`expected 4 dialogues, got ${dialogs.length}`);
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
  ensureDir(REVIEW);
  const only = process.env.ONLY || 'all';
  const baseLessons = JSON.parse(fs.readFileSync(path.join(DATA, 'lessons.base.json'), 'utf8'));
  const baseDialogs = JSON.parse(fs.readFileSync(path.join(DATA, 'dialogs.base.json'), 'utf8'));

  let generatedLessons = [];
  if (only === 'dialogs') {
    generatedLessons = JSON.parse(fs.readFileSync(path.join(DATA, 'lessons.generated.json'), 'utf8'));
  } else {
    for (const [level, plan] of Object.entries(COURSE_PLAN)) {
      generatedLessons.push(await generateCourse(level, plan));
    }
  }

  let generatedDialogs = [];
  if (only === 'lessons') {
    generatedDialogs = JSON.parse(fs.readFileSync(path.join(DATA, 'dialogs.generated.json'), 'utf8'));
  } else {
    for (const [level, plan] of Object.entries(DIALOG_PLAN)) {
      generatedDialogs.push(...await generateDialogs(level, plan));
    }
  }

  const lessons = [...baseLessons, ...generatedLessons];
  const dialogs = [...baseDialogs, ...generatedDialogs.filter(d => !baseDialogs.some(x => x.id === d.id))];
  fs.writeFileSync(path.join(DATA, 'lessons.json'), JSON.stringify(lessons, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'dialogs.json'), JSON.stringify(dialogs, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'lessons.generated.json'), JSON.stringify(generatedLessons, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'dialogs.generated.json'), JSON.stringify(generatedDialogs, null, 2) + '\n');
  fs.writeFileSync(path.join(REVIEW, 'content-summary.json'), JSON.stringify({
    model: MODEL,
    generatedAt: new Date().toISOString(),
    lessons: generatedLessons.map(l => ({ id: l.id, level: l.level, blocks: l.blocks.length, questions: l.blocks.reduce((n, b) => n + (b.quiz || []).length, 0) })),
    dialogs: generatedDialogs.map(d => ({ id: d.id, level: d.level, lines: d.lines.length, turns: d.lines.filter(l => l.you).length }))
  }, null, 2) + '\n');
  console.log(`Wrote ${lessons.length} lesson courses and ${dialogs.length} dialogs.`);
}

main().catch(err => { console.error(err); process.exit(1); });
