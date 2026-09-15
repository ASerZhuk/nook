# nook — MVP

Онлайн-запись для частных мастеров. Не CRM: мастер регистрируется по телефону, заполняет услуги и расписание и отправляет клиентам ссылку. Клиент записывается без регистрации и ставит PWA «Мои записи», чтобы получать уведомления о переносе или отмене.

```
apps/api   FastAPI + SQLAlchemy async + SQLite(WAL) + Alembic + pywebpush + smsint Call Password
apps/web   Next.js 15 (App Router) + Tailwind v4, только мобильная вёрстка
infra      docker-compose + Caddy (один домен, HTTPS)
```

## Маршруты
- `/` — лендинг, `/login` — вход по звонку (код — последние 4 цифры номера)
- `/app` — кабинет мастера (PWA): записи-«блокнот», `/app/clients`, `/app/profile`, `/app/services`, `/app/schedule`, `/app/onboarding`
- `/{slug}` — ссылка мастера для клиентов: запись по шагам
- `/c/{token}` — приложение клиента (PWA): свои записи, отмена, календарь, повторная запись, push

## Быстрая запись
Мастер пишет одной строкой («Анна шилак 16.09 в 13:30 89531234567») → ИИ (`VSELLM_*`) разбирает в черновик → мастер проверяет и нажимает «Записать».

## Уведомления
- Web Push (VAPID). Android — сразу в браузере; iPhone — только после «На экран Домой» (iOS 16.4+).
- Мастеру: новая запись, отмена клиентом. Клиенту: перенос и отмена мастером.
- Если у клиента нет приложения, кабинет предлагает мастеру сообщить ему самостоятельно.

## Локальный запуск
```bash
cd apps/api
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/alembic upgrade head && .venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --port 8000

npm install && npm run dev   # http://localhost:3000
```
- Токен smsint — `SMSINT_API_TOKEN` в `apps/api/.env`. Без него звонка нет, код входа показывается на экране. Демо-мастер: `+7 999 000-11-22`, ссылка `/anna`.
- Push и установка PWA на телефоне работают только по HTTPS (или на `localhost`).

## Тестовый стенд: https://nook.aszhukov.site
- Образы собирает GitHub Actions при пуше в `main` (`.github/workflows/docker.yml`) → `ghcr.io/aserzhuk/nook-web`, `nook-api`.
- На VPS: `/opt/nook` (`docker-compose.yml` = `infra/docker-compose.vps.yml`, `.env` с секретами), данные в томе `nook_nook_data`.
- nginx хоста: `/etc/nginx/sites-available/nook` (шаблон `infra/nginx.nook.conf.example`), сертификат certbot.
- Автообновление: после сборки задача `deploy` заходит на VPS по ключу из секретов (`VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`). На сервере ключ привязан только к `/opt/nook/deploy.sh`: pull → up -d → очистка образов → проверка здоровья.
- Правки только в `*.md` сборку и деплой не запускают.
- Вручную (если нужно): `/opt/nook/deploy.sh` или `cd /opt/nook && docker compose pull && docker compose up -d`.

## Продакшн
```bash
cd infra && cp .env.example .env   # заполнить
docker compose up -d --build
```
Бэкап: `sqlite3 /data/app.db "VACUUM INTO '/data/backup.db'"`. VAPID-ключи хранятся в `/data/vapid.json`: если их потерять, все подписки на push станут недействительными.
