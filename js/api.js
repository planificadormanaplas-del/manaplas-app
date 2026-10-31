// Comunicación con la API (Apps Script). Toda la app pasa por aquí.
const API = (() => {
  async function pedir(params, msMax = 30000) {
    const url = (await DB.get('apiUrl')) || APP_CONFIG.API_URL;
    if (!url) throw new Error('Falta configurar la dirección de la API (Ajustes).');
    const qs = new URLSearchParams(params).toString();
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), msMax);
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + qs, { signal: ctrl.signal, redirect: 'follow' });
      if (!r.ok) throw new Error('La API respondió ' + r.status);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Error de la API');
      return j;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('La API tardó demasiado en responder.');
      throw e;
    } finally {
      clearTimeout(reloj);
    }
  }

  return {
    ping: () => pedir({ api: 'ping' }, 15000),
    datos: (clave, fresco) => pedir({ api: 'datos', clave, ...(fresco ? { fresco: '1' } : {}) }, 60000)
  };
})();
