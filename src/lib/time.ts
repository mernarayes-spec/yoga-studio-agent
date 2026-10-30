/** Returns `override` if provided, otherwise real Date.now().
 *  All fee/window logic must use this instead of new Date(). */
export function getNow(override?: Date): Date {
  return override ?? new Date();
}
