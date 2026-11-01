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
 *   <URL /exec>?api=datos&clave=XXXX           -> productos, piezas y máquinas (desde caché)
 *   <URL /exec>?api=datos&clave=XXXX&fresco=1  -> fuerza a recalcular
 *   <URL /exec>?api=notas&clave=XXXX           -> todas las notas
 *
 * Escrituras (POST, cuerpo JSON como texto):
 *   { "accion": "guardarNota", "clave": "...", "nota": { id, fecha, autor, etiqueta, producto, maquina, texto, estado } }
 *   (si el id ya existe, la actualiza; si no, la agrega)
 *
 * Las notas se guardan en la hoja "Notas" del archivo "App Manaplas · Registros",
 * que la API crea sola la primera vez (en el Drive de la cuenta que la implementó).
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

const VERSION_API = '1.2.0';

// Archivos fuente
const ID_MPS = '12jKC01EUcIg9bpTMJ6i3MzBrBrgYiv8g1EYES3PF4Mo';        // MPS
const ID_SEGUIMIENTO = '1ypAmmdEtWpYUEHPN8kdCbVHV9ZtDqJfTdTJp8kVTyEs'; // Seguimiento de OP
const ID_BD = '1koJFsuSpleLc1xCc8RnfZFzQyQGj_xlgwmgr0NUGMlM';          // Base de Datos Planificación

// Notas
const ENC_NOTAS = ['ID', 'Fecha', 'Autor', 'Etiqueta', 'Producto', 'Máquina', 'Nota', 'Estado', 'Actualizado'];
const ETIQUETAS = ['General', 'Color', 'Molde', 'Material', 'Inventario', 'Producción', 'Máquina'];

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
    if (p.api === 'notas') return salida_({ ok: true, version: VERSION_API, data: leerNotas_() });
    return salida_({ ok: false, error: 'Consulta desconocida: ' + p.api });
  } catch (err) {
    return salida_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!claveValida_(b.clave)) return salida_({ ok: false, error: 'Clave incorrecta' });
    if (b.accion === 'guardarNota') return salida_({ ok: true, version: VERSION_API, data: guardarNota_(b.nota || {}) });
    return salida_({ ok: false, error: 'Acción desconocida: ' + b.accion });
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
  const libroSeg = SpreadsheetApp.openById(ID_SEGUIMIENTO);
  const ops = hoja_(libroSeg, 'Resumen de OP').getDataRange().getValues();
  const registro = hoja_(libroSeg, 'Registro').getDataRange().getValues();
  const libroBd = SpreadsheetApp.openById(ID_BD);
  const comp = hoja_(libroBd, 'Componentes').getRange('A1:N').getValues();
  const maqs = hoja_(libroBd, 'Maquinas/Producto').getRange('A1:F').getValues();

  // --- Máquinas (Base de Datos: A N°, B categoría, C capacidad, D tipo, E ubicación, F estatus)
  const maquinas = maqs.slice(1).filter(r => txt_(r[0])).map(r => ({
    n: txt_(r[0]), cat: txt_(r[1]), cap: typeof r[2] === 'number' ? r[2] : null,
    tipo: txt_(r[3]), lin: txt_(r[4]), est: txt_(r[5])
  }));

  // --- Piezas por producto base (Componentes: B cód. pieza, C sku, D parte, E nombre, J MP, K peso, L ton, M ciclo, N cavidades)
  const piezasPorBase = {};
  comp.slice(1).forEach(r => {
    const cp = txt_(r[1]); if (!cp) return;
    const base = txt_(r[2]).slice(0, 4) || cp.slice(0, 4);
    const ton = txt_(r[11]);
    (piezasPorBase[base] = piezasPorBase[base] || []).push({
      cod: cp, parte: txt_(r[3]), nom: txt_(r[4]), mp: txt_(r[9]),
      peso: num_(r[10]), ton: ton, ciclo: num_(r[12]), cav: num_(r[13]),
      maq: maquinasCompatibles_(ton, maquinas)
    });
  });

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
  const opsAbiertas = [];
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
    if (!op.cerrada) { const a = Object.assign({}, op); delete a._orden; opsAbiertas.push(a); }
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
    productos: productos,
    maquinas: maquinas,
    opsAbiertas: opsAbiertas,
    estadoMaq: estadoMaquinas_(registro),
    piezas: piezasPorBase          // piezas por código base (4 primeros dígitos del producto)
  };
}

/** Estatus actual de cada máquina según la hoja Registro del Seguimiento de OP
 *  (C = COD, D = producto, M = máquina, N = estatus). Las filas cerradas (OC) y en cola (EC) no cuentan;
 *  si una máquina tiene varias, gana la más importante para planta. */
