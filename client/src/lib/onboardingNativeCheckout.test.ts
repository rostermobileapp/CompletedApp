import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualSavings,
  onboardingProductId,
} from './onboardingNativeProducts';

test('each paid choice resolves to the existing native bridge package', () => {
  assert.equal(onboardingProductId('player_pro', 'monthly'), 'player_pro_monthly');
  assert.equal(onboardingProductId('player_pro', 'yearly'), 'player_pro_yearly');
  assert.equal(onboardingProductId('commissioner', 'monthly'), 'commissioner_monthly');
  assert.equal(onboardingProductId('commissioner', 'yearly'), 'commissioner_yearly');
});

test('yearly savings require numeric prices of the same store currency', () => {
  const products = [
    { identifier: 'player_pro_monthly', priceString: '€5,99', amount: 5.99, currencyCode: 'EUR' },
    { identifier: 'player_pro_yearly', priceString: '€59,99', amount: 59.99, currencyCode: 'EUR' },
    { identifier: 'commissioner_monthly', priceString: '$9.99', amount: 9.99, currencyCode: 'USD' },
    { identifier: 'commissioner_yearly', priceString: '€99,99', amount: 99.99, currencyCode: 'EUR' },
  ];
  assert.equal(annualSavings(products, 'player_pro'), 17);
  assert.equal(annualSavings(products, 'commissioner'), undefined);
  assert.equal(annualSavings(products.slice(0, 1), 'player_pro'), undefined);
  assert.equal(annualSavings([{ ...products[0], amount: undefined }, products[1]], 'player_pro'), undefined);
});