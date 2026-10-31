/**
 * API · Manaplas Planificación (app instalable)
 * ------------------------------------------------------------
 * Proyecto Apps Script INDEPENDIENTE (no va dentro de ninguna hoja).
 * La app del teléfono solo habla con esta API. Si mañana los datos
 * pasan de Google Sheets a una base de datos, se cambia este archivo
 * y la app no se toca.
 *
 * Lecturas (GET):
 *   <URL /exec>?api=ping                      -> estado (sin clave)
 *   <URL /exec>?api=datos&clave=XXXX           -> todos los productos (desde caché)
 *   <URL /exec>?api=datos&clave=XXXX&fresco=1  -> fuerza a recalcular
 *
 * Respuesta: { ok:true, version, data } o { ok:false, error }
 *
 * Instalación (una sola vez):
 *   1) ⚙ Configuración del proyecto > Propiedades de la secuencia de comandos:
 *        agregar  CLAVE_APP = (tu clave).  Luego ejecutar verificarClave().
 *   2) Ejecutar  instalarDisparador()  -> recalcula cada 10 min.
 *   3) Implementar > Nueva implementación > Aplicación web
 *        Ejecutar como: Yo   ·   Acceso: Cualquier persona
 */

const VERSION_API = '1.0.0';

// Archivos fuente
const ID_MPS = '12jKC01EUcIg9bpTMJ6i3MzBrBrgYiv8g1EYES3PF4Mo';        // MPS
const ID_SEGUIMIENTO = '1ypAmmdEtWpYUEHPN8kdCbVHV9ZtDqJfTdTJp8kVTyEs'; // Seguimiento de OP

// Estructura de la hoja MPS: bloques de 6 filas desde la fila 11, meses en I (jun-2026) .. AA (dic-2027)
const MPS_RANGO = 'A11:AA2422';
const MPS_COL_JUN26 = 8;   // índice (0 = A) de la columna I
const MESES_MPS = 5;       // meses que se muestran desde el mes en curso
const OP_CERRADAS = 3;     // últimas OP cerradas que se muestran por producto

const CACHE_SEG = 15 * 60; // la caché vive 15 min (el disparador la refresca cada 10)
const TROZO = 40000;       // caracteres por trozo de caché (límite de Google: 100 KB por valor)

// ============================================================ Entrada

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.api === 'ping') {
      return salida_({ ok: true, version: VERSION_API, hora: new Date().toISOString() });
    }
    if (!claveValida_(p.clave)) return salida_({ ok: false, error: 'Clave incorrecta' });

    if (p.api === 'datos') {
      const txt = p.fresco === '1' ? recalcular() : (leerCache_() || recalcular());
      // Se arma el texto a mano para no volver a convertir el JSON grande
      return ContentService
        .createTextOutput('{"ok":true,"version":"' + VERSION_API + '","data":' + txt + '}')
        .setMimeType(ContentService.MimeType.JSON);
    }
    return salida_({ ok: false, error: 'Consulta desconocida: ' + p.api });
  } catch (err) {
    return salida_({ ok: false, error: String(err && err.message || err) });
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================ Clave

/** La clave NO se escribe en el código (el repositorio es público).
 *  Se guarda en: Configuración del proyecto (⚙) > Propiedades de la secuencia de comandos
 *  Propiedad: CLAVE_APP   Valor: la clave que quieras. */
function verificarClave() {
  const ok = PropertiesService.getScriptProperties().getProperty('CLAVE_APP');
  Logger.log(ok ? 'Clave configurada (' + ok.length + ' caracteres).' : 'FALTA crear la propiedad CLAVE_APP.');
}

function claveValida_(clave) {
  const ok = PropertiesService.getScriptProperties().getProperty('CLAVE_APP');
  return !!ok && String(clave || '') === ok;
}

// ============================================================ Caché

/** Arma los datos, los guarda en caché y devuelve el texto JSON. */
function recalcular() {
  const txt = JSON.stringify(construirDatos_());
  const cache = CacheService.getScriptCache();
  const n = Math.ceil(txt.length / TROZO);
  const lote = { datos_n: String(n) };
  for (let i = 0; i < n; i++) lote['datos_' + i] = txt.substr(i * TROZO, TROZO);
  cache.putAll(lote, CACHE_SEG);
  return txt;
}

function leerCache_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('datos_n'));
  if (!n) return null;
  const claves = [];
  for (let i = 0; i < n; i++) claves.push('datos_' + i);
  const trozos = cache.getAll(claves);
  let txt = '';
  for (const k of claves) {
    if (trozos[k] == null) return null;
    txt += trozos[k];
  }
  return txt;
}

function instalarDisparador() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'recalcular')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('recalcular').timeBased().everyMinutes(10).create();
  recalcular();
  Logger.log('Disparador instalado: recalcula cada 10 minutos.');
}

// ============================================================ Datos