const PRIORIDAD_EST = ['CM', 'FALLA', 'MANTENIMIENTO', 'FO', 'FPM', 'P', 'PA', 'PRUEBA', 'SIN OP'];
function estadoMaquinas_(registro) {
  const res = {};
  registro.slice(1).forEach(r => {
    const maq = txt_(r[12]), est = txt_(r[13]);
    if (!maq || !est) return;
    const cod = est.toUpperCase().split(' ')[0];
    const clave = /^SIN OP/i.test(est) ? 'SIN OP' : (/^FALLA/i.test(est) ? 'FALLA' : (/^MANTENIMIENTO/i.test(est) ? 'MANTENIMIENTO' : (/^PRUEBA/i.test(est) ? 'PRUEBA' : cod)));
    const pr = PRIORIDAD_EST.indexOf(clave);
    if (pr < 0) return;                        // OC, EC u otros
    const actual = res[maq];
    if (!actual || pr < actual._pr) res[maq] = { est: est, cod: txt_(r[2]), prod: txt_(r[3]), _pr: pr };
  });
  Object.values(res).forEach(v => delete v._pr);
  return res;
}

/** Regla de tonelaje: la pieza va en máquinas de su misma centena y nunca en una más pequeña.
 *  300 -> 300, 310 · 400 -> 440, 450 · 500 -> 550, 580 · 220 -> 220, 225.
 *  "SOP" -> sopladoras. Sin dato o fuera de rango -> lista vacía (consultar con Moldes). */
function maquinasCompatibles_(ton, maquinas) {
  const t = String(ton || '').trim().toUpperCase();
  if (/^SOP/.test(t)) return maquinas.filter(m => /sopladora/i.test(m.cat)).map(m => m.n);
  const n = Number(t);
  if (!t || isNaN(n) || n <= 0) return [];
  return maquinas
    .filter(m => /inyectora/i.test(m.cat) && m.cap && m.cap >= n && Math.floor(m.cap / 100) === Math.floor(n / 100))
    .map(m => m.n);
}

// ============================================================ Notas

function hojaNotas_() {
  const props = PropertiesService.getScriptProperties();
  let libro = null;
  const id = props.getProperty('ID_REGISTROS');
  if (id) { try { libro = SpreadsheetApp.openById(id); } catch (e) { libro = null; } }
  if (!libro) {
    libro = SpreadsheetApp.create('App Manaplas · Registros');
    props.setProperty('ID_REGISTROS', libro.getId());
  }
  let h = libro.getSheetByName('Notas');
  if (!h) {
    h = libro.getSheets().length === 1 && libro.getSheets()[0].getLastRow() === 0
      ? libro.getSheets()[0].setName('Notas') : libro.insertSheet('Notas');
    h.getRange(1, 1, 1, ENC_NOTAS.length).setValues([ENC_NOTAS]).setFontWeight('bold').setBackground('#1BACEE').setFontColor('#FFFFFF');
    h.setFrozenRows(1);
    h.setColumnWidth(7, 420);
  }
  return h;
}

function leerNotas_() {
  const h = hojaNotas_();
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  const tz = Session.getScriptTimeZone();
  const iso = (v) => v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ssXXX") : txt_(v);
  return h.getRange(2, 1, n, ENC_NOTAS.length).getValues()
    .filter(r => txt_(r[0]))
    .map(r => ({
      id: txt_(r[0]), fecha: iso(r[1]), autor: txt_(r[2]), etiqueta: txt_(r[3]),
      producto: txt_(r[4]), maquina: txt_(r[5]), texto: txt_(r[6]), estado: txt_(r[7]) || 'Pendiente',
      actualizado: iso(r[8])
    }))
    .sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
}

function guardarNota_(nota) {
  const id = txt_(nota.id);
  const texto = txt_(nota.texto).slice(0, 4000);
  if (!id || !texto) throw new Error('La nota necesita id y texto.');
  const fila = [
    id,
    nota.fecha ? new Date(nota.fecha) : new Date(),
    txt_(nota.autor).slice(0, 80),
    ETIQUETAS.indexOf(nota.etiqueta) >= 0 ? nota.etiqueta : 'General',
    txt_(nota.producto).slice(0, 20),
    txt_(nota.maquina).slice(0, 10),
    texto,
    nota.estado === 'Resuelta' ? 'Resuelta' : 'Pendiente',
    new Date()
  ];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const h = hojaNotas_();
    const encontrada = h.getLastRow() > 1
      ? h.getRange(2, 1, h.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext()
      : null;
    if (encontrada) h.getRange(encontrada.getRow(), 1, 1, fila.length).setValues([fila]);
    else h.appendRow(fila);
  } finally {
    lock.releaseLock();
  }
  return { id: id, guardada: new Date().toISOString() };
}

/** Prueba desde el editor: crea (o abre) el archivo de notas y muestra su enlace. */
function probarNotas() {
  const h = hojaNotas_();
  Logger.log('Archivo de notas: ' + h.getParent().getUrl());
  Logger.log('Notas guardadas: ' + leerNotas_().length);
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
  Logger.log('Máquinas: ' + d.maquinas.length + ' · OP abiertas: ' + d.opsAbiertas.length);
  const ej = d.productos.find(p => p.c.indexOf('6535') === 0) || d.productos[0];
  Logger.log(JSON.stringify({ c: ej.c, n: ej.n, piezas: d.piezas[ej.c.slice(0, 4)] }, null, 2));
}
