#!/usr/bin/env node
/**
 * Explicit corrections for translation slips that the batch model repeated.
 * Keyed by English headword + part of speech; values are final.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TSV = path.join(ROOT, 'data', 'review', 'words.tsv');

const FIXES = {
  'me|pronoun': { sr: 'mene', ru: 'меня', topic: 'grammar' },
  'inevitable|adjective': { sr: 'neizbežan', ru: 'неизбежный', topic: 'descriptions' },
  'ghostly|adjective': { sr: 'sablasni', ru: 'призрачный', topic: 'descriptions' },
  'referent|adjective': { sr: 'referentni', ru: 'референтный', topic: 'descriptions' },
  'tabloid|adjective': { sr: 'tabloidni', ru: 'таблоидный', topic: 'descriptions' },
  'pH|noun': { sr: 'pH vrednost', ru: 'водородный показатель', topic: 'abstract' },
  'prejudge|verb': { sr: 'unaprediti', ru: 'предвзято судить', topic: 'emotions' },
  'stopover|noun': { sr: 'usputno zaustavljanje', ru: 'остановка в пути', topic: 'travel' },
  'avid|adjective': { sr: 'žaran', ru: 'заядлый', topic: 'descriptions' },
  'stop|noun': { sr: 'zaustavljanje', ru: 'остановка', topic: 'transport' },
  'wheelchair|noun': { sr: 'kolica za invalide', ru: 'инвалидная коляска', topic: 'health' },
  'generosity|noun': { sr: 'velikodušnost', ru: 'щедрость', topic: 'emotions' },
  'homeward|adjective': { sr: 'prema kući', ru: 'домой', topic: 'travel' },
  'unconcerned|adjective': { sr: 'ravnodušan', ru: 'безразличный', topic: 'emotions' },

  // Clear semantic slips found while spot-checking the AI review output.
  'bat|noun': { sr: 'slepi miš', ru: 'летучая мышь', topic: 'animals' },
  'better|adjective': { sr: 'bolji', ru: 'лучше', topic: 'descriptions' },
  'due|adjective': { sr: 'očekivan', ru: 'ожидаемый', topic: 'time' },
  'else|adverb': { sr: 'još', ru: 'ещё', topic: 'grammar' },
  'late|adjective': { sr: 'kasan', ru: 'поздний', topic: 'time' },
  'look|noun': { sr: 'pogled', ru: 'взгляд', topic: 'communication' },
  'mobile|noun': { sr: 'mobilni telefon', ru: 'мобильный телефон', topic: 'technology' },
  'need|modal auxiliary': { sr: 'trebati', ru: 'нужно', topic: 'grammar' },
  'past|adverb': { sr: 'mimo', ru: 'мимо', topic: 'actions' },
  'pay|noun': { sr: 'plata', ru: 'зарплата', topic: 'money' },
  'pick|verb': { sr: 'izabrati', ru: 'выбирать', topic: 'actions' },
  'classmate|noun': { sr: 'drug iz razreda', ru: 'одноклассник', topic: 'school' },
  'fail|verb': { sr: 'ne uspeti', ru: 'потерпеть неудачу', topic: 'actions' },
  'half-price|adjective': { sr: 'po pola cene', ru: 'за полцены', topic: 'shopping' },
  'invade|verb': { sr: 'izvršiti invaziju', ru: 'вторгаться', topic: 'society' },
  'mind|verb': { sr: 'imati nešto protiv', ru: 'возражать', topic: 'emotions' },
  'rain|verb': { sr: 'padati', ru: 'идти (о дожде)', topic: 'weather' },
  'rob|verb': { sr: 'opljačkati', ru: 'грабить', topic: 'society' },
  'singular|adjective': { sr: 'jedninski', ru: 'единственный', topic: 'grammar' },
  'keen|adjective': { sr: 'revnosan', ru: 'усердный', topic: 'descriptions' },
  'basin|noun': { sr: 'umivaonik', ru: 'раковина', topic: 'home' },
  'beat|verb': { sr: 'tući', ru: 'бить', topic: 'actions' },
  'establishment|noun': { sr: 'ustanova', ru: 'учреждение', topic: 'society' },
  'glimpse|noun': { sr: 'letimičan pogled', ru: 'проблеск', topic: 'descriptions' },
  'kid|verb': { sr: 'zezati', ru: 'шутить', topic: 'actions' },
  'latecomer|noun': { sr: 'onaj koji kasni', ru: 'опоздавший', topic: 'people' },
  'ness|noun': { sr: 'gnezdo', ru: 'гнездо', topic: 'nature' },
  'occasion|verb': { sr: 'izazvati', ru: 'вызывать', topic: 'actions' },
  'peanut|noun': { sr: 'kikiriki', ru: 'арахис', topic: 'food' },
  'pick|noun': { sr: 'pijuk', ru: 'кирка', topic: 'work' },
  'stylish|adjective': { sr: 'elegantan', ru: 'стильный', topic: 'descriptions' },
  'tick|noun': { sr: 'krpelj', ru: 'клещ', topic: 'animals' },
  'uncontrollable|adjective': { sr: 'nekontrolisan', ru: 'неконтролируемый', topic: 'descriptions' },
  'vice|adjective': { sr: 'potpredsednički', ru: 'вице-', topic: 'society' },
  'wizard|adjective': { sr: 'čaroban', ru: 'волшебный', topic: 'descriptions' },
  'admiringly|adverb': { sr: 's divljenjem', ru: 'восхищённо', topic: 'descriptions' },
  'bottle|verb': { sr: 'flaširati', ru: 'разливать по бутылкам', topic: 'actions' },
  'compromise|verb': { sr: 'praviti kompromis', ru: 'идти на компромисс', topic: 'actions' },
  'gambling|noun': { sr: 'kockanje', ru: 'азартные игры', topic: 'culture' },
  'legislate|verb': { sr: 'donositi zakone', ru: 'законодательствовать', topic: 'society' },
  'mover|noun': { sr: 'selidbeni radnik', ru: 'перевозчик', topic: 'work' },
  'moving|adjective': { sr: 'dirljiv', ru: 'трогательный', topic: 'descriptions' },
  'route|noun': { sr: 'ruta', ru: 'маршрут', topic: 'travel' },
  'shoplifter|noun': { sr: 'kradljivac iz prodavnice', ru: 'магазинный вор', topic: 'society' },
  'sliver|noun': { sr: 'iver', ru: 'щепка', topic: 'descriptions' },
  'squad|noun': { sr: 'odred', ru: 'отряд', topic: 'society' },
  'toenail|noun': { sr: 'nokat na nožnom prstu', ru: 'ноготь на пальце ноги', topic: 'body' },
  'tortoiseshell|noun': { sr: 'kornjačin oklop', ru: 'панцирь черепахи', topic: 'animals' },
  'unattractive|adjective': { sr: 'neatraktivan', ru: 'непривлекательный', topic: 'descriptions' },
  'workaholic|adjective': { sr: 'radoholičan', ru: 'трудоголичный', topic: 'descriptions' },
  'yawn|noun': { sr: 'zev', ru: 'зевота', topic: 'body' },
  'aqua|adjective': { sr: 'vodeni', ru: 'водный', topic: 'nature' },
  'bulk up|verb': { sr: 'nabaciti mišiće', ru: 'накачаться', topic: 'sports' },
  'immortalize|verb': { sr: 'ovekovečiti', ru: 'увековечить', topic: 'culture' },
  'inexhaustible|adjective': { sr: 'neiscrpan', ru: 'неисчерпаемый', topic: 'descriptions' },
  'maternalistic|adjective': { sr: 'materinski', ru: 'матерински-покровительственный', topic: 'descriptions' },
  'reassurance|noun': { sr: 'ohrabrenje', ru: 'заверение', topic: 'emotions' },
  'rumble|noun': { sr: 'tutnjava', ru: 'грохот', topic: 'nature' },
  'rumble|verb': { sr: 'tutnjati', ru: 'грохотать', topic: 'actions' },
  'salivate|verb': { sr: 'lučiti pljuvačku', ru: 'выделять слюну', topic: 'body' },
  'transfix|verb': { sr: 'prikovati', ru: 'заворожить', topic: 'emotions' },
  'unassisted|adjective': { sr: 'bez pomoći', ru: 'без посторонней помощи', topic: 'descriptions' },
  'uninspiring|adjective': { sr: 'bez nadahnuća', ru: 'невдохновляющий', topic: 'descriptions' },
  'unmanageable|adjective': { sr: 'neukrotiv', ru: 'неуправляемый', topic: 'descriptions' },
  'bank|verb': { sr: 'položiti', ru: 'вносить в банк', topic: 'money' }
};

const rows = fs.readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean);
const header = rows.shift().split('\t');
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
let changed = 0;
const out = [];
for (const row of rows) {
  const c = row.split('\t');
  const key = `${c[idx.en]}|${c[idx.pos]}`;
  const fix = FIXES[key];
  if (!fix) { out.push(row); continue; }
  c[idx.sr] = fix.sr;
  c[idx.ru] = fix.ru;
  c[idx.topic] = fix.topic;
  c[idx.srStress] = '';
  c[idx.kaikki] = '';
  c[idx.croatian] = '';
  out.push(c.join('\t'));
  changed++;
}
fs.writeFileSync(TSV, [header.join('\t'), ...out].join('\n') + '\n');
console.log(`Applied ${changed} manual translation fixes.`);
