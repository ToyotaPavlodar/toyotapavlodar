import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type DatePeriod,
  periodLabelRu,
  shiftPeriodByLength,
  thisMonthPeriod,
  lastMonthPeriod,
  todayPeriod,
  yesterdayPeriod,
  todayUtcDate,
} from "@/lib/month-range";
import { cn } from "@/lib/utils";

type Props = {
  value: DatePeriod;
  onChange: (period: DatePeriod) => void;
  className?: string;
  showLabel?: boolean;
};

function parseUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periodToRange(period: DatePeriod): DateRange {
  return { from: parseUtcDate(period.from), to: parseUtcDate(period.to) };
}

function rangeToPeriod(range: DateRange | undefined): DatePeriod | null {
  if (!range?.from) return null;
  const from = toIsoDate(range.from);
  const to = toIsoDate(range.to ?? range.from);
  return { from, to };
}

const PRESETS: { label: string; get: () => DatePeriod }[] = [
  { label: "Этот месяц", get: thisMonthPeriod },
  { label: "Прошлый месяц", get: lastMonthPeriod },
  { label: "Сегодня", get: todayPeriod },
  { label: "Вчера", get: yesterdayPeriod },
];

export function PeriodPicker({ value, onChange, className, showLabel = true }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(() => periodToRange(value));

  const label = useMemo(() => periodLabelRu(value.from, value.to), [value.from, value.to]);
  const today = todayUtcDate();
  const canGoForward = value.to < today;
  const isSingleDay = value.from === value.to;

  function openPicker() {
    setDraft(periodToRange(value));
    setOpen(true);
  }

  function applyDraft() {
    const next = rangeToPeriod(draft);
    if (!next) return;
    if (next.to > today) next.to = today;
    if (next.from > next.to) next.from = next.to;
    onChange(next);
    setOpen(false);
  }

  function applyPreset(get: () => DatePeriod) {
    const p = get();
    onChange(p);
    setDraft(periodToRange(p));
    setOpen(false);
  }

  function shift(direction: -1 | 1) {
    onChange(shiftPeriodByLength(value.from, value.to, direction));
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {showLabel && (
        <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Период
        </span>
      )}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-xs">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => shift(-1)}
          title="Предыдущий период"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) openPicker();
            else setOpen(false);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-9 min-w-[210px] justify-between gap-2 border-primary/20 bg-primary/5 px-3 text-sm font-semibold hover:bg-primary/10"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate capitalize">{label}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
            <div className="border-b border-border/60 bg-muted/30 p-3">
              <div className="mb-2 text-xs font-semibold text-foreground">Быстрый выбор</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    variant="outline"
                    size="sm"
                    className="h-8 justify-start bg-background text-xs"
                    onClick={() => applyPreset(p.get)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                В календаре: один клик — день, два клика — период. Затем «Применить».
              </p>
            </div>
            <Calendar
              mode="range"
              captionLayout="dropdown"
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: parseUtcDate(today) }}
              defaultMonth={draft.from ?? parseUtcDate(value.from)}
              numberOfMonths={1}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 p-3">
              <div className="min-w-0 text-xs text-muted-foreground">
                {draft.from ? (
                  <span className="font-medium text-foreground">
                    {periodLabelRu(toIsoDate(draft.from), toIsoDate(draft.to ?? draft.from))}
                  </span>
                ) : (
                  "Выберите день или период"
                )}
              </div>
              <Button size="sm" onClick={applyDraft} disabled={!draft.from}>
                Применить
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => shift(1)}
          disabled={!canGoForward}
          title={canGoForward ? "Следующий период" : "Нельзя смотреть будущее"}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {isSingleDay && (
        <span className="px-0.5 text-[10px] text-muted-foreground">Один день</span>
      )}
    </div>
  );
}

/** @deprecated use PeriodPicker */
export const DashboardPeriodPicker = PeriodPicker;
