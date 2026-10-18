/** The decimal and thousands signs of a locale, as Vega's number formats want them, so axes match the app. */
export function numberLocale(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const of = (type: string, fallback: string) => parts.find((p) => p.type === type)?.value ?? fallback;
  return { decimal: of('decimal', '.'), thousands: of('group', ','), grouping: [3], currency: ['', ''], minus: of('minusSign', '-') };
}
