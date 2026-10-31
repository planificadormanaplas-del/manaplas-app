# Manaplas · Planificación

App instalable (PWA) para consultar desde el teléfono, en planta, la situación de cada producto:
inventario, órdenes de producción, MPS y urgencia de stock de seguridad.

- **App:** https://planificadormanaplas-del.github.io/manaplas-app/
- **Dueño actual:** Planificación de Producción e Inventarios, Manaplas.

---

## Cómo está armada

```
Hojas de Google (fuentes)  →  API (Apps Script)  →  App en el teléfono (este repositorio)
```

| Capa | Dónde vive | Qué hace |
|---|---|---|
| **Fuentes** | Archivo **MPS** (hojas `Stock de Seguridad`, `Inv Query`, `Inventario MPS`, `MPS`) y archivo **Seguimiento de Orden de Producción Actualización Diaria** (hoja `Resumen de OP`) | Donde se trabaja todos los días. La app no las modifica. |
| **API** | Proyecto Apps Script independiente. Copia del código en [`api/Codigo.gs`](api/Codigo.gs) | Lee las fuentes, arma un paquete con todos los productos y lo guarda en caché. Se recalcula sola cada 10 minutos. |
| **App** | Este repositorio, publicado con GitHub Pages | Descarga el paquete, lo guarda en el teléfono (IndexedDB) y lo muestra. Funciona sin señal con los últimos datos. |

**Regla de oro:** la app solo habla con la API. Si algún día los datos pasan de Google Sheets a una base
de datos, se cambia la API y la app no se toca.

## Qué hace la app (v0.1)

- **Buscar:** por código (`6825`, `6825-0`) o por nombre (`silla blanco`), con filtro por clase.
- **Ficha de producto:**
  - urgencia (Stock de Seguridad);
  - inventario de hoy y del corte del mes;
  - meses de inventario, venta promedio, stock de seguridad y stock objetivo;
  - OP abiertas con avance y cerradas recientes;
  - MPS de los próximos 5 meses.
- **Alertas:** críticos y urgentes **sin OP abierta**, por ranking.
- **Seguimiento:** productos marcados con ★ (guardados en el teléfono).
- **Ajustes:** forzar actualización, versiones, dirección de la API, cerrar sesión.

## Archivos

```
index.html              Página única de la app
manifest.webmanifest    Nombre, colores e íconos para instalarla
sw.js                   Service worker: guarda la app en el teléfono (abre sin señal)
css/app.css             Estilos (azul Manaplas #1BACEE)
js/config.js            VERSIÓN de la app y dirección de la API   ← lo que más se toca
js/db.js                Almacenamiento local (IndexedDB)
js/api.js               Llamadas a la API
js/app.js               Pantallas y lógica
icons/                  Íconos de la app
api/Codigo.gs           Copia del código de la API (el que corre está en Apps Script)
```

## Instalar la API (una sola vez)

1. Entrar a https://script.google.com con la cuenta dueña de los archivos → **Nuevo proyecto** → nombre `API Manaplas App`.
2. Pegar el contenido de `api/Codigo.gs` en el archivo `Código.gs`.
3. ⚙ **Configuración del proyecto** → **Propiedades de la secuencia de comandos** → agregar `CLAVE_APP` = la clave de acceso.
   La clave **no** va en el código, porque este repositorio es público.
4. Ejecutar `probar()` (pide permisos la primera vez) y luego `instalarDisparador()`.
5. **Implementar → Nueva implementación → Aplicación web**, con *Ejecutar como: Yo* y *Acceso: Cualquier persona*.
6. Copiar la URL que termina en `/exec` y ponerla en `js/config.js` → `API_URL`.

Para actualizar la API después: **Implementar → Gestionar implementaciones → ✏ → Versión: nueva**.
Así la URL no cambia.

## Publicar una versión nueva de la app

1. Hacer los cambios.
2. Subir el número en `js/config.js` → `VERSION` (por ejemplo `0.1.0` → `0.2.0`).
3. Subir los cambios a la rama `main`. GitHub Pages publica solo en 1–2 minutos.
4. Los teléfonos se actualizan solos la próxima vez que abren la app. La versión se ve en **Ajustes**.

## Instalar la app en el teléfono

- **Android (Chrome):** abrir el link → menú ⋮ → **Instalar aplicación** (o "Agregar a pantalla principal").
- **iPhone (Safari):** abrir el link → botón Compartir → **Agregar a pantalla de inicio**.

## Dar o quitar acceso

Hoy hay una sola clave para todos (`CLAVE_APP`). Para quitarle el acceso a alguien, se cambia la clave
en las propiedades del proyecto de la API y se le da la nueva solo a quien corresponda.

## Próximos pasos

- [ ] Logo oficial de Manaplas en `icons/`.
- [ ] Usuarios con PIN y roles (como la API del recorrido).
- [ ] Planta en vivo: estado de máquinas desde la app de recorrido.
- [ ] Mapa de planta con el estado de cada máquina.
- [ ] Seguimiento compartido (guardado en una hoja, no solo en el teléfono).
- [ ] Empaquetar como APK si hace falta tenerla en Play Store.
