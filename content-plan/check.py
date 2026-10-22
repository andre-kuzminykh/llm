#!/usr/bin/env python3
"""Проверка готового плана по правилам — независимо от того, как его собрал build.py.

Читает app/public/seed.json (план с группами и правилами), out/3_plan.csv, out/4_calendar.csv
и исходник source/main.csv и проверяет то, о чём договорились: каналы и их старт, площадки,
сетку FULL по дням недели, лёгкую субботу, лимиты в день, что выходит вместе с FULL,
нумерацию, уроки, время и типы контента, названия и что из исходника ничего не потерялось.

Запуск: python3 check.py — печатает список проверок; код выхода 1, если что-то не так.
"""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = json.loads((ROOT / 'app' / 'public' / 'seed.json').read_text(encoding='utf-8'))
PLAN = list(csv.DictReader((ROOT / 'out' / '3_plan.csv').open(encoding='utf-8')))
CAL = list(csv.DictReader((ROOT / 'out' / '4_calendar.csv').open(encoding='utf-8')))
SRC = list(csv.DictReader((ROOT / 'source' / 'main.csv').open(encoding='utf-8')))

WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
D = date.fromisoformat
START, END = D(SEED['start']), D(SEED['end'])
RULES = {r['id']: r for r in SEED['rules']}
RUBRIC = {r['id']: r['name'] for r in SEED['rubrics']}
CH = {c['id']: c for c in SEED['channels']}
ITEMS = [it for it in SEED['items'] if it['date']]
BY_DAY = defaultdict(list)
for it in ITEMS:
    BY_DAY[it['date']].append(it)
FULLS = sorted((it for it in ITEMS if RULES[it['ruleId']]['full'] and not it.get('derive')), key=lambda it: it['date'])
GROUP = defaultdict(list)
for it in ITEMS:
    if it.get('group'):
        GROUP[(it['group'], it['date'])].append(it)

results = []


def check(name, problems, note=''):
    """problems — список строк с нарушениями; пусто — правило соблюдено."""
    results.append((name, list(problems), note))


def wd(it):
    return D(it['date']).weekday()


def days():
    d = START
    while d <= END:
        yield d
        d += timedelta(1)


# ── горизонт и таблицы ───────────────────────────────────────────────────────
check('Горизонт: 730 дней, 25.10.2026 — 23.10.2028, каждый день есть в календаре',
      [] if (START, END, len(CAL)) == (date(2026, 10, 25), date(2028, 10, 23), 730)
      and [r['Дата'] for r in CAL] == [d.isoformat() for d in days()] else [f'{START} … {END}, строк {len(CAL)}'])
check('План в CSV и в приложении — одно и то же', [] if len(PLAN) == len(ITEMS) else [f'CSV {len(PLAN)}, приложение {len(ITEMS)}'])

# ── каналы и площадки ────────────────────────────────────────────────────────
check('Landao — с 02.11.2026 (день анонса), Antropolis — с 01.12.2026',
      [f"{it['date']} {CH[it['channelId']]['name']}: {it['title']}" for it in ITEMS if it['date'] < CH[it['channelId']]['start']]
      + ([] if CH['landao']['start'] == '2026-11-02' and CH['antropolis']['start'] == '2026-12-01' else ['даты старта не те']))
check('Площадки материала — только площадки его канала и формата',
      [f"{it['date']} {it['ruleId']}: {p}" for it in ITEMS for p in it['platforms']
       if p not in CH[it['channelId']]['platforms'] or p not in RULES[it['ruleId']]['platforms']][:5])
check('Andre AIT — только LinkedIn и почта', [p for it in ITEMS if it['channelId'] == 'andre' for p in it['platforms'] if p not in ('LinkedIn', 'Mail')][:5])
check('Web — только Dataist, и всегда в своём разделе (Лаборатория, Академия, Кабинет)',
      [f"{it['date']} {it['ruleId']}" for it in ITEMS if 'Web' in it['platforms'] and (it['channelId'] != 'dataist' or not it.get('sectionId'))][:5])
