const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

function getPartsInTimezone(date: Date, tz: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function dateToLocalMidnightUTC(date: Date, tz: string): Date {
  const p = getPartsInTimezone(date, tz);
  const localDate = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  const offsetMs =
    localDate.getTime() -
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(localDate.getTime() - offsetMs);
}

function dateToLocalEndOfDayUTC(date: Date, tz: string): Date {
  const p = getPartsInTimezone(date, tz);
  const localDate = new Date(
    Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59, 999),
  );
  const offsetMs =
    localDate.getTime() -
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(localDate.getTime() - offsetMs);
}

export function getWorkshopDayRange(timezone?: string | null): {
  startUTC: Date;
  endUTC: Date;
} {
  const tz = timezone || DEFAULT_TIMEZONE;
  const now = new Date();

  return {
    startUTC: dateToLocalMidnightUTC(now, tz),
    endUTC: dateToLocalEndOfDayUTC(now, tz),
  };
}

export function getWorkshopNow(timezone?: string | null): Date {
  return new Date();
}
