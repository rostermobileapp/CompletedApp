import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';

test('Payments keeps Stripe setup visible until ready, then offers working management', async () => {
  const bundle = await build({
    entryPoints: ['client/src/components/OrganizerStripeSetupCard.tsx'],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    packages: 'external', jsx: 'automatic',
  });
  const module = { exports: {} as any };
  new vm.Script(bundle.outputFiles[0].text).runInNewContext({
    module, exports: module.exports, require: createRequire(import.meta.url),
    console, process,
  });
  const Card = module.exports.OrganizerStripeSetupCard;
  let setupCalls = 0, manageCalls = 0;
  const props = {
    eligible: true, ready: false, collectionEnabled: false, pending: false,
    onSetup: () => { setupCalls++; },
    onManage: () => { manageCalls++; },
  };
  const button = (element: any): any => {
    if (!element || typeof element !== 'object') return undefined;
    if (element.props?.['data-testid']?.startsWith('button-')) return element;
    const children = element.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const result = button(child);
      if (result) return result;
    }
  };

  // No feature switch or collection readiness may hide setup from an eligible account.
  for (const collectionEnabled of [false, true]) {
    const element = Card({ ...props, collectionEnabled });
    const html = renderToStaticMarkup(element);
    assert.match(html, /Set up Stripe/);
    assert.doesNotMatch(html, /Manage Stripe info/);
    assert.equal(button(element).props.disabled, false);
    button(element).props.onClick();
  }
  assert.equal(setupCalls, 2);

  // Finishing onboarding changes the action; it does not remove the button.
  const completed = Card({ ...props, ready: true });
  const completedHtml = renderToStaticMarkup(completed);
  assert.match(completedHtml, /Manage Stripe info/);
  assert.doesNotMatch(completedHtml, />Set up Stripe</);
  assert.match(completedHtml, /Card collection is not enabled yet/);
  button(completed).props.onClick();
  assert.equal(manageCalls, 1);
  assert.equal(setupCalls, 2);
  assert.equal(button(Card({ ...props, pending: true })).props.disabled, true);
  assert.equal(Card({ ...props, eligible: false }), null);
});
