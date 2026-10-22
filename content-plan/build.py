#!/usr/bin/env python3
"""Контент-план Andre AIT: правила → план → календарь.

Берёт материалы из исходной сетки (source/main.csv), раскладывает их по
правилам публикации (RUBRICS и функции ниже) и пишет в out/:

  1_rubrics.csv    — рубрики: какой канал, какие площадки, по каким дням
  2_week.csv       — типовая неделя: день × площадка
  3_plan.csv       — план: одна строка = один материал и его площадки
  4_calendar.csv   — план, наложенный на календарь (как исходная сетка)
  smm_plan.xlsx    — всё то же в одном файле, каналы жирным и в цвете

Запуск: python3 build.py
"""
import csv
import math
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import xlsxwriter

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'source' / 'main.csv'
OUT = ROOT / 'out'

START = date(2026, 10, 25)
END = date(2028, 10, 23)
LANDAO_START = date(2026, 11, 2)       # день анонса Landao
ANTROPOLIS_START = date(2026, 12, 1)   # следующий месяц после первого месяца плана

WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
PLATFORMS = ['Web', 'YouTube', 'Instagram', 'TikTok', 'Threads', 'X', 'Telegram', 'LinkedIn', 'Mail']
SHORTS = ('YouTube', 'Instagram', 'TikTok')
MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август',
          'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

# Порядок заголовков внутри ячейки календаря
HEADERS = ['Neuronium', 'Dataist', 'Dataist Lab', 'Dataist Academy', 'Dataist Office',
           'Лаборатория', 'Академия', 'Кабинет', 'Andre AIT', 'Landao', 'Antropolis']
WEB_SECTIONS = {'Lab': 'Лаборатория', 'Academy': 'Академия', 'Office': 'Кабинет'}
BRAND_COLORS = {'Neuronium': '#7B2CBF', 'Dataist': '#1A56B8', 'Andre AIT': '#0B7A75',
                'Landao': '#C2185B', 'Antropolis': '#D35400'}

# Спецпроекты (железо, XR, игры) — выходят по воскресеньям, как в исходной сетке
SPECIAL_DEMOS = {'Робот', 'EEG', 'VR-очки', 'Дроны', 'Антрополис', 'AR-очки', 'Гуманоид'}
# Дни недели FULL-рубрик
FULL_DAY = {'Демо': MON, 'Технологии': TUE, 'Кейсы': TUE, 'Разработка': WED,
            'Мысли': THU, 'Исследования': THU, 'Новости': FRI, 'Академия': SUN, 'Спецпроект': SUN}
TEXT_FIXES = [('агенство', 'агентство'), ('Агенство', 'Агентство'), ('Нетворокинг', 'Нетворкинг'),
              ('Иссдедования', 'Исследования'), ('Гуманойд', 'Гуманоид')]

PH = '…'  # материал не задан — слот под тему


# ---------------------------------------------------------------- рубрики

def _days(*cells):
    return list(cells)


ALL7 = _days(*['●'] * 7)
NO_SAT = _days('●', '●', '●', '●', '●', '', '●')

# id, бренд, канал/раздел, рубрика, что это, формат, площадки, Пн..Вс, частота, старт, материалы,
# подпись в типовой неделе, подсказки по дням для типовой недели
RUBRICS = {}


def rubric(rid, brand, channel, name, what, fmt, platforms, days, freq, start, source,
           tmpl=None, hint=None):
    RUBRICS[rid] = dict(brand=brand, channel=channel, name=name, what=what, fmt=fmt,
                        platforms=platforms, days=days, freq=freq, start=start, source=source,
                        tmpl=tmpl or name, hint=hint or {})


S0 = '25.10.2026'
# Neuronium
rubric('neu_all', 'Neuronium', 'Telegram «Neuronium»', 'Все новости',
       'Автоматическая лента всех новостей ИИ', 'Пост', 'Telegram', ALL7, 'ежедневно', S0,
       'лента Neuronium (авто)')
rubric('neu_top', 'Neuronium', 'YouTube «Neuronium»', 'Избранные новости',
       'Видео-подборка главных новостей дня', 'Видео', 'YouTube', ALL7, 'ежедневно', S0,
       'лента Neuronium')
rubric('neu_x', 'Neuronium', 'Telegram «Neuronium»', 'Кросс-пост о продукте',
       'Пост в день выхода FULL-видео Dataist про Neuronium', 'Пост', 'Telegram',
       _days(*['по FULL'] * 5, '', 'по FULL'), 'по графику FULL', S0, 'FULL Dataist',
       tmpl='Кросс-пост о продукте', hint={d: ' (по графику)' for d in range(7)})
# Dataist — Лаборатория
rubric('lab_day', 'Dataist', 'Dataist Lab', 'Исследование дня',
       'Разбор свежего исследования ИИ: пост в Лаборатории, X, Threads, LinkedIn и строка в письме',
       'Пост', 'Web (Лаборатория), Telegram, X, Threads, LinkedIn, Mail',
       _days('●', '●', '●', '●', '●', 'Web, TG, X', '●'), 'ежедневно', S0, 'Лаборатория (авто)')
rubric('lab_day_v', 'Dataist', 'Shorts', 'Исследование дня (видео)',
       'Короткое видео по исследованию дня', 'Shorts', 'YouTube, Instagram, TikTok', ALL7,
       'ежедневно', S0, 'Лаборатория (авто)', tmpl='Исследование дня')
rubric('lab_month', 'Dataist', 'Dataist Lab', 'Исследование месяца (пост)',
       'Итоги месяца в Лаборатории — в день выхода FULL «Исследования»', 'Пост',
       'Web (Лаборатория), Telegram', _days('', '', '', '2-й чт', '', '', ''), 'ежемесячно', S0,
       'FULL «Исследования»', tmpl='Исследования месяца', hint={THU: ' (2-й чт)'})
