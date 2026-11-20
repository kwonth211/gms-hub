import test from 'node:test';
import assert from 'node:assert/strict';
import { marketSharePath } from '../assets/market-share.js';

test('shared item links use published pages and preserve stat filters across fallback and fixed pages', () => {
  assert.equal(marketSharePath({ itemPath: '/ko/items/1472001-steel-titans/', id: 1472001, opt: 48 }), '/ko/items/1472001-steel-titans/?opt=48');
  assert.equal(marketSharePath({ marketPath: '/ko/tools/market/', id: 1472001, opt: 0 }), '/ko/tools/market/?item=1472001&opt=0');
  assert.equal(marketSharePath({ fixed: 1, pathname: '/en/items/example/', opt: null }), '/en/items/example/');
});
