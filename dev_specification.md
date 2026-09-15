# Техническая спецификация MVP (для разработки)

Документ для агента/разработчика, приступающего к реализации. Бизнес-контекст и продуктовые решения — в отдельной продуктовой спеке; здесь — только то, что нужно для старта кода: стек, структура репозитория, схема данных, API-контракты, маршруты фронтенда, инфраструктура и порядок работ.

---

## 1. Краткое резюме системы

Мультитенантная платформа: у каждого мастера — публичный сайт на собственном домене, общий бэкенд записи. Клиент бронирует без аккаунта; напоминание доставляется файлом `.ics` со встроенным `VALARM` (открывается в штатном календаре телефона, без push и без SMS). Мастер получает уведомление о новой записи через Telegram-бота. Админ-панель мастера — один общий продукт на отдельном поддомене платформы, без кастомизации.

---

## 2. Стек и версии

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python 3.12, Pydantic v2, SQLAlchemy 2.0 (async), Alembic (миграции)
- **БД:** SQLite (файл на диске VPS), доступ через `aiosqlite` + SQLAlchemy async — на MVP-масштабе (несколько пилотных мастеров, невысокая нагрузка) отдельный процесс СУБД не нужен; включить WAL-режим (`PRAGMA journal_mode=WAL`) для параллельного чтения во время записи. Схема спроектирована через SQLAlchemy без Postgres-специфичных типов, поэтому переход на PostgreSQL при росте нагрузки — это смена строки подключения и прогонка миграций, а не переписывание моделей
- **Бот:** aiogram 3.x (Telegram), запущен на том же ASGI-процессе, что и FastAPI, через вебхук
- **Календарь:** библиотека `icalendar` (Python) — генерация `.ics` с `VALARM`
- **Прокси/TLS:** Caddy 2, on-demand TLS для кастомных доменов мастеров
- **Инфраструктура:** собственный VPS, Docker Compose

---

## 3. Структура репозитория (монорепо)

```
/repo
  /apps
    /web              # Next.js: публичные сайты тенантов + админка
    /api              # FastAPI backend
  /packages
    /blocks           # общая библиотека React-компонентов (блоки публичного сайта)
  /infra
    docker-compose.yml
    Caddyfile
  README.md
```

Монорепо оправдан на этапе одного разработчика + будущих подрядчиков на фронтенде: проще синхронизировать типы и деплой. Разделение на отдельные репозитории можно сделать позже без потери истории (git subtree/filter-repo), если понадобится.

---

## 4. Модель данных (SQLite)

Многотенантность — через `master_id` во всех таблицах (без schema-per-tenant).

Особенности под SQLite (не влияют на структуру, но важны при реализации):
- `uuid PK` — у SQLite нет нативного типа UUID, хранить как `TEXT` (генерировать `uuid4()` на стороне приложения через SQLAlchemy, не полагаться на автоинкремент).
- `content jsonb` в `site_content` — хранить как `TEXT` с (де)сериализацией JSON в приложении (SQLAlchemy `JSON`-тип делает это прозрачно); полнотекстовый поиск/фильтрация внутри JSON на MVP не нужны, поэтому это не ограничение.

```
masters
  id                uuid PK
  slug              varchar unique        -- внутренний идентификатор
  domain            varchar unique null    -- кастомный домен, null пока не привязан
  name              varchar
  phone             varchar
  telegram_chat_id  varchar null           -- заполняется после привязки бота
  plan              enum(custom, template, integration)
  billing_status    enum(active, grace, suspended)
  created_at        timestamptz

services
  id                uuid PK
  master_id         uuid FK -> masters
  name              varchar
  duration_minutes  int
  price             numeric
  is_active         bool

working_hours
  id        uuid PK
  master_id uuid FK -> masters
  weekday   int (0-6)
  start_time time
  end_time   time

time_off
  id         uuid PK
  master_id  uuid FK -> masters
  date       date
  start_time time null   -- null = весь день
  end_time   time null
  reason     varchar null

bookings
  id            uuid PK
  master_id     uuid FK -> masters
  service_id    uuid FK -> services
  client_name   varchar
  client_phone  varchar
  start_at      timestamptz
  end_at        timestamptz
  status        enum(confirmed, cancelled)
  created_at    timestamptz

clients
  id         uuid PK
  master_id  uuid FK -> masters
  phone      varchar               -- уникален в рамках master_id
  name       varchar
  notes      text null
  created_at timestamptz

site_content
  id          uuid PK
  master_id   uuid FK -> masters
  block_type  varchar     -- 'hero', 'about', 'gallery', 'services', 'contacts' и т.д.
  position    int
  content     jsonb       -- произвольная структура под конкретный блок

admin_users
  id            uuid PK
  master_id     uuid FK -> masters
  login         varchar unique   -- телефон или email
  password_hash varchar
```

