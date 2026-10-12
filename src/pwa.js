/** Keep the installed web app current without interrupting a playing channel. */
export async function registerPwa({ navigatorImpl = globalThis.navigator, locationImpl = globalThis.location, documentImpl = globalThis.document, onUpdate = () => {} } = {}) {
  if (import.meta.env.VITE_WEB_MODE !== true || !navigatorImpl?.serviceWorker || locationImpl?.protocol !== 'https:') return null;
  try {
    const serviceWorker = navigatorImpl.serviceWorker;
    if (serviceWorker.controller) serviceWorker.addEventListener('controllerchange', onUpdate);
    const registration = await serviceWorker.register('/sw.js', { scope: '/' });
    let lastCheck = 0;
    const check = () => {
      if (documentImpl?.hidden || Date.now() - lastCheck < 5 * 60 * 1000) return;
      lastCheck = Date.now();
      registration.update().catch(() => {});
    };
    check();
    documentImpl?.addEventListener('visibilitychange', check);
    return registration;
  } catch (error) {
    console.warn('OpenWave offline support could not be enabled.', error);
    return null;
  }
}
