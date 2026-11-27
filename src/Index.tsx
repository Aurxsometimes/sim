// organize-imports-ignore
// We want our main CSS to load before all other CSS.
import './app/main.scss';
// Pull the sheet CSS up so it is at the top of the stylesheet and can be easily overridden.
import './app/dim-ui/Sheet.m.scss';
import './app/utils/sentry';
import { createSaveAccountsObserver } from 'app/accounts/observers';
import {
  createItemSizeObserver,
  createOrnamentDisplayObserver,
  createThemeObserver,
  createTilesPerCharColumnObserver,
  setCssVariableEventListeners,
} from 'app/css-variables';
import { loadDimApiData } from 'app/dim-api/actions';
import store from 'app/store/store';
import { lazyLoadStreamDeck, startStreamDeckConnection } from 'app/stream-deck/stream-deck';
import { infoLog } from 'app/utils/log';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { StorageBroken, storageTest } from './StorageTest';
import Root from './app/Root';
import setupRateLimiter from './app/bungie-api/rate-limit-config';
import { initGoogleAnalytics } from './app/google';
import { createLanguageObserver, initi18n } from './app/i18n';
import registerServiceWorker from './app/register-service-worker';
import { safariTouchFix } from './app/safari-touch-fix';
import { createWishlistObserver } from './app/wishlists/observers';
import { observe } from 'app/store/observerMiddleware';

// Bungie's login code should be handled by return.html, never by the app itself.
const authParams = new URLSearchParams(window.location.search);
if (authParams.get('code') && authParams.get('state')) {
  if (window.location.pathname.startsWith(`${$PUBLIC_PATH}return`)) {
    // An old service worker served the app in place of /return (Cloudflare drops ".html").
    // Remove it and reload so the real return page loads and finishes the login.
    void navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .finally(() => window.location.reload());
  } else {
    // The Bungie app's Redirect URL points at the site root instead of return.html
    window.location.replace(`${$PUBLIC_PATH}return.html${window.location.search}`);
  }
}

// A short loadout link (/s/<id>) that an older cached copy of SIM served as the app:
// look the loadout up and open it the way the link would have.
const shortLink = window.location.pathname.match(/^\/s\/([\w-]{8,12})\/?$/);
if (shortLink) {
  void fetch(`${$PUBLIC_PATH}api/share/${shortLink[1]}`)
    .then((r) => r.json() as Promise<{ data?: string }>)
    .catch(() => ({ data: undefined }))
    .then(({ data }) =>
      window.location.replace(`${$PUBLIC_PATH}loadouts${data ? `?s=${data}` : ''}`),
    );
}

infoLog(
  'app',
  `DIM v${$DIM_VERSION} (${$DIM_FLAVOR}) - Please report any errors to https://www.github.com/DestinyItemManager/DIM/issues`,
);

if ($featureFlags.googleAnalytics) {
  initGoogleAnalytics();
}
safariTouchFix();

if ($DIM_FLAVOR !== 'dev') {
  registerServiceWorker();
}

setupRateLimiter();

const i18nPromise = initi18n();

(async () => {
  const root = createRoot(document.getElementById('app')!);

  // Block on testing that we can use LocalStorage and IDB, before everything starts trying to use it
  const storageWorks = await storageTest();
  if (!storageWorks) {
    // Make sure localization is loaded
    await i18nPromise;
    root.render(
      <Provider store={store}>
        <StorageBroken />
      </Provider>,
    );
    return;
  }

  if ($featureFlags.wishLists) {
    store.dispatch(observe(createWishlistObserver()));
  }
  store.dispatch(observe(createSaveAccountsObserver()));
  store.dispatch(observe(createItemSizeObserver()));
  store.dispatch(observe(createOrnamentDisplayObserver()));
  store.dispatch(observe(createThemeObserver()));
  store.dispatch(observe(createTilesPerCharColumnObserver()));
  setCssVariableEventListeners();

  store.dispatch(loadDimApiData());

  if ($featureFlags.elgatoStreamDeck && store.getState().streamDeck.enabled) {
    await lazyLoadStreamDeck();
    store.dispatch(startStreamDeckConnection());
  }

  // Make sure localization is loaded
  await i18nPromise;

  // Update the language in both i18n and local storage when the user
  // changes the language setting.
  store.dispatch(observe(createLanguageObserver()));

  root.render(<Root />);
})();
