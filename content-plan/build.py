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
MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
              'сентября', 'октября', 'ноября', 'декабря']

# Порядок заголовков внутри ячейки календаря
HEADERS = ['Neuronium', 'Dataist', 'Dataist Lab', 'Dataist Academy', 'Dataist Office',
           'Лаборатория Датаиста', 'Академия Датаиста', 'Офис Датаиста', 'Andre AIT', 'Landao', 'Antropolis']
# Разделы Dataist на сайте и в плане (в исходнике — «Лаборатория», «Академия», «Кабинет»)
WEB_SECTIONS = {'Lab': 'Лаборатория Датаиста', 'Academy': 'Академия Датаиста', 'Office': 'Офис Датаиста'}
SECTION_COLOR = '#8e8e93'  # разделы — серые; цвет меняют в приложении
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


# ---------------------------------------------------------------- рубрики и форматы

# Рубрика — о чём материал (Демо, Академия, Тезисы…). Формат — как он выходит: FULL, тизер,
# анонс, пост, урок, письмо. Правило ниже — это рубрика × формат × канал с днями недели.
CATS = {
    'demo': ('Демо', 'Демо продуктов и агентов; по воскресеньям — спецпроекты: железо, XR, игры'),
    'tech': ('Технологии', 'Разбор технологии'),
    'cases': ('Кейсы', 'Кейсы внедрения и создания продуктов'),
    'dev': ('Разработка', 'Как строим продукты экосистемы'),
    'thoughts': ('Мысли', 'Эссе о будущем ИИ, бизнеса и общества'),
    'research': ('Исследования', 'Лаборатория: исследование дня и итоги месяца'),
    'news': ('Новости', 'Лента и подборки новостей ИИ, итоги недели'),
    'academy': ('Академия', 'Курсы: урок дня, видео модуля, обучающие шортсы'),
    'thesis': ('Тезисы', 'Короткие видео-мнения'),
    'razbor': ('Разборы', 'ИИ-трансформация отрасли: разбор и призыв'),
    'life': ('Лайфстайл', 'Лайфстайл-видео с цитатой'),
    'hacks': ('Лайфхаки', 'Практический совет дня'),
    'updates': ('Обновления', 'Что нового в продукте'),
    'launch': ('Анонсы', 'Запуск нового канала'),
}
SPREAD = 'С каждым FULL'  # форматы, которые выходят вместе с FULL любой рубрики


def _days(*cells):
    return list(cells)


ALL7 = _days(*['●'] * 7)
NO_SAT = _days('●', '●', '●', '●', '●', '', '●')

RUBRICS = {}  # правила: id → рубрика, формат, канал, площадки, дни


def rubric(rid, cat, fmt_name, brand, channel, what, fmt, platforms, days, freq, start, source,
           hint=None):
    name = f'{CATS[cat][0]} · {fmt_name}' if cat else fmt_name
    RUBRICS[rid] = dict(cat=cat, fmt_name=fmt_name, brand=brand, channel=channel, name=name, what=what,
                        fmt=fmt, platforms=platforms, days=days, freq=freq, start=start, source=source,
                        tmpl=name, hint=hint or {})


def cat_name(cat):
    return CATS[cat][0] if cat else SPREAD


S0 = '25.10.2026'
LAN0 = LANDAO_START.strftime('%d.%m.%Y')
ANT0 = ANTROPOLIS_START.strftime('%d.%m.%Y')
# Демо
rubric('f_demo', 'demo', 'FULL', 'Dataist', 'YouTube Dataist',
       'Пн — демо продуктов и агентов; Вс — спецпроекты (робот, EEG, очки, дроны, Антрополис, гуманоид)',
       'FULL', 'YouTube', _days('●', '', '', '', '', '', 'спецпроекты'),
       'еженедельно; спецпроекты — по готовности', S0, 'исходный план',
       hint={SUN: ' (спецпроекты, по готовности)'})
rubric('ait', 'demo', 'Анонс от Andre AIT', 'Andre AIT', 'LinkedIn / Mail',
       'Демо недели и спецпроекты от лица Andre AIT', 'Пост / письмо', 'LinkedIn, Mail',
       _days('●', '', '', '', '', '', 'спецпроекты'), 'в дни FULL «Демо»', S0, 'FULL «Демо»',
       hint={SUN: ' (если спецпроект)'})
# Технологии, Кейсы, Разработка, Мысли
rubric('f_tech', 'tech', 'FULL', 'Dataist', 'YouTube Dataist', 'Разбор технологии', 'FULL', 'YouTube',
       _days('', 'чередуется', '', '', '', '', ''), 'через неделю (с Кейсами)', S0, 'исходный план',
       hint={TUE: ' (чередуется с Кейсами)'})
rubric('f_case', 'cases', 'FULL', 'Dataist', 'YouTube Dataist', 'Кейсы внедрения и создания продуктов',
       'FULL', 'YouTube', _days('', 'чередуется', '', '', '', '', ''), 'через неделю (с Технологиями)',
       S0, 'исходный план', hint={TUE: ' (чередуется с Технологиями)'})
