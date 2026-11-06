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
    versionApi: null,
    porMaq: {},           // número de máquina -> máquina
    opsPorMaq: {},        // número de máquina -> OP abiertas
    notas: [],            // notas (las del servidor + las que faltan por enviar)
    cola: [],             // notas pendientes por enviar (sin señal)
    notasHora: 0,         // última vez que se bajaron las notas
    autor: 'Royseg Coello - Planificador Junior',
    filtroMaq: 'todas',
    vistaMaq: 'mapa',
    incluirConOP: false,
    zoomMapa: null,       // null = ajustar al ancho de la pantalla
    filtroNotas: 'Pendiente',
    textoNotas: ''
  };
  const ETIQUETAS = ['General', 'Color', 'Molde', 'Material', 'Inventario', 'Producción', 'Máquina'];
  const EMOJI_ETIQ = { General: '📝', Color: '🎨', Molde: '🔧', Material: '🧪', Inventario: '📦', 'Producción': '🏭', 'Máquina': '⚙️' };
  const COLOR_ETIQ = {
    General: 'var(--tinta-3)', Color: '#8E44AD', Molde: 'var(--naranja)', Material: '#6D4C41',
    Inventario: 'var(--azul)', 'Producción': 'var(--verde)', 'Máquina': 'var(--rojo)'
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
    'PLANIFICAR': { c: 'var(--lila)', t: '#fff', txt: 'PLANIFICAR' },
    'OK': { c: 'var(--verde)', t: '#fff', txt: 'OK' },
    'EN PRODUCCIÓN': { c: 'var(--azul)', t: '#fff', txt: 'EN PRODUCCIÓN' }
  };
  const urg = (u) => URG[String(u || '').toUpperCase()] || { c: 'var(--tinta-3)', t: '#fff', txt: u && u !== '—' ? u : 'SIN DATO' };
  const MPS_EST = {
    'PRODUCIR': { c: 'var(--naranja)', t: '#fff' },
    'CRÍTICO': { c: 'var(--rojo)', t: '#fff' },
    'CRITICO': { c: 'var(--rojo)', t: '#fff' },
    'PLANIFICAR': { c: 'var(--lila)', t: '#fff' },
    'BIEN': { c: 'var(--verde)', t: '#fff' }
  };
  const tagEstado = (s) => {
    const k = MPS_EST[String(s || '').toUpperCase()];
    return k ? `<span class="tag" style="--c:${k.c};--t:${k.t}">${esc(s)}</span>` : `<span class="tag suave">${esc(s || '—')}</span>`;
  };
  const tagUrg = (u) => { const k = urg(u); return `<span class="tag" style="--c:${k.c};--t:${k.t}">${esc(k.txt)}</span>`; };
  const tagClase = (a) => a ? `<span class="tag suave">${esc(a)}</span>` : '';

  const opAbierta = (p) => (p.ops || []).find(o => !o.cerrada);
  // Stickers de Manaplas (img/stickers)
  const st = (n, cls = 'st') => `<img class="${cls}" src="img/stickers/${n}.png" alt="">`;

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
    const piezas = d.piezas || {};
    (d.productos || []).forEach(p => {
      p.pz = piezas[String(p.c).slice(0, 4)] || [];
      p._busca = norm(p.c + ' ' + p.c.replace('-', '') + ' ' + p.n);
      E.porCod[p.c] = p;
    });
    E.porMaq = {};
    (d.maquinas || []).forEach(m => { E.porMaq[m.n] = m; });
    E.opsPorMaq = {};
    (d.opsAbiertas || []).forEach(o => { (E.opsPorMaq[o.maq] = E.opsPorMaq[o.maq] || []).push(o); });
    // En proceso primero, luego pendientes por iniciar
    Object.values(E.opsPorMaq).forEach(l => l.sort((a, b) => (/pendiente/i.test(a.clas) ? 1 : 0) - (/pendiente/i.test(b.clas) ? 1 : 0)));
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
      repintar({ fondo: true });
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
    const [camino, consulta] = h.split('?');
    const [vista, ...resto] = camino.split('/');
    return { vista: vista || 'buscar', arg: decodeURIComponent(resto.join('/')), q: new URLSearchParams(consulta || '') };
  }

  function repintar(op = {}) {
    if (!E.clave) { pintarBienvenida(); marcarNav(''); return; }
    const { vista, arg, q } = ruta();
    // Una actualización en segundo plano nunca borra lo que se está escribiendo
    if (op.fondo && (vista === 'nota' || vista === 'ajustes')) { pintarBadge(); pintarSync(); return; }
    const yScroll = window.scrollY;
    if (vista === 'p') pintarFicha(arg);
    else if (vista === 'm') pintarMaquina(arg);
    else if (vista === 'maquinas') pintarMaquinas();
    else if (vista === 'notas') pintarNotas(q);
    else if (vista === 'nota') pintarEditorNota(arg, q);
    else if (vista === 'alertas') pintarAlertas();
    else if (vista === 'seguimiento') pintarSeguimiento();
    else if (vista === 'ajustes') pintarAjustes();
    else pintarBuscar(true);
    marcarNav({ p: '', m: 'maquinas', nota: 'notas', seguimiento: 'buscar' }[vista] ?? vista);
    pintarBadge();
    pintarSync();
    if (repintar.mismaVista === location.hash) window.scrollTo(0, yScroll);
    repintar.mismaVista = location.hash;
  }

  function marcarNav(tab) {
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tab || '')));
  }

  window.addEventListener('hashchange', () => {
    window.scrollTo(0, 0);
    repintar();
  });

  // ============================================================ Pantalla: bienvenida (clave)

  function pintarBienvenida() {
    $vista.innerHTML = `
      <div class="bienvenida">
        <img src="img/stickers/envase_manaplas.png" alt="">
        <h1>manaplas · Planificación</h1>
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
        bajarNotas();
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
      const seg = E.seguimiento.map(c => E.porCod[c]).filter(Boolean);
      const pend = E.notas.filter(n => n.estado !== 'Resuelta').length;
      $res.innerHTML = `
        <div class="titulo">${st('grafico_cumplimiento')} Hoy</div>
        <div class="resumen">
          <a class="cuenta" href="#/alertas" style="--c:var(--rojo)"><div class="cuenta-n num">${crit}</div><div class="cuenta-t"><i class="punto" style="--c:var(--rojo)"></i>Críticos</div></a>
          <a class="cuenta" href="#/alertas" style="--c:var(--naranja)"><div class="cuenta-n num">${urgte}</div><div class="cuenta-t"><i class="punto" style="--c:var(--naranja)"></i>Urgentes</div></a>
          <div class="cuenta" style="--c:var(--azul)"><div class="cuenta-n num">${enProd}</div><div class="cuenta-t"><i class="punto" style="--c:var(--azul)"></i>Con OP abierta</div></div>
        </div>
        ${E.datos.maquinas ? `<div class="titulo">${st('mantenimiento')} Planta hoy</div><a href="#/maquinas" class="enlace-bloque">${tarjetasHoyHtml()}</a>` : ''}
        ${avisosDelDia().length ? `<div class="titulo">${st('checklist')} Avisos del día · ${avisosDelDia().length}</div>${avisosHtml(6)}` : ''}
        ${pend ? `<a class="tarjeta enlace-notas" href="#/notas">${st('checklist', 'st-mini')} <b class="num">${pend}</b> nota${pend === 1 ? '' : 's'} pendiente${pend === 1 ? '' : 's'} <span>Ver →</span></a>` : ''}
        ${seg.length ? `<div class="titulo">⭐ Tener en cuenta · ${seg.length}</div><div class="lista">${seg.map(itemHtml).join('')}</div>` : ''}
        ${rec.length ? `<div class="titulo">🕘 Vistos recientemente</div><div class="lista">${rec.map(itemHtml).join('')}</div>`
                     : `<div class="vacio">${st('caja_producto', 'st-grande')}<b>Busca un producto</b>Escribe el código (ej. 6825) o parte del nombre (ej. silla blanco).</div>`}`;
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
        <div class="dato"><div class="dato-t">${st('caja_producto', 'st-mini')} Inventario hoy</div><div class="dato-v num">${fmt(p.inv)}</div><div class="dato-s">Inv Query</div></div>
        <div class="dato"><div class="dato-t">Corte del mes</div><div class="dato-v num">${p.corte ? fmt(p.corte.v) : '—'}</div><div class="dato-s">${p.corte ? esc(p.corte.mes) : 'Sin corte'}</div></div>
        <div class="dato"><div class="dato-t">Meses de inventario</div><div class="dato-v num">${p.mi != null ? fmt(Math.floor(p.mi)) : '—'}</div><div class="dato-s">Cobertura MPS: ${p.cob ? fmt(p.cob) + ' meses' : '—'}</div></div>
        <div class="dato"><div class="dato-t">${st('grafico_cumplimiento', 'st-mini')} Venta promedio / mes</div><div class="dato-v num">${fmt(p.pv)}</div><div class="dato-s">SS ${fmt(p.ss)} · Objetivo ${fmt(p.so)}</div></div>
      </div>

      <div class="titulo">${st('tolva')} Órdenes de producción</div>
      ${abiertas.length ? abiertas.map(opHtml).join('') : `<div class="tarjeta" style="color:var(--tinta-2)">Sin OP abierta.</div>`}
      ${cerradas.length ? `<div class="tarjeta cerradas" style="margin-top:8px">
          ${cerradas.map(o => `<div class="cerrada"><div><b>${esc(o.op)}</b> · Máq ${esc(o.maq)}<br><span>${o.fin ? 'Cerró ' + fechaCorta(o.fin) : esc(o.clas)}</span></div><div class="num" style="text-align:right">${fmt(o.buenas)}<br><span>buenas</span></div></div>`).join('')}
        </div>` : ''}

      <div class="titulo">${st('molde')} Piezas y máquinas</div>
      ${piezasHtml(p)}

      <div class="titulo">${st('calendario')} MPS</div>
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

  function opHtml(o, titulo) {
    const pct = o.uni ? Math.min(100, Math.round(o.prod / o.uni * 100)) : 0;
    const faltan = Math.max(0, o.uni - o.prod);
    return `
      <div class="tarjeta">
        <div class="op-cab">
          <div><div class="op-maq">${titulo ? esc(titulo) : 'Máquina ' + esc(o.maq)}</div><div class="op-num">${titulo ? esc(o.cod) + ' · ' : ''}OP ${esc(o.op)}</div></div>
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

  // ============================================================ Piezas y máquinas

  const EST_MAQ = {
    'operativa': { c: 'var(--verde)', t: '#fff' },
    'espera logística': { c: 'var(--pizarra)', t: '#fff' },
    'intervención técnica': { c: 'var(--naranja)', t: '#fff' },
    'fuera de servicio': { c: 'var(--rojo)', t: '#fff' }
  };
  const estMaq = (s) => EST_MAQ[String(s || '').toLowerCase()] || { c: 'var(--tinta-3)', t: '#fff' };
  const tagMaq = (m) => { const k = estMaq(m.est); return `<span class="tag" style="--c:${k.c};--t:${k.t}">${esc(m.est || '—')}</span>`; };
  const corto = (comp) => String(comp || '').replace(/^\S+-\d\/\d+-/, '');   // "6535-0/0-Matero 35" -> "Matero 35"

  // ¿Qué máquina tiene montada esta pieza ahora?
  function maquinaDePieza(cod) {
    for (const [maq, ops] of Object.entries(E.opsPorMaq)) {
      if (ops.some(o => String(o.comp || '').startsWith(cod + '-') || o.comp === cod)) return maq;
    }
    return null;
  }

  function piezasHtml(p) {
    const pz = p.pz || [];
    if (!pz.length) return `<div class="tarjeta" style="color:var(--tinta-2)">Este producto no tiene piezas cargadas en Componentes (Base de Datos Planificación).</div>`;
    return pz.map(z => {
      const ahora = maquinaDePieza(z.cod);
      const valido = z.maq && z.maq.length;
      const chips = valido ? z.maq.map(n => {
        const m = E.porMaq[n] || { n, est: '' };
        const k = estMaq(m.est);
        return `<a class="maq-chip ${ahora === n ? 'aqui' : ''}" href="#/m/${encodeURIComponent(n)}" style="--c:${k.c}" title="${esc(m.est)}">${esc(n)}</a>`;
      }).join('') : '';
      return `
        <div class="tarjeta pieza">
          <div class="pieza-cab">
            <div><b>${esc(z.cod)}</b> · ${esc(z.parte || z.nom)}</div>
            <span class="tag ${valido ? 'op' : 'suave'}">${z.ton ? esc(z.ton) + (/^\d+$/.test(z.ton) ? ' t' : '') : 'sin ton'}</span>
          </div>
          <div class="pieza-det">${[z.cav ? `${fmt(z.cav)} cav` : '', z.ciclo ? `ciclo ${fmt(z.ciclo)} s` : '', z.peso ? `${String(z.peso).replace('.', ',')} g` : '', z.mp].filter(Boolean).join(' · ')}</div>
          ${valido ? `<div class="maq-chips">${chips}</div>` : `<div class="aviso-dato">Tonelaje sin dato válido: consultar con Moldes.</div>`}
          ${ahora ? `<div class="pieza-ahora">● Montada ahora en la ${esc(ahora)}</div>` : ''}
        </div>`;
    }).join('') + `<div class="nota">Máquinas de la misma centena de tonelaje y nunca más pequeñas que la pieza. Verde = operativa · gris = espera logística · naranja = intervención · rojo = fuera de servicio.</div>`;
  }

  // ============================================================ Pantalla: máquinas

  // Plano de la planta: misma ubicación que el mapa del recorrido.
  // Cada máquina: [centro x, centro y, ancho, alto, giro en grados]. Unidades del plano.
  const PLANO = (() => {
    const p = {};
    const caja = (n, x, y, w, h) => { p[n] = [x + w / 2, y + h / 2, w, h, 0]; };
    // Máquinas 201–209
    caja('201', 155, 28, 142, 32);
    [195, 236, 278, 321, 362, 404, 448, 489].forEach((cx, i) => { p[String(202 + i)] = [cx, 160, 32, 96, 22]; });
    // Máquinas 210–218
    [578, 621, 664, 706, 749].forEach((cx, i) => { p[String(210 + i)] = [cx, 160, 32, 96, 22]; });
    caja('218', 880, 30, 150, 32);
    caja('217', 1005, 76, 27, 84);
    caja('216', 880, 175, 150, 32);
    caja('215', 810, 228, 75, 26);
    // Soplado
    caja('306', 1126, 42, 64, 30);
    caja('302', 1068, 98, 58, 32); caja('305', 1134, 98, 58, 32);
    caja('301', 1068, 156, 58, 32); caja('304', 1134, 156, 58, 32);
    // Máquinas 101–112
    caja('101', 175, 376, 27, 104); caja('102', 213, 376, 27, 104); caja('103', 251, 376, 27, 104);
    [317, 352, 387, 422, 456, 490, 525, 560, 593].forEach((cx, i) => { p[String(104 + i)] = [cx, 430, 30, 100, 22]; });
    // Máquinas 113–124
    [637, 671, 705, 739, 773, 806, 839, 874, 908, 941, 975, 1008].forEach((cx, i) => { p[String(113 + i)] = [cx, 430, 30, 100, 22]; });
    // Máquinas 125–143: columna vertical a la derecha, debajo de Soplado
    for (let i = 0; i < 19; i++) caja(String(125 + i), 1078, 270 + i * 21.5, 102, 18);
    return p;
  })();
  const PLANO_ANCHO = 1210, PLANO_ALTO = 684;
  // Bloques: [x, y, ancho, alto, título]
  const BLOQUES = [
    [2, 6, 518, 287, 'Máquinas 201–209'], [528, 6, 512, 287, 'Máquinas 210–218'], [1052, 6, 154, 229, 'Soplado'],
    [156, 342, 438, 152, 'Máquinas 101–112'], [600, 342, 440, 152, 'Máquinas 113–124'],
    [1052, 243, 154, 438, 'Máquinas 125–143']
  ];

  // Colores del mapa según el estatus de hoy (hoja Registro del Seguimiento de OP)
  const COLOR_MAPA = {
    produciendo: { c: 'var(--verde)', t: '#fff', b: 'var(--verde)', txt: 'Produciendo' },
    arrancar: { c: 'var(--narciso)', t: '#5C4A00', b: '#E6DA00', txt: 'Por arrancar' },
    molde: { c: 'var(--rojo)', t: '#fff', b: 'var(--rojo)', txt: 'Cambio de molde' },
    falla: { c: '#9AA5B4', t: '#fff', b: '#8793A3', txt: 'Falla / mantenimiento' },
    falta: { c: 'var(--lila)', t: '#fff', b: 'var(--lila)', txt: 'Falta operario / materia prima' },
    prueba: { c: 'var(--azul)', t: '#fff', b: 'var(--azul)', txt: 'Prueba' },
    libre: { c: '#fff', t: '#4F5B67', b: '#AEB9C7', txt: 'Orden finalizada' },
    sinreg: { c: '#E4E9EF', t: '#8A96A3', b: '#C9D2DC', txt: 'Sin recorrido hoy' }
  };
  const recorridoDe = (n) => E.datos && E.datos.recorrido && E.datos.recorrido.maquinas && E.datos.recorrido.maquinas[n];
  // Fecha de hoy (del teléfono) en formato aaaa-mm-dd
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // Registro del recorrido de HOY de la máquina (si no hubo hoy, no cuenta)
  const recorridoHoy = (n) => { const rc = recorridoDe(n); return rc && String(rc.fecha).slice(0, 10) === hoyISO() ? rc : null; };

  // El estado de la máquina sale solo del recorrido de hoy
  function estadoMapa(n) {
    const rc = recorridoHoy(n);
    if (!rc) return 'sinreg';
    const e = norm(rc.est);
    if (e.startsWith('produciendo')) return 'produciendo';
    if (e.startsWith('por arrancar')) return 'arrancar';
    if (e.startsWith('cambio de molde')) return 'molde';
    if (e.startsWith('falla') || e.startsWith('mantenimiento')) return 'falla';
    if (e.startsWith('falta')) return 'falta';
    if (e.startsWith('prueba')) return 'prueba';
    return 'libre';
  }

  // Conteo de máquinas operativas por estado de hoy
  function conteoHoy() {
    const c = {};
    Object.keys(COLOR_MAPA).forEach(k => { c[k] = 0; });
    (E.datos.maquinas || []).filter(m => /^operativa$/i.test(m.est) && PLANO[m.n]).forEach(m => { c[estadoMapa(m.n)]++; });
    return c;
  }
  const hayRecorridoHoy = () => Object.keys(PLANO).some(n => recorridoHoy(n));

  function tarjetasHoyHtml() {
    const c = conteoHoy();
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const ult = E.datos.recorrido && E.datos.recorrido.ultimo;
    return `<div class="planta-hoy">
        <div class="ph-grande"><b class="num">${c.produciendo}</b><span>de ${total} máquinas operativas<br>produciendo hoy</span></div>
        <div class="ph-chips">${['arrancar', 'molde', 'falla', 'falta', 'libre', 'sinreg'].filter(k => c[k]).map(k =>
          `<span><i style="--c:${COLOR_MAPA[k].c};border:1.5px solid ${COLOR_MAPA[k].b}"></i><b class="num">${c[k]}</b> ${COLOR_MAPA[k].txt}</span>`).join('')}</div>
      </div>
      ${hayRecorridoHoy() ? '' : `<div class="aviso-dato" style="margin:6px 4px 0">Todavía no hay recorrido de hoy${ult ? ` (el último fue el ${fechaHora(ult)})` : ''}. Las máquinas salen como "Sin recorrido hoy".</div>`}`;
  }

  function mapaHtml() {
    // Solo las máquinas que pueden operar. Color según lo que tienen: produciendo, OP por arrancar o libre.
    const cajas = Object.entries(PLANO).map(([n, [cx, cy, w, h, giro]]) => {
      const m = E.porMaq[n];
      if (!m || !/^operativa$/i.test(m.est)) return '';
      const ops = E.opsPorMaq[n] || [];
      const estado = estadoMapa(n);
      const enProceso = estado === 'produciendo';
      const k = COLOR_MAPA[estado];
      const op = ops[0];
      const pct = op && op.uni ? Math.min(1, op.prod / op.uni) : 0;
      const x = cx - w / 2, y = cy - h / 2;
      const textoGiro = h > w ? giro - 90 : giro;
      return `<a href="#/m/${n}" class="mapa-maq">
        <g transform="rotate(${giro} ${cx} ${cy})">
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${k.c}" stroke="${k.b}" stroke-width="2"/>
          ${enProceso && h >= 25 ? `<rect x="${x + 4}" y="${y + h - 8}" width="${Math.max(3, (w - 8) * pct)}" height="4" rx="2" fill="#fff" opacity=".95"/>` : ''}
          ${ops.length > 1 ? `<circle cx="${x + w - 6}" cy="${y + 6}" r="4.5" fill="#fff" stroke="${k.b}"/>` : ''}
        </g>
        <text x="${cx}" y="${cy}" fill="${k.t}" transform="rotate(${textoGiro} ${cx} ${cy})">${n}</text>
      </a>`;
    }).join('');
    const bloques = BLOQUES.map(([x, y, w, h, t]) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" class="bloque"/><text x="${x + 14}" y="${y + 20}" class="zona">${t}</text>`).join('')
;
    return `
      <div class="mapa-caja" id="mapa-caja">
        <svg id="mapa" viewBox="0 0 ${PLANO_ANCHO} ${PLANO_ALTO}" style="width:${E.zoomMapa ? E.zoomMapa * PLANO_ANCHO + 'px' : '100%'}">${bloques}${cajas}</svg>
      </div>
      <div class="mapa-ctrl">
        <button type="button" data-z="0" class="txt">Ver toda la planta</button>
        <button type="button" data-z="-1" aria-label="Alejar">−</button>
        <button type="button" data-z="1" aria-label="Acercar">+</button>
      </div>
      <div class="leyenda">
        ${Object.values(COLOR_MAPA).map(k => `<span><i style="--c:${k.c};border:1.5px solid ${k.b}"></i>${k.txt}</span>`).join('')}
      </div>
      <div class="nota">Colores según el recorrido de hoy. Si una máquina no salió en el recorrido de hoy, aparece como "Sin recorrido hoy". Barra blanca = avance de la OP.</div>
      <div class="nota">Solo se muestran las máquinas operativas (${(E.datos.maquinas || []).filter(m => /^operativa$/i.test(m.est) && PLANO[m.n]).length}). Las demás están en Lista. Toca una máquina para ver su OP y qué productos caben en ella.</div>`;
  }

  function pintarMaquinas() {
    if (!E.datos || !E.datos.maquinas) { $vista.innerHTML = `<div class="vacio"><b>Sin datos de máquinas</b>Actualiza los datos (la API debe ser versión 1.1 o más).</div>`; return; }
    const filtros = { todas: 'Todas', libres: 'Operativas sin OP', paradas: 'No operativas' };
    let lista = E.datos.maquinas;
    if (E.filtroMaq === 'libres') lista = lista.filter(m => /operativa/i.test(m.est) && !(E.opsPorMaq[m.n] || []).length);
    if (E.filtroMaq === 'paradas') lista = lista.filter(m => !/^operativa$/i.test(m.est));
    const grupos = {};
    lista.forEach(m => { (grupos[m.lin || 'Otras'] = grupos[m.lin || 'Otras'] || []).push(m); });
    $vista.innerHTML = `
      <div class="cabecera">${st('mantenimiento', 'st-grande')}<div><b>Máquinas</b><span>Estatus, lo que tienen montado y qué cabe en cada una</span></div></div>
      ${tarjetasHoyHtml()}
      <div class="segmento" style="margin-top:10px">
        <button type="button" data-vista="mapa" class="${E.vistaMaq === 'mapa' ? 'on' : ''}">Mapa</button>
        <button type="button" data-vista="lista" class="${E.vistaMaq === 'lista' ? 'on' : ''}">Lista</button>
        <button type="button" data-vista="asignar" class="${E.vistaMaq === 'asignar' ? 'on' : ''}">Asignar</button>
      </div>
      ${E.vistaMaq === 'mapa' ? mapaHtml() : E.vistaMaq === 'asignar' ? asignarHtml() : `
      <div class="chips" style="margin:0 0 4px">
        ${Object.entries(filtros).map(([k, t]) => `<button class="chip ${E.filtroMaq === k ? 'on' : ''}" data-f="${k}" type="button">${t}</button>`).join('')}
      </div>
      ${Object.entries(grupos).map(([lin, ms]) => `
        <div class="titulo">${esc(lin)} · ${ms.length}</div>
        <div class="lista">${ms.map(maqItemHtml).join('')}</div>`).join('') || `<div class="vacio">Ninguna máquina con ese filtro.</div>`}`}`;
    $vista.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { E.filtroMaq = b.dataset.f; pintarMaquinas(); }));
    $vista.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
      E.vistaMaq = b.dataset.vista; DB.set('vistaMaq', E.vistaMaq); pintarMaquinas();
    }));
    $vista.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
      const svg = document.getElementById('mapa');
      const caja = document.getElementById('mapa-caja');
      const ajuste = (caja.clientWidth - 16) / PLANO_ANCHO;            // zoom que muestra toda la planta
      const actual = E.zoomMapa || ajuste;
      const z = Number(b.dataset.z);
      E.zoomMapa = z === 0 ? null : Math.min(2.2, Math.max(ajuste, actual * (z > 0 ? 1.4 : 1 / 1.4)));
      if (E.zoomMapa && Math.abs(E.zoomMapa - ajuste) < 0.01) E.zoomMapa = null;
      DB.set('zoomMapa', E.zoomMapa);
      svg.style.width = E.zoomMapa ? (E.zoomMapa * PLANO_ANCHO) + 'px' : '100%';
    }));
  }

  function maqItemHtml(m) {
    const k = estMaq(m.est);
    const ops = E.opsPorMaq[m.n] || [];
    const op = ops[0];
    const pct = op && op.uni ? Math.min(100, Math.round(op.prod / op.uni * 100)) : 0;
    return `
      <a class="item maq-item" href="#/m/${encodeURIComponent(m.n)}" style="--c:${k.c}">
        <div class="maq-num"><b>${esc(m.n)}</b><span>${m.cap ? fmt(m.cap) + ' t' : esc(m.tipo)}</span></div>
        <div class="item-txt">
          <div class="item-cod">${tagMaq(m)} ${ops.length > 1 ? `<span class="tag suave">+${ops.length - 1} en cola</span>` : ''}</div>
          <div class="item-nom">${op ? esc(corto(op.comp) || op.cod) : '<span style="color:var(--tinta-3)">Sin OP abierta</span>'}</div>
          ${op ? `<div class="mini-av"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        ${op ? `<div class="item-der"><div class="item-inv num">${pct}%</div><div class="item-und">${/pendiente/i.test(op.clas) ? 'por iniciar' : 'avance'}</div></div>` : ''}
      </a>`;
  }

  // ============================================================ Asignar: qué hacer en cada máquina

  const UMBRAL_TERMINA = 85;   // % de avance a partir del cual una máquina "está por terminar"
  const NIVEL_URG = (u) => {
    const x = norm(u);
    if (x.startsWith('critico')) return 0;
    if (x.startsWith('urgente')) return 1;
    if (x.startsWith('planificar')) return 2;
    if (x === 'ok') return 3;
    return 4;
  };
  const GRUPOS_URG = [
    { n: 0, t: 'Críticos', c: 'var(--rojo)' }, { n: 1, t: 'Urgentes', c: 'var(--naranja)' },
    { n: 2, t: 'Planificar', c: 'var(--lila)' }, { n: 3, t: 'OK', c: 'var(--verde)' }, { n: 4, t: 'Sin clasificar', c: 'var(--tinta-3)' }
  ];

  // Productos activos con alguna pieza que se puede hacer en la máquina n.
  // Orden: críticos, urgentes, planificar, OK; dentro de cada grupo, por ranking del Stock de Seguridad.
  function candidatosPara(n, conOP) {
    const l = [];
    E.datos.productos.forEach(p => {
      if (!(p.est === 'Act' || !p.est)) return;
      if (!conOP && opAbierta(p)) return;
      const z = (p.pz || []).find(z => (z.maq || []).includes(n));
      if (z) l.push({ p, z, nivel: NIVEL_URG(p.u) });
    });
    return l.sort((a, b) => (a.nivel - b.nivel) || ((a.p.r || 1e9) - (b.p.r || 1e9)));
  }

  // ¿La máquina está libre o por terminar? (solo operativas)
  function liberacion(n) {
    const m = E.porMaq[n];
    if (!m || !/^operativa$/i.test(m.est)) return null;
    // En falla, cambio de molde o sin operario/MP: no está disponible para asignar
    if (['falla', 'molde', 'falta'].includes(estadoMapa(n))) return null;
    const ops = E.opsPorMaq[n] || [];
    // Si el recorrido de hoy la vio produciendo o por arrancar, no está libre aunque no tenga OP cargada
    if (!ops.length && ['produciendo', 'arrancar', 'prueba'].includes(estadoMapa(n))) return null;
    if (!ops.length) return { tipo: 'libre', orden: 0, txt: 'Libre · sin OP' };
    if (ops.length === 1 && estadoMapa(n) === 'libre') return { tipo: 'libre', orden: 0, txt: 'Orden finalizada (recorrido de hoy)' };
    // "Por terminar" solo si el recorrido de hoy la vio produciendo
    if (ops.length === 1 && !/pendiente/i.test(ops[0].clas) && estadoMapa(n) === 'produciendo') {
      const o = ops[0];
      const pct = o.uni ? Math.round(o.prod / o.uni * 100) : 0;
      if (pct >= 100) return { tipo: 'termina', orden: 1, pct, txt: `OP cumplida · ${pct}%` };
      if (pct >= UMBRAL_TERMINA) return { tipo: 'termina', orden: 1, pct, txt: `Por terminar · ${pct}% · faltan ${fmt(Math.max(0, o.uni - o.prod))}` };
    }
    return null;
  }

  // Avisos del día: lo que hay que tener en cuenta hoy en planta
  function avisosDelDia() {
    if (!E.datos || !E.datos.maquinas) return [];
    const av = [];
    const opers = E.datos.maquinas.filter(m => /^operativa$/i.test(m.est) && /inyectora|sopladora/i.test(m.cat));
    opers.forEach(m => {
      const n = m.n, est = estadoMapa(n), rc = recorridoHoy(n);
      if (est === 'molde') av.push({ orden: 1, c: 'var(--rojo)', n, txt: `En cambio de molde${rc && rc.prod ? ' · ' + corto(rc.prod) : ''}` });
      if (est === 'falla') av.push({ orden: 2, c: '#9AA5B4', n, txt: `${rc.est}${rc.notas ? ' · ' + rc.notas : ''}` });
      if (est === 'falta') av.push({ orden: 2, c: 'var(--lila)', n, txt: rc.est });
      const l = liberacion(n);
      if (l) {
        const urg = candidatosPara(n, false).filter(c => c.nivel <= 1).length;
        const op = (E.opsPorMaq[n] || [])[0];
        av.push({
          orden: l.tipo === 'termina' ? 0 : 3, c: l.tipo === 'termina' ? 'var(--narciso)' : '#fff', n,
          txt: l.tipo === 'termina'
            ? `${l.pct >= 100 ? `Ya cumplió la OP (${l.pct}%)` : `Va a terminar: ${l.pct}%`}${op ? ' de ' + corto(op.comp) : ''}. Prepara lo siguiente${urg ? ` (${urg} críticos/urgentes caben)` : ''}`
            : `${l.txt}${urg ? ` · ${urg} críticos/urgentes caben` : ''}`
        });
      }
    });
    return av.sort((a, b) => (a.orden - b.orden) || (Number(a.n) - Number(b.n)));
  }

  function avisosHtml(max) {
    const av = avisosDelDia();
    if (!av.length) return '';
    return `<div class="tarjeta avisos">
      ${av.slice(0, max).map(a => `<a class="aviso-fila" href="#/m/${encodeURIComponent(a.n)}">
        <span class="aviso-maq" style="--c:${a.c}">${esc(a.n)}</span><span class="aviso-txt">${esc(a.txt)}</span></a>`).join('')}
      ${av.length > max ? `<a class="asig-mas" href="#/maquinas">Ver los ${av.length} avisos en Máquinas →</a>` : ''}
    </div>`;
  }

  function filaCandidato({ p, z }) {
    const g = GRUPOS_URG[NIVEL_URG(p.u)];
    return `<a class="cand" href="#/p/${encodeURIComponent(p.c)}">
      <i class="punto" style="--c:${g.c}"></i>
      <div class="cand-txt"><b>${esc(p.c)}</b> ${esc(p.n)}<span>${esc(z.cod)} · ${esc(z.parte || z.nom)} · ${esc(z.ton)} t</span></div>
      <div class="cand-inv num">${fmt(p.inv)}</div>
    </a>`;
  }

  function asignarHtml() {
    const opers = E.datos.maquinas.filter(m => /^operativa$/i.test(m.est) && /inyectora/i.test(m.cat));
    const libres = opers.map(m => ({ m, l: liberacion(m.n) })).filter(x => x.l)
      .sort((a, b) => (a.l.orden - b.l.orden) || ((b.l.pct || 0) - (a.l.pct || 0)) || (Number(a.m.n) - Number(b.m.n)));
    const tarjetas = libres.map(({ m, l }) => {
      const cand = candidatosPara(m.n, false);
      const urg = cand.filter(c => c.nivel <= 1).length;
      return `<div class="tarjeta asig">
        <a class="asig-cab" href="#/m/${encodeURIComponent(m.n)}">
          <div class="maq-num"><b>${esc(m.n)}</b><span>${m.cap ? fmt(m.cap) + ' t' : ''}</span></div>
          <div class="asig-est"><span class="tag" style="--c:${l.tipo === 'libre' ? '#fff' : 'var(--narciso)'};--t:#17212B;border:1.5px solid #AEB9C7">${esc(l.txt)}</span>
            <div class="asig-cuenta">${urg ? `<b>${urg}</b> crítico${urg === 1 ? '' : 's'}/urgente${urg === 1 ? '' : 's'} caben aquí` : 'Sin críticos ni urgentes para esta máquina'}</div></div>
          <span class="asig-ir">›</span>
        </a>
        ${cand.length ? `<div class="cands">${cand.slice(0, 3).map(filaCandidato).join('')}</div>
          <a class="asig-mas" href="#/m/${encodeURIComponent(m.n)}">Ver los ${cand.length} productos que se pueden hacer →</a>` : ''}
      </div>`;
    }).join('');
    return `
      ${avisosDelDia().length ? `<div class="titulo">Avisos del día · ${avisosDelDia().length}</div>${avisosHtml(99)}` : ''}
      <div class="titulo">Elegir máquina</div>
      <div class="sel-maq">${opers.map(m => {
        const l = liberacion(m.n);
        return `<a href="#/m/${encodeURIComponent(m.n)}" class="${l ? l.tipo : ''}">${esc(m.n)}</a>`;
      }).join('')}</div>
      <div class="nota">Blanco = libre · amarillo = por terminar (≥ ${UMBRAL_TERMINA}%) · gris = ocupada, en falla o en cambio de molde.</div>
      <div class="titulo">Se liberan pronto · ${libres.length}</div>
      ${tarjetas || `<div class="vacio">Ninguna máquina operativa está libre ni por terminar.</div>`}`;
  }

  function pintarMaquina(n) {
    const m = E.porMaq[n];
    if (!m) { $vista.innerHTML = `<div class="vacio"><b>No encuentro la máquina ${esc(n)}</b><a href="#/maquinas" style="color:var(--azul)">Ver máquinas</a></div>`; return; }
    const ops = E.opsPorMaq[n] || [];
    // Todo lo que se puede hacer en esta máquina, por urgencia
    const candidatos = candidatosPara(n, E.incluirConOP);
    const lib = liberacion(n);
    const k = estMaq(m.est);
    $vista.innerHTML = `
      <div class="ficha-top">
        <button class="volver" type="button" aria-label="Volver" onclick="history.length > 1 ? history.back() : (location.hash = '#/maquinas')">
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <div class="ficha-tit">
          <div class="ficha-cod">${esc(m.cat)} · ${esc(m.lin)}</div>
          <div class="ficha-nom">Máquina ${esc(m.n)}</div>
        </div>
      </div>
      <div class="estado" style="--c:${k.c};--t:${k.t}">
        <div class="estado-g">${esc(m.est || '—')}</div>
        <div class="estado-p">${m.cap ? fmt(m.cap) + ' toneladas' : ''}${m.tipo ? `<br>Tipo ${esc(m.tipo)}` : ''}</div>
      </div>
      ${(() => {
        const k = COLOR_MAPA[estadoMapa(n)];
        const tag = (t) => `<span class="tag" style="--c:${k.c};--t:${k.t};border:1.5px solid ${k.b}">${esc(t)}</span>`;
        const rc = recorridoDe(n), r = E.datos.estadoMaq && E.datos.estadoMaq[n];
        if (rc) return `<div class="titulo">${st('checklist')} Último recorrido</div>
          <div class="tarjeta recorrido">
            <div class="op-cab">${tag(rc.est)}<span class="nota-fecha">${fechaHora(rc.fecha)}${rc.por ? ' · ' + esc(rc.por) : ''}</span></div>
            <div class="rc-prod">${esc(corto(rc.prod) || rc.prod)}</div>
            <div class="op-fechas">${[rc.color, rc.op ? 'OP ' + rc.op : ''].filter(Boolean).map(esc).join(' · ')}</div>
            ${rc.notas ? `<div class="rc-notas">“${esc(rc.notas)}”</div>` : ''}
          </div>`;
        if (r) return `<div class="tarjeta hoy-maq">${tag(r.est)} <span>Estatus de hoy${r.prod ? ' · ' + esc(r.prod) : ''}</span></div>`;
        return '';
      })()}
      ${(() => {
        const cs = E.datos.recorrido && E.datos.recorrido.comentarios && E.datos.recorrido.comentarios[n];
        return cs && cs.length ? `<div class="titulo">Comentarios del recorrido</div><div class="tarjeta cerradas">${cs.map(c =>
          `<div class="cerrada"><div><b>${esc(c.nombre)}</b><br><span>${esc(c.msj)}</span></div><div class="nota-fecha" style="text-align:right">${fechaHora(c.fecha)}</div></div>`).join('')}</div>` : '';
      })()}

      <div class="titulo">${st('tolva')} Órdenes en esta máquina</div>
      ${ops.length ? ops.map(o => {
        const p = E.porCod[o.cod];
        return `<a href="#/p/${encodeURIComponent(o.cod)}" class="enlace-op">${opHtml(o, p ? p.n : o.cod)}</a>`;
      }).join('') : `<div class="tarjeta" style="color:var(--tinta-2)">Sin OP abierta.</div>`}

      <div class="titulo">${st('molde')} Qué se puede hacer aquí · ${candidatos.length}</div>
      ${lib ? `<div class="tarjeta aviso-lib"><b>${esc(lib.txt)}</b> — buen momento para asignarle el siguiente producto.</div>` : ''}
      <label class="check" style="margin:8px 4px 10px"><input type="checkbox" id="con-op" ${E.incluirConOP ? 'checked' : ''}> Incluir productos que ya tienen OP abierta</label>
      ${candidatos.length ? GRUPOS_URG.map(g => {
        const l = candidatos.filter(c => c.nivel === g.n);
        if (!l.length) return '';
        const abierto = g.n <= 1;
        return `<details class="grupo-cand" ${abierto ? 'open' : ''}>
          <summary><i class="punto" style="--c:${g.c}"></i>${g.t} · ${l.length}</summary>
          <div class="lista">${l.map(({ p, z }) => itemHtml(p).replace('<div class="item-nom">', `<div class="item-pieza">${esc(z.cod)} · ${esc(z.parte || z.nom)} · ${esc(z.ton)} t</div><div class="item-nom">`)).join('')}</div>
        </details>`;
      }).join('') : `<div class="vacio">Ningún producto activo tiene piezas cargadas para esta máquina. Revisa el tonelaje en la Base de Datos.</div>`}`;
    const chk = document.getElementById('con-op');
    if (chk) chk.addEventListener('change', () => { E.incluirConOP = chk.checked; pintarMaquina(n); });
  }

  // ============================================================ Notas

  const nuevoId = () => 'N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fechaHora = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return '';
    return `${d.getDate()} ${MESES[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const tagEtiq = (e) => `<span class="tag" style="--c:${COLOR_ETIQ[e] || 'var(--tinta-3)'}">${EMOJI_ETIQ[e] || '📝'} ${esc(e || 'General')}</span>`;

  function notaHtml(n, compacta) {
    const p = n.producto && E.porCod[n.producto];
    const pendienteEnvio = E.cola.some(x => x.id === n.id);
    return `
      <div class="tarjeta nota-card ${n.estado === 'Resuelta' ? 'resuelta' : ''}" data-id="${esc(n.id)}">
        <div class="nota-cab">
          ${tagEtiq(n.etiqueta)}
          <span class="nota-fecha">${fechaHora(n.fecha)}${pendienteEnvio ? ' · <b title="Se enviará cuando haya señal">⟳ sin enviar</b>' : ''}</span>
        </div>
        <div class="nota-txt">${esc(n.texto)}</div>
        <div class="nota-pie">
          ${n.producto ? `<a href="#/p/${encodeURIComponent(n.producto)}">${esc(n.producto)}${p && !compacta ? ' · ' + esc(p.n) : ''}</a>` : ''}
          ${n.maquina ? `<a href="#/m/${encodeURIComponent(n.maquina)}">Máq ${esc(n.maquina)}</a>` : ''}
          ${!compacta && n.autor ? `<span>${esc(n.autor)}</span>` : ''}
        </div>
        <div class="nota-acc">
          <button type="button" data-accion="estado">${n.estado === 'Resuelta' ? '↺ Reabrir' : '✓ Resuelta'}</button>
          <a href="#/nota/${encodeURIComponent(n.id)}">Editar</a>
        </div>
      </div>`;
  }

  function notasCortasHtml(filtro, vacio) {
    const l = E.notas.filter(filtro);
    return l.length ? `<div class="notas-lista">${l.map(n => notaHtml(n, true)).join('')}</div>` : `<div class="tarjeta" style="color:var(--tinta-2)">${vacio}</div>`;
  }

  // Botones "Resuelta / Reabrir" (funciona en cualquier pantalla)
  $vista.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-accion="estado"]');
    if (!b) return;
    const card = b.closest('.nota-card');
    const n = E.notas.find(x => x.id === card.dataset.id);
    if (!n) return;
    guardarNota(Object.assign({}, n, { estado: n.estado === 'Resuelta' ? 'Pendiente' : 'Resuelta' }), true);
  });

  function pintarNotas(q) {
    if (q && q.get('buscar') != null) E.textoNotas = q.get('buscar');
    const filtros = { Pendiente: 'Pendientes', Resuelta: 'Resueltas', todas: 'Todas' };
    if (!document.getElementById('qn') || ruta().vista !== 'notas') {
      $vista.innerHTML = `
        <div class="busca">
          <div class="busca-caja">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="qn" type="text" enterkeyhint="search" placeholder="Buscar en notas, código o máquina" autocomplete="off" value="${esc(E.textoNotas)}">
          </div>
          <div class="chips">
            ${Object.entries(filtros).map(([k, t]) => `<button class="chip ${E.filtroNotas === k ? 'on' : ''}" data-f="${k}" type="button">${t}</button>`).join('')}
          </div>
        </div>
        <div id="res-notas"></div>
        <a class="fab" href="#/nota/nueva">✏️ Nueva nota</a>`;
      const qn = document.getElementById('qn');
      qn.addEventListener('input', () => { E.textoNotas = qn.value; pintarListaNotas(); });
      $vista.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        E.filtroNotas = b.dataset.f;
        $vista.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
        pintarListaNotas();
      }));
    }
    pintarListaNotas();
    if (Date.now() - E.notasHora > 60000) bajarNotas();
  }

  function pintarListaNotas() {
    const $r = document.getElementById('res-notas');
    if (!$r) return;
    const toks = norm(E.textoNotas).split(/\s+/).filter(Boolean);
    let l = E.notas;
    if (E.filtroNotas !== 'todas') l = l.filter(n => (n.estado || 'Pendiente') === E.filtroNotas);
    if (toks.length) l = l.filter(n => {
      const p = n.producto && E.porCod[n.producto];
      const t = norm([n.texto, n.etiqueta, n.producto, p && p.n, n.maquina && 'maq ' + n.maquina, n.autor].join(' '));
      return toks.every(x => t.includes(x));
    });
    $r.innerHTML = l.length
      ? `<div class="titulo">${l.length} nota${l.length === 1 ? '' : 's'}</div><div class="notas-lista">${l.map(n => notaHtml(n, false)).join('')}</div>`
      : `<div class="vacio">${st('checklist', 'st-grande')}<b>${E.notas.length ? 'Sin notas con ese filtro' : 'Tu libreta está vacía'}</b>Toca "Nueva nota" para escribir la primera.</div>`;
  }

  function pintarEditorNota(id, q) {
    const existente = id && id !== 'nueva' ? E.notas.find(n => n.id === id) : null;
    const n = existente || {
      etiqueta: 'General', estado: 'Pendiente', producto: '', maquina: '', texto: ''
    };
    $vista.innerHTML = `
      <div class="ficha-top">
        <button class="volver" type="button" aria-label="Volver" onclick="history.back()">
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <div class="ficha-tit"><div class="ficha-nom">${st('checklist')} ${existente ? 'Editar nota' : 'Nueva nota'}</div>
          ${existente ? `<div class="ficha-cod">${fechaHora(n.fecha)} · ${esc(n.autor || '')}</div>` : ''}</div>
      </div>
      <form id="f-nota" class="tarjeta" style="margin-top:14px">
        <div class="campo">
          <label for="n-texto">Nota</label>
          <textarea id="n-texto" rows="9" required placeholder="Escribe aquí… ej.: Pedir MB terracota para los materos de 35 cm">${esc(n.texto)}</textarea>
        </div>
        <div class="campo">
          <label>Etiqueta</label>
          <div class="chips chips-wrap">${ETIQUETAS.map(e => `<button class="chip ${n.etiqueta === e ? 'on' : ''}" data-e="${e}" type="button">${EMOJI_ETIQ[e]} ${e}</button>`).join('')}</div>
        </div>
        ${existente ? `<label class="check"><input type="checkbox" id="n-resuelta" ${n.estado === 'Resuelta' ? 'checked' : ''}> Resuelta</label>` : ''}
        <button class="boton" type="submit">Guardar nota</button>
      </form>`;
    let etiqueta = n.etiqueta || 'General';
    $vista.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => {
      etiqueta = b.dataset.e;
      $vista.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', x === b));
    }));
    if (!existente) setTimeout(() => document.getElementById('n-texto').focus(), 50);
    document.getElementById('f-nota').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const texto = document.getElementById('n-texto').value.trim();
      if (!texto) return;
      const chk = document.getElementById('n-resuelta');
      guardarNota({
        id: existente ? existente.id : nuevoId(),
        fecha: existente ? existente.fecha : new Date().toISOString(),
        autor: existente ? existente.autor : E.autor,
        etiqueta,
        producto: existente ? existente.producto || '' : '',
        maquina: existente ? existente.maquina || '' : '',
        texto,
        estado: chk ? (chk.checked ? 'Resuelta' : 'Pendiente') : 'Pendiente'
      });
      history.back();
    });
  }

  // Guarda local + cola; se envía apenas haya señal
  async function guardarNota(nota, quedarse) {
    nota.actualizado = new Date().toISOString();
    E.notas = [nota].concat(E.notas.filter(n => n.id !== nota.id))
      .sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
    E.cola = E.cola.filter(n => n.id !== nota.id).concat([nota]);
    await Promise.all([DB.set('notas', E.notas), DB.set('cola', E.cola)]);
    avisar(navigator.onLine ? 'Nota guardada' : 'Nota guardada en el teléfono: se enviará cuando haya señal', 3000);
    if (quedarse) repintar();
    enviarCola();
  }

  async function enviarCola() {
    if (enviarCola.activo || !E.cola.length || !E.clave || !navigator.onLine) return;
    enviarCola.activo = true;
    let enviadas = 0;
    try {
      for (const n of E.cola.slice()) {
        await API.guardarNota(E.clave, n);
        E.cola = E.cola.filter(x => !(x.id === n.id && x.actualizado === n.actualizado));
        await DB.set('cola', E.cola);
        enviadas++;
      }
    } catch (e) {
      console.warn('Notas: no se pudo enviar', e);
    } finally {
      enviarCola.activo = false;
      if (enviadas) bajarNotas();
    }
  }

  async function bajarNotas() {
    if (!E.clave || !navigator.onLine) return;
    try {
      const r = await API.notas(E.clave);
      const pendientes = {};
      E.cola.forEach(n => { pendientes[n.id] = n; });
      const servidor = (r.data || []).filter(n => !pendientes[n.id]);
      E.notas = servidor.concat(Object.values(pendientes)).sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
      E.notasHora = Date.now();
      await DB.set('notas', E.notas);
      repintar({ fondo: true });
    } catch (e) {
      console.warn('Notas: no se pudieron bajar', e);
    }
  }
  window.addEventListener('online', () => { enviarCola(); });

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
    const bn = document.getElementById('badge-notas');
    const pn = E.notas.filter(x => x.estado !== 'Resuelta').length;
    bn.hidden = !pn; bn.textContent = pn > 99 ? '99+' : pn;
  }

  function pintarAlertas() {
    if (!E.datos) { $vista.innerHTML = `<div class="vacio"><b>Sin datos todavía</b></div>`; return; }
    const a = alertas();
    $vista.innerHTML = `
      <div class="cabecera">${st('saco_materia_prima', 'st-grande')}<div><b>Alertas</b><span>Activos en crítico o urgente que <b>no tienen OP abierta</b>, en orden de ranking.</span></div></div>
      <div class="titulo"><i class="punto" style="--c:var(--rojo)"></i>Críticos · ${a.crit.length}</div>
      ${a.crit.length ? `<div class="lista">${a.crit.map(itemHtml).join('')}</div>` : `<div class="vacio">${st('checklist', 'st-grande')}<b>Ninguno</b></div>`}
      <div class="titulo"><i class="punto" style="--c:var(--naranja)"></i>Urgentes · ${a.urg.length}</div>
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
        <div><span>Máquinas</span><b class="num">${d && d.maquinas ? fmt(d.maquinas.length) : '—'}</b></div>
        <div><span>Notas</span><b class="num">${fmt(E.notas.length)}${E.cola.length ? ` · ${E.cola.length} sin enviar` : ''}</b></div>
        <div><span>Meses del MPS</span><b>${d && d.meses ? d.meses.map(mesCorto).join(', ') : '—'}</b></div>
      </div>
      <button class="boton" id="b-fresco" type="button" style="margin-top:10px">Recalcular y descargar ahora</button>
      <div class="nota">Los datos se recalculan solos cada 10 minutos. Usa este botón si acabas de cambiar algo en las hojas.</div>

      <div class="titulo">Notas</div>
      <form id="f-autor" class="tarjeta">
        <div class="campo">
          <label for="autor">Tu nombre (firma de las notas)</label>
          <input id="autor" type="text" value="${esc(E.autor)}" maxlength="80">
        </div>
        <button class="boton sec" type="submit">Guardar nombre</button>
      </form>

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
    document.getElementById('f-autor').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = document.getElementById('autor').value.trim();
      if (!v) return;
      E.autor = v; await DB.set('autor', v);
      avisar('Nombre guardado');
    });
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
      const [clave, datos, seg, rec, vApi, notas, cola, autor, vistaMaq, zoomMapa] = await Promise.all(
        ['clave', 'datos', 'seguimiento', 'recientes', 'versionApi', 'notas', 'cola', 'autor', 'vistaMaq', 'zoomMapa'].map(k => DB.get(k)));
      if (vistaMaq) E.vistaMaq = vistaMaq;
      if (zoomMapa) E.zoomMapa = zoomMapa;
      E.notas = notas || [];
      E.cola = cola || [];
      if (autor && !/^Reysecoello/.test(autor)) E.autor = autor;
      E.clave = clave || null;
      E.seguimiento = seg || [];
      E.recientes = rec || [];
      E.versionApi = vApi || null;
      if (datos) usarDatos(datos);
    } catch (e) {
      console.warn('No se pudo leer el almacenamiento local', e);
    }
    repintar();
    if (E.clave) { sincronizar(false); enviarCola(); bajarNotas(); }
    revisarActualizacion();
    setInterval(pintarSync, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !E.clave) return;
      const min = E.datos ? (Date.now() - new Date(E.datos.generado).getTime()) / 60000 : Infinity;
      if (min > AUTO_MIN) sincronizar(false);
      enviarCola();
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
