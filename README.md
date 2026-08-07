# siigo-pyme-mcp

Servidor [MCP](https://modelcontextprotocol.io) que expone **SIIGO Pyme** a un agente de IA.
Envuelve `EXCELSIIGO.exe`, el ejecutable de interfases de SIIGO, y convierte sus **47 funciones**
de exportación e importación en herramientas MCP con parámetros documentados, descubrimiento
automático de empresas y resultados ya parseados a JSON.

```
Agente: "dame los terceros de la empresa 02"
  → siigo_run_function(funcion: "GETTER", empresa: "02")
  → EXCELSIIGO.exe Z:\SIIWI02\ 2026 GETTER L USUARIO **** ... Terceros.xlsx
  → { ok: true, archivo: "...", totalFilas: 1240, columnas: [...], filas: [...] }
```

Se autodiagnostica: `npx -y siigo-pyme-mcp --doctor` dice si el equipo puede ejecutar SIIGO y qué
falta, y `--print-config` escupe el bloque de configuración exacto para su cliente MCP. Las dos
cosas funcionan **antes** de registrar nada.

## Requisitos

| Requisito | Por qué |
|---|---|
| **Windows** | SIIGO Pyme solo existe en Windows. |
| **SIIGO Pyme instalado** | Se necesita `EXCELSIIGO.exe` (por defecto en `C:\Siigo`). |
| **Microsoft Excel instalado** | SIIGO genera los `.xlsx` con Excel por COM, a través de `SiigoExcel.exe`. Sin Excel no se produce ningún archivo. |
| **Sesión de escritorio activa** | Consecuencia de lo anterior: no funciona como servicio de Windows, ni por SSH sin sesión, ni en un contenedor. Durante cada ejecución verás aparecer la ventana de progreso de SIIGO y Excel: **no se pueden ocultar**, con la ventana oculta el proceso se cuelga sin generar nada. |
| **Node.js 18 o superior** | Para ejecutarlo con `npx`. |

## Instalación

No hace falta instalar nada: se ejecuta con `npx`. Tres pasos, y el propio paquete guía cada uno.

```bash
npx -y siigo-pyme-mcp --doctor                      # 1. ¿puede este equipo ejecutar SIIGO?
npx -y siigo-pyme-mcp --print-config --cliente hermes   # 2. el bloque exacto a pegar
# 3. reinicie el cliente MCP y repita --doctor
```

`--print-config` conoce **hermes**, Claude Desktop, Claude Code, VS Code y Cursor, e imprime
además los primitivos del protocolo para cualquier cliente que no esté en la lista. Sin argumento
`--cliente` los muestra todos. Para el caso genérico:

```json
{
  "mcpServers": {
    "siigo": {
      "command": "npx",
      "args": ["-y", "siigo-pyme-mcp"],
      "env": {
        "SIIGO_USUARIO": "TU_USUARIO",
        "SIIGO_CLAVE": "TU_CLAVE"
      }
    }
  }
}
```

El `-y` **no es opcional**: sin él npx pide confirmación por consola, se queda esperando, y el
cliente MCP interpreta ese silencio como que el servidor no arrancó.

### Si la instalación falla

| Síntoma | Causa real |
|---|---|
| `npm error EBADPLATFORM ... wanted {"os":"win32"}` | Se está instalando fuera de Windows (WSL, contenedor, Linux). Hay que registrarlo en la máquina Windows donde está SIIGO; `--force` no ayuda, porque sin SIIGO ni Excel no hay nada que ejecutar. |
| El cliente dice que el servidor no arrancó, sin más detalle | Falta el `-y` en npx. |
| `'npx' no se reconoce como un comando`, o `ENOENT` al lanzarlo | El cliente MCP no tiene `npx` en su PATH. Use `--print-config --absoluto`, que emite un bloque apuntando a `node.exe` y al `dist/index.js` instalado, con las rutas reales de esa máquina. |
| Arranca, pero toda función falla sin generar archivo | Falta Excel, falta la sesión de escritorio, o alguna ruta pasa de 50 caracteres. Ejecute `--doctor`. |

En hermes hay un detalle que rompe la configuración escrita a mano: en su `config.yaml`, `args` y
`env` son **cadenas JSON dentro del YAML**, no una lista y un mapa YAML. `--print-config --cliente
hermes` ya lo emite así.

## Primeros pasos

1. **`siigo_doctor`** — verifica el entorno y dice qué falta. Es la primera llamada ante cualquier fallo.
2. **`siigo_list_companies`** — lista las empresas `SIIWI01`..`SIIWI99` disponibles.
3. **`siigo_set_credentials`** — guarda usuario y clave. Sin indicar empresa, la credencial
   se aplica a **todas**, que es lo más cómodo si usa el mismo usuario en todas ellas.
4. **`siigo_describe_function`** — los parámetros exactos de la función que va a usar.
5. **`siigo_run_function`** — ejecútela.

```
siigo_set_credentials(usuario: "TU_USUARIO", clave: "TU_CLAVE")
siigo_set_company_alias(empresa: "Z:\\SIIWI01\\", alias: "Inmunotek")
siigo_describe_function(funcion: "GETMOV")
siigo_run_function(funcion: "GETMOV", empresa: "Inmunotek",
                   params: { fechaInicial: "0101", fechaFinal: "0131", tipoComprobante: "F" })
```

El paso 4 no es ceremonia: el CLI acepta un parámetro mal formateado, lo registra como `081` y
**termina con código 0**, así que un error de parámetros se parece a un éxito. Es la única forma
en la que este servidor puede devolver datos equivocados.

## Cómo encuentra sus empresas

- **Instalaciones**: se leen del registro de Windows
  (`HKLM\SOFTWARE\WOW6432Node\Informatica y Gestion S.A\Siigo Windows`), de la configuración
  del servidor, y escaneando las unidades en busca de carpetas `<X>:\Siigo*` que contengan
  `EXCELSIIGO.exe`. Puede tener varias (`C:\Siigo`, `C:\Siigo2`, `D:\Siigo`...).
- **Empresas**: cada instalación declara en su `filepath.txt` la ruta de **una** empresa.
  A partir de ella se explora la carpeta que la contiene buscando `SIIWI00`..`SIIWI99`. Solo
  se aceptan las que traen datos reales de SIIGO (`ZnnSIIGO`, `CONFIMP.CFG`, archivos `.DIS`),
  de modo que carpetas homónimas vacías o de instalación no se ofrecen como empresas.
- Para registrar algo que el autodescubrimiento no ve, use `siigo_add_installation` o
  guarde credenciales directamente sobre la ruta de la empresa con `siigo_set_credentials`.

Puede referirse a una empresa por su ruta (`Z:\SIIWI01\`), por su número (`01`) o por el alias.

## Herramientas

Por defecto expone **11**. Cada esquema de herramienta viaja en *cada* llamada al modelo, así que
las 47 funciones como herramientas independientes cuestan unos 35 000 tokens por llamada —
medidos: 140 116 caracteres de `tools/list` frente a 8 927 del perfil por defecto, un 94 % menos.
Se controla con `SIIGO_TOOLS`:

| `SIIGO_TOOLS` | Herramientas | Coste de `tools/list` |
|---|---|---|
| `core` (por defecto) | 11: las de apoyo más `siigo_run_function` | ~2 200 tokens |
| `all` | 57: una por cada función | ~35 000 tokens |

### De apoyo

| Herramienta | Para qué |
|---|---|
| `siigo_doctor` | Verifica Windows, SIIGO, Excel, sesión de escritorio, credenciales, empresas y el límite de 50 caracteres. No ejecuta nada de SIIGO. |
| `siigo_list_installations` | Instalaciones de SIIGO detectadas. |
| `siigo_list_companies` | Empresas disponibles, con alias y si tienen credenciales. |
| `siigo_list_functions` | Catálogo de las 47 funciones, filtrable por grupo. |
| `siigo_describe_function` | Parámetros, orden posicional y ejemplo del manual de una función. |
| `siigo_set_credentials` | Guarda usuario y clave, global o por empresa. |
| `siigo_set_company_alias` | Da un nombre legible a una empresa. |
| `siigo_add_installation` | Registra una instalación que no se detectó sola. |
| `siigo_get_config` | Muestra la configuración (claves enmascaradas). |
| `siigo_read_xlsx` | Lee de forma paginada cualquier `.xlsx` generado. |

### De función

En el perfil `core`, una sola: **`siigo_run_function`**, que ejecuta cualquiera de las 47 por
nombre. En `all`, una por función con el nombre en minúsculas (`siigo_getmov`, `siigo_getter`,
`siigo_pushmov`...). Las dos rutas construyen exactamente el mismo `argv`, y hay un test que lo
compara lado a lado.

Todas aceptan los mismos campos comunes — `empresa` (obligatorio), `anio`, `norma`,
`instalacion`, `usuario`, `clave` — más los parámetros propios de la función. Las de
exportación admiten además `filasPreview`.

`siigo_run_function` exige **`confirmarEscritura: true`** para las funciones `PUSH*`. Al colapsar
47 herramientas en una se pierde el `destructiveHint` por función, y una importación escribe en la
contabilidad sin que el servidor pueda deshacerla; la protección pasa a ser explícita.

### Recursos y prompt

`siigo://guia/inicio` trae la misma guía que `--help`, y `siigo://funcion/{nombre}` la firma de
una función en markdown, para consultarla sin gastar una llamada de herramienta. El prompt
`siigo_puesta_en_marcha` recorre el arranque completo. Los recursos no cuestan contexto salvo que
el cliente los pida.

Las funciones `GET*` devuelven la ruta del `.xlsx`, el total de filas, las columnas y las
primeras 50 filas ya parseadas, con un `siguienteOffset` para continuar con `siigo_read_xlsx`.

Los modelos de SIIGO no empiezan por los títulos: llevan el nombre de la empresa en la fila 1,
el del modelo en la 2, dos filas vacías, y los encabezados en la 5. El lector detecta esa fila
automáticamente y recorta el relleno de espacios que arrastra COBOL. Si algún modelo despista a
la heurística, `siigo_read_xlsx` acepta `filaEncabezado` para forzarla.

## Configuración

Se guarda en `%APPDATA%\siigo-pyme-mcp\config.json` (se puede reubicar con
`SIIGO_MCP_CONFIG_DIR`).

```json
{
  "installations": ["D:\\Siigo"],
  "defaultCredentials": { "user": "TU_USUARIO", "password": "TU_CLAVE" },
  "companies": {
    "Z:\\SIIWI01\\": { "alias": "Inmunotek" },
    "Z:\\SIIWI02\\": { "alias": "Comercial", "user": "CONTA", "password": "2222", "year": "2025" }
  },
  "outputDir": "C:\\SiigoMCP\\out",
  "norma": "L",
  "timeoutMs": 180000
}
```

Precedencia de las credenciales: valores de la llamada → `SIIGO_USUARIO`/`SIIGO_CLAVE` →
credencial de la empresa → credencial por defecto.

`outputDir` debe ser **corto**: SIIGO limita la ruta del `.xlsx` a 50 caracteres. `siigo_doctor`
calcula el margen que queda y avisa antes de que el CLI empiece a truncar en silencio.

### Variables de entorno

| Variable | Para qué |
|---|---|
| `SIIGO_USUARIO`, `SIIGO_CLAVE` | Credenciales, como alternativa a guardarlas en el `config.json`. |
| `SIIGO_ANO` | Año de proceso por defecto, 4 dígitos. |
| `SIIGO_TOOLS` | `core` (por defecto) o `all`. Ver [Herramientas](#herramientas). |
| `SIIGO_MCP_CONFIG_DIR` | Reubica la carpeta de configuración. |

## Diagnóstico

```bash
npx -y siigo-pyme-mcp --doctor            # informe legible; exit 1 si el veredicto es NO LISTO
npx -y siigo-pyme-mcp --doctor --json     # el mismo informe para consumo de máquina
npx -y siigo-pyme-mcp --doctor --sin-empresas   # omite el escaneo de discos, más rápido
```

Diez comprobaciones, todas se ejecutan siempre: plataforma, Node, instalaciones de SIIGO, Excel,
sesión de escritorio, configuración, credenciales, empresas accesibles, carpeta de salida y
procesos de SIIGO o Excel vivos. Cada resultado que no esté en `[ ok ]` viene con una acción
concreta, y la última línea es siempre el paso que desbloquea.

Nunca ejecuta `EXCELSIIGO.exe`, no lanza Excel y no escribe ningún archivo. Detecta Excel por el
registro (`App Paths`, y el ProgID COM como respaldo) y la sesión por el número de sesión del
propio proceso: instanciar Excel para comprobar que existe se colgaría en una máquina sin
escritorio, que es justo el fallo que hay que diagnosticar. La clave nunca aparece en el informe;
hay un test que serializa el informe completo y falla si la encuentra.

La misma información está disponible como herramienta MCP, `siigo_doctor`, una vez registrado.

## Limitaciones

Nacen del ejecutable de SIIGO, no del servidor:

- **La clave es visible en la tabla de procesos.** `EXCELSIIGO.exe` la recibe como argumento
  posicional, así que aparece en `Get-CimInstance Win32_Process` mientras dura la ejecución.
  No hay forma de evitarlo desde fuera. El servidor sí la mantiene fuera de logs, mensajes de
  error y respuestas MCP.
- **Una ejecución a la vez.** El CLI no tolera instancias simultáneas; el servidor las encola.
- **Ante un error abre un cuadro de diálogo y espera un clic**, sin escribir el log. El servidor
  vigila el título de la ventana del proceso y, en cuanto reconoce un diálogo de error, cancela
  la ejecución y devuelve ese título: es el único sitio donde SIIGO explica qué pasó cuando no
  llega a escribir nada.
- **Las exportaciones tardan.** Un `GETTER` de mil terceros ronda el minuto; un `GETMOV` de un
  año completo con 25 000 movimientos, algo más de dos. El servidor emite notificaciones de
  progreso para que el cliente no aborte la llamada por silencio, y corta a los 180 segundos
  por defecto (`timeoutMs` en la configuración).
- **No todas las funciones aplican a todas las empresas.** Si SIIGO está licenciado sin el
  módulo de seriales o el de nómina, esas funciones responden `020` o `105`. El servidor lo
  distingue de un error corriente y devuelve `moduloNoDisponible: true`: reintentar no cambia
  nada, hay que habilitar el módulo en SIIGO o usar otra función.
- **Rutas de 50 caracteres.** Se aplica al `.xlsx` de salida y al log. El servidor genera
  nombres cortos y avisa antes de invocar si una ruta se pasa.
- **Requiere Excel y sesión interactiva**, por el uso de COM.
- **`exit code 0` no significa éxito.** El binario puede fallar (`081 Parámetros de la función
  tienen errores`) y salir con 0. El servidor combina tres señales antes de dar por buena una
  corrida: código de salida, contenido del log y existencia y tamaño del archivo generado.
- **Las importaciones dejan su resultado en la carpeta `TEMP` de la empresa**, según documenta
  el manual, no en la ruta que se indique.
- Si la empresa vive en una unidad de red mapeada y el recurso se cae, Windows deja el mapeo
  visible pero desconectado. El servidor lo detecta antes de ejecutar y lo dice explícitamente.

## Desarrollo

```bash
npm install
npm run typecheck
npm test               # 220 tests, incluidos los dorados contra los ejemplos del manual
npm run build
npm run test:smoke     # handshake MCP en los dos perfiles, más --doctor --json
npm run test:e2e       # prueba negativa: exige que un fallo se reporte como fallo
npm run test:tools     # ejercita LAS 56 herramientas contra una instalación real
```

`test:e2e` es el único script que necesita SIIGO instalado; el resto corre en cualquier
máquina, incluida la de CI.

Sin credenciales corre la **prueba negativa**: usa unas inválidas a propósito y exige que el
servidor reporte el fallo, que es justo lo que el binario no hace por su cuenta. Con
credenciales válidas corre la **prueba positiva**, que ejecuta un `GETTER` real y verifica que
el `.xlsx` exista, pese más de cero y traiga columnas y filas legibles:

```bash
SIIGO_USUARIO=TU_USUARIO SIIGO_CLAVE=TU_CLAVE npm run test:e2e     # bash
$env:SIIGO_USUARIO='TU_USUARIO'; $env:SIIGO_CLAVE='TU_CLAVE'; npm run test:e2e   # PowerShell
```

`test:tools` recorre las herramientas del perfil `all`: invoca las de apoyo, **ejecuta de verdad** las 29
exportaciones contra la empresa, y prueba las 18 importaciones **solo por su ruta de
validación**. Las importaciones escriben en la contabilidad y ese script no puede deshacerlo,
así que comprueba el esquema, la resolución de empresa y credenciales y la construcción del
argv, y verifica que rechacen un archivo de entrada inexistente antes de lanzar el ejecutable.
Su argv sí está cubierto al completo por los tests dorados. Para probar una importación de
verdad, use una empresa de pruebas.

### Sobre los tests dorados

El manual de SIIGO (`<instalación>\ExcelSIIGO-Ayuda.LOG`) trae una línea `Ejemplo:` por cada
función. `src/siigo/args.golden.test.ts` reconstruye el `argv` con esos mismos valores y exige
que coincida token por token. Es la única defensa real contra el error `081`, que el binario
reporta en silencio. Si corrige la firma de una función en `src/catalog/functions.ts`, el test
correspondiente se lo confirmará.

## Publicación

La publicación es automática. No se publica nada a mano.

- **`ci.yml`** valida cada PR y cada push a `main` en un runner de Windows: typecheck, tests,
  build, smoke y comprobación de que el tarball solo lleva artefactos de distribución.
- **`publish.yml`** se dispara al empujar un tag `v*` y, tras repetir la validación completa,
  publica a npm con `--provenance`, publica al MCP Registry oficial autenticando con el OIDC
  de GitHub Actions, y crea la GitHub Release con notas generadas.

Para sacar una versión:

```bash
npm version patch --no-git-tag-version   # o minor / major
# sincronizar server.json a la misma versión (version y packages[].version)
git commit -am "release: v0.1.1"
git push
git tag v0.1.1
git push origin v0.1.1
```

El workflow bloquea la publicación si `package.json`, el tag y `server.json` no coinciden:
el MCP Registry rechaza con 422 cuando las versiones difieren, y es mejor fallar antes de
haber subido nada a npm.

Configuración necesaria una sola vez en el repositorio: el secret **`NPM_TOKEN`** con un token
de tipo *Automation* de npm (los tokens Automation omiten el 2FA, que un runner no puede
resolver). El MCP Registry no necesita ningún secret.

## Licencia

MIT. Proyecto independiente, sin relación con Informática y Gestión S.A. (SIIGO).