rubric('f_dev', 'dev', 'FULL', 'Dataist', 'YouTube Dataist', 'Как строим продукты экосистемы', 'FULL',
       'YouTube', _days('', '', 'через нед.', '', '', '', ''), 'через неделю', S0, 'исходный план',
       hint={WED: ' (через неделю)'})
rubric('ant_diary', 'dev', 'Дневник разработки', 'Antropolis', 'Antropolis', 'Еженедельный девлог игры',
       'Пост + Shorts', 'Telegram, YouTube, TikTok', _days('', '', '', '●', '', '', ''), 'еженедельно',
       ANT0, 'команда Antropolis')
rubric('f_think', 'thoughts', 'FULL', 'Dataist', 'YouTube Dataist', 'Эссе о будущем ИИ, бизнеса и общества',
       'FULL', 'YouTube', _days('', '', '', 'через нед.', '', '', ''),
       'через неделю (кроме чт с Исследованиями)', S0, 'исходный план',
       hint={THU: ' (остальные чт, через неделю)'})
# Исследования
rubric('lab_day', 'research', 'Исследование дня', 'Dataist', 'Dataist Lab',
       'Разбор свежего исследования ИИ: пост в Лаборатории, X, Threads, LinkedIn и строка в письме',
       'Пост', 'Web (Лаборатория), Telegram, X, Threads, LinkedIn, Mail',
       _days('●', '●', '●', '●', '●', 'Web, TG, X', '●'), 'ежедневно', S0, 'Лаборатория (авто)')
rubric('lab_day_v', 'research', 'Исследование дня (шортс)', 'Dataist', 'Shorts',
       'Короткое видео по исследованию дня', 'Shorts', 'YouTube, Instagram, TikTok', ALL7, 'ежедневно',
       S0, 'Лаборатория (авто)')
rubric('f_res', 'research', 'FULL', 'Dataist', 'YouTube Dataist',
       'Итоги прошлого месяца — 2-й четверг; итоги года — последний четверг декабря', 'FULL', 'YouTube',
       _days('', '', '', '2-й чт', '', '', ''), 'ежемесячно', S0, 'исходный план + по правилу',
       hint={THU: ' (2-й чт месяца)'})
rubric('lab_month', 'research', 'Итоги месяца в Лаборатории', 'Dataist', 'Dataist Lab',
       'Пост в Лаборатории в день FULL «Исследования»', 'Пост', 'Web (Лаборатория), Telegram',
       _days('', '', '', '2-й чт', '', '', ''), 'ежемесячно', S0, 'FULL «Исследования»',
       hint={THU: ' (2-й чт)'})
# Новости
rubric('neu_all', 'news', 'Все новости', 'Neuronium', 'Telegram «Neuronium»',
       'Автоматическая лента всех новостей ИИ: приходят по вебхуку и выходят сразу', 'Пост', 'Telegram', ALL7,
       'круглосуточно, по вебхуку', S0, 'лента Neuronium (авто)')
rubric('neu_top', 'news', 'Избранные новости', 'Neuronium', 'YouTube «Neuronium»',
       'Видео по главным новостям ИИ: приходят по вебхуку и выходят сразу', 'Видео', 'YouTube', ALL7,
       'круглосуточно, по вебхуку', S0, 'лента Neuronium (авто)')
rubric('ml_news', 'news', 'Избранные новости в письме', 'Dataist', 'Рассылка Dataist',
       'Подборка новостей Neuronium в письме Dataist', 'Строка письма', 'Mail', NO_SAT,
       'ежедневно, кроме субботы', S0, 'лента Neuronium')
rubric('f_news', 'news', 'FULL', 'Dataist', 'YouTube Dataist', 'Новости недели — итоги недели в ИИ',
       'FULL', 'YouTube', _days('', '', '', '', '●', '', ''), 'еженедельно', S0, 'по правилу (нумерация)')
rubric('ml_week', 'news', 'Недельный дайджест', 'Dataist', 'Рассылка Dataist', 'Письмо с итогами недели',
       'Письмо', 'Mail', _days('', '', '', '', '●', '', ''), 'еженедельно', S0, 'Новости недели')
# Академия
rubric('aca_lesson', 'academy', 'Урок дня', 'Dataist', 'Dataist Academy',
       'Очередной урок курса; в день старта модуля — пометка «старт модуля»', 'Урок',
       'Web (Академия), Telegram, X', ALL7, 'ежедневно', S0,
       'курсы по порядку: Автоматизация → Разработка → Инжениринг → Менеджмент → AI CEO → CAIO '
       '→ AI CTO → AI Founder → Data Engineer → Data Analyst → Data Scientist → ML Engineer → Dataist')
rubric('f_aca', 'academy', 'FULL', 'Dataist', 'YouTube Dataist', 'Полное видео модуля курса', 'FULL',
       'YouTube', _days('', '', '', '', '', '', '●'), 'ближайшее свободное вс после старта модуля', S0,
       'исходный план (Автоматизация 1–8), дальше — модули курсов', hint={SUN: ' (после старта модуля)'})
rubric('sh_edu', 'academy', 'Обучение 1–4', 'Dataist', 'Shorts', 'Четыре обучающих шортса', 'Shorts',
       'YouTube, Instagram, TikTok', NO_SAT, 'ежедневно, кроме субботы', S0, 'Академия')
