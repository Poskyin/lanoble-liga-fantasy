#!/usr/bin/env python3
"""Genera la Carta Magna 2026/27 con anexos en un solo PDF.

Une el texto de la Carta Magna (docs/fuente/carta-magna-2026-27-texto.pdf) con unas
páginas de anexos generadas a partir de data/anexos.json:
  Anexo I   Modificaciones
  Anexo II  Jurisprudencia
  Anexo III Votaciones

Uso (desde la raíz del repositorio):
    python3 scripts/anexos_pdf.py
Salida: docs/carta-magna-2026-27.pdf

Necesita reportlab y pypdf (pip install reportlab pypdf).
"""
import io
import json
import os
from datetime import date
from html import escape

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE_PDF = os.path.join(RAIZ, 'docs', 'fuente', 'carta-magna-2026-27-texto.pdf')
SALIDA_PDF = os.path.join(RAIZ, 'docs', 'carta-magna-2026-27.pdf')
ANEXOS = os.path.join(RAIZ, 'data', 'anexos.json')

GRANATE = HexColor('#7a1f1a')
TINTA = HexColor('#1f1a14')
GRIS = HexColor('#5d4f3b')
BANDA = HexColor('#ead9b0')

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
         'septiembre', 'octubre', 'noviembre', 'diciembre']


def fuentes():
    """DejaVu si está instalada (acentos y comillas seguros); si no, las de serie."""
    base = '/usr/share/fonts/truetype/dejavu/'
    try:
        pdfmetrics.registerFont(TTFont('Serif', base + 'DejaVuSerif.ttf'))
        pdfmetrics.registerFont(TTFont('Serif-B', base + 'DejaVuSerif-Bold.ttf'))
        pdfmetrics.registerFont(TTFont('Serif-I', base + 'DejaVuSerif-Italic.ttf'))
        return 'Serif', 'Serif-B', 'Serif-I'
    except Exception:
        return 'Times-Roman', 'Times-Bold', 'Times-Italic'


def fecha_larga(f):
    if not f:
        return ''
    partes = [int(x) for x in f.split('-')]
    if len(partes) == 1:
        return str(partes[0])
    if len(partes) == 2:
        return f'{MESES[partes[1] - 1]} de {partes[0]}'
    return f'{partes[2]} de {MESES[partes[1] - 1]} de {partes[0]}'


