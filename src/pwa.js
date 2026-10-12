/** Register the conservative static-app service worker for secure web deployments. */
export async function registerPwa({ navigatorImpl = globalThis.navigator, locationImpl = globalThis.location } = {}) {
  if (import.meta.env.VITE_WEB_MODE !== true || !navigatorImpl?.serviceWorker || locationImpl?.protocol !== 'https:') return null;
  try {
    return await navigatorImpl.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    console.warn('OpenWave offline support could not be enabled.', error);
    return null;
  }
}