check('Telegram Dataist — только Dataist Lab, Academy или Office',
      [f"{it['date']} {it['ruleId']}" for it in ITEMS if 'Telegram' in it['platforms'] and it['channelId'] == 'dataist' and not it.get('sectionId')][:5])

# ── сетка FULL ───────────────────────────────────────────────────────────────
per_day = Counter(it['date'] for it in FULLS)
check('Один FULL в день — без наложений', [d for d, n in per_day.items() if n > 1])
want = {MON: {'demo'}, TUE: {'tech', 'cases'}, WED: {'dev'}, THU: {'thoughts', 'research'}, FRI: {'news'}, SAT: set(), SUN: {'academy', 'demo'}}
check('FULL по дням: Пн Демо · Вт Технологии/Кейсы · Ср Разработка · Чт Исследования/Мысли · Пт Новости · Сб нет · Вс Академия/спецпроекты',
      [f"{it['date']} {WD[wd(it)]}: {RUBRIC[it['rubricId']]}" for it in FULLS if it['rubricId'] not in want[wd(it)]])
mondays = [d for d in days() if d.weekday() == MON]
check('Каждый понедельник — FULL «Демо»', [d.isoformat() for d in mondays if not any(it['rubricId'] == 'demo' for it in FULLS if it['date'] == d.isoformat())])
tue = [it for it in FULLS if wd(it) == TUE]
check('Каждый вторник — FULL, Технологии и Кейсы строго чередуются',
      [d.isoformat() for d in days() if d.weekday() == TUE and d.isoformat() not in per_day]
      + [f"{a['date']}, {b['date']}: два раза «{RUBRIC[a['rubricId']]}»" for a, b in zip(tue, tue[1:]) if a['rubricId'] == b['rubricId']])
fridays = [d for d in days() if d.weekday() == FRI]
news = [it for it in FULLS if it['ruleId'] == 'f_news']
check('Каждую пятницу — «Новости · FULL: Итоги недели №N», нумерация сквозная',
      [d.isoformat() for d in fridays if not any(it['date'] == d.isoformat() for it in news)]
      + [f"{it['date']}: «{it['title']}»" for n, it in enumerate(news, 1) if it['title'] != f'Итоги недели №{n}'])


def nth_thu(y, m, n):
    d = date(y, m, 1)
    d += timedelta((THU - d.weekday()) % 7)
    return d + timedelta(7 * (n - 1))


def last_thu_dec(y):
    d = date(y, 12, 31)
    return d - timedelta((d.weekday() - THU) % 7)


MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
bad = []
for it in (x for x in FULLS if x['ruleId'] == 'f_res'):
    d = D(it['date'])
    m = re.fullmatch(r'Итоги (\S+) (\d{4})(?: года)?', it['title'])
    if it['title'].endswith('года'):
        if d != last_thu_dec(int(it['title'].split()[1])) and d.year != 2026:
            bad.append(f"{it['date']}: {it['title']}")
    elif m and m.group(1) in MONTHS_GEN:
        mi, y = MONTHS_GEN.index(m.group(1)) + 1, int(m.group(2))
        ny, nm = (y + 1, 1) if mi == 12 else (y, mi + 1)
        if d != nth_thu(ny, nm, 2) and nth_thu(ny, nm, 2) >= START:
            bad.append(f"{it['date']}: {it['title']} — ждали {nth_thu(ny, nm, 2)}")
    elif d.weekday() != THU:
        bad.append(f"{it['date']}: «{it['title']}» не в четверг")
other_res = [f"{it['date']} «{it['title']}»" for it in FULLS if it['ruleId'] == 'f_res' and not it['title'].startswith('Итоги')]
check('Исследования · FULL: итоги месяца — во 2-й четверг следующего месяца, итоги года — в последний четверг декабря', bad,
      'итоги сентября 2026 — 29.10: 2-й четверг октября был до старта плана'
      + (f"; отдельное исследование из исходника — в свободный четверг: {', '.join(other_res)}" if other_res else ''))