rubric('aca_mail', 'academy', 'Старт модуля в письме', 'Dataist', 'Рассылка Dataist',
       'Строка в письме в день старта модуля (старт в субботу — в воскресном письме)', 'Строка письма',
       'Mail', _days(*['по курсу'] * 5, '', 'по курсу'), 'раз в 11 дней (короткие курсы — раз в 9)', S0,
       'расписание Академии', hint={d: ' (по графику курса)' for d in range(7)})
# Тезисы, Разборы, Лайфстайл, Лайфхаки
rubric('sh_thesis', 'thesis', 'Тезис дня', 'Dataist', 'Shorts', 'Короткое видео-мнение (хук дня)', 'Shorts',
       'YouTube, Instagram, TikTok', NO_SAT, 'ежедневно, кроме субботы', S0, 'исходный план')
rubric('sh_razbor', 'razbor', 'Разбор отрасли', 'Dataist', 'Shorts', 'Разбор ИИ-трансформации отрасли',
       'Shorts', 'YouTube, Instagram, TikTok', NO_SAT, 'ежедневно, кроме субботы', S0, 'исходный план')
rubric('th_call', 'razbor', 'Призыв', 'Dataist', 'Threads', 'Призыв к компаниям отрасли из разбора дня',
       'Пост', 'Threads', NO_SAT, 'в дни Разборов', S0, 'Разборы дня')
rubric('sh_life', 'life', 'Шортс', 'Dataist', 'Shorts', 'Лайфстайл-видео с цитатой', 'Shorts',
       'YouTube, Instagram, TikTok', ALL7, 'ежедневно (в субботу — главный контент)', S0, 'исходный план')
rubric('tx_hack', 'hacks', 'Лайфхак дня', 'Dataist', 'Threads / LinkedIn / Mail', 'Практический совет дня',
       'Пост / строка письма', 'Threads, LinkedIn, Mail', NO_SAT, 'ежедневно, кроме субботы', S0,
       'по правилу')
# Обновления и анонсы новых каналов
rubric('lan_upd', 'updates', 'Пост + шортс', 'Landao', 'Landao', 'Что нового в Landao за неделю',
       'Пост + Shorts', 'Telegram, Instagram, TikTok', _days('', '', '●', '', '', '', ''), 'еженедельно',
       LAN0, 'команда Landao')
rubric('lan_launch', 'launch', 'Запуск Landao', 'Landao', 'Landao', 'Первый пост канала в день анонса Landao',
       'Пост', 'Telegram', _days('02.11', '', '', '', '', '', ''), 'разово', LAN0, '—')
rubric('ant_launch', 'launch', 'Запуск Antropolis', 'Antropolis', 'Antropolis',
       'Первый пост канала + строка в письме Dataist', 'Пост', 'Telegram, Mail',
       _days('', '01.12', '', '', '', '', ''), 'разово', ANT0, '—')
# С каждым FULL — тизер, анонсы, кросс-посты; рубрика — та же, что у FULL
rubric('sh_teaser', None, 'Тизер FULL', 'Dataist', 'Shorts', 'Вертикальный тизер FULL-видео дня', 'Shorts',
       'YouTube, Instagram, TikTok', _days('●', '●', '●', 'Мысли', '●', '', 'спецпроекты'),
       'в дни FULL, кроме Академии и Исследований', S0, 'FULL дня')
rubric('office', None, 'Анонс в Офисе', 'Dataist', 'Dataist Office',
       'Текстовая версия / анонс FULL-видео дня (кроме Академии)', 'Пост', 'Web (Офис), Telegram',
       _days('●', '●', '●', '●', '●', '', 'спецпроекты'), 'в дни FULL', S0, 'FULL дня',
       hint={SUN: ' (если спецпроект)', WED: ' (если Разработка)', THU: ' (если FULL)'})
rubric('an_full', None, 'Анонс в X / LinkedIn / письме', 'Dataist', 'X / LinkedIn / Mail',
       'X — все FULL, кроме Академии; LinkedIn и письмо Dataist — только Вт–Чт', 'Пост / строка письма',
       'X, LinkedIn, Mail', _days('X', '●', '●', '●', 'X', '', 'X'), 'в дни FULL', S0, 'FULL дня',
       hint={SUN: ' (если спецпроект)', WED: ' (если Разработка)', THU: ' (если FULL)'})
rubric('neu_x', None, 'Кросс-пост в Neuronium', 'Neuronium', 'Telegram «Neuronium»',
       'В день FULL Dataist про Neuronium', 'Пост', 'Telegram', _days(*['по FULL'] * 5, '', 'по FULL'),
       'по графику FULL', S0, 'FULL Dataist', hint={d: ' (по графику)' for d in range(7)})
rubric('lan_x', None, 'Кросс-пост в Landao', 'Landao', 'Landao', 'В день FULL Dataist про Landao',
       'Пост + Shorts', 'Telegram, Instagram, TikTok', _days('по FULL', 'по FULL', '', '', '', '', ''),
       'по графику FULL', LAN0, 'FULL Dataist', hint={d: ' (по графику)' for d in range(7)})
