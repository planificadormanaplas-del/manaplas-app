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

  // Plano de la planta (según el formato de asignación de personal). x, y, ancho, alto en unidades del plano.
  const PLANO = (() => {
    const p = {};
    p['201'] = [10, 10, 488, 40];
    for (let i = 0; i < 13; i++) p[String(202 + i)] = [10 + i * 38, 60, 32, 92];
    p['218'] = [514, 10, 72, 40]; p['217'] = [514, 58, 34, 40]; p['216'] = [514, 106, 72, 40]; p['215'] = [514, 154, 72, 40];
    for (let i = 0; i < 24; i++) p[String(101 + i)] = [10 + i * 32, 214, 28, 74];
    p['306'] = [812, 10, 76, 26]; p['302'] = [812, 42, 36, 26]; p['305'] = [852, 42, 36, 26];
    p['301'] = [812, 74, 36, 26]; p['304'] = [852, 74, 36, 26];
    for (let i = 0; i < 19; i++) p[String(125 + i)] = [812, 116 + i * 25, 76, 21];
    return p;
  })();
  const PLANO_ANCHO = 898, PLANO_ALTO = 596;
  const ZONAS = [
    [10, 2, 'Línea II · 201–218'], [10, 206, 'Línea I · 101–124'], [812, 2, 'Soplado'], [812, 108, '125–143']
  ];

  function mapaHtml() {
    // Solo las máquinas que pueden operar. Color según lo que tienen: produciendo, OP por iniciar o libre.
    const cajas = Object.entries(PLANO).map(([n, [x, y, w, h]]) => {
      const m = E.porMaq[n];
      if (!m || !/^operativa$/i.test(m.est)) return '';
      const ops = E.opsPorMaq[n] || [];
      const enProceso = ops.some(o => !/pendiente/i.test(o.clas));
      const k = enProceso ? { c: 'var(--verde)', t: '#fff' } : ops.length ? { c: 'var(--azul)', t: '#fff' } : { c: 'var(--libre)', t: '#4F5B67' };
      const vertical = h > w;
      const op = ops[0];
      const pct = op && op.uni ? Math.min(1, op.prod / op.uni) : 0;
      return `<a href="#/m/${n}" class="mapa-maq">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${k.c}"/>
        ${enProceso ? `<rect x="${x + 2}" y="${y + h - 5}" width="${Math.max(2, (w - 4) * pct)}" height="3" rx="1.5" fill="#fff" opacity=".9"/>` : ''}
        ${ops.length > 1 ? `<circle cx="${x + w - 5}" cy="${y + 5}" r="3.2" fill="#fff"/>` : ''}
        <text x="${x + w / 2}" y="${y + h / 2}" class="${vertical ? 'v' : ''}" fill="${k.t}" transform="${vertical ? `rotate(-90 ${x + w / 2} ${y + h / 2})` : ''}">${n}</text>
      </a>`;
    }).join('');
    const zonas = ZONAS.map(([x, y, t]) => `<text x="${x}" y="${y + 4}" class="zona">${t}</text>`).join('');
    return `
      <div class="mapa-caja" id="mapa-caja">
        <svg id="mapa" viewBox="-4 -6 ${PLANO_ANCHO + 8} ${PLANO_ALTO + 10}" style="width:${E.zoomMapa ? E.zoomMapa * PLANO_ANCHO + 'px' : '100%'}">${zonas}${cajas}</svg>
      </div>
      <div class="mapa-ctrl">
        <button type="button" data-z="0" class="txt">Ver toda la planta</button>
        <button type="button" data-z="-1" aria-label="Alejar">−</button>
        <button type="button" data-z="1" aria-label="Acercar">+</button>
      </div>
      <div class="leyenda">
        <span><i style="--c:var(--verde)"></i>Produciendo (barra = avance)</span>
        <span><i style="--c:var(--azul)"></i>OP por iniciar</span>
        <span><i class="libre"></i>Libre, sin OP</span>
        <span><i class="blanco"></i>Más OP en cola</span>
      </div>
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
      <div class="segmento">
        <button type="button" data-vista="mapa" class="${E.vistaMaq === 'mapa' ? 'on' : ''}">Mapa</button>
        <button type="button" data-vista="lista" class="${E.vistaMaq === 'lista' ? 'on' : ''}">Lista</button>
      </div>
      ${E.vistaMaq === 'mapa' ? mapaHtml() : `
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

  function pintarMaquina(n) {
    const m = E.porMaq[n];
    if (!m) { $vista.innerHTML = `<div class="vacio"><b>No encuentro la máquina ${esc(n)}</b><a href="#/maquinas" style="color:var(--azul)">Ver máquinas</a></div>`; return; }
    const ops = E.opsPorMaq[n] || [];
    // Productos crítico/urgente sin OP con alguna pieza compatible con esta máquina
    const candidatos = [];
    E.datos.productos.forEach(p => {
      if (!(p.est === 'Act' || !p.est) || opAbierta(p) || !/CR[IÍ]TICO|URGENTE/i.test(p.u || '')) return;
      const z = (p.pz || []).find(z => (z.maq || []).includes(n));
      if (z) candidatos.push({ p, z });
    });
    candidatos.sort((a, b) => (/CR[IÍ]TICO/i.test(b.p.u) - /CR[IÍ]TICO/i.test(a.p.u)) || ((a.p.r || 1e9) - (b.p.r || 1e9)));
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

      <div class="titulo">${st('tolva')} Órdenes en esta máquina</div>
      ${ops.length ? ops.map(o => {
        const p = E.porCod[o.cod];
        return `<a href="#/p/${encodeURIComponent(o.cod)}" class="enlace-op">${opHtml(o, p ? p.n : o.cod)}</a>`;
      }).join('') : `<div class="tarjeta" style="color:var(--tinta-2)">Sin OP abierta.</div>`}

      <div class="titulo">${st('molde')} Críticos y urgentes sin OP que caben aquí · ${candidatos.length}</div>
      ${candidatos.length ? `<div class="lista">${candidatos.slice(0, 40).map(({ p, z }) =>
        itemHtml(p).replace('<div class="item-nom">', `<div class="item-pieza">${esc(z.cod)} · ${esc(z.parte || z.nom)} · ${esc(z.ton)} t</div><div class="item-nom">`)).join('')}</div>`
        : `<div class="vacio">Ningún producto crítico o urgente sin OP tiene piezas para esta máquina.</div>`}`;
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
