import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../assets/google-consent.js', import.meta.url), 'utf8');
function setup() {
  const window = {};
  vm.runInNewContext(code, {window});
  return {window, events: () => Array.from(window.dataLayer, args => JSON.parse(JSON.stringify([...args]))),
    ready: () => window.googlefc.callbackQueue[0].CONSENT_MODE_DATA_READY()};
}
test('the first event has an explicit advertising-data state without fabricating sessions or disabling analytics cookies', () => {
  const s=setup();
  s.window.gtag('config','G-TEST');
  assert.deepEqual(s.events(), [['consent','default',{ad_user_data:'denied',wait_for_update:500}],['config','G-TEST']]);
  assert.equal(s.window.gtag_enable_tcf_support,true);
});
test('only an explicit CMP decision updates consent; unknown, not-applicable and unconfigured are not grants', () => {
  const s=setup(), fc=s.window.googlefc;
  fc.ConsentModePurposeStatusEnum={GRANTED:1,DENIED:2};
  for (const value of [0,3,4,undefined]) {
    fc.getGoogleConsentModeValues=()=>({adUserDataPurposeConsentStatus:value});s.ready();
  }
  assert.equal(s.events().length,1);
  for (const value of [1,2]) {
    fc.getGoogleConsentModeValues=()=>({adUserDataPurposeConsentStatus:value});s.ready();
  }
  assert.deepEqual(s.events().slice(1),[['consent','update',{ad_user_data:'granted'}],['consent','update',{ad_user_data:'denied'}]]);
  fc.getGoogleConsentModeValues=()=>{throw Error('blocked')};
  assert.doesNotThrow(s.ready);assert.equal(s.events().length,3);
});