# Dataist — Академия
rubric('aca_lesson', 'Dataist', 'Dataist Academy', 'Урок дня',
       'Очередной урок курса; в день старта модуля — пометка «старт модуля»', 'Урок',
       'Web (Академия), Telegram, X', ALL7, 'ежедневно', S0,
       'курсы по порядку: Автоматизация → Разработка → Инжениринг → Менеджмент → AI CEO → CAIO '
       '→ AI CTO → AI Founder → Data Engineer → Data Analyst → Data Scientist → ML Engineer → Dataist')
rubric('aca_mail', 'Dataist', 'Рассылка Dataist', 'Старт модуля / курса',
       'Строка в письме в день старта модуля (старт в субботу — в воскресном письме)',
       'Строка письма', 'Mail', _days(*['по курсу'] * 5, '', 'по курсу'),
       'раз в 11 дней (короткие курсы — раз в 9)', S0, 'расписание Академии',
       hint={d: ' (по графику курса)' for d in range(7)})
# Dataist — FULL
rubric('f_demo', 'Dataist', 'YouTube Dataist', 'FULL: Демо', 'Демо продуктов и агентов', 'FULL',
       'YouTube', _days('●', '', '', '', '', '', ''), 'еженедельно', S0, 'исходный план')
rubric('f_tech', 'Dataist', 'YouTube Dataist', 'FULL: Технологии', 'Разбор технологии', 'FULL',
       'YouTube', _days('', 'чередуется', '', '', '', '', ''), 'через неделю (с Кейсами)', S0,
       'исходный план', hint={TUE: ' (чередуется с Кейсами)'})
rubric('f_case', 'Dataist', 'YouTube Dataist', 'FULL: Кейсы', 'Кейсы внедрения и создания продуктов',
       'FULL', 'YouTube', _days('', 'чередуется', '', '', '', '', ''),
       'через неделю (с Технологиями)', S0, 'исходный план',
       hint={TUE: ' (чередуется с Технологиями)'})
rubric('f_dev', 'Dataist', 'YouTube Dataist', 'FULL: Разработка', 'Как строим продукты экосистемы',
       'FULL', 'YouTube', _days('', '', 'через нед.', '', '', '', ''), 'через неделю', S0,
       'исходный план', hint={WED: ' (через неделю)'})
rubric('f_res', 'Dataist', 'YouTube Dataist', 'FULL: Исследования',
       'Исследования за прошлый месяц — 2-й четверг; годовой выпуск — последний четверг декабря',
       'FULL', 'YouTube', _days('', '', '', '2-й чт', '', '', ''), 'ежемесячно', S0,
       'исходный план + по правилу', hint={THU: ' (2-й чт месяца)'})
rubric('f_think', 'Dataist', 'YouTube Dataist', 'FULL: Мысли', 'Эссе о будущем ИИ, бизнеса и общества',
       'FULL', 'YouTube', _days('', '', '', 'через нед.', '', '', ''),
       'через неделю (кроме чт с Исследованиями)', S0, 'исходный план',
       hint={THU: ' (остальные чт, через неделю)'})
rubric('f_news', 'Dataist', 'YouTube Dataist', 'FULL: Новости недели', 'Итоги недели в ИИ', 'FULL',
       'YouTube', _days('', '', '', '', '●', '', ''), 'еженедельно', S0, 'по правилу (нумерация)')
rubric('f_aca', 'Dataist', 'YouTube Dataist', 'FULL: Академия', 'Полное видео модуля курса', 'FULL',
       'YouTube', _days('', '', '', '', '', '', '●'),
       'ближайшее свободное вс после старта модуля', S0,
       'исходный план (Автоматизация 1–8), дальше — модули курсов',
       hint={SUN: ' (после старта модуля)'})
rubric('f_spec', 'Dataist', 'YouTube Dataist', 'FULL: Демо-спецпроект',
       'Железо, XR, игры: робот, EEG, очки, дроны, Антрополис, гуманоид', 'FULL', 'YouTube',
       _days('', '', '', '', '', '', 'по готовности'), 'по готовности', S0, 'исходный план',
       hint={SUN: ' (по готовности)'})
rubric('sh_teaser', 'Dataist', 'Shorts', 'Тизер FULL', 'Вертикальный тизер FULL-видео дня', 'Shorts',
       'YouTube, Instagram, TikTok', _days('●', '●', '●', 'Мысли', '●', '', 'спецпроект'),
       'в дни FULL, кроме Академии и Исследований', S0, 'FULL дня')
rubric('office', 'Dataist', 'Dataist Office', 'Анонс FULL дня',
       'Текстовая версия / анонс FULL-видео дня (кроме Академии)', 'Пост', 'Web (Кабинет), Telegram',
       _days('●', '●', '●', '●', '●', '', 'спецпроект'), 'в дни FULL', S0, 'FULL дня',
       tmpl='Анонс FULL', hint={SUN: ' (если спецпроект)', WED: ' (если Разработка)',
                                THU: ' (если FULL)'})
rubric('an_full', 'Dataist', 'X / LinkedIn / Mail', 'Анонс FULL',
       'X — все FULL, кроме Академии; LinkedIn и письмо Dataist — только Вт–Чт',
       'Пост / строка письма', 'X, LinkedIn, Mail', _days('X', '●', '●', '●', 'X', '', 'X'),
       'в дни FULL', S0, 'FULL дня',
       hint={SUN: ' (если спецпроект)', WED: ' (если Разработка)', THU: ' (если FULL)'})
# Dataist — Shorts
rubric('sh_thesis', 'Dataist', 'Shorts', 'Тезис дня', 'Короткое видео-мнение (хук дня)', 'Shorts',
       'YouTube, Instagram, TikTok', NO_SAT, 'ежедневно, кроме субботы', S0, 'исходный план')
rubric('sh_razbor', 'Dataist', 'Shorts', 'Разборы: отрасль', 'Разбор ИИ-трансформации отрасли',
       'Shorts', 'YouTube, Instagram, TikTok', NO_SAT, 'ежедневно, кроме субботы', S0,
       'исходный план', tmpl='Разборы')
