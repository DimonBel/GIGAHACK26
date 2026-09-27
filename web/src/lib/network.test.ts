import { describe, expect, it } from 'vitest';

import { isLocalHost, urlHost } from './network';

describe('isLocalHost', () => {
  it('accepts this machine only, like the server', () => {
    for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) expect(isLocalHost(host)).toBe(true);
    for (const host of ['smtp.gmail.com', '10.0.0.5', 'mailhog', '']) expect(isLocalHost(host)).toBe(false);
  });

  it('reads the host of a webhook URL', () => {
    expect(urlHost('http://127.0.0.1:5678/webhook/secure-mom')).toBe('127.0.0.1');
    expect(urlHost('not a url')).toBe('');
  });
});
