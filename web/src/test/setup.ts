import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import i18n from '../i18n';

afterEach(() => cleanup());

// Tests read the English texts.
void i18n.changeLanguage('en');

// Browser APIs Mantine uses that jsdom does not implement.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
window.HTMLElement.prototype.scrollIntoView = () => undefined;
Object.defineProperty(document, 'fonts', {
  value: { addEventListener: () => undefined, removeEventListener: () => undefined },
});
