/** Host checks for the delivery settings, mirroring the server's rule. */

const LOOPBACK_V4 = /^127(\.\d{1,3}){3}$/;

/** localhost or a loopback address: the server only delivers mail on this machine. */
export function isLocalHost(host: string): boolean {
  const name = host
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return name === 'localhost' || name === '::1' || LOOPBACK_V4.test(name);
}

/** The host of a URL, or '' when it is not a valid URL. */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