thu_free = [d.isoformat() for d in days() if d.weekday() == THU and d.isoformat() not in per_day]
think = [it['date'] for it in FULLS if it['ruleId'] == 'f_think']
# между двумя Мыслями — ровно один четверг без Мыслей и без итогов Исследований
non_res = [d.isoformat() for d in days() if d.weekday() == THU
           and not any(it['date'] == d.isoformat() and it['ruleId'] == 'f_res' and it['title'].startswith('Итоги') for it in FULLS)]
idx = {d: i for i, d in enumerate(non_res)}
check('Мысли — через четверг среди свободных от итогов Исследований',
      [f'{a} → {b}' for a, b in zip(think, think[1:]) if idx[b] - idx[a] != 2], f'четвергов без FULL: {len(thu_free)} — это «через неделю»')
wed = [it['date'] for it in FULLS if it['ruleId'] == 'f_dev']
check('Разработка — строго через среду', [f'{a} → {b}' for a, b in zip(wed, wed[1:]) if (D(b) - D(a)).days != 14])
sun_free = [d.isoformat() for d in days() if d.weekday() == SUN and d.isoformat() not in per_day]
check('Академия · FULL — по воскресеньям, после старта модуля',
      [f"{it['date']}: {it['title']}" for it in FULLS if it['ruleId'] == 'f_aca' and wd(it) != SUN],
      f'воскресений без FULL: {len(sun_free)} — новый модуль стартует раз в 9–11 дней, видео модуля выходит в ближайшее свободное воскресенье после старта')

# ── суббота и лимиты ─────────────────────────────────────────────────────────
SAT_OK = {'neu_all', 'neu_top', 'lab_day', 'lab_day_v', 'aca_lesson', 'sh_life'}
check('Суббота — отдых: только авто-ленты, исследование дня, урок и лайфстайл; без Threads, LinkedIn и почты',
      [f"{it['date']} {it['ruleId']} {it['platforms']}" for it in ITEMS if wd(it) == SAT
       and (it['ruleId'] not in SAT_OK or {'Threads', 'LinkedIn', 'Mail'} & set(it['platforms']))][:5])
bad = []
for d, its in BY_DAY.items():
    c = Counter(it['ruleId'] for it in its)
    for rid, lim in (('office', 1), ('ait', 1), ('sh_razbor', 1), ('sh_thesis', 3 if d == SEED['start'] else 1)):
        if c[rid] > lim:
            bad.append(f'{d}: {rid} × {c[rid]}')
check('Лимиты в день: анонс в Кабинете, Andre AIT, разбор — по одному; тезис — один (в первый день — три из исходника)', bad)
bad = []
for it in ITEMS:
    r = RULES[it['ruleId']]
    if not r['days'][wd(it)] and not it.get('origDate') and it['date'] != SEED['start']:
        bad.append(f"{it['date']} {WD[wd(it)]}: {it['ruleId']}")
check('Каждый материал — в день недели, который разрешён его форматом в сетке', bad[:5])
DAILY = {'neu_all': 7, 'neu_top': 7, 'lab_day': 7, 'lab_day_v': 7, 'sh_life': 7,
         'ml_news': 6, 'sh_edu': 6, 'tx_hack': 6, 'sh_thesis': 6, 'sh_razbor': 6, 'th_call': 6}
bad = []
for rid, n in DAILY.items():
    have = {it['date'] for it in ITEMS if it['ruleId'] == rid}
    miss = [d.isoformat() for d in days() if (n == 7 or d.weekday() != SAT) and d.isoformat() not in have]
    if rid == 'sh_razbor':
        miss = [x for x in miss if x != SEED['start']]  # в первый день в исходнике был только призыв
    bad += [f'{rid}: нет {x}' for x in miss[:2]]
check('Ежедневные рубрики стоят каждый день (кроме субботы — у тех, что в субботу не выходят)', bad)

