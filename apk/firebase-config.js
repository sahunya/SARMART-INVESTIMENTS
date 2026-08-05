/* Firebase web configuration for SARMART INVESTIMENTS.
   This file contains public web-app identifiers, not an administrator password. */
window.SARMART_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDPqrtaCu5nUiAbt_KH9UP2JN3jCUyNbJ8',
  authDomain: 'sarma-investiments.firebaseapp.com',
  projectId: 'sarma-investiments',
  storageBucket: 'sarma-investiments.firebasestorage.app',
  messagingSenderId: '994931768752',
  appId: '1:994931768752:web:5c4c89fa01e6ff48daea75'
};

if (window.firebase && !firebase.apps.length) firebase.initializeApp(window.SARMART_FIREBASE_CONFIG);
