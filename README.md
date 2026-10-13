# La Noble Liga Fantasy

Web de la liga: clasificación, jornadas, clausulazos, calendario de LaLiga y Carta Magna.

## De dónde salen los datos

La web lee dos hojas de Google cada vez que alguien la abre (con unos minutos de caché):

| Qué | Hoja | Pestaña |
|---|---|---|
| Puntos de cada jornada | `NLF – Jornadas` | la primera |
| Clausulazos | `Registro Clausulazos` | `Hoja 1` |
| Semanas de clausulazos | `Registro Clausulazos` | `Periodos` |
| Sanciones (multas a mano) | `NLF – Administración` | `Sanciones` |
| Pagos al tesorero | `NLF – Administración` | `Pagos` |

Las tres hojas tienen que estar compartidas como **"Cualquier persona con el enlace" → Lector**.
Si una hoja no se puede leer, la web enseña la copia guardada en `data/respaldo.json` y lo dice en el pie.

## Añadir una jornada

En `NLF – Jornadas`, cinco filas nuevas con el orden que da la app:

| Jornada | Posicion | Usuario | Puntos | Provisional |
|---|---|---|---|---|
| 9 | 1 | MrPipita20 | 70 | No |

`Provisional` = `Sí` mientras haya partidos aplazados. Cuando se cierren, se cambia a `No` y se corrigen los puntos.

## Estructura

- `index.html`, `assets/`: la página.
- `api/datos.js`: función de Vercel que lee las hojas y devuelve JSON.
- `data/calendario.json`: calendario de LaLiga 2026/27 por fin de semana.
- `data/respaldo.json`: copia de seguridad de los datos.
- `docs/`: Cartas Magnas en PDF.

Los usuarios de la app se asocian a cada mánager en `MIEMBROS`, al principio de `assets/app.js`.

## Multas

- Automáticas, a partir de las jornadas: último 1 €, penúltimo 0,50 €, y 1 € más a quien haga 0 puntos (alineación indebida).
- A mano: una fila en `Sanciones` con Fecha (opcional), Mánager, Concepto e Importe.
- Pagos: una fila en `Pagos` con Fecha, Mánager, Importe y Nota. La web resta lo pagado de lo que debe cada uno.
