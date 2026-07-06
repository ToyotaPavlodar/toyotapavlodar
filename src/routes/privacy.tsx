import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";
import { LEGAL_SITE } from "@/lib/legal-site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — Автодом Павлодар" },
      { name: "description", content: "Политика обработки персональных данных Тойота Центр Павлодар." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageLayout title="Политика конфиденциальности">
      <p>
        Настоящая Политика конфиденциальности описывает, как {LEGAL_SITE.companyName} (
        {LEGAL_SITE.legalEntity}), {LEGAL_SITE.address}, {LEGAL_SITE.city}, обрабатывает персональные
        данные пользователей, оставивших заявку через рекламу в Facebook и Instagram (Meta Lead Ads), а
        также через формы на связанных landing-страницах и CRM-системе дилера.
      </p>
      <p className="text-sm text-muted-foreground">Дата последнего обновления: {LEGAL_SITE.lastUpdated}</p>

      <LegalSection title="1. Оператор персональных данных">
        <p>
          <strong>{LEGAL_SITE.companyName}</strong>
          <br />
          Адрес: {LEGAL_SITE.city}, {LEGAL_SITE.address}
          <br />
          Email:{" "}
          <a href={`mailto:${LEGAL_SITE.email}`} className="text-brand hover:underline">
            {LEGAL_SITE.email}
          </a>
          <br />
          Телефон:{" "}
          <a href={LEGAL_SITE.phoneHref} className="text-brand hover:underline">
            {LEGAL_SITE.phone}
          </a>
        </p>
      </LegalSection>

      <LegalSection title="2. Какие данные мы собираем">
        <p>При отправке лид-формы в рекламе Meta или заявки с сайта мы можем получить:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>имя и фамилию;</li>
          <li>номер телефона;</li>
          <li>интересующую модель автомобиля или услугу (сервис, trade-in, АСП и т.д.);</li>
          <li>город проживания;</li>
          <li>комментарий к заявке (если указан в форме);</li>
          <li>технические идентификаторы рекламы (ID кампании, объявления, формы) — для аналитики.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Цели обработки">
        <ul className="list-disc space-y-1 pl-5">
          <li>обработка заявки и обратная связь с клиентом (звонок, сообщение);</li>
          <li>консультация по покупке автомобиля Toyota, Lexus, автомобилей с пробегом (АСП);</li>
          <li>запись на сервис и сопутствующие услуги автодилера;</li>
          <li>передача данных в учётную систему (1С) для оформления сделки или заказ-наряда;</li>
          <li>аналитика эффективности рекламных кампаний (CPL, конверсия по брендам).</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Правовые основания">
        <p>
          Обработка осуществляется на основании согласия пользователя при отправке лид-формы, а также
          для исполнения запроса пользователя и законных интересов дилера в обработке обращений клиентов
          в соответствии с законодательством Республики Казахстан о персональных данных.
        </p>
      </LegalSection>

      <LegalSection title="5. Хранение и доступ">
        <p>
          Данные хранятся в защищённой CRM-системе (облачная база данных Supabase, серверы с
          шифрованием и контролем доступа). Доступ имеют только уполномоченные сотрудники кол-центра,
          отдела продаж, сервиса и маркетинга {LEGAL_SITE.companyName} — в объёме, необходимом для
          выполнения служебных обязанностей.
        </p>
      </LegalSection>

      <LegalSection title="6. Срок хранения">
        <p>
          Данные хранятся до достижения целей обработки, но не дольше срока, установленного
          внутренними регламентами дилера и требованиями законодательства (как правило, до 3 лет с
          момента последнего контакта, если иное не требуется для бухгалтерского или договорного учёта).
        </p>
      </LegalSection>

      <LegalSection title="7. Передача третьим лицам">
        <p>Мы можем передавать данные:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            в <strong>1С</strong> и связанные учётные системы — для оформления продажи, сервиса и
            документооборота;
          </li>
          <li>
            провайдерам IT-инфраструктуры (хостинг, CRM, Supabase) — исключительно для хранения и
            обработки по нашим инструкциям;
          </li>
          <li>
            Meta Platforms — в рамках использования Lead Ads (получение заявки через API/webhook по
            инициативе пользователя).
          </li>
        </ul>
        <p>Мы не продаём персональные данные третьим лицам.</p>
      </LegalSection>

      <LegalSection title="8. Ваши права">
        <p>Вы вправе:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>запросить информацию о хранящихся данных;</li>
          <li>потребовать исправление неточных данных;</li>
          <li>потребовать удаление данных (см. также страницу «Удаление данных»);</li>
          <li>отозвать согласие, направив запрос на {LEGAL_SITE.email}.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Контакты по вопросам данных">
        <p>
          По всем вопросам, связанным с персональными данными, обращайтесь:{" "}
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