def construir_anexos(datos):
    normal, negrita, cursiva = fuentes()
    st = {
        'titulo': ParagraphStyle('t', fontName=negrita, fontSize=18, leading=22, alignment=TA_CENTER, textColor=GRANATE, spaceAfter=4),
        'sub': ParagraphStyle('s', fontName=cursiva, fontSize=10.5, leading=14, alignment=TA_CENTER, textColor=GRIS, spaceAfter=18),
        'anexo': ParagraphStyle('a', fontName=negrita, fontSize=12.5, leading=16, textColor=TINTA),
        'ficha': ParagraphStyle('f', fontName=negrita, fontSize=10.5, leading=14, textColor=GRANATE, spaceBefore=10, spaceAfter=2),
        'meta': ParagraphStyle('m', fontName=cursiva, fontSize=9, leading=12, textColor=GRIS, spaceAfter=5),
        'texto': ParagraphStyle('x', fontName=normal, fontSize=10, leading=14.5, alignment=TA_JUSTIFY, textColor=TINTA, spaceAfter=5),
        'nota': ParagraphStyle('n', fontName=cursiva, fontSize=9.5, leading=13.5, textColor=GRIS, spaceAfter=5),
    }

    def banda(texto):
        t = Table([[Paragraph(escape(texto), st['anexo'])]], colWidths=[17 * cm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BANDA),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        return [Spacer(1, 10), t, Spacer(1, 4)]

    def parrafos(texto):
        return [Paragraph(escape(p.strip()).replace('\n', '<br/>'), st['texto'])
                for p in str(texto or '').split('\n\n') if p.strip()]

    def meta(x):
        bits = [fecha_larga(x.get('fecha'))]
        if x.get('articulos'):
            bits.append('Afecta a: ' + ', '.join(x['articulos']))
        return Paragraph(escape('. '.join(b for b in bits if b)) + '.', st['meta'])

    h = [Paragraph('ANEXOS', st['titulo']),
         Paragraph(f'Carta Magna de La Noble Liga Fantasy, temporada 2026/27. Actualizados el {fecha_larga(datos.get("actualizado") or date.today().isoformat())}.', st['sub'])]

    # Anexo I
    h += banda('Anexo I. Modificaciones')
    mods = datos.get('modificaciones') or []
    if not mods:
        h.append(Paragraph('Ninguna modificación desde el Decreto de Refundación.', st['texto']))
    for x in mods:
        bloque = [Paragraph(escape(f'{x["codigo"]}. {x["titulo"]}'), st['ficha']), meta(x)] + parrafos(x.get('texto'))
        if x.get('votacion'):
            bloque.append(Paragraph(escape(f'Aprobada en {x["votacion"]}.'), st['nota']))
        h.append(KeepTogether(bloque))
    if datos.get('nota_historica'):
        h.append(Paragraph(escape(datos['nota_historica']), st['nota']))

    # Anexo II
    h += banda('Anexo II. Jurisprudencia')
    juris = datos.get('jurisprudencia') or []
    if not juris:
        h.append(Paragraph('Todavía no hay jurisprudencia.', st['texto']))
    for x in juris:
        bloque = [Paragraph(escape(f'{x["codigo"]}. {x["titulo"]}'), st['ficha']), meta(x)] + parrafos(x.get('criterio'))
        if x.get('motivo'):
            bloque.append(Paragraph('<b>Motivo:</b> ' + escape(x['motivo']), st['nota']))
        if x.get('origen'):
            extra = f', {x["votacion"]}' if x.get('votacion') else ''
            bloque.append(Paragraph(escape(f'{x["origen"]}{extra}.'), st['nota']))
        h.append(KeepTogether(bloque))

    # Anexo III
    h += banda('Anexo III. Votaciones')
    votos = datos.get('votaciones') or []
    if not votos:
        h.append(Paragraph('No hay votaciones registradas todavía.', st['texto']))
    for x in votos:
        bloque = [Paragraph(escape(f'{x["codigo"]}. {x["asunto"]}'), st['ficha']),
                  Paragraph(escape(f'{fecha_larga(x.get("fecha"))}. Resultado: {x.get("resultado", "pendiente")}. Mayoría necesaria: {x.get("mayoria", "—")}.'), st['meta'])]
        filas = [[escape(k), escape(v)] for k, v in (x.get('votos') or {}).items()]
        if filas:
            t = Table(filas, colWidths=[8 * cm, 4 * cm])
            t.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), normal), ('FONTSIZE', (0, 0), (-1, -1), 9.5),
                ('TEXTCOLOR', (0, 0), (-1, -1), TINTA), ('LINEBELOW', (0, 0), (-1, -1), 0.4, HexColor('#d8c9a3')),
                ('LEFTPADDING', (0, 0), (-1, -1), 2), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            bloque.append(t)
        if x.get('relacionada'):
            bloque.append(Paragraph(escape(f'Da lugar a: {x["relacionada"]}.'), st['nota']))
        h.append(KeepTogether(bloque))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2.2 * cm, bottomMargin=2 * cm,
                            title='Anexos de la Carta Magna', author='La Noble Liga Fantasy')
    doc.build(h)
    buf.seek(0)
    return buf


def main():
    with open(ANEXOS, encoding='utf-8') as f:
        datos = json.load(f)
    anexos = PdfReader(construir_anexos(datos))
    escritor = PdfWriter()
    for pagina in PdfReader(FUENTE_PDF).pages:
        escritor.add_page(pagina)
    for pagina in anexos.pages:
        escritor.add_page(pagina)
    escritor.add_metadata({'/Title': 'Carta Magna de La Noble Liga Fantasy 2026/27, con anexos', '/Author': 'La Noble Liga Fantasy'})
    with open(SALIDA_PDF, 'wb') as f:
        escritor.write(f)
    print(f'{SALIDA_PDF}: {len(escritor.pages)} páginas ({len(anexos.pages)} de anexos)')


if __name__ == '__main__':
    main()
