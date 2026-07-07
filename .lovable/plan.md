
# План: полный аудит и подготовка CRM к рабочему состоянию

Пройду систему по трём заявленным зонам, зафиксирую ошибки, исправлю, затем прогоню e2e Playwright под реальной учёткой из preview и приложу скриншоты.

## Что уже найдено при первичном разборе

### Аутентификация и роли
1. **UsersTab**: переключатели ролей независимы, но `createEmployee` ещё и вручную сбрасывает роли — возможна рассинхронизация, если админ поменяет роль после создания. Триггер `handle_new_user` всегда даёт роль `operator`, которая в UI не отображается, но остаётся в БД. Нужно почистить старую роль `operator` у существующих пользователей и убрать её из UI.
2. `canDashboard` включает флаг `dashboardAccess` из профиля независимо от роли. У менеджера этот тумблер видно — если админ его случайно включит, менеджер получит доступ. Уточню правило: дашборд = только admin/marketer (тумблер «Аналитика» переименовать и оставить только для случая «менеджер + доступ к дашборду по исключению»), либо убрать вовсе.
3. Хук `useSessionProfile` делает второй запрос `getUser` внутри `_authenticated`, при этом gate уже вызвал его в `beforeLoad`. Некритично, но добавлю кэш через контекст маршрута, чтобы избежать двойного запроса и мигания «Загрузка…».
4. Форма входа не блокирует сабмит при повторных кликах и не показывает ссылку «Забыли пароль» — админ восстанавливает через Supabase Admin API. Добавлю кнопку «Отправить ссылку восстановления» (только на sign-in — вызывает `supabase.auth.resetPasswordForEmail`).

### Meta / Facebook
5. **Публичные cron-хуки** `sync-meta-spend`, `sync-meta-leads`, `sync-fx`, `subscribe-meta-webhooks` вызываются без проверки. Секрет `CRON_SECRET` в проекте уже есть, но не используется. Добавлю проверку заголовка `Authorization: Bearer <CRON_SECRET>` (или query `?key=`), чтобы посторонний не запускал синхронизацию.
6. `saveMetaToken`, `saveWhatsAppConfig`, `saveSelectedForms` делают `update` по `id = 1`. Если seed-строки нет — тихо ничего не запишется. Заменю на `upsert`.
7. Webhook `meta-leads.ts` возвращает 500 при отсутствии `META_APP_SECRET`. Это правильно, но админ в UI не видит, что секрет не задан. Добавлю в разделе Meta индикатор «App Secret задан/не задан» через сервер-функцию (без раскрытия значения).
8. При выборе форм в мастере, если у формы нет вопросов (custom preset), `field_map` не строится — вебхук упадёт в fallback по именам. Явно валидирую и предупреждаю в UI.
9. `syncMetaMessagingMonth` использует «Сервис»-кабинет через код бренда `service` и хардкод `act_1205600091457168`. Уберу хардкод, оставлю только правило «default_brand_id = бренд service».
10. `subscribePagesToLeadgenWebhook` фейлится молча в интерфейсе (только запись в sync_log). Мастер FB должен показывать состояние подписки страниц.

### Дашборд и лиды
11. `dashboard.tsx` кнопка «Синхронизировать Meta» вызывает `syncMetaMonth` — если Meta не подключен, будет невнятная ошибка. Добавлю проверку и подсказку «Подключите Meta в Настройках».
12. `leads.tsx` при открытии текущего месяца пуляет `POST /api/public/hooks/sync-meta-leads` каждые 3 минуты с браузера (см. `pullMetaLeads`). После включения CRON_SECRET этот вызов перестанет работать. Заменю на защищённую server-функцию `syncRecentMetaLeads` (обёртка вокруг `syncMetaLeadsRange` с `requireSupabaseAuth`).
13. Realtime подписка на `leads` работает, но при большом количестве INSERT сортировка теряется (новые в начало, обновления не сортируются). Добавлю пересортировку.
14. Экспорт CSV использует `;`-разделитель + BOM — ок. Но телефоны как `+7...` в Excel превращаются в дату. Оберну в `="..."`.

### Общие
15. **Hydration warning** в консоли `data-tsd-source` — это отладочный атрибут dev-инструмента. Добавлю `suppressHydrationWarning` на `<html>/<head>/<body>` в `__root.tsx`.
16. Валидация `.env` серверных переменных на старте: если чего-то нет — писать понятную ошибку в лог, а не 500.

