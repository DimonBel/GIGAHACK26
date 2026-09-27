/** Email address checks. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A domain name as the server accepts it: medpark.md, medpark.local. */
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isDomain(value: string): boolean {
  return DOMAIN.test(value.trim());
}

/** Whether minutes may go to the address: its domain is one of domains (exactly, like the server), or domains is
 *  empty (any domain). */
export function inAllowedDomain(email: string, domains: string[]): boolean {
  const domain = normalizeEmail(email).split('@').pop() ?? '';
  return domains.length === 0 || domains.includes(domain);
}

/** "medpark.md or medpark.local", for hints and errors. */
export function domainList(domains: string[]): string {
  return domains.length > 1 ? `${domains.slice(0, -1).join(', ')} or ${domains[domains.length - 1]}` : domains.join('');
}
