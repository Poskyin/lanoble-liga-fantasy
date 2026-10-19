# La Noble Liga Fantasy

Web de la liga: clasificación, jornadas, clausulazos, calendario de LaLiga y Carta Magna.

## De dónde salen los datos

La web lee tres hojas de Google cada vez que alguien la abre (con unos minutos de caché):

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
- `data/anexos.json`: anexos de la Carta Magna (modificaciones, jurisprudencia y votaciones).
- `docs/`: Cartas Magnas en PDF. `docs/fuente/` guarda el texto de la 2026/27 sin anexos.
- `scripts/anexos_pdf.py`: une ese texto con los anexos y genera `docs/carta-magna-2026-27.pdf`.

Los usuarios de la app se asocian a cada mánager en `MIEMBROS`, al principio de `assets/app.js`.

## Multas

- Automáticas, a partir de las jornadas: último 1 €, penúltimo 0,50 €, y 1 € más a quien haga 0 puntos (alineación indebida). Las jornadas marcadas como provisionales no generan multa hasta que se pongan en `No`.
- A mano: una fila en `Sanciones` con Fecha (opcional), Mánager, Concepto e Importe.
- Pagos: una fila en `Pagos` con Fecha, Mánager, Importe y Nota. La web resta lo pagado de lo que debe cada uno.

## Al cambiar el código

Si se toca `assets/app.js` o `assets/styles.css`, sube el número `?v=` con el que se cargan en `index.html`. Así los móviles que ya tenían la web abierta no se quedan con la versión vieja.

## Anexos de la Carta Magna

Se editan en `data/anexos.json`. Después hay que regenerar el PDF:

```
python3 scripts/anexos_pdf.py
```

Numeración: «Modificación xx/ddmmY» (número de orden, día, mes y último dígito del año), «Jurisprudencia NN» y «Votación NN».

## Modo Halloween

Se enciende solo del 15 de octubre al 2 de noviembre: noche morada, calabaza en vez de oro, luna tras el escudo, murciélagos, telarañas y una calabaza para el colista de la general. Cada uno puede apagarlo con el botón de la calabaza de la barra (se recuerda en su navegador). Para verlo fuera de fechas: `?halloween=1`.

Está en `assets/halloween.css`, en `prepararHalloween()` de `assets/app.js` y en el script del `<head>` de `index.html`, que es donde se cambian las fechas.