## Порядок работ

1. **Миграция БД**
   - Удалить старую роль `operator` у всех пользователей (единоразово, идемпотентно).
   - Гарантировать наличие строки `meta_integration(id=1)` и `whatsapp_integration(id=1)` (`INSERT ... ON CONFLICT DO NOTHING`).
   - Обновить `handle_new_user`: назначать роль `manager` вместо `operator`.

2. **Backend / server-функции**
   - Добавить утилиту `assertCronSecret(request)` и подключить во всех `/api/public/hooks/*`.
   - Заменить `update` на `upsert` в `saveMetaToken`, `saveWhatsAppConfig`, `saveSelectedForms`, `setAccountDefaultBrand`, `setPageDefaultBrand`.
   - Добавить `hasMetaAppSecret` сервер-функцию (возвращает `boolean`) для индикатора в UI.
   - Убрать хардкод `act_1205600091457168` в `resolveWhatsAppLeadAccountIds`.
   - Новая `syncRecentMetaLeads` (auth-only) — вместо публичного POST из leads-страницы.

3. **UI**
   - `__root.tsx`: `suppressHydrationWarning` на html/head/body.
   - `_authenticated/route.tsx`: убрать тумблер «Аналитика» для роли admin/marketer, оставить только для manager (переименовать в «Дашборд по исключению»).
   - `settings.tsx > UsersTab`: скрыть переключатель dashboardAccess у admin/marketer, добавить бейджи ролей.
   - `settings.tsx > MetaTab`: индикатор App Secret + статус вебхуков (кол-во подписанных страниц).
   - `dashboard.tsx`: понятное сообщение «Meta не подключён».
   - `leads.tsx`: заменить `fetch('/api/public/hooks/sync-meta-leads')` на `syncRecentMetaLeads` через `useServerFn`. Пофиксить пересортировку по `created_at`. В CSV обернуть телефон в `="..."`.
   - `auth.tsx`: ссылка «Забыли пароль?» → `supabase.auth.resetPasswordForEmail`.

4. **Проверка e2e Playwright**
   - Скрипт под `/tmp/browser/audit/`:
     - Логин по managed Supabase session.
     - Обход `/leads`, `/dashboard`, `/settings` (все табы).
     - Скриншоты состояний: пустой список, с фильтром, экспорт, диалог «Добавить лид», мастер FB (Token → Pages → Forms → Save), таблица пользователей.
     - Проверка консоли и network (нет 500/401 на /_serverFn/*, нет unhandled errors).
   - По результатам — доправить, если что-то падает.

5. **Валидация**
   - `tsgo --noEmit` — типы.
   - `security--run_security_scan` — регресс.
   - Ручной smoke: создать сотрудника, переключить роль, открыть дашборд, экспорт CSV.

## Технические детали

**Файлы, которые изменятся:**
```text
supabase/migrations/<ts>_cleanup_roles_seed.sql   # роли + seed id=1
src/routes/__root.tsx                              # suppressHydrationWarning
src/routes/_authenticated/route.tsx                # правила отображения дашборда
src/routes/_authenticated/settings.tsx             # UsersTab + MetaTab
src/routes/_authenticated/dashboard.tsx            # empty-state для Meta
src/routes/_authenticated/leads.tsx                # server-fn вместо fetch, sort
src/routes/auth.tsx                                # reset password link
src/routes/api/public/hooks/sync-fx.ts             # assertCronSecret
src/routes/api/public/hooks/sync-meta-leads.ts     # assertCronSecret
src/routes/api/public/hooks/sync-meta-spend.ts     # assertCronSecret
src/routes/api/public/hooks/subscribe-meta-webhooks.ts # assertCronSecret
src/lib/cron-auth.ts                               # NEW helper
src/lib/admin.functions.ts                         # upsert, hasMetaAppSecret
src/lib/leads.functions.ts                         # csv phone fix
src/lib/sync.functions.ts                          # syncRecentMetaLeads
src/lib/meta-sync.server.ts                        # убрать хардкод act_
```

**Что не будет сделано** (не входит в скоп по вашему запросу):
- Редизайн, новый функционал (email-уведомления, интеграция 1С, звонки).
- Сужение RLS менеджера до «своих лидов» — нет владельца в таблице.
- Refactor `settings.tsx` (1388 строк) на подкомпоненты — большой рефакторинг, риск регрессий.

Скажите «поехали» — переключусь в build-режим и начну с миграции.
