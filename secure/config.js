// Firebase web identifiers are PUBLIC, not passwords. Rules enforce access.
window.EGY_CONFIG = {
  firebase: {apiKey:'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk',authDomain:'egygrillz-studio.firebaseapp.com',projectId:'egygrillz-studio',storageBucket:'egygrillz-studio.firebasestorage.app',messagingSenderId:'1022362401463',appId:'1:1022362401463:web:fec76b9c73e24d9cfeeb32'},
  region:'europe-west1',
  repository:{owner:'egygrillz',name:'egygriilz',branch:'main'},
  // REQUIRED before release: register this web app in Firebase App Check (reCAPTCHA v3).
  appCheckSiteKey:'REPLACE_WITH_RECAPTCHA_V3_SITE_KEY',
  // REQUIRED for push: Firebase Project settings > Cloud Messaging > Web Push certificates.
  vapidKey:'REPLACE_WITH_PUBLIC_VAPID_KEY'
};