rubric('ant_x', None, 'Кросс-пост в Antropolis', 'Antropolis', 'Antropolis', 'В день FULL Dataist про Антрополис',
       'Пост + Shorts', 'Telegram, YouTube, TikTok', _days('', 'по FULL', '', '', '', '', 'по FULL'),
       'по графику FULL', ANT0, 'FULL Dataist', hint={d: ' (по графику)' for d in range(7)})

ONE_OFF = {'lan_launch', 'ant_launch'}

# Во сколько выходит формат и что именно выходит на каждой площадке. Время — по умолчанию,
# у материала в приложении его можно поменять; совпадающие по времени стоят в календаре рядом.
SH = {'YouTube': 'Shorts', 'Instagram': 'Reels', 'TikTok': 'Видео'}
FULL_TYPES = {'YouTube': 'FULL'}
META = {
    'f_demo': ('12:00', FULL_TYPES), 'f_tech': ('12:00', FULL_TYPES), 'f_case': ('12:00', FULL_TYPES),
    'f_dev': ('12:00', FULL_TYPES), 'f_think': ('12:00', FULL_TYPES), 'f_res': ('12:00', FULL_TYPES),
    'f_news': ('12:00', FULL_TYPES), 'f_aca': ('12:00', FULL_TYPES),
    'ait': ('13:00', {'LinkedIn': 'Пост', 'Mail': 'Письмо'}),
    'ant_diary': ('15:00', {'Telegram': 'Пост', 'YouTube': 'Shorts', 'TikTok': 'Видео'}),
    'lab_day': ('09:00', {'Web': 'Статья · Лаборатория', 'Telegram': 'Пост · Lab', 'X': 'Пост', 'Threads': 'Пост',
                          'LinkedIn': 'Пост', 'Mail': 'Строка письма'}),
    'lab_day_v': ('09:00', SH),
    'lab_month': ('12:00', {'Web': 'Итоги · Лаборатория', 'Telegram': 'Итоги · Lab'}),
    'neu_all': ('00:00', {'Telegram': 'Лента'}),  # поток 24/7: в ячейке и в дне — первым, как событие на весь день
    'neu_top': ('00:00', {'YouTube': 'Видео'}),
    'ml_news': ('07:30', {'Mail': 'Строка письма'}),
    'ml_week': ('17:00', {'Mail': 'Письмо'}),
    'aca_lesson': ('10:00', {'Web': 'Урок · Академия', 'Telegram': 'Урок · Academy', 'X': 'Пост'}),
    'sh_edu': ('16:00', SH),
    'aca_mail': ('07:30', {'Mail': 'Строка письма'}),
    'sh_thesis': ('11:00', SH),
    'sh_razbor': ('14:00', SH),
    'th_call': ('14:00', {'Threads': 'Призыв'}),
    'sh_life': ('18:00', SH),
    'tx_hack': ('15:00', {'Threads': 'Пост', 'LinkedIn': 'Пост', 'Mail': 'Строка письма'}),
    'lan_upd': ('13:00', {'Telegram': 'Пост', 'Instagram': 'Reels', 'TikTok': 'Видео'}),
    'lan_launch': ('10:00', {'Telegram': 'Пост'}),
    'ant_launch': ('10:00', {'Telegram': 'Пост', 'Mail': 'Строка письма'}),
    'sh_teaser': ('12:00', {'YouTube': 'Тизер · Shorts', 'Instagram': 'Тизер · Reels', 'TikTok': 'Тизер'}),
    'office': ('12:00', {'Web': 'Анонс · Офис', 'Telegram': 'Анонс · Office'}),
    'an_full': ('12:00', {'X': 'Анонс', 'LinkedIn': 'Анонс', 'Mail': 'Анонс в письме'}),
    'neu_x': ('12:30', {'Telegram': 'Кросс-пост'}),
    'lan_x': ('12:30', {'Telegram': 'Кросс-пост', 'Instagram': 'Reels', 'TikTok': 'Видео'}),
    'ant_x': ('12:30', {'Telegram': 'Кросс-пост', 'YouTube': 'Shorts', 'TikTok': 'Видео'}),
}
assert set(META) == set(RUBRICS), set(RUBRICS) ^ set(META)
# Поток: новости Neuronium приходят по вебхуку и выходят круглосуточно, своего времени у них нет
STREAM = {'neu_all', 'neu_top'}
# Порядок строк в таблице правил: по рубрикам, в конце — что выходит с каждым FULL
RUBRIC_ORDER = sorted(RUBRICS, key=lambda rid: (list(CATS).index(RUBRICS[rid]['cat'])
                                                if RUBRICS[rid]['cat'] else len(CATS)))


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
    group: str | None = None   # материалы, которые двигаются вместе (FULL и всё, что из него)
    derive: str | None = None  # шаблон текста от главного материала группы: {title}, {topic}
    cat: str | None = None     # рубрика, если правило общее и группы с FULL нет


UNITS: list[Unit] = []


def add(day, brand, section, rid, fmt, text, platforms, source, rank, orig=None, group=None,
        derive=None, cat=None):
    if START <= day <= END:
        UNITS.append(Unit(day, brand, section, rid, fmt, text, tuple(platforms), source, rank,
                          orig if orig and orig != day else None, group, derive, cat))


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

