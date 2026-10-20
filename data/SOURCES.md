# Источники и происхождение данных

Встроенные материалы приложения лежат в `data/*.json`. Это обычные JSON-файлы,
которые можно позже перенести в серверную базу данных без изменения формата.

## Уровни A1–C1

Список слов и распределение по уровням собраны из двух открытых профилей:

- **CEFR-J Vocabulary Profile 1.5** — A1–B2  
  https://github.com/vitwits/english-wordlist-cefr-a1-c2
- **Octanove Vocabulary Profile C1/C2 1.0** — C1  
  https://github.com/vitwits/english-wordlist-cefr-a1-c2

Уровень C2 в приложение не включён. Одинаковые слова с разными частями речи
объединены, для слова берётся самый простой уровень; служебные слова
(артикли, предлоги, союзы, местоимения) вынесены в тему «Грамматика».

## Частотность сербских слов

- **HermitDave FrequencyWords — Serbian 50k**  
  https://github.com/hermitdave/FrequencyWords

Частотный список используется для сортировки слов внутри темы и для проверки
хорватских вариантов: если слово отсутствует в сербском корпусе, а его
сербский вариант присутствует, выбирается сербский вариант.

## Сербские формы и ударения

- **Kaikki.org / Wiktionary — Serbo-Croatian extract**  
  https://kaikki.org/dictionary/Serbo-Croatian/

Из выгрузки берутся канонические формы с сербскими тоническими ударениями.
Ударение добавляется только тогда, когда слово найдено в Wiktionary; если
формы нет, слово показывается без ударения. Это сделано намеренно: неверное
ударение хуже, чем его отсутствие.

В приложении **211 тем и 6 644 слова** (A1 — 1 014, A2 — 1 130,
B1 — 1 870, B2 — 1 910, C1 — 720 на момент сборки), **10 курсов**
(по два на каждый уровень A1–C1) и **34 диалога** (A1 — 8, A2 — 8,
B1 — 6, B2 — 6, C1 — 6). Базовые 77 слов и шесть исходных тем сохранены.

## Переводы, темы, уроки и диалоги

- Модель **`gemma4:31b-cloud`** через локальный [Ollama](https://ollama.com/).
- Переводы и темы генерируются пакетами; проблемные строки исправляются
  повторным переводом в JSON-режиме, после чего запускается отдельный
  AI-ревьюер (`scripts/vocab/review-words.mjs`).
- Уроки A1–C1 и диалоги A1–C1 сгенерированы в JSON-режиме и прошли
  программную проверку структуры и вычитку типичных ошибок
  (`scripts/content/review-content.mjs`). Дополнительные курсы и диалоги
  добавлены скриптом `scripts/content/add-content.mjs`.

**Важно:** материал проверен только с помощью ИИ и автоматических проверок.
Носитель языка или преподаватель не участвовали. Перед публикацией стоит
выборочно проверить переводы, ударения и естественность диалогов.

## Как пересобрать

В минимальной поставке в `data/` оставлены только файлы, нужные приложению
(`words.json`, `dialogs.json`, `lessons.json`). Для пересборки понадобятся
исходные `data/*.base.json`, промежуточные `data/*.generated.json` и
`data/review/words.tsv`; они не входят в эту поставку.

```bash
# 1. Скачать исходники в .cache/ (папка не коммитится)
mkdir -p .cache
curl -L https://raw.githubusercontent.com/vitwits/english-wordlist-cefr-a1-c2/master/cefrj-vocabulary-profile-1.5.csv -o .cache/cefrj.csv
curl -L https://raw.githubusercontent.com/vitwits/english-wordlist-cefr-a1-c2/master/octanove-vocabulary-profile-c1c2-1.0.csv -o .cache/octanove.csv
curl -L https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sr/sr_50k.txt -o .cache/sr_50k.txt
curl -L https://kaikki.org/dictionary/Serbo-Croatian/kaikki.org-dictionary-SerboCroatian.jsonl -o .cache/sh.jsonl

# 2. Сгенерировать слова (нужен запущенный Ollama)
node scripts/vocab/generate-words.mjs

# 3. Исправить потерянные колонки и проверить переводы
node scripts/vocab/repair-translations.mjs
node scripts/vocab/review-words.mjs
node scripts/vocab/manual-fixes.mjs

# 4. Пересобрать темы, убрать неподтверждённые ударения
node scripts/vocab/rebuild-words.mjs
node scripts/vocab/clean-stress.mjs

# 5. Сгенерировать уроки и диалоги, добавить дополнительные материалы,
#    затем применить вычитку
node scripts/content/generate-content.mjs
node scripts/content/add-content.mjs
node scripts/content/review-content.mjs
```

Скрипты используют только стандартную библиотеку Node.js и HTTP API Ollama;
npm-пакеты не требуются. Модель можно переопределить переменной
`OLLAMA_MODEL`, количество слов в пакете — `BATCH`.

## Структура

```jsonc
// data/words.json
[{ "id": "a1-food", "level": "A1", "name": "Еда", "emoji": "🍽️",
   "words": [{ "ru": "хлеб", "sr": "hleb", "srStress": "hlȅb" }] }]

// data/dialogs.json
[{ "id": "a1-buying-bread", "level": "A1", "name": "Покупка хлеба",
   "emoji": "🥖", "lines": [
     { "sr": "Dobar dan!", "ru": "Добрый день!" },
     { "you": "Jedan hleb, molim vas.", "ru": "Один хлеб, пожалуйста.",
       "alt": ["Molim vas, jedan hleb."], "extra": ["voda", "mleko"] }
   ] }]

// data/lessons.json
[{ "id": "a2-course", "level": "A2", "title": "Сербский A2",
   "emoji": "🌿", "description": "...", "blocks": [
     { "title": "...", "description": "...", "content": "<p>...</p>",
       "quiz": [{ "q": "...", "opts": ["...", "..."], "a": 0 }] }
   ] }]
```
