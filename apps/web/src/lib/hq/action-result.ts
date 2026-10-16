/** What every dashboard server action returns to its form. Messages are i18n keys. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; fields?: Record<string, string>; message?: string; params?: Record<string, string | number> };

export const initialActionResult: ActionResult | null = null;