Примечание: `bookings.status` на MVP достаточно двух значений; `no_show` и прочую детализацию — по мере необходимости.

---

## 5. API-контракты (FastAPI)

### 5.1 Публичные эндпоинты (booking-флоу, без авторизации)

```
GET  /api/public/{domain}/config
     → { master: {...}, blocks: [site_content...] }

GET  /api/public/{domain}/services
     → [{ id, name, duration_minutes, price }]

GET  /api/public/{domain}/availability?date=YYYY-MM-DD&service_id=...
     → [{ start_at, end_at }]   -- свободные слоты с учётом working_hours, time_off и существующих bookings

POST /api/public/{domain}/bookings
     body: { service_id, client_name, client_phone, start_at }
     → { booking_id, ics_url }

GET  /api/public/{domain}/bookings/{id}/ics
     → файл text/calendar с VALARM
```

### 5.2 Админ-эндпоинты (авторизация — JWT в cookie)

```
POST   /api/admin/auth/login          { login, password } → { token }
GET    /api/admin/schedule            → working_hours + time_off
PUT    /api/admin/schedule            обновление рабочих часов

GET    /api/admin/services            список услуг
POST   /api/admin/services            создать
PUT    /api/admin/services/{id}       обновить
DELETE /api/admin/services/{id}       удалить

GET    /api/admin/bookings?from&to    список/календарь записей
POST   /api/admin/bookings            ручное добавление (оффлайн-клиент)
PUT    /api/admin/bookings/{id}/cancel

GET    /api/admin/clients             список клиентов
PUT    /api/admin/clients/{id}        редактирование заметок

GET    /api/admin/site-content        текущий контент блоков
PUT    /api/admin/site-content        обновление контента (фото/тексты/ссылки)

GET    /api/admin/analytics/summary   число записей/отмен за период

POST   /api/admin/telegram/link       генерирует deep-link для привязки бота мастера
```

### 5.3 Вебхуки

```
POST /api/webhooks/telegram    -- обновления от Telegram Bot API, обрабатываются aiogram-диспетчером
```

### 5.4 Внутренняя логика (не HTTP)

При успешном `POST /bookings` — если у мастера заполнен `telegram_chat_id`, отправить ему сообщение с деталями записи через Telegram Bot API (синхронно в рамках запроса — на объёме MVP фоновая очередь не нужна).

---

## 6. Frontend: маршруты (Next.js App Router)

### 6.1 Публичный сайт — route group `(tenant)`, резолвится middleware по hostname

```
/                    главная (hero, о мастере, услуги, галерея, отзывы, контакты)
/booking             флоу записи: услуга → слот → имя/телефон → подтверждение
/booking/success     экран после записи: кнопки "добавить в календарь" и "сохранить на экран"
```

### 6.2 Админка — route group `(admin)`, на поддомене `admin.<платформа>.ru`

```
/login
/dashboard           записи на сегодня, краткая аналитика
/schedule            рабочие часы, выходные
/services            CRUD услуг
/bookings            календарь/список, ручное добавление
/clients             список клиентов
/content             редактирование контента сайта
```

---

## 7. Middleware мультитенантности

Логика на каждый входящий запрос:

1. Прочитать `Host` из заголовков.
2. Если host совпадает с `admin.<платформа>.ru` → рендерить route group `(admin)`.
3. Иначе — искать мастера по `domain` (с кэшированием, чтобы не бить в БД на каждый запрос) → если найден, пробросить `master_id`/`slug` в контекст рендера (через rewrite или заголовок); если не найден — 404.

