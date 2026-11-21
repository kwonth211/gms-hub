// Inlined before both Google tags: the first GA hit must already have ad_user_data.
// Advertising user data is optional for ordinary session/page-view measurement.
// Unknown or unconfigured CMP values must never be treated as visitor consent.
(function (w) {
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
  w.gtag_enable_tcf_support = true;
  w.gtag('consent', 'default', { ad_user_data: 'denied', wait_for_update: 500 });
  w.googlefc = w.googlefc || {};
  w.googlefc.callbackQueue = w.googlefc.callbackQueue || [];
  w.googlefc.callbackQueue.push({ CONSENT_MODE_DATA_READY: function () {
    try {
      var fc = w.googlefc, status = fc.getGoogleConsentModeValues().adUserDataPurposeConsentStatus;
      var values = fc.ConsentModePurposeStatusEnum;
      if (values && typeof status === 'number' && (status === values.GRANTED || status === values.DENIED)) {
        w.gtag('consent', 'update', { ad_user_data: status === values.GRANTED ? 'granted' : 'denied' });
      }
    } catch (_) { /* Keep the safe default if the CMP is unavailable. */ }
  } });
})(window);