def lesson_title(name, kind=None):
    """«Автоматизация 3_8» → «Автоматизация, модуль 3, урок 8»; старт модуля и курса — с пометкой."""
    m = re.fullmatch(r'(.+?) (\d+)(?:_(\d+))?', name)
    if not m:
        return f'{name} — старт курса' if kind == 'course' else name
    course, module, lesson = m.groups()
    t = f'{course}, модуль {module}' + (f', урок {lesson}' if lesson else '')
    return t + (' — старт' if kind == 'module' else '')


def classify(title):
    """FULL-заголовок исходника → (рубрика, тема). Рубрика в тему не входит: она стоит меткой рядом."""
    m = re.fullmatch(r'(\S+?)\s*[/:]\s*(.+)', title)
    if title.startswith('Новости'):
        return 'Новости', ''
    if m:
        cat, topic = m.group(1), m.group(2).strip()
        if cat == 'Демо' and topic in SPECIAL_DEMOS:
            return 'Спецпроект', topic
        return cat, topic
    m = re.fullmatch(r'Автоматизация (\d+)', title)
    if m:
        return 'Академия', lesson_title(title)
    m = re.fullmatch(r'Исследования (\d{4})', title)
    if m:
        return 'Исследования', f'Итоги {m.group(1)} года'
    raise ValueError(title)


def schedule_full(full, starts):
    slots = {}  # дата → (рубрика, тема, источник, исходная дата)

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
        take(d, ('Новости', f'Итоги недели №{n}', 'правило', None))

    # 2. Исследования месяца — 2-й четверг следующего месяца, год — последний четверг декабря
    items = [(d, classify(t)) for d, t in full]
    rest = []
    last_month = None
    for d, (cat, topic) in items:
        if cat == 'Исследования' and topic in MONTHS:
            mi = MONTHS.index(topic) + 1
            year = d.year if mi < d.month else d.year - 1
            ny, nm = (year + 1, 1) if mi == 12 else (year, mi + 1)
            t = nth_weekday(ny, nm, THU, 2)
            if t < START:
                t = on_weekday(d, THU)
            take(t, ('Исследования', f'Итоги {MONTHS_GEN[mi - 1]} {year}', 'исходный план', d))
            last_month = (year, mi)
        elif cat == 'Исследования' and topic.startswith('Итоги'):
            take(last_weekday(d.year, 12, THU) if d.month == 12 else on_weekday(d, THU),
                 (cat, topic, 'исходный план', d))
        elif cat == 'Спецпроект':
            take(on_weekday(d, SUN), (cat, topic, 'исходный план', d))
        else:
            rest.append((d, cat, topic))
    y, m = last_month
    while True:
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        t = nth_weekday(ny, nm, THU, 2)
        if t > END:
            break
        take(t, ('Исследования', f'Итоги {MONTHS_GEN[m - 1]} {y}', 'правило', None))
    for y in range(START.year + 1, END.year + 1):
        t = last_weekday(y, 12, THU)
        if t <= END and t not in slots:
            take(t, ('Исследования', f'Итоги {y} года', 'правило', None))

    # 3. Остальное — на свой день недели в той же неделе, при занятости — дальше; порядок внутри
    #    рубрики сохраняется. «Через неделю» — строго через неделю: у Технологий и Кейсов вторники
    #    чередуются, у Разработки — свои недели (чётность от первого материала рубрики). Мысли — через
    #    четверг среди свободных от Исследований: итоги месяца и года уже стоят (шаг 2).
    #    Отдельные исследования из исходника (не итоги) — в свободный четверг после Мыслей.
    week_no = lambda d: (d - (START - timedelta(START.weekday()))).days // 7
    parity = {}
    for d, cat, topic in rest:
        if cat in ('Технологии', 'Кейсы') and not parity:
            p = week_no(on_weekday(d, TUE)) % 2
            parity = {cat: p, ('Кейсы' if cat == 'Технологии' else 'Технологии'): 1 - p}
    for d, cat, topic in rest:
        if cat == 'Разработка' and cat not in parity:
            parity[cat] = week_no(on_weekday(d, WED)) % 2
    first_think = next(on_weekday(d, THU) for d, cat, _ in rest if cat == 'Мысли')
    free_thu = [d for d in days_range(first_think) if d.weekday() == THU and d not in slots]
    think_days = set(free_thu[::2])
    first_src = {}

    def place(d, cat, wd, par):
        t = next_weekday(d, wd)
        while t in slots or (par is not None and week_no(t) % 2 != par) or (cat == 'Мысли' and t not in think_days):
            t += timedelta(7)
        return t

    prev = {}
    for d, cat, topic in [x for x in rest if x[1] != 'Исследования'] + [x for x in rest if x[1] == 'Исследования']:
        wd = FULL_DAY[cat]
        t = place(max(on_weekday(d, wd), prev.get(cat, START)), cat, wd, parity.get(cat))
        take(t, (cat, topic, 'исходный план', d))
        prev[cat] = t + timedelta(1)
        first_src.setdefault(cat, t)

    # 4. Академия: после Автоматизации 1–8 — по видео на каждый модуль/курс,
    #    в ближайшее свободное воскресенье после старта модуля на сайте
    a = prev.get('Академия', START)
    for d, name, kind in starts:
        if name.startswith('Автоматизация'):
            continue
        t = first_free(max(d, a), SUN)
        if t > END:
            break
        take(t, ('Академия', lesson_title(name), 'правило', None))
        a = t + timedelta(1)

    # 5. Где тем из исходника нет — слоты «…» по той же сетке: каждый понедельник Демо, каждый вторник
    #    Технологии или Кейсы по очереди, Разработка и Мысли — в свои недели (с первого материала рубрики)
    series = [('Демо', MON, None), ('Технологии', TUE, parity['Технологии']), ('Кейсы', TUE, parity['Кейсы']),
              ('Разработка', WED, parity['Разработка']), ('Мысли', THU, None)]
    for cat, wd, par in series:
        for d in days_range(first_src[cat]):
            if d.weekday() == wd and d not in slots and (par is None or week_no(d) % 2 == par) \
                    and (cat != 'Мысли' or d in think_days):
                take(d, (cat, PH, 'нужна тема', None))
    return slots


