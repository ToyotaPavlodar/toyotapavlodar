import { createFileRoute } from "@tanstack/react-router";
import { assertCronSecret } from "@/lib/cron-auth";

/**
 * Ежедневный cron: полный текущий месяц расходов + messaging + свежие лиды.
 * Раньше тянули только 3 дня spend — из‑за этого цифры отставали от Meta.
 */
async function runMetaSync() {
  const {
    syncMetaSpendRange,
    syncMetaLeadsRange,
    syncMetaMessagingMonth,
    subscribePagesToLeadgenWebhook,
  } = await import("@/lib/meta-sync.server");
  const { currentMonthSyncRange, shiftMonthKey, monthBoundsUtc, todayBusinessDate } =
    await import("@/lib/month-range");

  const range = currentMonthSyncRange();
  const today = todayBusinessDate();
  const dayOfMonth = Number(today.slice(8, 10));

  // В первые 3 дня месяца дотягиваем и прошлый месяц целиком (закрытие отчётов Meta).
  const monthsToMsg = [range.month];
  const spendRanges: Array<{ from: Date; to: Date }> = [
    { from: range.from, to: range.to },
  ];
  if (dayOfMonth <= 3) {
    const prev = shiftMonthKey(range.month, -1);
    monthsToMsg.push(prev);
    const pb = monthBoundsUtc(prev);
    spendRanges.push({ from: pb.from, to: pb.toInclusive });
  }

  const leadsFrom = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const leadsTo = new Date();

  const [webhook, ...spendResults] = await Promise.all([
    subscribePagesToLeadgenWebhook(),
    ...spendRanges.map((r) => syncMetaSpendRange(r.from, r.to)),
  ]);

  const messagingResults = [];
  for (const m of monthsToMsg) {
    messagingResults.push(await syncMetaMessagingMonth(m));
  }

  const leads = await syncMetaLeadsRange(leadsFrom, leadsTo);

  const spendRows = spendResults.reduce((a, s) => a + (s.rows ?? 0), 0);
  const spendError = spendResults.map((s) => s.error).filter(Boolean)[0] ?? null;
  const messagingRows = messagingResults.reduce((a, s) => a + (s.rows ?? 0), 0);
  const messagingError = messagingResults.map((s) => s.error).filter(Boolean)[0] ?? null;

  return {
    ok: !spendError,
    period: { from: range.fromDate, to: range.toDate, month: range.month },
    webhook_subscribed: webhook.subscribed,
    webhook_errors: webhook.errors,
    spend_rows: spendRows,
    spend_error: spendError,
    leads_rows: leads.inserted ?? leads.rows,
    leads_skipped_test: leads.skipped_test ?? 0,
    leads_errors: leads.errors,
    messaging_rows: messagingRows,
    messaging_error: messagingError,
  };
}

export const Route = createFileRoute("/api/public/hooks/sync-meta-spend")({
  server: {
    handlers: {
      GET: async ({ request }) => (await assertCronSecret(request)) ?? Response.json(await runMetaSync()),
      POST: async ({ request }) => (await assertCronSecret(request)) ?? Response.json(await runMetaSync()),
    },
  },
});
