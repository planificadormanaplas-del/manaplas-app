// Manaplas · Planificación — lógica de la app
(() => {
  'use strict';

  // ============================================================ Estado
  const E = {
    datos: null,          // { generado, meses, productos }
    porCod: {},           // código -> producto
    clave: null,
    seguimiento: [],      // códigos marcados
    recientes: [],        // últimos productos abiertos
    texto: '',            // texto del buscador
    clase: '',            // filtro de clase (A, B, C)
    cargando: false,
    errorSync: null,
    versionApi: null
  };
  const VIEJO_MIN = 30;   // minutos a partir de los cuales los datos se marcan como viejos
  const AUTO_MIN = 10;    // al volver a la app, se actualiza si los datos tienen más de esto

  const $vista = document.getElementById('vista');
  const $sync = document.getElementById('sync');

  // ============================================================ Utilidades
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('es-VE');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesCorto = (ym) => { const [y, m] = ym.split('-'); return MESES[Number(m) - 1] + ' ' + y.slice(2); };
  const fechaCorta = (s) => {
    if (!s) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : s;
  };
  const haceCuanto = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} d`;
  };

  // Colores por estado
  const URG = {
    'CRITICO': { c: 'var(--rojo)', t: '#fff', txt: 'CRÍTICO' },
    'CRÍTICO': { c: 'var(--rojo)', t: '#fff', txt: 'CRÍTICO' },
    'URGENTE': { c: 'var(--naranja)', t: '#fff', txt: 'URGENTE' },
    'PLANIFICAR': { c: 'var(--amarillo)', t: '#17212B', txt: 'PLANIFICAR' },
    'OK': { c: 'var(--verde)', t: '#fff', txt: 'OK' },
    'EN PRODUCCIÓN': { c: 'var(--azul)', t: '#fff', txt: 'EN PRODUCCIÓN' }
  };
  const urg = (u) => URG[String(u || '').toUpperCase()] || { c: 'var(--tinta-3)', t: '#fff', txt: u && u !== '—' ? u : 'SIN DATO' };
  const MPS_EST = {
    'PRODUCIR': { c: 'var(--naranja)', t: '#fff' },
    'CRÍTICO': { c: 'var(--rojo)', t: '#fff' },
    'CRITICO': { c: 'var(--rojo)', t: '#fff' },
    'PLANIFICAR': { c: 'var(--amarillo)', t: '#17212B' },
    'BIEN': { c: 'var(--verde)', t: '#fff' }
  };
  const tagEstado = (s) => {
    const k = MPS_EST[String(s || '').toUpperCase()];
    return k ? `<span class="tag" style="--c:${k.c};--t:${k.t}">${esc(s)}</span>` : `<span class="tag suave">${esc(s || '—')}</span>`;
  };
  const tagUrg = (u) => { const k = urg(u); return `<span class="tag" style="--c:${k.c};--t:${k.t}">${esc(k.txt)}</span>`; };
  const tagClase = (a) => a ? `<span class="tag suave">${esc(a)}</span>` : '';

  const opAbierta = (p) => (p.ops || []).find(o => !o.cerrada);

  function avisar(msg, ms = 2600) {
    const el = document.getElementById('aviso');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ============================================================ Datos

  function usarDatos(d) {
    E.datos = d;
    E.porCod = {};
    (d.productos || []).forEach(p => {
      p._busca = norm(p.c + ' ' + p.c.replace('-', '') + ' ' + p.n);
      E.porCod[p.c] = p;
    });
  }

  async function sincronizar(fresco = false) {
    if (E.cargando || !E.clave) return;
    E.cargando = true; E.errorSync = null; pintarSync();
    try {
      const r = await API.datos(E.clave, fresco);
      E.versionApi = r.version;
      usarDatos(r.data);
      await DB.set('datos', r.data);
      await DB.set('versionApi', r.version);
      if (fresco) avisar('Datos actualizados');
      repintar();
    } catch (e) {
      E.errorSync = e.message;
      if (/clave/i.test(e.message)) {
        avisar('La clave ya no es válida. Ingrésala de nuevo en Ajustes.', 4000);
      } else if (fresco || !E.datos) {
        avisar(navigator.onLine ? e.message : 'Sin conexión: mostrando los últimos datos guardados.', 4000);
      }
    } finally {
      E.cargando = false; pintarSync();
    }
  }

  function pintarSync() {
    const txt = $sync.querySelector('.sync-txt');
    $sync.classList.remove('viejo', 'error', 'cargando');
    if (E.cargando) { $sync.classList.add('cargando'); txt.textContent = 'Actualizando…'; return; }
    if (!E.datos) { txt.textContent = E.errorSync ? 'Sin datos' : '—'; if (E.errorSync) $sync.classList.add('error'); return; }
    txt.textContent = haceCuanto(E.datos.generado);
    const min = (Date.now() - new Date(E.datos.generado).getTime()) / 60000;
    if (E.errorSync) $sync.classList.add('error');
    else if (min > VIEJO_MIN) $sync.classList.add('viejo');
  }

  // ============================================================ Navegación

  function ruta() {
    const h = location.hash.replace(/^#\/?/, '');
    const [vista, ...resto] = h.split('/');
    return { vista: vista || 'buscar', arg: decodeURIComponent(resto.join('/')) };
  }

  function repintar() {
    if (!E.clave) { pintarBienvenida(); marcarNav(''); return; }
    const { vista, arg } = ruta();
    const yScroll = window.scrollY;
    if (vista === 'p') pintarFicha(arg);
    else if (vista === 'alertas') pintarAlertas();
    else if (vista === 'seguimiento') pintarSeguimiento();
    else if (vista === 'ajustes') pintarAjustes();
    else pintarBuscar(true);
    marcarNav(vista === 'p' ? '' : vista);
    pintarBadge();
    pintarSync();
    if (repintar.mismaVista === location.hash) window.scrollTo(0, yScroll);
    repintar.mismaVista = location.hash;
  }

  function marcarNav(tab) {
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tab || '')));
  }

  window.addEventListener('hashchange', () => {
    document.getElementById('aviso').hidden = true;
    window.scrollTo(0, 0);
    repintar();
  });

  // ============================================================ Pantalla: bienvenida (clave)

  function pintarBienvenida() {
    $vista.innerHTML = `
      <div class="bienvenida">
        <img src="icons/icon-192.png" alt="">
        <h1>Manaplas · Planificación</h1>
        <p>Inventario, órdenes de producción y MPS de cada producto.</p>
      </div>
      <form id="f-clave" class="tarjeta">
        <div class="campo">
          <label for="clave">Clave de acceso</label>
          <input id="clave" type="password" autocomplete="current-password" required>
        </div>
        <button class="boton" type="submit">Entrar</button>
        <div class="error" id="err" hidden></div>
      </form>`;
    document.getElementById('f-clave').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = ev.target.querySelector('button');
      const err = document.getElementById('err');
      const clave = document.getElementById('clave').value.trim();
      btn.disabled = true; btn.textContent = 'Descargando datos…'; err.hidden = true;
      try {
        const r = await API.datos(clave);
        E.clave = clave; E.versionApi = r.version;
        usarDatos(r.data);
        await DB.set('clave', clave);
        await DB.set('datos', r.data);
        await DB.set('versionApi', r.version);
        location.hash = '#/buscar';
        repintar();
      } catch (e) {
        err.textContent = e.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  // ============================================================ Pantalla: buscar

  function filtrar() {
    const toks = norm(E.texto).split(/\s+/).filter(Boolean);
    let lista = E.datos ? E.datos.productos : [];
    if (E.clase) lista = lista.filter(p => String(p.a || '').toUpperCase().startsWith(E.clase));
    if (toks.length) lista = lista.filter(p => toks.every(t => p._busca.includes(t)));
    return lista;
  }

  function itemHtml(p) {
    const k = urg(p.u);
    const op = opAbierta(p);
    return `
      <a class="item" href="#/p/${encodeURIComponent(p.c)}" style="--c:${k.c}">
        <div class="item-txt">
          <div class="item-cod">${esc(p.c)} ${tagClase(p.a)} ${p.u ? tagUrg(p.u) : ''} ${op ? `<span class="tag op">OP · Máq ${esc(op.maq)}</span>` : ''}</div>
          <div class="item-nom">${esc(p.n)}</div>
        </div>
        <div class="item-der">
          <div class="item-inv num">${fmt(p.inv)}</div>
          <div class="item-und">unidades</div>
        </div>
      </a>`;
  }

  function pintarBuscar(conservarFoco) {
    const enfocado = conservarFoco && document.activeElement && document.activeElement.id === 'q';
    if (!document.getElementById('q') || ruta().vista !== 'buscar' || !$vista.querySelector('.busca')) {
      $vista.innerHTML = `
        <div class="busca">
          <div class="busca-caja">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="q" type="text" enterkeyhint="search" placeholder="Código o nombre del producto" autocomplete="off" value="${esc(E.texto)}">
            <button class="busca-borrar" id="q-borrar" type="button" aria-label="Borrar" ${E.texto ? '' : 'hidden'}>×</button>
          </div>
          <div class="chips">
            ${['', 'A', 'B', 'C'].map(c => `<button class="chip ${E.clase === c ? 'on' : ''}" data-clase="${c}" type="button">${c ? 'Clase ' + c : 'Todas'}</button>`).join('')}
          </div>
        </div>
        <div id="res"></div>`;
      const q = document.getElementById('q');
      q.addEventListener('input', () => {
        E.texto = q.value;
        document.getElementById('q-borrar').hidden = !q.value;
        pintarResultados();
      });
      document.getElementById('q-borrar').addEventListener('click', () => {
        E.texto = ''; q.value = ''; q.focus();
        document.getElementById('q-borrar').hidden = true;
        pintarResultados();
      });
      $vista.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        E.clase = b.dataset.clase;
        $vista.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
        pintarResultados();
      }));
    }
    pintarResultados();
    if (enfocado) document.getElementById('q').focus();
  }

  function pintarResultados() {
    const $res = document.getElementById('res');
    if (!$res) return;
    if (!E.datos) { $res.innerHTML = `<div class="vacio"><b>Sin datos todavía</b>Conéctate a internet y toca el botón de arriba para descargar.</div>`; return; }

    if (!E.texto.trim() && !E.clase) {
      const ps = E.datos.productos.filter(p => p.est === 'Act' || !p.est);
      const n = (f) => ps.filter(f).length;
      const crit = n(p => /CR[IÍ]TICO/i.test(p.u || ''));
      const urgte = n(p => /URGENTE/i.test(p.u || ''));
      const enProd = n(p => !!opAbierta(p));
      const rec = E.recientes.map(c => E.porCod[c]).filter(Boolean);
      $res.innerHTML = `
        <div class="titulo">Hoy</div>
        <div class="resumen">
          <a class="cuenta" href="#/alertas" style="--c:var(--rojo)"><div class="cuenta-n num">${crit}</div><div class="cuenta-t">Críticos</div></a>
          <a class="cuenta" href="#/alertas" style="--c:var(--naranja)"><div class="cuenta-n num">${urgte}</div><div class="cuenta-t">Urgentes</div></a>
          <div class="cuenta" style="--c:var(--azul)"><div class="cuenta-n num">${enProd}</div><div class="cuenta-t">Con OP abierta</div></div>
        </div>
        ${rec.length ? `<div class="titulo">Vistos recientemente</div><div class="lista">${rec.map(itemHtml).join('')}</div>`
                     : `<div class="vacio"><b>Busca un producto</b>Escribe el código (ej. 6825) o parte del nombre (ej. silla blanco).</div>`}`;
      return;
    }

    const lista = filtrar();
    const MAX = 60;
    $res.innerHTML = lista.length
      ? `<div class="titulo">${lista.length} producto${lista.length === 1 ? '' : 's'}</div>
         <div class="lista">${lista.slice(0, MAX).map(itemHtml).join('')}</div>
         ${lista.length > MAX ? `<div class="mas">Mostrando ${MAX}. Escribe más para afinar la búsqueda.</div>` : ''}`
      : `<div class="vacio"><b>Sin resultados</b>Prueba con otra palabra o con el código.</div>`;
  }

  // ============================================================ Pantalla: ficha

  async function pintarFicha(cod) {
    const p = E.porCod[cod];
    if (!p) {
      $vista.innerHTML = `<div class="vacio"><b>No encuentro el producto ${esc(cod)}</b><a href="#/buscar" style="color:var(--azul)">Volver a buscar</a></div>`;
      return;
    }
    // recientes
    E.recientes = [cod].concat(E.recientes.filter(c => c !== cod)).slice(0, 8);
    DB.set('recientes', E.recientes);

    const k = urg(p.u);
    const marcado = E.seguimiento.includes(cod);
    const abiertas = (p.ops || []).filter(o => !o.cerrada);
    const cerradas = (p.ops || []).filter(o => o.cerrada);
    const estadoTxt = abiertas.length ? `OP abierta en Máq ${esc(abiertas[0].maq)}` : (p.eop || 'Sin OP');

    $vista.innerHTML = `
      <div class="ficha-top">
        <button class="volver" type="button" aria-label="Volver" onclick="history.length > 1 ? history.back() : (location.hash = '#/buscar')">
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <div class="ficha-tit">
          <div class="ficha-cod">${esc(p.c)} ${tagClase(p.a)} ${p.est && p.est !== 'Act' ? `<span class="tag suave">${esc(p.est)}</span>` : ''}</div>
          <div class="ficha-nom">${esc(p.n)}</div>
        </div>
        <button class="estrella ${marcado ? 'on' : ''}" id="estrella" type="button" aria-label="Tener en cuenta">
          <svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z"/></svg>
        </button>
      </div>

      <div class="estado" style="--c:${k.c};--t:${k.t}">
        <div class="estado-g">${esc(k.txt)}</div>
        <div class="estado-p">${estadoTxt}${p.r ? `<br>Ranking ${fmt(p.r)}` : ''}</div>
      </div>

      <div class="datos">
        <div class="dato"><div class="dato-t">Inventario hoy</div><div class="dato-v num">${fmt(p.inv)}</div><div class="dato-s">Inv Query</div></div>
        <div class="dato"><div class="dato-t">Corte del mes</div><div class="dato-v num">${p.corte ? fmt(p.corte.v) : '—'}</div><div class="dato-s">${p.corte ? esc(p.corte.mes) : 'Sin corte'}</div></div>
        <div class="dato"><div class="dato-t">Meses de inventario</div><div class="dato-v num">${p.mi != null ? fmt(Math.floor(p.mi)) : '—'}</div><div class="dato-s">Cobertura MPS: ${p.cob ? fmt(p.cob) + ' meses' : '—'}</div></div>
        <div class="dato"><div class="dato-t">Venta promedio / mes</div><div class="dato-v num">${fmt(p.pv)}</div><div class="dato-s">SS ${fmt(p.ss)} · Objetivo ${fmt(p.so)}</div></div>
      </div>

      <div class="titulo">Órdenes de producción</div>
      ${abiertas.length ? abiertas.map(opHtml).join('') : `<div class="tarjeta" style="color:var(--tinta-2)">Sin OP abierta.</div>`}
      ${cerradas.length ? `<div class="tarjeta cerradas" style="margin-top:8px">
          ${cerradas.map(o => `<div class="cerrada"><div><b>${esc(o.op)}</b> · Máq ${esc(o.maq)}<br><span>${o.fin ? 'Cerró ' + fechaCorta(o.fin) : esc(o.clas)}</span></div><div class="num" style="text-align:right">${fmt(o.buenas)}<br><span>buenas</span></div></div>`).join('')}
        </div>` : ''}

      <div class="titulo">MPS</div>
      ${mpsHtml(p)}
    `;

    document.getElementById('estrella').addEventListener('click', async (ev) => {
      const boton = ev.currentTarget;
      const on = !E.seguimiento.includes(cod);
      E.seguimiento = on ? [cod].concat(E.seguimiento) : E.seguimiento.filter(c => c !== cod);
      await DB.set('seguimiento', E.seguimiento);
      boton.classList.toggle('on', on);
      avisar(on ? 'Agregado a Seguimiento' : 'Quitado de Seguimiento');
    });
  }

  function opHtml(o) {
    const pct = o.uni ? Math.min(100, Math.round(o.prod / o.uni * 100)) : 0;
    const faltan = Math.max(0, o.uni - o.prod);
    return `
      <div class="tarjeta">
        <div class="op-cab">
          <div><div class="op-maq">Máquina ${esc(o.maq)}</div><div class="op-num">OP ${esc(o.op)}</div></div>
          <span class="tag ${/pendiente/i.test(o.clas) ? 'suave' : 'op'}">${esc(o.clas || 'Abierta')}</span>
        </div>
        <div class="barra-av ${pct >= 100 ? 'full' : ''}"><i style="width:${pct}%"></i></div>
        <div class="op-cifras num">
          <span><b>${fmt(o.prod)}</b> de ${fmt(o.uni)} (${pct}%)</span>
          <span>${faltan ? `Faltan <b>${fmt(faltan)}</b>` : '<b>Completa</b>'}</span>
        </div>
        <div class="op-fechas">Emitida ${fechaCorta(o.emi) || '—'} · Inicio ${fechaCorta(o.ini) || 'por iniciar'} · Buenas ${fmt(o.buenas)}</div>
        ${o.cod !== undefined && o.comp ? `<div class="op-comp">${esc(o.comp)}</div>` : ''}
      </div>`;
  }

  function mpsHtml(p) {
    if (!p.mps || !E.datos.meses) return `<div class="tarjeta" style="color:var(--tinta-2)">Este producto no está en el MPS.</div>`;
    const filas = E.datos.meses.map((m, i) => {
      const x = p.mps[i];
      if (!x) return '';
      return `<tr>
        <td class="mes">${mesCorto(m)}</td>
        <td class="num">${fmt(x.i)}</td>
        <td class="num">${fmt(x.d)}</td>
        <td class="num ${x.f < 0 ? 'neg' : ''}">${fmt(x.f)}</td>
        <td>${tagEstado(x.s)}${x.p > 0 ? `<span class="prod num">+${fmt(x.p)}</span>` : ''}</td>
      </tr>`;
    }).join('');
    return `<div class="tarjeta"><table class="mps">
      <thead><tr><th>Mes</th><th>Inicial</th><th>Venta</th><th>Final</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      <div class="nota">Inicial = corte real si el mes tiene corte cargado; si no, el final proyectado del mes anterior. "+" = producción planificada.</div>`;
  }

  // ============================================================ Pantalla: alertas

  function alertas() {
    if (!E.datos) return { crit: [], urg: [] };
    const base = E.datos.productos.filter(p => (p.est === 'Act' || !p.est) && !opAbierta(p));
    const orden = (a, b) => (a.r || 1e9) - (b.r || 1e9);
    return {
      crit: base.filter(p => /CR[IÍ]TICO/i.test(p.u || '')).sort(orden),
      urg: base.filter(p => /URGENTE/i.test(p.u || '')).sort(orden)
    };
  }

  function pintarBadge() {
    const b = document.getElementById('badge-alertas');
    const n = alertas().crit.length;
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  }

  function pintarAlertas() {
    if (!E.datos) { $vista.innerHTML = `<div class="vacio"><b>Sin datos todavía</b></div>`; return; }
    const a = alertas();
    $vista.innerHTML = `
      <div class="nota" style="margin-top:0">Productos activos en crítico o urgente que <b>no tienen OP abierta</b>, en orden de ranking.</div>
      <div class="titulo">Críticos · ${a.crit.length}</div>
      ${a.crit.length ? `<div class="lista">${a.crit.map(itemHtml).join('')}</div>` : `<div class="vacio">Ninguno 🎉</div>`}
      <div class="titulo">Urgentes · ${a.urg.length}</div>
      ${a.urg.length ? `<div class="lista">${a.urg.map(itemHtml).join('')}</div>` : `<div class="vacio">Ninguno</div>`}`;
  }

  // ============================================================ Pantalla: seguimiento

  function pintarSeguimiento() {
    const lista = E.seguimiento.map(c => E.porCod[c]).filter(Boolean);
    $vista.innerHTML = lista.length
      ? `<div class="titulo">Tener en cuenta · ${lista.length}</div><div class="lista">${lista.map(itemHtml).join('')}</div>
         <div class="nota">Toca la estrella en la ficha de un producto para agregarlo o quitarlo.</div>`
      : `<div class="vacio"><b>Tu lista está vacía</b>Abre un producto y toca la ★ para tenerlo en cuenta.</div>`;
  }

  // ============================================================ Pantalla: ajustes

  async function pintarAjustes() {
    const apiUrl = (await DB.get('apiUrl')) || '';
    const d = E.datos;
    $vista.innerHTML = `
      <div class="titulo">Datos</div>
      <div class="tarjeta filas">
        <div><span>Actualizados</span><b>${d ? haceCuanto(d.generado) : '—'}</b></div>
        <div><span>Productos</span><b class="num">${d ? fmt(d.productos.length) : '—'}</b></div>
        <div><span>Meses del MPS</span><b>${d && d.meses ? d.meses.map(mesCorto).join(', ') : '—'}</b></div>
      </div>
      <button class="boton" id="b-fresco" type="button" style="margin-top:10px">Recalcular y descargar ahora</button>
      <div class="nota">Los datos se recalculan solos cada 10 minutos. Usa este botón si acabas de cambiar algo en las hojas.</div>

      <div class="titulo">Aplicación</div>
      <div class="tarjeta filas">
        <div><span>Versión de la app</span><b>${esc(APP_CONFIG.VERSION)} · ${NATIVA ? 'Android' : 'web'}</b></div>
        <div><span>Versión de la API</span><b>${esc(E.versionApi || '—')}</b></div>
      </div>

      ${NATIVA ? '' : `<a class="boton sec" href="${APK_URL}" style="display:block;text-align:center;margin-top:10px">Descargar app para Android (APK)</a>`}

      <div class="titulo">Conexión</div>
      <form id="f-api" class="tarjeta">
        <div class="campo">
          <label for="api">Dirección de la API (solo si cambia)</label>
          <input id="api" type="url" placeholder="${esc(APP_CONFIG.API_URL || 'https://script.google.com/macros/s/.../exec')}" value="${esc(apiUrl)}">
        </div>
        <button class="boton sec" type="submit">Guardar dirección</button>
      </form>
      <button class="boton sec" id="b-salir" type="button" style="margin-top:10px">Cerrar sesión</button>`;

    document.getElementById('b-fresco').addEventListener('click', () => sincronizar(true));
    document.getElementById('f-api').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = document.getElementById('api').value.trim();
      if (v) await DB.set('apiUrl', v); else await DB.del('apiUrl');
      avisar('Dirección guardada');
    });
    document.getElementById('b-salir').addEventListener('click', async () => {
      await DB.del('clave');
      E.clave = null;
      repintar();
    });
  }

  // ============================================================ Arranque

  async function iniciar() {
    $sync.addEventListener('click', () => sincronizar(true));
    try {
      const [clave, datos, seg, rec, vApi] = await Promise.all(
        ['clave', 'datos', 'seguimiento', 'recientes', 'versionApi'].map(k => DB.get(k)));
      E.clave = clave || null;
      E.seguimiento = seg || [];
      E.recientes = rec || [];
      E.versionApi = vApi || null;
      if (datos) usarDatos(datos);
    } catch (e) {
      console.warn('No se pudo leer el almacenamiento local', e);
    }
    repintar();
    if (E.clave) sincronizar(false);
    revisarActualizacion();
    setInterval(pintarSync, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !E.clave) return;
      const min = E.datos ? (Date.now() - new Date(E.datos.generado).getTime()) / 60000 : Infinity;
      if (min > AUTO_MIN) sincronizar(false);
    });
  }

  // ============================================================ App Android (APK)

  const NATIVA = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const REPO = 'planificadormanaplas-del/manaplas-app';
  const APK_URL = `https://github.com/${REPO}/releases/latest/download/Manaplas.apk`;

  const masNueva = (a, b) => {   // ¿la versión a es mayor que b?
    const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  };

  async function revisarActualizacion() {
    if (!NATIVA || !navigator.onLine) return;
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const rel = await r.json();
      if (!masNueva(rel.tag_name, APP_CONFIG.VERSION)) return;
      const nueva = rel.tag_name.replace(/^v/, '');
      const b = document.createElement('a');
      b.className = 'actualizar';
      b.href = APK_URL;
      b.innerHTML = `<b>Nueva versión ${esc(nueva)}</b><span>Toca para descargar e instalar</span>`;
      document.body.insertBefore(b, document.getElementById('vista'));
    } catch (e) { /* sin conexión: se revisa la próxima vez */ }
  }

  // Service worker (solo versión web): hace que la app se instale y abra sin señal.
  // En el APK los archivos ya vienen dentro de la app, así que no hace falta.
  if (!NATIVA && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Solo recarga cuando una versión nueva reemplaza a otra (no en la primera instalación)
      const habiaVersion = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
      let recargado = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargado || !habiaVersion) return;
        recargado = true;
        location.reload();
      });
    });
  }

  iniciar();
})();