function construirDatos_() {
  const tz = Session.getScriptTimeZone();
  const libroMps = SpreadsheetApp.openById(ID_MPS);
  const ss = hoja_(libroMps, 'Stock de Seguridad').getDataRange().getValues();
  const invQuery = hoja_(libroMps, 'Inv Query').getDataRange().getValues();
  const cortes = hoja_(libroMps, 'Inventario MPS').getDataRange().getValues();
  const mps = hoja_(libroMps, 'MPS').getRange(MPS_RANGO).getValues();
  const ops = hoja_(SpreadsheetApp.openById(ID_SEGUIMIENTO), 'Resumen de OP').getDataRange().getValues();

  // --- Meses a mostrar (desde el mes en curso)
  const hoy = new Date();
  const meses = [];
  for (let k = 0; k < MESES_MPS; k++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1);
    meses.push(Utilities.formatDate(d, tz, 'yyyy-MM'));
  }
  const colMes = meses.map(m => {
    const y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7));
    return MPS_COL_JUN26 + (y - 2026) * 12 + (mm - 6);
  });

  // --- Inventario de hoy (Inv Query: A = Sku, D = Existencia Real)
  const invHoy = {};
  invQuery.slice(1).forEach(r => { const c = txt_(r[0]); if (c) invHoy[c] = num_(r[3]); });

  // --- Último corte por producto (Inventario MPS: A = código, D.. = cortes)
  const encCortes = cortes[0] || [];
  const corte = {};
  cortes.slice(1).forEach(r => {
    const c = txt_(r[0]); if (!c) return;
    for (let j = r.length - 1; j >= 3; j--) {
      if (r[j] !== '' && r[j] !== null) {
        corte[c] = { mes: txt_(encCortes[j]).replace(/^Inventario\s*/i, ''), v: num_(r[j]) };
        break;
      }
    }
  });

  // --- MPS por producto (bloques de 6 filas)
  const mpsPorCod = {};
  for (let i = 0; i + 5 < mps.length; i += 6) {
    const c = txt_(mps[i][0]); if (!c || mpsPorCod[c]) continue;
    mpsPorCod[c] = {
      nombre: txt_(mps[i][1]),
      cob: num_(mps[i + 1][6]),
      meses: colMes.map(col => col >= 0 && col <= 26 ? {
        i: num_(mps[i + 1][col]),     // inventario inicial
        d: num_(mps[i + 2][col]),     // pronóstico de ventas
        f: num_(mps[i + 3][col]),     // inventario final
        p: num_(mps[i + 4][col]),     // producción planificada
        s: txt_(mps[i + 5][col])      // estado
      } : null)
    };
  }

  // --- OP (Resumen de OP)
  const opsPorCod = {};
  ops.slice(1).forEach(r => {
    const cod = txt_(r[2]); if (!cod) return;
    const op = {
      op: txt_(r[1]), maq: txt_(r[0]), cod: cod, comp: txt_(r[4]),
      emi: fecha_(r[5], tz), ini: fecha_(r[6], tz), fin: fecha_(r[7], tz),
      cerrada: r[8] === true || txt_(r[8]).toUpperCase() === 'TRUE',
      uni: num_(r[9]), prod: num_(r[10]), buenas: num_(r[11]), clas: txt_(r[12]),
      _orden: r[5] instanceof Date ? r[5].getTime() : 0
    };
    (opsPorCod[cod] = opsPorCod[cod] || []).push(op);
  });
  const opsDe = (cod) => {
    const base = cod.split('-')[0];
    let lista = (opsPorCod[cod] || []).concat(base !== cod ? (opsPorCod[base] || []) : []);
    lista.sort((a, b) => b._orden - a._orden);
    const abiertas = lista.filter(o => !o.cerrada);
    const cerradas = lista.filter(o => o.cerrada).slice(0, OP_CERRADAS);
    return abiertas.concat(cerradas).map(o => {
      const copia = Object.assign({}, o); delete copia._orden; return copia;
    });
  };

  // --- Productos (base: Stock de Seguridad; se agregan los que solo estén en el MPS)
  const productos = [];
  const vistos = {};
  ss.slice(1).forEach(r => {
    const c = txt_(r[1]); if (!c || vistos[c]) return;
    vistos[c] = true;
    productos.push(producto_(c, {
      n: txt_(r[2]), est: txt_(r[3]), a: txt_(r[4]), r: num_(r[6]), mi: num_(r[7]),
      pv: num_(r[9]), ss: num_(r[10]), so: num_(r[11]), eop: txt_(r[12]), u: txt_(r[16])
    }));
  });
  Object.keys(mpsPorCod).forEach(c => {
    if (vistos[c]) return;
    vistos[c] = true;
    productos.push(producto_(c, { n: mpsPorCod[c].nombre }));
  });

  function producto_(c, base) {
    const m = mpsPorCod[c];
    return Object.assign({ c: c }, base, {
      inv: c in invHoy ? invHoy[c] : null,
      corte: corte[c] || null,
      cob: m ? m.cob : null,
      mps: m ? m.meses : null,
      ops: opsDe(c)
    });
  }

  return {
    generado: new Date().toISOString(),
    meses: meses,
    productos: productos
  };
}

// ============================================================ Utilidades

function hoja_(libro, nombre) {
  const h = libro.getSheetByName(nombre);
  if (!h) throw new Error('No encuentro la hoja "' + nombre + '" en ' + libro.getName());
  return h;
}

function txt_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function num_(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const s = txt_(v);
  if (!s) return 0;
  const n = Number(s.replace(/\s/g, '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function fecha_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return txt_(v);
}

/** Prueba desde el editor: muestra el tamaño y un producto de ejemplo. */
function probar() {
  const t = Date.now();
  const d = construirDatos_();
  Logger.log('Productos: ' + d.productos.length + ' · ' + (Date.now() - t) + ' ms · ' +
    Math.round(JSON.stringify(d).length / 1024) + ' KB');
  Logger.log(JSON.stringify(d.productos.find(p => p.c === '7090-0') || d.productos[0], null, 2));
}
