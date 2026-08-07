# siigo-pyme-mcp

Servidor [MCP](https://modelcontextprotocol.io) que expone **SIIGO Pyme** a un agente de IA.
Envuelve `EXCELSIIGO.exe`, el ejecutable de interfases de SIIGO, y convierte sus **47 funciones**
de exportación e importación en herramientas MCP con parámetros documentados, descubrimiento
automático de empresas y resultados ya parseados a JSON.

```
Agente: "dame los terceros de la empresa 02"
  → siigo_getter(empresa: "02")
  → EXCELSIIGO.exe Z:\SIIWI02\ 2026 GETTER L ADMON **** ... Terceros.xlsx
  → { ok: true, archivo: "...", totalFilas: 1240, columnas: [...], filas: [...] }
```

## Requisitos

| Requisito | Por qué |
|---|---|
| **Windows** | SIIGO Pyme solo existe en Windows. |
| **SIIGO Pyme instalado** | Se necesita `EXCELSIIGO.exe` (por defecto en `C:\Siigo`). |
| **Microsoft Excel instalado** | SIIGO genera los `.xlsx` con Excel por COM, a través de `SiigoExcel.exe`. Sin Excel no se produce ningún archivo. |
| **Sesión de escritorio activa** | Consecuencia de lo anterior: no funciona como servicio de Windows, ni por SSH sin sesión, ni en un contenedor. |
| **Node.js 18 o superior** | Para ejecutarlo con `npx`. |

## Instalación

No hace falta instalar nada: se ejecuta con `npx`. Añádalo a la configuración MCP de su cliente.

```json
{
  "mcpServers": {
    "siigo": {
      "command": "npx",
      "args": ["-y", "siigo-pyme-mcp"]
    }
  }
}
```

Si prefiere pasar las credenciales por entorno en lugar de guardarlas:

```json
{
  "mcpServers": {
    "siigo": {
      "command": "npx",
      "args": ["-y", "siigo-pyme-mcp"],
      "env": {
        "SIIGO_USUARIO": "ADMON",
        "SIIGO_CLAVE": "1111"
      }
    }
  }
}
```

## Primeros pasos

1. **`siigo_list_installations`** — comprueba qué instalaciones de SIIGO se detectaron.
2. **`siigo_list_companies`** — lista las empresas `SIIWI01`..`SIIWI99` disponibles.
3. **`siigo_set_credentials`** — guarda usuario y clave. Sin indicar empresa, la credencial
   se aplica a **todas**, que es lo más cómodo si usa el mismo usuario en todas ellas.
4. Ya puede llamar a cualquier función: `siigo_getmov`, `siigo_getter`, `siigo_getinv`...

```
siigo_set_credentials(usuario: "ADMON", clave: "1111")
siigo_set_company_alias(empresa: "Z:\\SIIWI01\\", alias: "Inmunotek")
siigo_getmov(empresa: "Inmunotek", fechaInicial: "0101", fechaFinal: "0131", tipoComprobante: "F")
```

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

### De apoyo

| Herramienta | Para qué |
|---|---|
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

Una por cada función del CLI, con el nombre en minúsculas: `siigo_getmov`, `siigo_pushmov`,
`siigo_getter`, `siigo_getinv`, `siigo_getcta`, `siigo_getsal`, `siigo_getinf`... Use
`siigo_list_functions` para verlas todas.

Todas aceptan los mismos campos comunes — `empresa` (obligatorio), `anio`, `norma`,
`instalacion`, `usuario`, `clave` — más los parámetros propios de la función. Las de
exportación admiten además `filasPreview`.

Las funciones `GET*` devuelven la ruta del `.xlsx`, el total de filas, las columnas y las
primeras 50 filas ya parseadas, con un `siguienteOffset` para continuar con `siigo_read_xlsx`.

## Configuración

Se guarda en `%APPDATA%\siigo-pyme-mcp\config.json` (se puede reubicar con
`SIIGO_MCP_CONFIG_DIR`).

```json
{
  "installations": ["D:\\Siigo"],
  "defaultCredentials": { "user": "ADMON", "password": "1111" },
  "companies": {
    "Z:\\SIIWI01\\": { "alias": "Inmunotek" },
    "Z:\\SIIWI02\\": { "alias": "Comercial", "user": "CONTA", "password": "2222", "year": "2025" }
  },
  "outputDir": "C:\\SiigoMCP\\out",
  "norma": "L",
  "timeoutMs": 300000
}
```

Precedencia de las credenciales: valores de la llamada → `SIIGO_USUARIO`/`SIIGO_CLAVE` →
credencial de la empresa → credencial por defecto.

`outputDir` debe ser **corto**: SIIGO limita la ruta del `.xlsx` a 50 caracteres.

## Limitaciones

Nacen del ejecutable de SIIGO, no del servidor:

- **La clave es visible en la tabla de procesos.** `EXCELSIIGO.exe` la recibe como argumento
  posicional, así que aparece en `Get-CimInstance Win32_Process` mientras dura la ejecución.
  No hay forma de evitarlo desde fuera. El servidor sí la mantiene fuera de logs, mensajes de
  error y respuestas MCP.
- **Una ejecución a la vez.** El CLI no tolera instancias simultáneas; el servidor las encola.
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
npm test               # 111 tests, incluidos los 47 dorados contra los ejemplos del manual
npm run build
npm run test:smoke     # handshake MCP y verificación de las 56 herramientas
npm run test:e2e -- ADMON 1111 01   # ejecuta GETTER de verdad contra una empresa
```

`npm run test:e2e` sin argumentos usa credenciales inválidas a propósito, para comprobar que
un fallo se reporta como fallo y no como éxito silencioso. Es el único script que necesita
SIIGO instalado; el resto corre en cualquier máquina, incluida la de CI.

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
