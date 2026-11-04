# SMM на сервере: https://smm.neuronium.ai

SMM · контент-план — статический сайт: `npm run build` кладёт его в `dist/`, отдаёт его nginx или Caddy. Сервера
приложения, базы и ключей нет — план живёт в браузере (IndexedDB). Адрес — **https://smm.neuronium.ai**,
Neuronium — **https://os.neuronium.ai**.

## Открыть внутри Neuronium (nr-launch/1)

Neuronium рисует отделы слева и открывает SMM в своём окне (во фрейме), если SMM это разрешает, иначе — в новой
вкладке. Решает одна переменная — `NR_HOST_ORIGINS` (пример — [`../.env.example`](../.env.example)):

```bash
NR_HOST_ORIGINS=https://os.neuronium.ai
```

- **Не задана или пустая** — всё как раньше: сборка та же, в `dist/nr-launch.json` — `"frame": false`, а конфиг
  сервера пускает во фрейм только сам сайт (`frame-ancestors 'self'` и `X-Frame-Options: SAMEORIGIN`). Neuronium
  откроет SMM в новой вкладке.
- **Задана** — в `dist/nr-launch.json` — `"frame": true`, а каждый ответ сайта несёт
  `Content-Security-Policy: frame-ancestors 'self' https://os.neuronium.ai` и **не** несёт `X-Frame-Options`
  (он не умеет называть чужой адрес).
- Адрес — точный: `https://хост[:порт]`, без пути и «/» в конце; `http://` — только `localhost` и `127.0.0.1`.
  Неверный пропускается, в журнале сборки и установки — одна строка, что именно пропущено.

`/nr-launch.json` — паспорт для Neuronium: открыт всем, кэш — минута, секретов и данных плана в нём нет:

```json
{"contract":"nr-launch/1","id":"smm","name":{"ru":"SMM","en":"SMM"},"frame":true,"version":"0.1.0","commit":"<коммит сборки>"}
```

`version` — из `package.json`, `commit` — коммит git-копии, из которой собирали (вне git поля нет). Файл пишет
сборка прямо в `dist/` — в git ничего не меняется, `git pull` на машине остаётся чистым.

**Вход во фрейме.** Входа у SMM нет — менять нечего: cookies нет, перехода верхнего окна на чужую страницу входа
нет. Neuronium и SMM — на одном сайте (`*.neuronium.ai`), поэтому браузер не делит хранилище: во фрейме тот же план
в IndexedDB, что и на https://smm.neuronium.ai (так в Chrome и Firefox; проверять — в браузере владельца).

**Меню во фрейме.** Отделы рисует Neuronium, меню одно: своей панели (знак Nr, отделы) SMM во фрейме не рисует,
меню профиля — «Настройки» с шестерёнкой внизу колонки «Главная / Календарь» (кружок аккаунта — у Neuronium). На телефоне
во фрейме нижняя панель одна — у Neuronium: у SMM внизу ничего нет, «Главная», «Календарь» и «Настройки» — вверху, в
шапке SMM. Это решает браузер (`window.top !== window.self`) — в установке ничего не меняется; на https://smm.neuronium.ai
панель отделов и «Профиль» — как раньше (на телефоне — внизу «Главная, Календарь, Профиль»).

## Установка

Переменная — в окружении или в `content-plan/app/.env`; сборка и конфиг берут её из одного места.

```bash
cd content-plan/app
npm ci
echo 'NR_HOST_ORIGINS=https://os.neuronium.ai' > .env
npm run build                                   # → dist/ и dist/nr-launch.json
```

**nginx** — конфиг из той же переменной (адрес и папку меняют `SMM_HOST` и `SMM_ROOT`; по умолчанию —
`smm.neuronium.ai` и `dist/` этой копии; nginx должен уметь её читать — иначе скопируйте `dist/` в `/var/www/smm`
и задайте `SMM_ROOT=/var/www/smm`):

```bash
node scripts/nr-launch.mjs nginx | sudo tee /etc/nginx/sites-available/smm.neuronium.ai
sudo ln -sf /etc/nginx/sites-available/smm.neuronium.ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d smm.neuronium.ai        # HTTPS
```

Что получится (с `NR_HOST_ORIGINS=https://os.neuronium.ai`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name smm.neuronium.ai;
    root /var/www/smm;
    index index.html;

    add_header Content-Security-Policy "frame-ancestors 'self' https://os.neuronium.ai" always;

    location = /nr-launch.json {
        expires 60s;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Caddy** (HTTPS — сам):

```bash
sudo mkdir -p /etc/caddy/sites
node scripts/nr-launch.mjs caddy | sudo tee /etc/caddy/sites/smm.neuronium.ai.caddy
grep -q '^import sites/\*' /etc/caddy/Caddyfile || echo 'import sites/*' | sudo tee -a /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

```caddy
smm.neuronium.ai {
	root * /var/www/smm
	encode gzip
	header {
		Content-Security-Policy "frame-ancestors 'self' https://os.neuronium.ai"
	}
	header /nr-launch.json Cache-Control "public, max-age=60"
	try_files {path} /index.html
	file_server
}
```

Без переменной в обоих конфигах вместо этой строки — `frame-ancestors 'self'` и `X-Frame-Options "SAMEORIGIN"`.
Поменяли `NR_HOST_ORIGINS` — пересоберите (`npm run build`) и заново сделайте конфиг: паспорт и заголовки должны
говорить одно. Проверить: `curl -sI https://smm.neuronium.ai/ | grep -i frame` и
`curl -s https://smm.neuronium.ai/nr-launch.json`.

**DNS.** Запись `smm.neuronium.ai` (A или CNAME) — на машину с nginx/Caddy. Прежнего адреса у SMM не было,
перенаправлять нечего.
