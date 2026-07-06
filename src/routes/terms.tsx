import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";
import { LEGAL_SITE } from "@/lib/legal-site";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Пользовательское соглашение — Автодом Павлодар" },
      { name: "description", content: "Условия использования сайта и CRM Тойота Центр Павлодар." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageLayout title="Пользовательское соглашение">
      <p>
        Настоящее Соглашение регулирует использование сайта и внутренней CRM-системы{" "}
        {LEGAL_SITE.companyName} ({LEGAL_SITE.city}). Используя сайт или оставляя заявку, вы
        соглашаетесь с условиями ниже.
      </p>
      <p className="text-sm text-muted-foreground">Дата последнего обновления: {LEGAL_SITE.lastUpdated}</p>

      <LegalSection title="1. Владелец сайта">
        <p>
          Сайт и CRM принадлежат и управляются {LEGAL_SITE.companyName} ({LEGAL_SITE.legalEntity}).
          Контакты: {LEGAL_SITE.email}, {LEGAL_SITE.phone}, {LEGAL_SITE.address}, {LEGAL_SITE.city}.
        </p>
      </LegalSection>

      <LegalSection title="2. Назначение сервиса">
        <p>
          Сайт и CRM предназначены для приёма и обработки заявок клиентов на покупку автомобилей
          Toyota, Lexus, автомобилей с пробегом (АСП), сервисное обслуживание, а также для учёта
          обращений сотрудниками кол-центра и маркетинга дилера.
        </p>
      </LegalSection>

      <LegalSection title="3. Регистрация и доступ к CRM">
        <p>
          Раздел CRM доступен только авторизованным сотрудникам {LEGAL_SITE.companyName}. Логин и
          пароль являются конфиденциальными. Пользователь CRM обязан не передавать учётные данные
          третьим лицам и соблюдать внутренние правила работы с клиентскими данными.
        </p>
      </LegalSection>

      <LegalSection title="4. Заявки клиентов">
        <p>
          Отправляя лид-форму в рекламе Meta или форму на сайте, клиент подтверждает достоверность
          указанных данных и согласие на обработку персональных данных в соответствии с{" "}
          <a href="/privacy" className="text-brand hover:underline">
            Политикой конфиденциальности
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="5. Ограничение ответственности">
        <p>
          Информация на сайте носит справочный характер и не является публичной офертой, если иное
          прямо не указано. {LEGAL_SITE.companyName} не несёт ответственности за временную
          недоступность сайта по техническим причинам, а также за действия третьих лиц (Meta,
          провайдеры связи), влияющие на доставку заявок.
        </p>
      </LegalSection>

      <LegalSection title="6. Интеллектуальная собственность">
        <p>
          Логотипы Toyota, Lexus и материалы сайта принадлежат их правообладателям. Копирование
          контента без разрешения запрещено.
        </p>
      </LegalSection>

      <LegalSection title="7. Изменения условий">
        <p>
          Мы можем обновлять настоящее Соглашение. Актуальная версия всегда доступна по адресу{" "}
          <a href="/terms" className="text-brand hover:underline">
            /terms
          </a>
          . Продолжение использования сайта после изменений означает согласие с новой редакцией.
        </p>
      </LegalSection>

      <LegalSection title="8. Контакты">
        <p>
          Вопросы по Соглашению:{" "}
          <a href={`mailto:${LEGAL_SITE.email}`} className="text-brand hover:underline">
            {LEGAL_SITE.email}
          </a>
          , тел.{" "}
          <a href={LEGAL_SITE.phoneHref} className="text-brand hover:underline">
            {LEGAL_SITE.phone}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
