
## Что делаю

### 1) Роли и права

Три роли: `admin`, `marketer`, `manager`. Роль `operator` заменяем на `manager` (обратно-совместимо оставляем в enum, но UI показывает только 3).

| Роль | Лиды | Дашборд | Настройки |
|---|---|---|---|
| admin | ✓ (все действия) | ✓ | ✓ (управление всем) |
| marketer | ✓ (просмотр/статусы) | ✓ | ✕ |
| manager | ✓ (только своё, статусы) | ✕ | ✕ |

Обновляю `_authenticated/route.tsx`: пункт «Дашборд» для admin+marketer, «Настройки» только для admin.

### 2) Добавление сотрудника (вкладка «Пользователи»)

Новая форма над таблицей: **Email**, **Пароль** (мин. 8), **Имя**, **Роль (select)**. Кнопка «Создать».

Server function `createEmployee` — использует `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`, затем назначает выбранную роль в `user_roles`. Доступно только админу.

Кнопка удаления сотрудника — `supabaseAdmin.auth.admin.deleteUser(id)` (нельзя удалить самого себя).

### 3) Facebook: мастер подключения

Всё уже начинается со вставки токена — не меняю. Улучшаю пошаговый мастер после подключения:

**Шаг 1. Выбор рекламного кабинета** — dropdown из `ad_accounts`.

**Шаг 2. Список страниц кабинета** — server fn `listMetaPages(ad_account_id)` через `/act_.../promote_pages`. Чекбоксами выбираются страницы, с которых собираем лиды.

**Шаг 3. Формы выбранных страниц** — server fn `listMetaFormsForPages(page_ids)` возвращает формы + их поля (`questions`) через `/{form_id}?fields=id,name,status,questions,page`.

**Шаг 4. Маппинг форм**. Для каждой формы:
- Выбор бренда (Select) — обязателен, иначе форма пропускается.
- Таблица полей формы (question `key`/`label`) → системное поле:
  `— игнорировать —`, `full_name`, `phone`, `email`, `city`, `comment`, `custom` (сохраняется в `custom_fields`).
- Автоопределение по типу вопроса (`FULL_NAME` → full_name, `PHONE` → phone, `EMAIL` → email) как значение по умолчанию.

Кнопка «Сохранить конфигурацию форм» пишет в `meta_integration.selected_forms` расширенную структуру:
```
[{ form_id, form_name, page_id, page_name, brand_id, field_map: { <question_key>: <system_field> } }]
```

Обновлю обработчик вебхука `meta-leads.ts`: при приёме лида читает `field_map` для формы и мапит `field_data` в колонки `leads` (full_name, phone, email, city) + остальное в `custom_fields`. Сейчас там простая логика по названию полей — заменю на явный маппинг.

### 4) Миграция БД

- `ALTER TYPE app_role ADD VALUE 'manager'` (если ещё нет).
- Существующие политики RLS уже допускают admin/marketer через `has_role`. Проверю `leads` — для manager оставлю просмотр всех строк (можно позже сузить).

## Технические детали

**Файлы:**
- `supabase/migrations/...` — добавить enum `manager`.
- `src/lib/admin.functions.ts` — `createEmployee`, `deleteEmployee`, `listMetaPages`, `listMetaFormsForPages`; расширение `saveSelectedForms` под новую схему.
- `src/routes/_authenticated/settings.tsx` — форма создания сотрудника, кнопка удаления, роли admin/marketer/manager, мастер FB в 4 шага с маппингом.
- `src/routes/_authenticated/route.tsx` — навигация по ролям.
- `src/routes/api/public/webhooks/meta-leads.ts` — использовать `field_map` при разборе лида.

**Не входит:** сужение RLS `leads` для manager (можно добавить в отдельной итерации, если нужно «только своих» — потребует владельца лида).