def full_units(d, item):
    """FULL и всё, что выходит вместе с ним. Тема у всей группы одна; чем материалы отличаются —
    видно по формату и площадкам, а не по приставкам в названии."""
    cat, title, source, orig = item
    rid = {'Демо': 'f_demo', 'Технологии': 'f_tech', 'Кейсы': 'f_case', 'Разработка': 'f_dev',
           'Мысли': 'f_think', 'Исследования': 'f_res', 'Новости': 'f_news', 'Академия': 'f_aca',
           'Спецпроект': 'f_demo'}[cat]
    g = f'full-{d.isoformat()}'
    add(d, 'Dataist', None, rid, 'FULL', title, ['YouTube'], source, 0, orig, g)
    if cat == 'Академия':
        return
    if cat != 'Исследования':
        add(d, 'Dataist', None, 'sh_teaser', 'Shorts', title, SHORTS, source, 60, orig, g, '{title}')
    if cat == 'Исследования':
        add(d, 'Dataist', 'Lab', 'lab_month', 'Пост', title, ['Web', 'Telegram'], source, 15, orig, g,
            '{title}')
    add(d, 'Dataist', 'Office', 'office', 'Пост', title, ['Web', 'Telegram'], source, 30, orig, g, '{title}')
    xs = ['X'] + (['LinkedIn', 'Mail'] if d.weekday() in (TUE, WED, THU) else [])
    add(d, 'Dataist', None, 'an_full', 'Пост / строка письма', title, xs, source, 80, orig, g, '{title}')
    if cat in ('Демо', 'Спецпроект'):
        add(d, 'Andre AIT', None, 'ait', 'Пост / письмо', title, ['LinkedIn', 'Mail'],
            source, 0, orig, g, '{title}')
    if cat == 'Новости':
        add(d, 'Dataist', None, 'ml_week', 'Письмо', 'Недельный дайджест', ['Mail'], source, 85,
            group=g)
    if source == 'нужна тема':
        return
    if re.search(r'Landao|Ландао', title) and d >= LANDAO_START:
        add(d, 'Landao', None, 'lan_x', 'Пост + Shorts', title, ['Telegram', 'Instagram', 'TikTok'],
            source, 10, orig, g, '{title}')
    if re.search(r'Antropolis|Антрополис', title) and d >= ANTROPOLIS_START:
        add(d, 'Antropolis', None, 'ant_x', 'Пост + Shorts', title, ['Telegram', 'YouTube', 'TikTok'],
            source, 10, orig, g, '{title}')
    if re.search(r'Neuronium|Нейроний', title):
        add(d, 'Neuronium', None, 'neu_x', 'Пост', title, ['Telegram'], source, 10, orig, g, '{title}')


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
        add(d, 'Dataist', 'Academy', 'aca_lesson', 'Урок', lesson_title(name, kind), ['Web', 'Telegram', 'X'],
            'исходный план', 20)
        if kind:
            md = d + timedelta(1) if d.weekday() == SAT else d
            course = re.sub(r' \d+$', '', name)
            text = f'Новый курс «{course}»' if kind == 'course' else lesson_title(name, kind)
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
            add(d, 'Dataist', None, 'sh_thesis', 'Shorts', t, SHORTS, 'исходный план', 20, orig,
                f'intro-{d.isoformat()}' if len(titles) > 1 else None)
    for d in days:
        if d > END:
            break
        add(d, 'Dataist', None, 'sh_thesis', 'Shorts', PH, SHORTS, 'нужна тема', 20)

    days = sequential(razbor[0][0])
    for orig, industry in razbor:
        d = next(days)
        g = f'raz-{d.isoformat()}'
        add(d, 'Dataist', None, 'sh_razbor', 'Shorts', industry, SHORTS, 'исходный план', 30, orig, g)
        add(d, 'Dataist', None, 'th_call', 'Пост', industry, ['Threads'], 'исходный план', 30, orig, g,
            '{title}')
    for d in days:
        if d > END:
            break
        g = f'raz-{d.isoformat()}'
        add(d, 'Dataist', None, 'sh_razbor', 'Shorts', PH, SHORTS, 'нужна тема', 30, group=g)
        add(d, 'Dataist', None, 'th_call', 'Пост', PH, ['Threads'], 'нужна тема', 30, group=g,
            derive='{title}')
    for d, t in calls:
        add(d, 'Dataist', None, 'th_call', 'Пост', fix(t.split(':', 1)[1]), ['Threads'], 'исходный план', 30)

    # Лайфстайл — каждый день, по исходным датам
    by_day = {}
    for d, t in life:
        m = re.fullmatch(r'Лайфстайл:\s*([^:]*?)\s*(?::\s*(.*))?', t)
        place, quote = (m.group(1), m.group(2)) if m else ('', '')
        if place and quote:
            by_day[d] = (f'{place} — {quote}', 'исходный план')
        elif place:
            by_day[d] = (place, 'исходный план')
    for d in days_range():
        text, src = by_day.get(d, (PH, 'нужна тема'))
        add(d, 'Dataist', None, 'sh_life', 'Shorts', text, SHORTS, src, 40)

    # Разовые вещи старта из исходной сетки
    add(START, 'Dataist', 'Office', 'office', 'Пост', lesson_title('Автоматизация 3_8'),
        ['Web', 'Telegram'], 'исходный план', 30, cat='academy')

    # Landao
    add(LANDAO_START, 'Landao', None, 'lan_launch', 'Пост', 'Landao — запуск канала',
        ['Telegram'], 'правило', 0)
    for d in days_range(LANDAO_START):
        if d.weekday() == WED:
            add(d, 'Landao', None, 'lan_upd', 'Пост + Shorts', 'Что нового в Landao',
                ['Telegram', 'Instagram', 'TikTok'], 'правило', 20)

    # Antropolis
    add(ANTROPOLIS_START, 'Antropolis', None, 'ant_launch', 'Пост',
        'Antropolis — запуск канала', ['Telegram'], 'правило', 0)
    add(ANTROPOLIS_START, 'Dataist', None, 'ant_launch', 'Строка письма', 'Новый канал Antropolis',
        ['Mail'], 'правило', 88)
    for d in days_range(ANTROPOLIS_START):
        if d.weekday() == THU:
            add(d, 'Antropolis', None, 'ant_diary', 'Пост + Shorts', 'Antropolis',
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


def label_of(u):
    """«Демо · FULL», «Демо · Тизер FULL»; формат, совпадающий с рубрикой, не повторяется."""
    f = RUBRICS[u.rubric]['fmt_name']
    c = cat_of(u)
    if not c:
        return f
    r = CATS[c][0]
    return r if f == r else f'{r} · {f}'


def line_of(u):
    """«Демо · FULL: Стратегия». Если тема — это название формата («Все новости»), она не повторяется."""
    f = RUBRICS[u.rubric]['fmt_name']
    same = u.text == f or f.startswith(u.text + ' ')
    return label_of(u) if same else f'{label_of(u)}: {u.text}'


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
        for u in sorted(groups[h], key=lambda u: (META[u.rubric][0], u.rank)):
            style = 'ph' if u.source == 'нужна тема' else 'full' if u.fmt == 'FULL' else 'text'
            lines.append((f'• {line_of(u)}', style))
    return lines


def channel_of(u):
    if u.brand == 'Dataist' and u.section:
        return f'Dataist {u.section}'
    if u.brand == 'Dataist' and u.fmt == 'FULL':
        return 'YouTube Dataist'
    if u.brand == 'Dataist' and u.fmt == 'Shorts':
        return 'Dataist Shorts'
    return u.brand


def cat_of(u, heads={}):
    """Рубрика материала: своя у правила, а у тизера, анонсов и кросс-постов — та же, что у FULL."""
    if not heads:
        for x in UNITS:
            if x.group and RUBRICS[x.rubric]['cat'] and x.fmt == 'FULL':
                heads[x.group] = RUBRICS[x.rubric]['cat']
    return RUBRICS[u.rubric]['cat'] or u.cat or heads.get(u.group)


def tables():
    rubrics = [['№', 'Рубрика', 'Формат', 'Канал', 'Где выходит', 'Площадки', *WD, 'Частота', 'Что это',
                'Старт', 'Откуда материалы']]
    for i, rid in enumerate(RUBRIC_ORDER, 1):
        r = RUBRICS[rid]
        rubrics.append([i, cat_name(r['cat']), r['fmt_name'], r['brand'], r['channel'], r['platforms'],
                        *r['days'], r['freq'], r['what'], r['start'], r['source']])

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

    plan = [['Дата', 'День', 'Канал', 'Раздел', 'Рубрика', 'Формат', 'Материал', 'Площадки',
             'Источник', 'Дата в исходнике']]
    for u in UNITS:
        plan.append([u.day.isoformat(), WD[u.day.weekday()], u.brand, channel_of(u),
                     cat_name(cat_of(u)), RUBRICS[u.rubric]['fmt_name'], u.text, ', '.join(u.platforms),
                     u.source, u.orig.isoformat() if u.orig else ''])

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
    C['rubric'] = wb.add_format({**cell, 'bold': True})

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
    widths = [4, 14, 24, 11, 20, 28, 11, 11, 11, 11, 11, 11, 11, 24, 44, 11, 32]
    for i, w in enumerate(widths):
        ws.set_column(i, i, w)
    ws.write_row(0, 0, rubrics[0], C['head'])
    ws.set_row(0, 30)
    for r, row in enumerate(rubrics[1:], 1):
        for c, v in enumerate(row):
            if c == 1:
                ws.write(r, c, v, C['rubric'])
            elif c == 3:
                ws.write(r, c, v, C['brand:' + v])
            elif 6 <= c <= 12:
                ws.write(r, c, v, C['center_sat'] if c == 11 else C['center'])
            else:
                ws.write(r, c, v, C['cell'])
        ws.set_row(r, height([[(str(v), '')] for v in row], widths))
    ws.freeze_panes(1, 3)

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


# ---------------------------------------------------------------- данные для приложения

APP_SEED = ROOT / 'app' / 'public' / 'seed.json'
CHANNEL_IDS = {'Neuronium': 'neuronium', 'Dataist': 'dataist', 'Andre AIT': 'andre',
               'Landao': 'landao', 'Antropolis': 'antropolis'}
SECTION_IDS = {'Lab': 'lab', 'Academy': 'academy', 'Office': 'office'}
# Форматы в приложении: видео — полное горизонтальное и короткое вертикальное, текст — страница на сайте
# и текст с картинкой. Что именно выходит на площадке (Reels, строка письма) — в типах правила.
FULL_VIDEO, SHORT_VIDEO = 'Полное горизонтальное видео', 'Короткое вертикальное видео'
WEB_PAGE, TEXT_IMAGE = 'Страница на сайте', 'Текст с картинкой'


def app_format(fmt, platforms):
    if fmt in ('FULL', 'Видео'):
        return FULL_VIDEO
    if 'shorts' in fmt.lower() or 'reels' in fmt.lower():
        return SHORT_VIDEO
    return WEB_PAGE if 'Web' in platforms else TEXT_IMAGE


# Форматы с банком тем в приложении: темы к ним придумывают заранее
BANK = {'f_demo', 'f_tech', 'f_case', 'f_dev', 'f_res', 'f_think', 'f_aca', 'sh_thesis', 'sh_razbor', 'sh_life'}


def write_seed():
    import json
    channels = [
        dict(id='neuronium', name='Neuronium', start=START, platforms=['Telegram', 'YouTube'],
             sections=[]),
        dict(id='dataist', name='Dataist', start=START, platforms=PLATFORMS,
             sections=[dict(id=SECTION_IDS[k], name=f'Dataist {k}', web=v, color=SECTION_COLOR)
                       for k, v in WEB_SECTIONS.items()]),
        dict(id='andre', name='Andre AIT', start=START, platforms=['LinkedIn', 'Mail'], sections=[]),
        dict(id='landao', name='Landao', start=LANDAO_START,
             platforms=['Telegram', 'Instagram', 'TikTok'], sections=[]),
        dict(id='antropolis', name='Antropolis', start=ANTROPOLIS_START,
             platforms=['Telegram', 'YouTube', 'TikTok'], sections=[]),
    ]
    for c in channels:
        c['color'] = BRAND_COLORS[c['name']]
        c['start'] = c['start'].isoformat()
    rubrics = [dict(id=cid, name=name, what=what) for cid, (name, what) in CATS.items()]
    rules = []
    for rid in RUBRIC_ORDER:
        r = RUBRICS[rid]
        names = [re.sub(r'\s*\(.*?\)', '', t).strip() for t in r['platforms'].split(',')]
        rule = dict(id=rid, rubricId=r['cat'], name=r['fmt_name'], channelId=CHANNEL_IDS[r['brand']],
                    channel=r['channel'], what=r['what'],
                    platforms=[p for p in PLATFORMS if p in names], days=[bool(c) for c in r['days']],
                    dayNotes=['' if c == '●' else c for c in r['days']], freq=r['freq'],
                    source=r['source'], full=r['fmt'] == 'FULL', limit=1, time=META[rid][0],
                    types={p: META[rid][1][p] for p in PLATFORMS if p in META[rid][1]}, stream=rid in STREAM)
        rule['format'] = app_format(r['fmt'], rule['platforms'])
        if rid in BANK:
            rule['bank'] = True
        section = next((u.section for u in UNITS if u.rubric == rid and u.brand == r['brand']), None)
        if section:
            rule['sectionId'] = SECTION_IDS[section]
        rules.append(rule)
    items = []
    for n, u in enumerate(UNITS, 1):
        it = dict(id=f'i{n}', date=u.day.isoformat(), channelId=CHANNEL_IDS[u.brand], ruleId=u.rubric,
                  rubricId=cat_of(u), title=u.text, format=app_format(u.fmt, u.platforms), platforms=list(u.platforms),
                  status='planned', source=u.source, rank=u.rank)
        if u.section:
            it['sectionId'] = SECTION_IDS[u.section]
        if u.group:
            it['group'] = u.group
        if u.derive:
            it['derive'] = u.derive
        if u.orig:
            it['origDate'] = u.orig.isoformat()
        items.append(it)
    seed = dict(version=3, start=START.isoformat(), end=END.isoformat(), platforms=PLATFORMS,
                channels=channels, rubrics=rubrics, rules=rules, items=items)
    APP_SEED.parent.mkdir(parents=True, exist_ok=True)
    APP_SEED.write_text(json.dumps(seed, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    build()
    OUT.mkdir(exist_ok=True)
    write_seed()
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
