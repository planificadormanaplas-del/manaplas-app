// Almacenamiento local de la app (IndexedDB): datos descargados, clave y lista de seguimiento.
// Funciona sin señal y no se borra al cerrar la app.
const DB = (() => {
  const NOMBRE = 'manaplas-app', TIENDA = 'kv';
  let conexion = null;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((ok, falla) => {
      const req = indexedDB.open(NOMBRE, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(TIENDA);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falla(req.error);
    });
    return conexion;
  }

  async function op(modo, fn) {
    const db = await abrir();
    return new Promise((ok, falla) => {
      const tx = db.transaction(TIENDA, modo);
      const req = fn(tx.objectStore(TIENDA));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => falla(tx.error);
    });
  }

  return {
    get: (clave) => op('readonly', s => s.get(clave)),
    set: (clave, valor) => op('readwrite', s => s.put(valor, clave)),
    del: (clave) => op('readwrite', s => s.delete(clave))
  };
})();
