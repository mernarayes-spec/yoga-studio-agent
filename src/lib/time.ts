/** Returns `override` if provided, then checks DEMO_NOW env var,
 *  otherwise real Date.now().
 *  All fee/window logic must use this instead of new Date(). */
export function getNow(override?: Date): Date {
  if (override) return override;
  const envNow = process.env.DEMO_NOW;
  if (envNow) return new Date(envNow);
  return new Date();
}
