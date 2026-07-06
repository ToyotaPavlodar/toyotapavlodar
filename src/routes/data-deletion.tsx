import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";
import { LEGAL_SITE } from "@/lib/legal-site";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "Удаление данных — Автодом Павлодар" },
      {
        name: "description",
        content: "Как запросить удаление персональных данных из CRM Тойота Центр Павлодар.",
      },
    ],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  return (
    <LegalPageLayout title="Инструкция по удалению данных">
      <p>
        Если вы оставляли заявку через рекламу {LEGAL_SITE.companyName} в Facebook или Instagram и
        хотите удалить свои персональные данные из нашей CRM-системы, воспользуйтесь инструкцией
        ниже.
      </p>
      <p className="text-sm text-muted-foreground">Дата последнего обновления: {LEGAL_SITE.lastUpdated}</p>

      <LegalSection title="1. Как подать запрос">
        <p>Направьте запрос любым удобным способом:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Email:{" "}
            <a href={`mailto:${LEGAL_SITE.email}`} className="text-brand hover:underline">
              {LEGAL_SITE.email}
            </a>
          </li>
          <li>
            Телефон:{" "}
            <a href={LEGAL_SITE.phoneHref} className="text-brand hover:underline">
              {LEGAL_SITE.phone}
            </a>
          </li>
          <li>
            WhatsApp: напишите на номер{" "}
            <a href={LEGAL_SITE.phoneHref} className="text-brand hover:underline">
              {LEGAL_SITE.phone}
            </a>{" "}
            с текстом «Удаление данных».
          </li>
        </ul>
        <p>В сообщении укажите:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>ФИО (как указано в заявке);</li>
          <li>номер телефона из заявки;</li>
          <li>кратко: «прошу удалить мои персональные данные из CRM».</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Что будет удалено">
        <p>После проверки запроса мы удалим или обезличим:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>имя и контактный телефон;</li>
          <li>интерес (модель/услуга) и город из заявки;</li>
          <li>комментарии и историю обработки заявки в CRM;</li>
          <li>связанные технические записи (ID формы, кампании) — если они позволяют идентифицировать вас.</li>
        </ul>
        <p>
          Данные, которые мы обязаны хранить по закону (бухгалтерские документы, оформленные сделки в
          1С), могут быть сохранены в обезличенном виде или в объёме, требуемом законодательством.
        </p>
      </LegalSection>

      <LegalSection title="3. Срок обработки">
        <p>
          Запрос обрабатывается в течение <strong>30 календарных дней</strong> с момента получения.
          При необходимости уточнения данных мы свяжемся с вами по указанному телефону или email.
        </p>
      </LegalSection>

      <LegalSection title="4. Кто обрабатывает запросы">
        <p>
          Запросы на удаление данных обрабатывает ответственный сотрудник {LEGAL_SITE.companyName}{" "}
          (отдел маркетинга / администратор CRM). Контакт:{" "}
          <a href={`mailto:${LEGAL_SITE.email}`} className="text-brand hover:underline">
            {LEGAL_SITE.email}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="5. Meta (Facebook / Instagram)">
        <p>
          Если вы хотите отозвать доступ приложения Meta к вашим данным на стороне Facebook, это также
          можно сделать в настройках Facebook: «Настройки и конфиденциальность» → «Центр аккаунтов» →
          «Ваши данные и разрешения». Удаление данных в нашей CRM выполняется отдельно по запросу,
          описанному выше.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
