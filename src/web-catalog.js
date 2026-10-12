const INDEX_URL = '/catalog/world/index.v1.json';

export function createWebCatalog(fetchImpl = fetch) {
  let indexPromise;
  const countryPromises = new Map();

  async function getJSON(url) {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    return response.json();
  }

  function index() {
    if (!indexPromise) indexPromise = getJSON(INDEX_URL).catch(error => { indexPromise = null; throw error; });
    return indexPromise;
  }

  function country(code) {
    if (!/^[A-Z]{2}$/.test(code)) return Promise.reject(new Error('Invalid country code'));
    if (!countryPromises.has(code)) {
      const promise = getJSON(`/catalog/world/${code}.v1.json`).then(data => {
        if (data.version !== 1 || data.country?.code !== code || !Array.isArray(data.channels) || !Array.isArray(data.directory)) throw new Error('Invalid country catalog');
        return data;
      }).catch(error => { countryPromises.delete(code); throw error; });
      countryPromises.set(code, promise);
    }
    return countryPromises.get(code);
  }

  return { index, country };
}
