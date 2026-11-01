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
| **Fuentes** | Archivo **MPS** (hojas `Stock de Seguridad`, `Inv Query`, `Inventario MPS`, `MPS`), archivo **Seguimiento de Orden de Producción Actualización Diaria** (hoja `Resumen de OP`) y **Base de Datos Planificación** (hojas `Componentes` y `Maquinas/Producto`) | Donde se trabaja todos los días. La app solo las lee. |
| **Registros** | Archivo **App Manaplas · Registros** (lo crea la API) | Lo que se escribe desde la app: notas. |
| **Recorrido** | Archivo **Secuencia de OP** (hojas `ProduccionD` y `Comentarios`), de la app de recorrido | Colores del mapa (último registro de cada máquina, últimos 2 días) y comentarios por máquina. Solo lectura. |
| **API** | Proyecto Apps Script independiente. Copia del código en [`api/Codigo.gs`](api/Codigo.gs) | Lee las fuentes, arma un paquete con todos los productos y lo guarda en caché. Se recalcula sola cada 10 minutos. |
| **App** | Este repositorio, publicado con GitHub Pages | Descarga el paquete, lo guarda en el teléfono (IndexedDB) y lo muestra. Funciona sin señal con los últimos datos. |

**Regla de oro:** la app solo habla con la API. Si algún día los datos pasan de Google Sheets a una base
de datos, se cambia la API y la app no se toca.

## Qué hace la app (v0.3)

- **Buscar:** por código (`6825`, `6825-0`) o por nombre (`silla blanco`), con filtro por clase.
  - Al inicio: conteos del día, notas pendientes, productos ★ y vistos recientemente.
- **Ficha de producto:**
  - urgencia; inventario de hoy y del corte;
  - OP abiertas con avance y las cerradas recientes;
  - **piezas y máquinas compatibles** por tonelaje;
  - notas del producto;
  - MPS de 5 meses.
- **Alertas:** críticos y urgentes **sin OP abierta**, por ranking.
- **Máquinas:** las inyectoras y sopladoras con su estatus y lo que tienen montado. En el detalle de cada una:
  - sus OP;
  - los **críticos o urgentes sin OP que caben en esa máquina**;
  - sus notas.
- **Notas:**
  - Se escriben con etiqueta (General, Color, Molde, Material, Inventario, Producción, Máquina) y, si se quiere, ligadas a un producto o a una máquina.
  - Se pueden buscar y marcar como resueltas.
  - Sin señal se guardan en el teléfono y se envían solas después.
  - Quedan en la hoja **Notas** del archivo **App Manaplas · Registros**, que la API crea en el Drive de la cuenta de la empresa.
- **Ajustes:** forzar actualización, firma de las notas, versiones, dirección de la API y cerrar sesión.

### Regla de tonelaje (Componentes → máquinas)
Una pieza va en las inyectoras de **su misma centena** de tonelaje, y nunca en una máquina más pequeña:
- 300 → 300 y 310
- 400 → 440 y 450
- 500 → 550 y 580
- 220 → 220 y 225

`SOP` → sopladoras. Sin tonelaje válido (vacío, `#N/A`, `-`, valores que no existen en planta) → "consultar con Moldes".
Para ir más allá de la regla hay que consultar con Moldes. La regla vive en `maquinasCompatibles_()` de la API.

Fuente: **Base de Datos Planificación**. El tonelaje sale de la hoja `Componentes` (que lo toma de `Caracteristicas` → "Máquina (ton)"); las máquinas y su estatus, de `Maquinas/Producto`.

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
icons/                  Íconos de la app (web)
assets/                 Íconos y pantalla de inicio del APK (originales de 1024 px)
android/                Proyecto Android (Capacitor)
scripts/build-www.js    Copia la app a www/ para meterla en el APK
.github/workflows/      Compilación automática del APK
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

### Android: APK (recomendado)
Descargar desde el teléfono: **https://github.com/planificadormanaplas-del/manaplas-app/releases/latest/download/Manaplas.apk**
→ abrir el archivo → permitir "instalar apps de origen desconocido" si lo pide → **Instalar**.

- El APK se compila solo con GitHub Actions (`.github/workflows/apk.yml`) cada vez que se sube un cambio a `main`, y queda en **Releases**.
- Cuando hay versión nueva, la app muestra un aviso amarillo para descargarla e instalarla encima (no se pierden datos).
- Está empaquetada con **Capacitor** (`capacitor.config.json`, carpeta `android/`). Los archivos de la app van dentro del APK.
- **Firma:** la llave está en los secretos del repositorio `ANDROID_KEYSTORE_B64` y `ANDROID_KEYSTORE_PASS`, con respaldo en el Drive de la empresa.
  Siempre hay que usar la misma llave; si se pierde, las versiones nuevas no se instalan encima.

### Versión web
- **Android (Chrome):** abrir el link → menú ⋮ → **Instalar aplicación**.
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
- [ ] Publicar en Play Store (opcional; hoy se instala con el APK).