# ── что выходит вместе с FULL ────────────────────────────────────────────────
bad = []
for it in FULLS:
    g = GROUP.get((it.get('group'), it['date']), [it])
    rids = Counter(x['ruleId'] for x in g)
    rub, d = it['rubricId'], D(it['date'])
    need = set()
    if rub != 'academy':
        need |= {'office', 'an_full'}
        if rub != 'research':
            need.add('sh_teaser')
    if it['ruleId'] == 'f_demo':
        need.add('ait')
    if rub == 'news':
        need.add('ml_week')
    if rub == 'research':
        need.add('lab_month')
    for r in need - set(rids):
        bad.append(f"{it['date']} {RUBRIC[rub]}: нет {RULES[r]['name']}")
    if rub == 'academy' and set(rids) != {'f_aca'}:
        bad.append(f"{it['date']} Академия: лишнее {sorted(set(rids) - {'f_aca'})}")
    for x in g:
        if x['ruleId'] == 'an_full':
            exp = ['X'] + (['LinkedIn', 'Mail'] if d.weekday() in (TUE, WED, THU) else [])
            if x['platforms'] != exp:
                bad.append(f"{it['date']} анонс FULL: {x['platforms']}, ждали {exp}")
        if x.get('derive') and x['title'] != it['title']:
            bad.append(f"{it['date']} {x['ruleId']}: тема «{x['title']}» ≠ «{it['title']}»")
check('С каждым FULL: тизер (кроме Академии и Исследований), анонс в Кабинете и в X (кроме Академии); '
      'LinkedIn и письмо — только Вт–Чт; Andre AIT — с Демо; у тизера и анонсов та же тема', bad[:8])
bad = []
for it in ITEMS:
    if it['ruleId'] in ('lan_x', 'ant_x', 'neu_x'):
        head = next((x for x in GROUP[(it['group'], it['date'])] if x in FULLS), None)
        key = {'lan_x': r'Landao|Ландао', 'ant_x': r'Antropolis|Антрополис', 'neu_x': r'Neuronium|Нейроний'}[it['ruleId']]
        if not head or not re.search(key, head['title']):
            bad.append(f"{it['date']} {it['ruleId']}")
for it in FULLS:
    for rid, key, ch in (('lan_x', r'Landao|Ландао', 'landao'), ('ant_x', r'Antropolis|Антрополис', 'antropolis'), ('neu_x', r'Neuronium|Нейроний', 'neuronium')):
        if re.search(key, it['title']) and it['date'] >= CH[ch]['start'] and not any(x['ruleId'] == rid for x in GROUP.get((it.get('group'), it['date']), [])):
            bad.append(f"{it['date']} «{it['title']}»: нет кросс-поста в {CH[ch]['name']}")
check('Кросс-посты в Landao, Antropolis, Neuronium — в дни FULL про них, после старта канала', bad)

# ── Академия ─────────────────────────────────────────────────────────────────
lessons = sorted((it for it in ITEMS if it['ruleId'] == 'aca_lesson'), key=lambda it: it['date'])
gaps = [f"{a['date']} → {b['date']}" for a, b in zip(lessons, lessons[1:]) if (D(b['date']) - D(a['date'])).days != 1]
dups = [a['date'] for a, b in zip(lessons, lessons[1:]) if a['title'] == b['title']]
check('Уроки Академии — каждый день, по порядку, без повторов', gaps + dups,
      f"курсы кончаются {lessons[-1]['date']}: последние {(END - D(lessons[-1]['date'])).days} дн. горизонта без урока — уроков в исходнике больше нет")
starts = {}
for it in lessons:
    m = re.fullmatch(r'(.+), модуль (\d+) — старт', it['title'])
    if m:
        starts[f'{m.group(1)}, модуль {m.group(2)}'] = it['date']
bad = [f"{it['date']}: {it['title']} — модуль стартовал {starts[it['title']]}"
       for it in FULLS if it['ruleId'] == 'f_aca' and it['title'] in starts and it['date'] < starts[it['title']]]
check('Видео модуля — не раньше старта модуля на сайте', bad)

