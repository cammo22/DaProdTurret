import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('install button survives asynchronous DOM event dispatch', async () => {
  const events = new Map();
  const buttonEvents = new Map();
  const button = { hidden: true, addEventListener: (name, fn) => buttonEvents.set(name, fn) };
  const source = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.PROD', 'false')
    .replaceAll('import.meta.env.BASE_URL', "'./'");
  runInNewContext(source, {
    window: { addEventListener: (name, fn) => events.set(name, fn) },
    document: { getElementById: () => button }, navigator: {}, console,
  });
  events.get('DOMContentLoaded')();
  let requested = false;
  events.get('beforeinstallprompt')({ preventDefault() {}, async prompt() { requested = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(button.hidden, false);
  const event = { currentTarget: button };
  const pending = buttonEvents.get('click')(event);
  // Browsers clear currentTarget when the dispatch callback returns.
  event.currentTarget = null;
  await pending;
  assert.equal(requested, true);
  assert.equal(button.hidden, true);
});