Для локальной разработки: прописать тестовые домены в `/etc/hosts`, например `master1.local.test → 127.0.0.1`, чтобы проверять мультидоменную логику без реального DNS.

---

## 8. Генерация `.ics` с напоминанием

Через библиотеку `icalendar`:

- Создать `VEVENT` с `DTSTART`/`DTEND` по времени записи.
- Добавить `VALARM` с `TRIGGER=-P1D` (за сутки) и опционально второй `VALARM` с `TRIGGER=-PT1H` (за час).
- Отдавать с `Content-Type: text/calendar; charset=utf-8`.
- На фронтенде — обычная ссылка/кнопка на скачивание файла, без JS-библиотек для календаря.

---

## 9. Telegram-бот

1. Регистрация бота через `@BotFather`, токен — в переменную окружения `TELEGRAM_BOT_TOKEN`.
2. Привязка чата мастера: в админке кнопка "Подключить Telegram" → генерируется deep-link вида `t.me/<bot>?start=<master_id>` → при команде `/start` с параметром бот сохраняет `chat_id` в `masters.telegram_chat_id`.
3. Уведомление о новой записи — текстовое сообщение с именем клиента, услугой и временем, отправляется сразу при создании записи.

---

## 10. Инфраструктура и деплой

**docker-compose сервисы:**
- `api` — FastAPI (uvicorn), **запускать одним воркером** (SQLite — один писатель; несколько воркеров uvicorn, пишущих в один файл, могут ловить блокировки)
- `web` — Next.js (standalone build)
- `caddy` — reverse proxy, on-demand TLS

Отдельного сервиса БД нет: файл SQLite монтируется как volume в контейнер `api` (например `/data/app.db`), чтобы данные переживали пересборку контейнера. Бэкап — периодическая копия файла (с учётом WAL: либо делать `VACUUM INTO`/checkpoint перед копированием, либо копировать вместе с файлами `-wal`/`-shm`).

**Caddy:** базовый домен платформы (админка) — статическая запись; кастомные домены мастеров — секция on-demand TLS с ask-эндпоинтом, который перед выпуском сертификата проверяет через `/api/internal/domain-check?domain=...`, что домен реально привязан к активному мастеру (чтобы не выпускать сертификаты на произвольные домены).

**Переменные окружения (минимум):**
```
DATABASE_URL=sqlite+aiosqlite:////data/app.db
JWT_SECRET
TELEGRAM_BOT_TOKEN
BASE_ADMIN_DOMAIN
```

---

## 11. Порядок работ (для агента)

1. Скаффолдинг репозитория: docker-compose, Dockerfile для `api` и `web`, базовый README.
2. Схема БД (раздел 4) + первая миграция Alembic. Важно: в `env.py` включить `render_as_batch=True` — SQLite не поддерживает большинство `ALTER TABLE` напрямую, Alembic обходит это пересборкой таблицы, но только если batch-режим включён заранее.
3. FastAPI: CRUD для `services`, `working_hours`, `bookings` — без мультитенантного роутинга, на одном тестовом мастере (по `slug` в пути запроса).
4. Next.js: страница `/booking` для тестового мастера (без кастомных доменов, просто по пути `/m/{slug}/booking`) — сквозная проверка "запись → генерация `.ics`".
5. Добавить middleware мультитенантности, переключить резолв на `domain`/hostname.
6. Админ-панель: `auth` + CRUD-страницы (раздел 6.2).
7. Telegram-бот: привязка чата, отправка уведомлений о записи.
8. Caddy + on-demand TLS, разворачивание на VPS, привязка первого реального кастомного домена.
9. Ручной сквозной прогон всего цикла на одном пилотном мастере перед подключением остальных.

---

## 12. Явно не входит в эту итерацию

- Автогенерация сайта без участия разработчика.
- Онлайн-оплата/предоплата клиента.
- Push-уведомления и VK-бот как каналы для мастера.
- Автоматический рекуррентный биллинг подписки мастера.
- Фоновые очереди задач (Celery/RQ) — на объёме MVP не нужны, синхронной отправки в Telegram достаточно.
