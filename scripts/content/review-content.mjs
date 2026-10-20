#!/usr/bin/env node
/**
 * Explicit review pass over generated lessons/dialogs.
 * Fixes known model slips without re-running the generator.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'data');

const lessons = JSON.parse(fs.readFileSync(path.join(DATA, 'lessons.json'), 'utf8'));
const dialogs = JSON.parse(fs.readFileSync(path.join(DATA, 'dialogs.json'), 'utf8'));

function fixText(s) {
  return String(s || '')
    .replace(/\$\s*(?:\\?rightarrow|ightarrow)\s*\$/g, '→')
    .replace(/\\rightarrow/g, '→')
    .replace(/впечатljюще/g, 'впечатляюще')
    .replace(/Pomagam bratu/g, 'Pomažem bratu')
    .replace(/Kuca je izgrađena/g, 'Kuća je izgrađena')
    .replace(/u[сc]ледnosti toga/g, 'usled toga')
    .replace(/u[сc]ледности toga/g, 'usled toga')
    .replace(/уследности toga/g, 'usled toga')
    .replace(/\bHeti\b/g, 'Hteti')
    .replace(/Dobro dan\b/g, 'Dobar dan')
    .replace(/autobusskih/g, 'autobuskih')
    .replace(/Если на гласную, то после него \(в разговорной речи\)\./g, 'Краткая форма всегда ставится перед инфинитивом: Ja ću ići.');
}

for (const lesson of lessons) {
  lesson.description = fixText(lesson.description);
  for (const block of lesson.blocks || []) {
    block.title = fixText(block.title);
    block.description = fixText(block.description);
    block.content = fixText(block.content);
    for (const q of block.quiz || []) {
      q.q = fixText(q.q);
      q.opts = (q.opts || []).map(fixText);
    }
  }
}

const findDialog = id => {
  const d = dialogs.find(x => x.id === id);
  if (!d) console.warn('missing dialog:', id);
  return d;
};

function line(d, needle) {
  if (!d) return null;
  return (d.lines || []).find(l => [l.sr, l.you, l.ru].some(x => String(x || '').includes(needle)));
}
function setLine(d, needle, patch) {
  const l = line(d, needle);
  if (l) Object.assign(l, patch);
  else console.warn('not found:', d?.id, needle);
  return l;
}
function replaceAlt(d, needle, replacement) {
  if (!d) return;
  for (const l of d.lines || []) {
    if (!Array.isArray(l.alt)) continue;
    const i = l.alt.findIndex(x => String(x).includes(needle));
    if (i >= 0) { l.alt[i] = replacement; return; }
  }
  console.warn('alt not found:', d.id, needle);
}

// A1: asking the time
{
  const d = findDialog('a1-asking-time');
  setLine(d, 'Da li je autobus stanica', { sr: 'Da li je autobusna stanica blizu?' });
  setLine(d, 'Idite pravo', { sr: 'Autobusna stanica je blizu, idite pravo pa levo.', ru: 'Автобусная остановка рядом: идите прямо, затем налево.' });
  setLine(d, 'Autobusna stanica je blizu', { ru: 'Автобусная остановка рядом: идите прямо, затем налево.' });
}

// A1: buying bread - add the customer's payment answer.
{
  const d = findDialog('a1-buying-bread');
  if (d) {
    setLine(d, 'To će biti sto pedeset dinara', {
      ru: 'Это будет сто пятьдесят динаров.'
    });
    const hasPayment = d.lines.some(l => l.you && /karticom|gotovinom/i.test(l.you));
    if (!hasPayment) {
      const idx = d.lines.findIndex(l => /Platite karticom/i.test(l.sr || ''));
      d.lines.splice(idx + 1, 0, {
        you: 'Karticom, molim vas.',
        ru: 'Картой, пожалуйста.',
        alt: ['Gotovinom, molim vas.', 'Platiću karticom.'],
        extra: ['hleb', 'sutra', 'skupo']
      });
    }
  }
}

// A1: introducing a friend - Mark should answer about his own Serbian.
{
  const d = findDialog('a1-introducing-friend');
  setLine(d, 'Odakle si, Mark', { sr: 'Odakle je Mark?', ru: 'Откуда Марк?' });
  const l = setLine(d, 'Malo, ali učim svaki dan', {
    you: 'Malo, ali učim svaki dan.',
    ru: 'Немного, но я учу каждый день.',
    alt: ['Govorim malo srpski.', 'Učim srpski svaki dan.'],
    extra: ['mnogo', 'nikada', 'Engleski']
  });
  if (l) delete l.sr;
}

// A2: booking
{
  const d = findDialog('a2-booking');
  setLine(d, 'Hotel Splendid', { sr: 'Dobar dan, Hotel Splendid. Izvolite?' });
  const l = line(d, 'Hotel Splendid');
  if (l) l.ru = 'Добрый день, отель «Сплендид». Слушаю вас?';
}

// A2: bus
{
  const d = findDialog('a2-bus');
  const l = setLine(d, 'Prodavnica je odmah pored stanice', {
    you: 'Prodavnica karata je odmah pored stanice.',
    ru: 'Билетная касса прямо рядом с остановкой.'
  });
  if (l) delete l.sr;
  setLine(d, 'Košta sto pedeset dinara', {
    ru: 'Стоит сто пятьдесят динаров.'
  });
}

// A2: lunch
{
  const d = findDialog('a2-lunch');
  const l = setLine(d, 'lepnjom', {
    you: 'Želim ćevape sa lukom i lepinjom.',
    ru: 'Я хочу чевапы с луком и лепёшкой.'
  });
  if (l) delete l.sr;
}

// A2: doctor
{
  const d = findDialog('a2-doctor');
  replaceAlt(d, 'Bolim se', 'Boli me grlo i imam temperaturu.');
}

// B1: renting
{
  const d = findDialog('b1-renting-apartment');
  setLine(d, 'mesečni kirija', {
    you: 'Koliko iznosi mesečna kirija i da li su računi uključeni?'
  });
}

// B2: news discussion
{
  const d = findDialog('b2-news-discussion');
  setLine(d, 'trenutnog neprijatnosti', {
    you: 'Upravo tako, dugoročne koristi su mnogo veće od trenutne neprijatnosti.'
  });
  replaceAlt(d, 'malog aneksusa', 'Tako je, zdravlje planete je važnije od kratkoročnih neprijatnosti.');
  replaceAlt(d, 'Smejmo se učiti', 'Trebalo bi da učimo od njih kako bismo brže postigli rezultate.');
}

// B2: service complaint
{
  const d = findDialog('b2-service-complaint');
  setLine(d, 'kurir je zapleo', {
    sr: 'Žao mi je, imali smo veliki broj porudžbina i kurir se zaglavio u saobraćaju.'
  });
  setLine(d, 'Razumem, ali to nije opravdanje', {
    sr: 'Razumem vaše nezadovoljstvo. Nažalost, ne možemo uticati na saobraćaj.',
    ru: 'Я понимаю ваше недовольство. К сожалению, мы не можем повлиять на дорожное движение.'
  });
}

// C1: transport debate
{
  const d = findDialog('c1-transport');
  setLine(d, 'trajačkog transporta', {
    you: 'Smatram da bi prioritet trebalo biti razvoj brzog šinskog transporta kako bismo smanjili gužve.'
  });
}

// C1: culture review
{
  const d = findDialog('c1-culture');
  setLine(d, 'savremenog umetnosti', {
    sr: 'Da li ste imali priliku da posetite novu izložbu savremene umetnosti u galeriji?'
  });
}

// C1: formal complaint - the opening belongs to the learner.
{
  const d = findDialog('c1-complaint');
  if (d) {
    const first = d.lines[0];
    if (first && first.sr && !first.you) {
      delete first.sr;
      Object.assign(first, {
        you: 'Dobar dan, želim da podnesem zvaničnu reklamaciju u vezi sa uslugom koju sam primio.',
        ru: 'Добрый день, я хочу подать официальную жалобу в связи с услугой, которую я получил.',
        alt: ['Dobar dan, došao sam da uložim zvaničnu reklamaciju na uslugu.'],
        extra: ['hvala', 'sutra', 'brzo']
      });
    }
    setLine(d, 'Nedoprivatibilno', {
      you: 'Neprihvatljivo je da ste zakasnili tri dana sa isporukom bez ikakvog obaveštenja.'
    });
  }
}

// C1: clitic-order quiz had an unnatural example.
{
  const c = lessons.find(x => x.id === 'c1-course');
  const b = c?.blocks.find(x => /Клитики/.test(x.title));
  const q = b?.quiz.find(x => /после союза/.test(x.q));
  if (q) {
    q.opts = ['da mi ga je poslao', 'da je mi ga poslao', 'da poslao mi ga je'];
    q.a = 0;
  }
}

// Extra A2 course: the genitive quiz asked for a nonsensical phrase.
{
  const c = lessons.find(x => x.id === 'a2-course-2');
  const b = c?.blocks.find(x => /Генитив/.test(x.title));
  const q = b?.quiz.find(x => /Kafa od kafe/.test(x.q));
  if (q) {
    q.q = "Переведите: 'Čaša vode'.";
    q.opts = ['Стакан воды', 'Кофе с молоком', 'Счёт, пожалуйста'];
    q.a = 0;
  }
}

// Extra C1 course: correct two idioms and remove a model-inserted stress mark.
{
  const c = lessons.find(x => x.id === 'c1-course-2');
  const b = c?.blocks.find(x => /Идиомы/.test(x.title));
  if (b) {
    b.content = b.content
      .replace('Prodati skóru medvedu', 'Prodati medvedu kožu')
      .replace('Prodati kožu medveda', 'Prodati medvedu kožu')
      .replace('(Продать шкуру медведя) — забегать вперед.', '(Делить шкуру неубитого медведя) — рано праздновать успех.')
      .replace('Biti kao zapela igla', 'Ponavljati kao pokvarena ploča')
      .replace('(Повторять одно и то же) — повторять одно и то же.', '(Повторять как заезженная пластинка) — говорить одно и то же.');
    const q = b.quiz.find(x => /prodati/i.test(x.q));
    if (q) q.q = "Что значит 'prodati medvedu kožu'?";
  }
}

// Extra B1 course: model duplicated an <li> tag.
{
  const c = lessons.find(x => x.id === 'b1-course-2');
  const b = c?.blocks.find(x => /Работа/.test(x.title));
  if (b) b.content = b.content.replace(/<li>\s*<li>/g, '<li>');
}

// Extra B2 course: nominative plural in a Serbian heading.
{
  const c = lessons.find(x => x.id === 'b2-course-2');
  const b = c?.blocks.find(x => /Сложные условия/.test(x.title));
  if (b) b.content = b.content.replace('Složeni uslovi i ustupke', 'Složeni uslovi i ustupci');
}

// Extra C1 course: replace a register quiz that used a nonsense option.
{
  const c = lessons.find(x => x.id === 'c1-course-2');
  const b = c?.blocks.find(x => /Регистр/.test(x.title));
  const q = b?.quiz.find(x => /разговорной речи вместо формального/.test(x.q));
  if (q) {
    q.q = 'Какая фраза звучит наиболее разговорно?';
    q.opts = ['Molim Vas da me obavestite.', 'Reci mi kad budeš znao.', 'Želeo bih da Vas zamolim.'];
    q.a = 1;
  }
}

// Extra dialogs: concise titles and known grammar/script slips.
{
  const names = {
    'b1-extra-bank': 'В банке',
    'b1-extra-job-search': 'Звонок о работе',
    'b2-extra-university': 'В университете',
    'b2-extra-environment': 'Сортировка мусора',
    'c1-extra-education': 'Реформа образования',
    'c1-extra-media': 'Медиаграмотность'
  };
  for (const [id, name] of Object.entries(names)) {
    const d = findDialog(id);
    if (d) d.name = name;
  }

  const pharmacy = findDialog('a2-extra-pharmacy');
  setLine(pharmacy, 'jako boli me grlo', {
    you: 'Imam visoku temperaturu i jako me boli grlo.'
  });

  const job = findDialog('b1-extra-job-search');
  setLine(job, 'uslovi su mi odgovaraju', {
    you: 'Da, uslovi mi odgovaraju. Gde se nalazi vaša kancelarija?'
  });
  replaceAlt(job, 'Gde je vaš sedište', 'Gde je vaša kancelarija?');

  const environment = findDialog('b2-extra-environment');
  setLine(environment, 'площадку', {
    you: 'Šta mislite o tome da organizujemo posebno mesto za reciklažu?'
  });

  const education = findDialog('c1-extra-education');
  setLine(education, 'как нас je', {
    ru: 'Это идеально, но как быть с ролью учителя? Есть ли у них вообще ресурсы для такого подхода?'
  });
  setLine(education, 'менталитеta', {
    ru: 'Это требует полного изменения менталитета, а не просто изменения учебного плана и программы.'
  });

  const media = findDialog('c1-extra-media');
  for (const l of media?.lines || []) {
    for (const k of ['sr', 'you', 'ru']) {
      if (l[k]) l[k] = l[k].replace(/feyk/gi, 'lažne').replace(/фейковых/gi, 'ложных');
    }
    if (Array.isArray(l.alt)) l.alt = l.alt.map(x => x.replace(/feyk/gi, 'lažne'));
  }
}

for (const d of dialogs) {
  d.name = fixText(d.name);
  for (const l of d.lines || []) {
    for (const k of ['sr', 'ru', 'you']) if (l[k]) l[k] = fixText(l[k]);
    if (Array.isArray(l.alt)) l.alt = l.alt.map(fixText);
    if (Array.isArray(l.extra)) l.extra = l.extra.map(fixText);
  }
}

fs.writeFileSync(path.join(DATA, 'lessons.json'), JSON.stringify(lessons, null, 2) + '\n');
fs.writeFileSync(path.join(DATA, 'dialogs.json'), JSON.stringify(dialogs, null, 2) + '\n');
console.log('Reviewed lessons and dialogs.');
