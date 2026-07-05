
# План: CRM «Автодом Павлодар»

## 1. Роли и доступ
- Роли в таблице `user_roles` (enum: `admin`, `operator`, `marketer`) + функция `has_role()`.
- Отдельный флаг `dashboard_access boolean` в `profiles` — админ выдаёт точечно.
- Публичный маршрут `/auth` (email+пароль). Всё остальное — под `_authenticated/`.

## 2. Схема БД (Supabase)

**profiles** — id (FK auth.users), full_name, email, dashboard_access, created_at.
**user_roles** — user_id, role (enum).
**brands** — id, code (toyota/lexus/asp/service), name, color.
**leads** — id, created_at, name, phone (нормализ. +7), interest, brand_id, source (enum: `meta_lead_form` / `whatsapp`), source_ref (form_id/ctwa_clid/wa_message_id), meta_campaign_id, meta_adset_id, meta_ad_id, called (bool null), qualified (bool null), sent_to_1c bool default false, comment text, raw_payload jsonb, updated_at.
  - Индексы: (created_at desc), (brand_id, created_at), (phone).
  - Realtime publication: включить.
**campaign_brand_map** — meta_account_id, campaign_id, brand_id (админ настраивает).
**ad_spend_daily** — date, meta_account_id, campaign_id, brand_id, spend_usd numeric — уникальный ключ (date, campaign_id).
**fx_rates** — date PK, usd_kzt numeric, source text.
**meta_integration** — id=1 (singleton), access_token (шифр.), user_id_meta, token_expires_at, connected_at, ad_accounts jsonb, selected_forms jsonb (массив form_id → brand_id).
**whatsapp_integration** — id=1, phone_number_id, waba_id, access_token, verify_token, connected_at.
**sync_log** — id, kind (`meta_spend`/`fx`/`meta_leads`/`wa`), status, message, ran_at.

RLS:
- `leads`: SELECT для operator/admin/marketer; UPDATE операторских полей (called/qualified/sent_to_1c/comment) — operator+admin; INSERT/DELETE — только service_role (через edge/webhook).
- Дашборд-агрегаты (ad_spend, fx) — SELECT только для admin или `dashboard_access=true`.
- Настройки/интеграции — только admin.
- Все таблицы: GRANT + ENABLE RLS.

## 3. Приём лидов (Edge Functions — веб-хуки от Meta)
Оставляем на Supabase Edge Functions (внешние вебхуки от Meta должны бить в фиксированный URL):
- `meta-lead-webhook` — верификация GET (`hub.challenge`), приём POST, проверка `X-Hub-Signature-256`, вытягивание лида через Graph API по `leadgen_id`, определение бренда по campaign_id → `campaign_brand_map`, upsert в `leads`. Фильтр по `selected_forms` из настроек.
- `whatsapp-webhook` — Meta Cloud API. На входящих сообщениях с `referral.ctwa_clid` создаём лид; бренд по source_url/ctwa. Первое сообщение → имя (profile.name), phone (wa_id), interest = первый текст.

## 4. Серверные функции (TanStack `createServerFn`)
- `listLeads({month, brand, filters, search})` — с пагинацией.
- `updateLead({id, patch})` — только разрешённые поля.
- `exportLeadsCsv({month, brand})`.
- `getDashboard({month})` — агрегирует: spend (USD→KZT по среднему курсу месяца), total_leads, CPL, по брендам, quality% (qualified/called_yes), conversion% (sent_to_1c/total), тренд 6 мес.
- `admin.listUsers / setDashboardAccess / setRole`.
- `admin.saveMetaToken / listAdAccounts / listForms / saveSelectedForms`.
- `admin.saveWhatsAppConfig / testWhatsApp`.
- `admin.setCampaignBrandMap`.

## 5. Cron (pg_cron + pg_net → `/api/public/hooks/*`)
- Ежедневно 03:00 — `sync-meta-spend` (Marketing API insights по кабинетам за последние 3 дня, upsert в `ad_spend_daily`).
- Ежедневно 06:00 — `sync-fx` (Нацбанк РК XML `rates?fdate=...`, upsert `fx_rates`).
- Каждые 10 мин — `refresh-meta-token` (проверка срока, лог).

## 6. UI

**Маршруты:**
- `/auth` — вход.
- `/_authenticated/leads` — рабочая таблица (operator/admin/marketer).
- `/_authenticated/dashboard` — виджеты (admin + dashboard_access).
- `/_authenticated/settings` — админ:
  - Пользователи (роль + переключатель «Доступ к аналитике»).
  - Facebook / Meta: вставка токена → список кабинетов → чекбоксы форм → сохранить. Таблица «Кампания → Бренд».
  - WhatsApp (Meta Cloud API): phone_number_id, waba_id, токен, verify_token, кнопка «Проверить», URL вебхука для копирования в Meta.
  - Бренды (CRUD, цвета).

**Таблица лидов:**
- Верх: табы брендов (Toyota / Lexus / АСП / Сервис / Все), поиск, фильтры (дата, дозвон, квал, 1С), кнопка Export.
- Столбцы: Дата, Имя, Телефон (клик → tel/wa.me), Что интересует, Бренд-тег, Дозвон (switch), Квал (switch, disabled пока Дозвон≠да), 1С (switch), Комментарий (inline edit).
- Realtime подписка на `leads` — новые сверху без перезагрузки.
- Цвета: зелёный = да, серый = не указано, красный = нет.

**Дашборд:**
- Верх: `◀ Месяц ГГГГ ▶`, метка «Обновлено ЧЧ:ММ», курс USD/KZT.
- Карточки: Расходы (KZT + USD), Всего лидов, CPL, Лиды по брендам (4 карточки), CPL по брендам, Качество (Квал/Дозвонившиеся, %), Конверсия в 1С (%).
- Мини-спарклайны 6 мес (recharts).

## 7. Дизайн-система
- Тёмная/светлая тема (переключатель), primary — акцент бренда дилера (тёмно-синий #0B2340, акцент #C8102E). Все токены — HSL в `src/styles.css`, никаких хардкод-цветов в компонентах.
- Шрифт: Inter/Manrope через `@fontsource`.
- shadcn компоненты: Tabs, Switch, Table, Card, Dialog, Sonner для уведомлений.

## 8. Порядок реализации
1. Починка сборки (`bun add @supabase/supabase-js` + недостающие зависимости).
2. Миграция БД (все таблицы, enum, RLS, GRANT, публикация realtime).
3. Auth + layout `_authenticated` + роли, seed админа.
4. Настройки (Users, Brands, Campaign→Brand map).
5. Таблица лидов + realtime + серверные fn.
6. Edge Functions: `meta-lead-webhook`, `whatsapp-webhook`.
7. Настройки → Meta (сохранение токена, выбор форм) и WhatsApp Cloud.
8. Cron: fx + spend + server routes `/api/public/hooks/*`.
9. Дашборд (виджеты + тренды).
10. Экспорт CSV, полировка, seed демо-данных.

## 9. Секреты
Через `add_secret` по мере надобности: `META_APP_SECRET` (для проверки подписи вебхука), `META_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN`. Токены интеграций хранятся в БД (таблицы `*_integration`), доступ только через admin server fn.

## 10. Вне рамок
Реальная 1С, авто-квалификация, пуши операторам, Green API.

## Открытые вопросы (уточню при разработке)
- Точный список брендов подтверждён (Toyota/Lexus/АСП/Сервис) — стартую с ними.
- Первого админа заведу через миграцию по email (спрошу email при первом шаге).