rubric('th_call', 'Dataist', 'Threads', 'Призыв: отрасль',
       'Призыв к компаниям отрасли из разбора дня', 'Пост', 'Threads', NO_SAT,
       'в дни Разборов', S0, 'Разборы дня', tmpl='Призыв')
rubric('sh_life', 'Dataist', 'Shorts', 'Лайфстайл', 'Лайфстайл-видео с цитатой', 'Shorts',
       'YouTube, Instagram, TikTok', ALL7, 'ежедневно (в субботу — главный контент)', S0,
       'исходный план')
rubric('sh_edu', 'Dataist', 'Shorts', 'Обучение 1–4', 'Четыре обучающих шортса', 'Shorts',
       'YouTube, Instagram, TikTok', NO_SAT, 'ежедневно, кроме субботы', S0, 'Академия')
# Dataist — текст и рассылка
rubric('tx_hack', 'Dataist', 'Threads / LinkedIn / Mail', 'Лайфхак дня', 'Практический совет дня',
       'Пост / строка письма', 'Threads, LinkedIn, Mail', NO_SAT, 'ежедневно, кроме субботы', S0,
       'по правилу')
rubric('ml_news', 'Dataist', 'Рассылка Dataist', 'Избранные новости',
       'Подборка новостей Neuronium в письме Dataist', 'Строка письма', 'Mail', NO_SAT,
       'ежедневно, кроме субботы', S0, 'лента Neuronium')
rubric('ml_week', 'Dataist', 'Рассылка Dataist', 'Недельный дайджест', 'Письмо с итогами недели',
       'Письмо', 'Mail', _days('', '', '', '', '●', '', ''), 'еженедельно', S0, 'Новости недели')
# Andre AIT
rubric('ait', 'Andre AIT', 'LinkedIn / Mail', 'Анонс демо',
       'Демо недели и спецпроекты от лица Andre AIT', 'Пост / письмо', 'LinkedIn, Mail',
       _days('●', '', '', '', '', '', 'спецпроект'), 'еженедельно + спецпроекты', S0,
       'FULL «Демо»', hint={SUN: ' (если спецпроект)'})
# Landao
rubric('lan_launch', 'Landao', 'Landao', 'Запуск канала', 'Первый пост канала в день анонса Landao',
       'Пост', 'Telegram', _days('02.11', '', '', '', '', '', ''), 'разово',
       LANDAO_START.strftime('%d.%m.%Y'), '—')
rubric('lan_upd', 'Landao', 'Landao', 'Обновления Landao', 'Что нового в продукте за неделю',
       'Пост + Shorts', 'Telegram, Instagram, TikTok', _days('', '', '●', '', '', '', ''),
       'еженедельно', LANDAO_START.strftime('%d.%m.%Y'), 'команда Landao')
rubric('lan_x', 'Landao', 'Landao', 'Кросс-пост демо',
       'Демо / кейсы Landao в день выхода FULL у Dataist', 'Пост + Shorts',
       'Telegram, Instagram, TikTok', _days('по FULL', 'по FULL', '', '', '', '', ''),
       'по графику FULL', LANDAO_START.strftime('%d.%m.%Y'), 'FULL Dataist',
       hint={d: ' (по графику)' for d in range(7)})
# Antropolis
rubric('ant_launch', 'Antropolis', 'Antropolis', 'Запуск канала',
       'Первый пост канала + строка в письме Dataist', 'Пост', 'Telegram, Mail',
       _days('', '01.12', '', '', '', '', ''), 'разово', ANTROPOLIS_START.strftime('%d.%m.%Y'), '—')
rubric('ant_diary', 'Antropolis', 'Antropolis', 'Дневник разработки', 'Еженедельный девлог игры',
       'Пост + Shorts', 'Telegram, YouTube, TikTok', _days('', '', '', '●', '', '', ''),
       'еженедельно', ANTROPOLIS_START.strftime('%d.%m.%Y'), 'команда Antropolis')
rubric('ant_x', 'Antropolis', 'Antropolis', 'Кросс-пост демо',
       'Демо / кейсы Antropolis в день выхода FULL у Dataist', 'Пост + Shorts',
       'Telegram, YouTube, TikTok', _days('', 'по FULL', '', '', '', '', 'по FULL'),
       'по графику FULL', ANTROPOLIS_START.strftime('%d.%m.%Y'), 'FULL Dataist',
       hint={d: ' (по графику)' for d in range(7)})

ONE_OFF = {'lan_launch', 'ant_launch'}
# Порядок строк в таблице рубрик: сначала сетка FULL, потом всё, что от неё и вокруг неё
RUBRIC_ORDER = ['f_demo', 'f_tech', 'f_case', 'f_dev', 'f_res', 'f_think', 'f_news', 'f_aca', 'f_spec',
                'sh_teaser', 'office', 'an_full', 'ait',
                'lab_day', 'lab_day_v', 'lab_month', 'aca_lesson', 'aca_mail',
                'sh_thesis', 'sh_razbor', 'th_call', 'sh_life', 'sh_edu', 'tx_hack', 'ml_news', 'ml_week',
                'neu_all', 'neu_top', 'neu_x',
                'lan_launch', 'lan_upd', 'lan_x', 'ant_launch', 'ant_diary', 'ant_x']
assert sorted(RUBRIC_ORDER) == sorted(RUBRICS)


# ---------------------------------------------------------------- модель

@dataclass
class Unit:
    day: date
    brand: str
    section: str | None  # Lab / Academy / Office — только у Dataist
    rubric: str
    fmt: str
    text: str
    platforms: tuple
    source: str          # исходный план / правило / нужна тема
    rank: int
    orig: date | None = None


UNITS: list[Unit] = []


