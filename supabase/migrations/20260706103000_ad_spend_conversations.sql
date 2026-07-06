-- WhatsApp / messaging campaigns: store "conversation started" count from Meta Insights
ALTER TABLE public.ad_spend_daily
  ADD COLUMN IF NOT EXISTS conversations_started INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ad_spend_daily.conversations_started IS
  'Meta Insights: messaging_conversation_started_7d (Click-to-WhatsApp and similar)';