# ── время, типы, названия ────────────────────────────────────────────────────
check('У каждого формата есть время выхода и что выходит на каждой его площадке',
      [f"{r['id']}: {p}" for r in SEED['rules'] for p in r['platforms'] if not r.get('types', {}).get(p)]
      + [r['id'] for r in SEED['rules'] if not re.fullmatch(r'\d\d:\d\d', r.get('time', ''))])
PREFIX = re.compile(r'^(Тизер|Призыв|Анонс|Разборы|Лайфстайл|Тезис|Демо|Технологии|Кейсы|Разработка|Мысли|Исследования|Академия)\s*[/:]')
check('Название — только тема: без рубрики и формата в начале',
      [f"{it['date']}: {it['title']}" for it in ITEMS if PREFIX.match(it['title'])][:5])
check('Уроки называются словами: «Автоматизация, модуль 3, урок 8»',
      [it['title'] for it in lessons if re.search(r'\d_\d', it['title'])][:5])

# ── календарь и исходник ─────────────────────────────────────────────────────
PLATFORMS = SEED['platforms']
lines = sum(1 for row in CAL for p in PLATFORMS for l in row[p].split('\n') if l.startswith('• '))
check('Календарь: каждая публикация на каждой своей площадке — одной строкой «• Рубрика · Формат: тема»',
      [] if lines == sum(len(it['platforms']) for it in ITEMS) else [f'строк {lines}, публикаций {sum(len(it["platforms"]) for it in ITEMS)}'])
bad = []
for row in CAL:
    its = BY_DAY.get(row['Дата'], [])
    for p in PLATFORMS:
        heads = [l for l in row[p].split('\n') if l and not l.startswith('• ')]
        if len(heads) != len(set(heads)):
            bad.append(f"{row['Дата']} {p}: канал дважды")
check('В ячейке календаря каждый канал — один раз, жирным заголовком над своими строками', bad[:5])


def src_lines(col):
    out = []
    for r in SRC:
        out += [l.strip() for l in r[col].split('\n') if l.strip()]
    return out


fixes = [('агенство', 'агентство'), ('Агенство', 'Агентство'), ('Нетворокинг', 'Нетворкинг'), ('Иссдедования', 'Исследования'), ('Гуманойд', 'Гуманоид')]


def fix(s):
    s = re.sub(r'\s+', ' ', s).strip()
    for a, b in fixes:
        s = s.replace(a, b)
    return s


titles = Counter(fix(it['title']) for it in ITEMS)
razbor = {fix(l.split(':', 1)[1]) for l in src_lines('Instagram') if l.startswith('Разборы:')}
check('Из исходника ничего не потерялось: все отрасли Разборов на месте', [x for x in razbor if not titles[x]][:5], f'отраслей: {len(razbor)}')
full_src = []
for r in SRC:
    yt = [l.strip() for l in r['YouTube'].split('\n')]
    if 'FULL' in yt and yt.index('FULL') + 1 < len(yt) and yt[yt.index('FULL') + 1]:
        full_src.append(fix(yt[yt.index('FULL') + 1]))
topic = lambda t: re.split(r'\s*[/:]\s*', t, maxsplit=1)[1] if re.match(r'\S+\s*[/:]', t) else t
lost = [t for t in full_src if not re.match(r'(Новости|Автоматизация|Исследования)\b', t) and not any(topic(t) == it['title'] for it in FULLS)]
check('Из исходника ничего не потерялось: все темы FULL (Демо, Технологии, Кейсы, Разработка, Мысли) на месте', lost[:5], f'тем FULL в исходнике: {len(full_src)}')

# ── итог ─────────────────────────────────────────────────────────────────────
fails = 0
for name, problems, note in results:
    ok = not problems
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}")
    for p in problems[:8]:
        print(f'    – {p}')
    if note:
        print(f'    · {note}')
print(f'\nПроверок: {len(results)}, нарушено: {fails}')
raise SystemExit(1 if fails else 0)