def add(day, brand, section, rid, fmt, text, platforms, source, rank, orig=None):
    if START <= day <= END:
        UNITS.append(Unit(day, brand, section, rid, fmt, text, tuple(platforms), source, rank,
                          orig if orig and orig != day else None))


def fix(s):
    s = re.sub(r'\s+', ' ', s).strip()
    for a, b in TEXT_FIXES:
        s = s.replace(a, b)
    return s


def days_range(a=START, b=END):
    d = a
    while d <= b:
        yield d
        d += timedelta(1)


def on_weekday(d, wd):
    """Дата дня недели wd в той же неделе (Пн–Вс), что и d."""
    return d - timedelta(d.weekday()) + timedelta(wd)


def next_weekday(d, wd):
    return d + timedelta((wd - d.weekday()) % 7)


def nth_weekday(year, month, wd, n):
    d = next_weekday(date(year, month, 1), wd)
    return d + timedelta(7 * (n - 1))


def last_weekday(year, month, wd):
    nxt = date(year + month // 12, month % 12 + 1, 1)
    return next_weekday(nxt - timedelta(7), wd)


# ---------------------------------------------------------------- исходник

def load_source():
    rows = list(csv.reader(SRC.open(encoding='utf-8')))
    ix = {h: i for i, h in enumerate(rows[0])}
    out = []
    for r in rows[1:]:
        cells = {p: [l.strip() for l in r[ix[p]].split('\n')] for p in PLATFORMS}
        out.append((date.fromisoformat(r[ix['Дата']]), cells))
    return out


def extract(src):
    lessons, full, thesis, razbor, life, calls = [], [], [], [], [], []
    for d, c in src:
        web = [l for l in c['Web'] if l]
        if len(web) == 1:
            lessons.append(web[0])
        elif 'Академия:' in web:
            lessons.append(web[web.index('Академия:') + 1])
        yt = c['YouTube']
        title = ''
        if 'FULL' in yt and yt.index('FULL') + 1 < len(yt):
            title = fix(yt[yt.index('FULL') + 1])
            if title:
                full.append((d, title))
        day_thesis = []
        for l in c['Instagram']:
            if not l or l in ('Датаист:', 'Исследование дня', '#VALUE!') or l.startswith('Обучение'):
                continue
            if l.startswith('Разборы:'):
                razbor.append((d, fix(l.split(':', 1)[1])))
            elif l.startswith('Лайфстайл'):
                life.append((d, fix(l)))
            elif title and fix(l) == title:
                continue  # тизер FULL
            else:
                day_thesis.append(fix(l))
        if day_thesis:
            thesis.append((d, day_thesis))
        if not any(x[0] == d for x in razbor):
            calls += [(d, fix(l)) for l in c['Threads'] if l.startswith('Призыв:')]
    # в исходнике урок «Автоматизация 6_2» стоит два дня подряд — убираем повтор
    lessons = [l for i, l in enumerate(lessons) if i == 0 or l != lessons[i - 1]]
    return lessons, full, thesis, razbor, life, calls


# ---------------------------------------------------------------- Академия

def academy(lessons):
    """Уроки по дням + старты модулей/курсов."""
    sched, starts = [], []
    for i, name in enumerate(lessons):
        d = START + timedelta(i)
        if d > END:
            break
        nxt = lessons[i + 1] if i + 1 < len(lessons) else ''
        m = re.fullmatch(r'(.+?) (\d+)', name)
        kind = None
        if not re.search(r'\d', name):
            kind = 'course'
        elif m and nxt == f'{name}_1':
            kind = 'course' if m.group(2) == '1' else 'module'
        sched.append((d, name, kind))
        if kind:
            starts.append((d, name, kind))
    return sched, starts


# ---------------------------------------------------------------- FULL

def classify(title):
    """FULL-заголовок → (рубрика, тема, нормализованный заголовок)."""
    m = re.fullmatch(r'(\S+?)\s*[/:]\s*(.+)', title)
    if title.startswith('Новости'):
        return 'Новости', '', title
    if m:
        cat, topic = m.group(1), m.group(2).strip()
        if cat == 'Демо' and topic in SPECIAL_DEMOS:
            return 'Спецпроект', topic, f'Демо / {topic}'
        return cat, topic, f'{cat} / {topic}'
    m = re.fullmatch(r'Автоматизация (\d+)', title)
    if m:
        return 'Академия', title, f'Академия / {title}'
    m = re.fullmatch(r'Исследования (\d{4})', title)
    if m:
        return 'Исследования', title, f'Исследования / Итоги {m.group(1)} года'
    raise ValueError(title)


def schedule_full(full, starts):
    slots = {}  # дата → (рубрика, тема, заголовок, источник, исходная дата)

    def take(d, item):
        assert d not in slots, (d, item, slots[d])
        slots[d] = item

    def first_free(d, wd):
        d = next_weekday(d, wd)
        while d in slots:
            d += timedelta(7)
        return d

    # 1. Новости недели — каждую пятницу
    for n, d in enumerate((d for d in days_range() if d.weekday() == FRI), 1):
        take(d, ('Новости', '', f'Новости недели {n}', 'правило', None))

    # 2. Исследования месяца — 2-й четверг следующего месяца, год — последний четверг декабря
    items = [(d, classify(t)) for d, t in full]
    rest = []
    last_month = None
    for d, (cat, topic, title) in items:
        if cat == 'Исследования' and topic in MONTHS:
            mi = MONTHS.index(topic) + 1
            year = d.year if mi < d.month else d.year - 1
            ny, nm = (year + 1, 1) if mi == 12 else (year, mi + 1)
            t = nth_weekday(ny, nm, THU, 2)
            if t < START:
                t = on_weekday(d, THU)
            take(t, ('Исследования', topic, f'Исследования / {topic} {year}', 'исходный план', d))
            last_month = (year, mi)
        elif cat == 'Исследования' and title.startswith('Исследования / Итоги'):
            take(last_weekday(d.year, 12, THU) if d.month == 12 else on_weekday(d, THU),
                 (cat, topic, title, 'исходный план', d))
        elif cat == 'Спецпроект':
            take(on_weekday(d, SUN), (cat, topic, title, 'исходный план', d))
        else:
            rest.append((d, cat, topic, title))
    y, m = last_month
    while True:
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        t = nth_weekday(ny, nm, THU, 2)
        if t > END:
            break
        take(t, ('Исследования', MONTHS[m - 1], f'Исследования / {MONTHS[m - 1]} {y}', 'правило', None))
    for y in range(START.year + 1, END.year + 1):
        t = last_weekday(y, 12, THU)
        if t <= END and t not in slots:
            take(t, ('Исследования', str(y), f'Исследования / Итоги {y} года', 'правило', None))

    # 3. Остальное — на свой день недели в той же неделе, при занятости — дальше;
    #    порядок внутри рубрики сохраняется
    prev = {}
    for d, cat, topic, title in rest:
        wd = FULL_DAY[cat]
        t = max(on_weekday(d, wd), prev.get(cat, START))
        t = first_free(t, wd)
        take(t, (cat, topic, title, 'исходный план', d))
        prev[cat] = t + timedelta(1)

    # 4. Академия: после Автоматизации 1–8 — по видео на каждый модуль/курс,
    #    в ближайшее свободное воскресенье после старта модуля на сайте
    a = prev.get('Академия', START)
    for d, name, kind in starts:
        if name.startswith('Автоматизация'):
            continue
        t = first_free(max(d, a), SUN)
        if t > END:
            break
        take(t, ('Академия', name, f'Академия / {name}', 'правило', None))
        a = t + timedelta(1)

    # 5. После исходного плана — слоты по сетке
    def last_on(wd, cats):
        return max(d for d, it in slots.items()
                   if d.weekday() == wd and it[0] in cats and it[3] == 'исходный план')

    for d in days_range(last_on(MON, {'Демо'}) + timedelta(1)):
        if d.weekday() == MON and d not in slots:
            take(d, ('Демо', PH, f'Демо / {PH}', 'нужна тема', None))
    lt = last_on(TUE, {'Технологии', 'Кейсы'})
    cat = 'Технологии' if slots[lt][0] == 'Кейсы' else 'Кейсы'
    for d in days_range(lt + timedelta(1)):
        if d.weekday() == TUE and d not in slots:
            take(d, (cat, PH, f'{cat} / {PH}', 'нужна тема', None))
            cat = 'Технологии' if cat == 'Кейсы' else 'Кейсы'
    lw = last_on(WED, {'Разработка'})
    for d in days_range(lw + timedelta(14)):
        if d.weekday() == WED and (d - lw).days % 14 == 0 and d not in slots:
            take(d, ('Разработка', PH, f'Разработка / {PH}', 'нужна тема', None))
    lth = last_on(THU, {'Мысли', 'Исследования'})
    on = True
    for d in days_range(lth + timedelta(1)):
        if d.weekday() == THU and d not in slots:
            if on:
                take(d, ('Мысли', PH, f'Мысли / {PH}', 'нужна тема', None))
            on = not on
    return slots


def full_units(d, item):
    cat, topic, title, source, orig = item
    rid = {'Демо': 'f_demo', 'Технологии': 'f_tech', 'Кейсы': 'f_case', 'Разработка': 'f_dev',
           'Мысли': 'f_think', 'Исследования': 'f_res', 'Новости': 'f_news', 'Академия': 'f_aca',
           'Спецпроект': 'f_spec'}[cat]
    add(d, 'Dataist', None, rid, 'FULL', title, ['YouTube'], source, 0, orig)
    if cat == 'Академия':
        return
    if cat != 'Исследования':
        add(d, 'Dataist', None, 'sh_teaser', 'Shorts', f'Тизер: {title}', SHORTS, source, 60, orig)
    if cat in ('Демо', 'Спецпроект'):
        office = f'Анонс / {topic}'
    elif cat == 'Исследования':
        office = f'Анонс / {title}'
        add(d, 'Dataist', 'Lab', 'lab_month', 'Пост', title, ['Web', 'Telegram'], source, 15, orig)
    else:
        office = title
    add(d, 'Dataist', 'Office', 'office', 'Пост', office, ['Web', 'Telegram'], source, 30, orig)
    xs = ['X'] + (['LinkedIn', 'Mail'] if d.weekday() in (TUE, WED, THU) else [])
    add(d, 'Dataist', None, 'an_full', 'Пост / строка письма', title, xs, source, 80, orig)
    if cat in ('Демо', 'Спецпроект'):
        add(d, 'Andre AIT', None, 'ait', 'Пост / письмо', f'Анонс / {topic}', ['LinkedIn', 'Mail'],
            source, 0, orig)
    if cat == 'Новости':
        add(d, 'Dataist', None, 'ml_week', 'Письмо', 'Недельный дайджест', ['Mail'], source, 85)
    if source == 'нужна тема':
        return
    if re.search(r'Landao|Ландао', title) and d >= LANDAO_START:
        add(d, 'Landao', None, 'lan_x', 'Пост + Shorts', title, ['Telegram', 'Instagram', 'TikTok'],
            source, 10, orig)
    if re.search(r'Antropolis|Антрополис', title) and d >= ANTROPOLIS_START:
        add(d, 'Antropolis', None, 'ant_x', 'Пост + Shorts', title, ['Telegram', 'YouTube', 'TikTok'],
            source, 10, orig)
    if re.search(r'Neuronium|Нейроний', title):
        add(d, 'Neuronium', None, 'neu_x', 'Пост', title, ['Telegram'], source, 10, orig)


# ---------------------------------------------------------------- сборка плана

def build():
    lessons, full, thesis, razbor, life, calls = extract(load_source())
    sched, starts = academy(lessons)
    slots = schedule_full(full, starts)

    # Ежедневные рубрики
    for d in days_range():
        sat = d.weekday() == SAT
        add(d, 'Neuronium', None, 'neu_all', 'Пост', 'Все новости', ['Telegram'], 'правило', 0)
        add(d, 'Neuronium', None, 'neu_top', 'Видео', 'Избранные новости', ['YouTube'], 'правило', 0)
        lab = ['Web', 'Telegram', 'X'] + ([] if sat else ['Threads', 'LinkedIn', 'Mail'])
        add(d, 'Dataist', 'Lab', 'lab_day', 'Пост', 'Исследование дня', lab, 'правило', 10)
        add(d, 'Dataist', None, 'lab_day_v', 'Shorts', 'Исследование дня', SHORTS, 'правило', 10)
        if not sat:
            add(d, 'Dataist', None, 'ml_news', 'Строка письма', 'Избранные новости', ['Mail'],
                'правило', 5)
            add(d, 'Dataist', None, 'sh_edu', 'Shorts', 'Обучение 1–4', SHORTS, 'правило', 50)
            add(d, 'Dataist', None, 'tx_hack', 'Пост / строка письма', 'Лайфхак дня',
                ['Threads', 'LinkedIn', 'Mail'], 'правило', 70)

    # Академия
    for d, name, kind in sched:
        mark = {'course': ' — старт курса', 'module': ' — старт модуля'}.get(kind, '')
        add(d, 'Dataist', 'Academy', 'aca_lesson', 'Урок', name + mark, ['Web', 'Telegram', 'X'],
            'исходный план', 20)
        if kind:
            md = d + timedelta(1) if d.weekday() == SAT else d
            course = re.sub(r' \d+$', '', name)
            text = f'Академия: новый курс «{course}»' if kind == 'course' else \
                f'Академия: старт модуля {name}'
            add(md, 'Dataist', 'Academy', 'aca_mail', 'Строка письма', text, ['Mail'],
                'исходный план', 90, d)

    # FULL и всё, что от него зависит
    for d, item in sorted(slots.items()):
        full_units(d, item)

    # Тезисы и Разборы: каждый день, кроме субботы, в исходном порядке
    def sequential(start):
        d = start
        while True:
            if d.weekday() != SAT:
                yield d
            d += timedelta(1)

    days = sequential(thesis[0][0])
    for orig, titles in thesis:
        d = next(days)
        for t in titles:
            add(d, 'Dataist', None, 'sh_thesis', 'Shorts', t, SHORTS, 'исходный план', 20, orig)
    for d in days:
        if d > END:
            break
        add(d, 'Dataist', None, 'sh_thesis', 'Shorts', f'Тезис: {PH}', SHORTS, 'нужна тема', 20)

    days = sequential(razbor[0][0])
    for orig, industry in razbor:
        d = next(days)
        add(d, 'Dataist', None, 'sh_razbor', 'Shorts', f'Разборы: {industry}', SHORTS,
            'исходный план', 30, orig)
        add(d, 'Dataist', None, 'th_call', 'Пост', f'Призыв: {industry}', ['Threads'],
            'исходный план', 30, orig)
    for d in days:
        if d > END:
            break
        add(d, 'Dataist', None, 'sh_razbor', 'Shorts', f'Разборы: {PH}', SHORTS, 'нужна тема', 30)
        add(d, 'Dataist', None, 'th_call', 'Пост', f'Призыв: {PH}', ['Threads'], 'нужна тема', 30)
    for d, t in calls:
        add(d, 'Dataist', None, 'th_call', 'Пост', t, ['Threads'], 'исходный план', 30)

    # Лайфстайл — каждый день, по исходным датам
    by_day = {}
    for d, t in life:
        m = re.fullmatch(r'Лайфстайл:\s*([^:]*?)\s*(?::\s*(.*))?', t)
        place, quote = (m.group(1), m.group(2)) if m else ('', '')
        if place and quote:
            by_day[d] = (f'Лайфстайл: {place} — {quote}', 'исходный план')
        elif place:
            by_day[d] = (f'Лайфстайл: {place}', 'исходный план')
    for d in days_range():
        text, src = by_day.get(d, (f'Лайфстайл: {PH}', 'нужна тема'))
        add(d, 'Dataist', None, 'sh_life', 'Shorts', text, SHORTS, src, 40)

    # Разовые вещи старта из исходной сетки
    add(START, 'Dataist', 'Office', 'office', 'Пост', 'Анонс / Автоматизация 3_8',
        ['Web', 'Telegram'], 'исходный план', 30)

    # Landao
    add(LANDAO_START, 'Landao', None, 'lan_launch', 'Пост', 'Анонс / Landao — запуск канала',
        ['Telegram'], 'правило', 0)
    for d in days_range(LANDAO_START):
        if d.weekday() == WED:
            add(d, 'Landao', None, 'lan_upd', 'Пост + Shorts', 'Обновления Landao',
                ['Telegram', 'Instagram', 'TikTok'], 'правило', 20)

    # Antropolis
    add(ANTROPOLIS_START, 'Antropolis', None, 'ant_launch', 'Пост',
        'Анонс / Antropolis — запуск канала', ['Telegram'], 'правило', 0)
    add(ANTROPOLIS_START, 'Dataist', None, 'ant_launch', 'Строка письма', 'Новый канал: Antropolis',
        ['Mail'], 'правило', 88)
    for d in days_range(ANTROPOLIS_START):
        if d.weekday() == THU:
            add(d, 'Antropolis', None, 'ant_diary', 'Пост + Shorts', 'Дневник разработки Antropolis',
                ['Telegram', 'YouTube', 'TikTok'], 'правило', 20)

    UNITS.sort(key=lambda u: (u.day, HEADERS.index(u.brand), u.rank))
    check(slots)


# ---------------------------------------------------------------- проверки

def check(slots):
    by_day = {}
    for u in UNITS:
        by_day.setdefault(u.day, []).append(u)
    for d, us in by_day.items():
        fulls = [u for u in us if u.fmt == 'FULL']
        assert len(fulls) <= 1, (d, [u.text for u in fulls])
        assert len([u for u in us if u.rubric == 'office']) <= 1, d
        assert len([u for u in us if u.rubric == 'ait']) <= 1, d
        if d.weekday() == SAT:
            allowed = {'neu_all', 'neu_top', 'lab_day', 'lab_day_v', 'aca_lesson', 'sh_life'}
            bad = [u.rubric for u in us if u.rubric not in allowed]
            assert not bad, (d, bad)
            assert not any({'Threads', 'LinkedIn', 'Mail'} & set(u.platforms) for u in us), d
        for rid in ('sh_thesis', 'sh_razbor'):
            n = len([u for u in us if u.rubric == rid])
            assert n <= (3 if d == START else 1), (d, rid, n)


# ---------------------------------------------------------------- вывод

def header_of(u, platform):
    if platform == 'Web':
        return WEB_SECTIONS[u.section]
    if platform == 'Telegram' and u.brand == 'Dataist':
        return f'Dataist {u.section}'
    return u.brand


def brand_of_header(h):
    return 'Dataist' if h in WEB_SECTIONS.values() or h.startswith('Dataist') else h


def cell_lines(units, platform):
    """[(текст, стиль)], стиль: head:<бренд> / full / ph / text / blank."""
    groups = {}
    for u in units:
        if platform in u.platforms:
            groups.setdefault(header_of(u, platform), []).append(u)
    lines = []
    for h in sorted(groups, key=HEADERS.index):
        if lines:
            lines.append(('', 'blank'))
        lines.append((h, 'head:' + brand_of_header(h)))
        for u in sorted(groups[h], key=lambda u: u.rank):
            if u.fmt == 'FULL':
                lines.append((f'• FULL: {u.text}', 'ph' if u.source == 'нужна тема' else 'full'))
            else:
                lines.append((f'• {u.text}', 'ph' if u.source == 'нужна тема' else 'text'))
    return lines


def channel_of(u):
    if u.brand == 'Dataist' and u.section:
        return f'Dataist {u.section}'
    if u.brand == 'Dataist' and u.fmt == 'FULL':
        return 'YouTube Dataist'
    if u.brand == 'Dataist' and u.fmt == 'Shorts':
        return 'Dataist Shorts'
    return u.brand


def tables():
    rubrics = [['№', 'Бренд', 'Канал / раздел', 'Рубрика', 'Что это', 'Формат', 'Площадки', *WD,
                'Частота', 'Старт', 'Откуда материалы']]
    for i, rid in enumerate(RUBRIC_ORDER, 1):
        r = RUBRICS[rid]
        rubrics.append([i, r['brand'], r['channel'], r['name'], r['what'], r['fmt'], r['platforms'],
                        *r['days'], r['freq'], r['start'], r['source']])

    # Типовая неделя: всё, что встречается в этот день недели, с подсказками частоты
    week = {}
    for u in UNITS:
        if u.rubric in ONE_OFF or u.day == START:
            continue
        for p in u.platforms:
            key = (u.day.weekday(), p, header_of(u, p), u.rubric)
            week[key] = min(week.get(key, 99), u.rank)
    week_lines = {}
    for wd in range(7):
        for p in PLATFORMS:
            items = [(h, rid, rank) for (w, pp, h, rid), rank in week.items() if w == wd and pp == p]
            lines = []
            for h in sorted({h for h, _, _ in items}, key=HEADERS.index):
                if lines:
                    lines.append(('', 'blank'))
                lines.append((h, 'head:' + brand_of_header(h)))
                for _, rid, _ in sorted((x for x in items if x[0] == h), key=lambda x: x[2]):
                    r = RUBRICS[rid]
                    style = 'full' if r['fmt'] == 'FULL' else 'text'
                    lines.append((f"• {r['tmpl']}{r['hint'].get(wd, '')}", style))
            week_lines[(wd, p)] = lines

    plan = [['Дата', 'День', 'Бренд', 'Канал / раздел', 'Рубрика', 'Формат', 'Материал', 'Площадки',
             'Источник', 'Дата в исходнике']]
    for u in UNITS:
        plan.append([u.day.isoformat(), WD[u.day.weekday()], u.brand, channel_of(u),
                     RUBRICS[u.rubric]['name'], u.fmt, u.text, ', '.join(u.platforms), u.source,
                     u.orig.isoformat() if u.orig else ''])

    by_day = {}
    for u in UNITS:
        by_day.setdefault(u.day, []).append(u)
    calendar = []
    for i, d in enumerate(days_range(), 1):
        calendar.append((i, d, {p: cell_lines(by_day.get(d, []), p) for p in PLATFORMS}))
    return rubrics, week_lines, plan, calendar


def text_of(lines):
    return '\n'.join(t for t, _ in lines)


def write_csv(name, rows):
    with (OUT / name).open('w', encoding='utf-8', newline='') as f:
        csv.writer(f).writerows(rows)


def write_xlsx(rubrics, week_lines, plan, calendar):
    wb = xlsxwriter.Workbook(OUT / 'smm_plan.xlsx')
    base = dict(font_name='Arial', font_size=10)
    F = {
        'text': wb.add_format(base),
        'full': wb.add_format({**base, 'font_color': '#B71C1C'}),
        'ph': wb.add_format({**base, 'font_color': '#9E9E9E', 'italic': True}),
    }
    for b, c in BRAND_COLORS.items():
        F['head:' + b] = wb.add_format({**base, 'bold': True, 'font_color': c})
    cell = dict(base, text_wrap=True, valign='top', border=1, border_color='#D0D0D0')
    C = {
        'cell': wb.add_format(cell),
        'sat': wb.add_format({**cell, 'bg_color': '#EEF6EC'}),
        'mon': wb.add_format({**cell, 'top': 2, 'top_color': '#607D8B'}),
        'head': wb.add_format({**base, 'bold': True, 'font_color': '#FFFFFF', 'bg_color': '#263238',
                               'valign': 'vcenter', 'align': 'center', 'text_wrap': True, 'border': 1}),
        'center': wb.add_format({**cell, 'align': 'center'}),
        'center_sat': wb.add_format({**cell, 'align': 'center', 'bg_color': '#EEF6EC'}),
        'ph_row': wb.add_format({**cell, 'font_color': '#9E9E9E', 'italic': True}),
        'need': wb.add_format({**cell, 'bg_color': '#FFF3E0'}),
    }
    for b, c in BRAND_COLORS.items():
        C['brand:' + b] = wb.add_format({**cell, 'bold': True, 'font_color': c})

    def rich(ws, r, c, lines, fmt):
        frags = []
        for i, (t, st) in enumerate(lines):
            t = t + ('\n' if i < len(lines) - 1 else '')
            if not t:
                continue
            f = F[st] if st in F else F['text']
            if frags and frags[-2] is f:
                frags[-1] += t
            else:
                frags += [f, t]
        if len(frags) > 2:
            ws.write_rich_string(r, c, *frags, fmt)
        elif frags:
            ws.write_string(r, c, frags[1], fmt)
        else:
            ws.write_blank(r, c, None, fmt)

    def height(cells, widths):
        n = 1
        for lines, w in zip(cells, widths):
            n = max(n, sum(max(1, math.ceil(len(t) / max(w - 2, 1))) for t, _ in lines))
        return min(n * 13 + 4, 409)

    # Правила
    ws = wb.add_worksheet('Правила')
    widths = [4, 11, 20, 24, 44, 14, 28, 11, 11, 11, 11, 11, 11, 11, 24, 11, 32]
    for i, w in enumerate(widths):
        ws.set_column(i, i, w)
    ws.write_row(0, 0, rubrics[0], C['head'])
    ws.set_row(0, 30)
    for r, row in enumerate(rubrics[1:], 1):
        for c, v in enumerate(row):
            if c == 1:
                ws.write(r, c, v, C['brand:' + v])
            elif 7 <= c <= 13:
                ws.write(r, c, v, C['center_sat'] if c == 12 else C['center'])
            else:
                ws.write(r, c, v, C['cell'])
        ws.set_row(r, height([[(str(v), '')] for v in row], widths))
    ws.freeze_panes(1, 4)

    # Неделя
    ws = wb.add_worksheet('Неделя')
    widths = [6, 22, 36, 30, 30, 24, 26, 30, 28, 30]
    for i, w in enumerate(widths):
        ws.set_column(i, i, w)
    ws.write_row(0, 0, ['День', *PLATFORMS], C['head'])
    for wd in range(7):
        fmt = C['sat'] if wd == SAT else C['cell']
        ws.write(wd + 1, 0, WD[wd], C['center_sat'] if wd == SAT else C['center'])
        cells = [week_lines[(wd, p)] for p in PLATFORMS]
        for c, lines in enumerate(cells, 1):
            rich(ws, wd + 1, c, lines, fmt)
        ws.set_row(wd + 1, height(cells, widths[1:]))
    ws.freeze_panes(1, 1)

    # План
    ws = wb.add_worksheet('План')
    widths = [11, 5, 11, 17, 24, 18, 60, 34, 14, 12]
    for i, w in enumerate(widths):
        ws.set_column(i, i, w)
    ws.write_row(0, 0, plan[0], C['head'])
    for r, row in enumerate(plan[1:], 1):
        ph = row[8] == 'нужна тема'
        for c, v in enumerate(row):
            if c == 2:
                ws.write(r, c, v, C['brand:' + v])
            elif c == 8 and ph:
                ws.write(r, c, v, C['need'])
            else:
                ws.write(r, c, v, C['ph_row'] if ph and c == 6 else C['cell'])
    ws.autofilter(0, 0, len(plan) - 1, len(plan[0]) - 1)
    ws.freeze_panes(1, 3)

    # Календарь
    ws = wb.add_worksheet('Календарь')
    widths = [5, 5, 11, 32, 46, 40, 40, 30, 30, 36, 30, 32]
    for i, w in enumerate(widths):
        ws.set_column(i, i, w)
    ws.write_row(0, 0, ['#', 'День', 'Дата', *PLATFORMS], C['head'])
    for r, (i, d, cells) in enumerate(calendar, 1):
        fmt = C['sat'] if d.weekday() == SAT else C['mon'] if d.weekday() == MON else C['cell']
        ws.write(r, 0, i, fmt)
        ws.write(r, 1, WD[d.weekday()], fmt)
        ws.write(r, 2, d.isoformat(), fmt)
        lines = [cells[p] for p in PLATFORMS]
        for c, ls in enumerate(lines, 3):
            rich(ws, r, c, ls, fmt)
        ws.set_row(r, height(lines, widths[3:]))
    ws.freeze_panes(1, 3)
    ws.activate()
    wb.close()


def main():
    build()
    OUT.mkdir(exist_ok=True)
    rubrics, week_lines, plan, calendar = tables()
    write_csv('1_rubrics.csv', rubrics)
    write_csv('2_week.csv', [['День', *PLATFORMS]] +
              [[WD[wd], *(text_of(week_lines[(wd, p)]) for p in PLATFORMS)] for wd in range(7)])
    write_csv('3_plan.csv', plan)
    write_csv('4_calendar.csv', [['#', 'День', 'Дата', *PLATFORMS]] +
              [[i, WD[d.weekday()], d.isoformat(), *(text_of(c[p]) for p in PLATFORMS)]
               for i, d, c in calendar])
    write_xlsx(rubrics, week_lines, plan, calendar)
    need = sum(1 for u in UNITS if u.source == 'нужна тема')
    print(f'{len(calendar)} дней, {len(UNITS)} материалов, из них слотов без темы: {need}')


if __name__ == '__main__':
    main()
