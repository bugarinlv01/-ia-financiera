"""Integración con Claude (API de Anthropic) para el chat con Fina y el análisis de contratos."""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Iterator

import anthropic

MODELO = "claude-opus-5-5"
BETAS = ["server-side-fallback-2026-07-01"]  # si el modelo declina, el API reintenta con un modelo de respaldo
RUTA_PROMPT = Path(__file__).resolve().parent.parent / "prompts" / "fina_system.md"


def prompt_fina() -> str:
    return RUTA_PROMPT.read_text(encoding="utf-8").strip()


def crear_cliente(api_key: str | None) -> anthropic.Anthropic | None:
    return anthropic.Anthropic(api_key=api_key) if api_key else None


def _error_amable(e: Exception) -> str:
    if isinstance(e, anthropic.AuthenticationError):
        return "La API key de Anthropic no es válida. Revisa ANTHROPIC_API_KEY en .streamlit/secrets.toml."
    if isinstance(e, anthropic.RateLimitError):
        return "Se alcanzó el límite de uso de la API. Intenta de nuevo en un momento."
    if isinstance(e, anthropic.APIConnectionError):
        return "No hay conexión con la API de Anthropic. Revisa tu red."
    if isinstance(e, anthropic.APIStatusError):
        return f"La API respondió con un error ({e.status_code}). Intenta de nuevo."
    return f"Error inesperado: {e}"


def chat_stream(cliente: anthropic.Anthropic, contexto_datos: str, historial: list[dict]) -> Iterator[str]:
    """Devuelve el texto de Fina en streaming. `historial` usa el formato de mensajes de la API."""
    system = [
        {"type": "text", "text": prompt_fina()},
        {"type": "text", "text": "DATOS DEL USUARIO (cargados en la app; úsalos como única fuente de cifras):\n\n"
                                 + contexto_datos, "cache_control": {"type": "ephemeral"}},
    ]
    try:
        with cliente.beta.messages.stream(
            model=MODELO,
            max_tokens=16000,
            system=system,
            messages=historial,
            thinking={"type": "adaptive"},
            output_config={"effort": "medium"},
            betas=BETAS,
            fallbacks="default",
        ) as stream:
            yield from stream.text_stream
            final = stream.get_final_message()
        if final.stop_reason == "refusal":
            yield "\n\n_No puedo ayudar con esa solicitud. Intenta reformular tu pregunta._"
        elif final.stop_reason == "max_tokens":
            yield "\n\n_(La respuesta se cortó por longitud; pídeme que continúe.)_"
    except anthropic.APIError as e:
        yield f"⚠️ {_error_amable(e)}"


ESQUEMA_CONTRATO = {
    "type": "object",
    "additionalProperties": False,
    "required": ["resumen", "partes", "vigencia", "vencimientos", "penalizaciones", "obligaciones",
                 "revision_profesional", "recomendaciones", "confianza"],
    "properties": {
        "resumen": {"type": "string", "description": "Resumen en 2-3 frases sencillas."},
        "partes": {"type": "array", "items": {"type": "string"}},
        "vigencia": {
            "type": "object", "additionalProperties": False,
            "required": ["inicio", "fin", "renovacion_automatica", "aviso_no_renovacion"],
            "properties": {
                "inicio": {"type": "string", "description": "AAAA-MM-DD o 'No especificado'"},
                "fin": {"type": "string", "description": "AAAA-MM-DD o 'No especificado'"},
                "renovacion_automatica": {"type": "boolean"},
                "aviso_no_renovacion": {"type": "string"},
            },
        },
        "vencimientos": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["fecha", "descripcion", "clausula"],
            "properties": {"fecha": {"type": "string", "description": "AAAA-MM-DD, o descripción del plazo si es recurrente"},
                           "descripcion": {"type": "string"}, "clausula": {"type": "string"}}}},
        "penalizaciones": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["clausula", "descripcion", "monto_o_porcentaje", "riesgo"],
            "properties": {"clausula": {"type": "string"}, "descripcion": {"type": "string"},
                           "monto_o_porcentaje": {"type": "string"},
                           "riesgo": {"type": "string", "enum": ["alto", "medio", "bajo"]}}}},
        "obligaciones": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["parte", "obligacion", "plazo", "clausula"],
            "properties": {"parte": {"type": "string"}, "obligacion": {"type": "string"},
                           "plazo": {"type": "string"}, "clausula": {"type": "string"}}}},
        "revision_profesional": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["clausula", "motivo", "riesgo"],
            "properties": {"clausula": {"type": "string"}, "motivo": {"type": "string"},
                           "riesgo": {"type": "string", "enum": ["alto", "medio", "bajo"]}}}},
        "recomendaciones": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["titulo", "porque", "accion"],
            "properties": {"titulo": {"type": "string"}, "porque": {"type": "string"}, "accion": {"type": "string"}}}},
        "confianza": {"type": "string", "enum": ["alta", "media", "baja"]},
    },
}

INSTRUCCION_CONTRATO = """Analiza el contrato adjunto para el dueño de una pyme en México. Hoy es {hoy}; la pyme usuaria es {empresa}.
Identifica, citando el número de cláusula:
- penalizaciones (penas convencionales, intereses moratorios, multas, causales de rescisión) con su nivel de riesgo;
- vigencia, renovaciones y vencimientos/plazos clave (incluye avisos que deban darse y si ya pasaron respecto a hoy);
- obligaciones de cada parte con su plazo;
- cláusulas que requieren revisión de un abogado o contador (posiblemente abusivas, renuncias de derechos, jurisdicción lejana, ambigüedades, implicaciones fiscales).
Usa español sencillo. No inventes datos que no estén en el texto; si algo no se especifica, dilo.
Cada recomendación debe explicar el porqué y una acción concreta que el usuario pueda aprobar o corregir.
Recuerda: no aceptas ni firmas contratos; solo recomiendas."""


def analizar_contrato(cliente: anthropic.Anthropic, nombre: str, contenido: bytes, texto: str,
                      hoy: str, empresa: str) -> dict:
    """Analiza un contrato (PDF nativo o texto) con salida estructurada. Lanza RuntimeError con mensaje amable."""
    if nombre.lower().endswith(".pdf"):
        doc = {"type": "document", "title": nombre,
               "source": {"type": "base64", "media_type": "application/pdf",
                          "data": base64.standard_b64encode(contenido).decode()}}
    else:
        doc = {"type": "document", "title": nombre,
               "source": {"type": "text", "media_type": "text/plain", "data": texto}}
    try:
        with cliente.beta.messages.stream(
            model=MODELO,
            max_tokens=32000,
            system=prompt_fina(),
            messages=[{"role": "user", "content": [
                doc, {"type": "text", "text": INSTRUCCION_CONTRATO.format(hoy=hoy, empresa=empresa)}]}],
            thinking={"type": "adaptive"},
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": ESQUEMA_CONTRATO}},
            betas=BETAS,
            fallbacks="default",
        ) as stream:
            final = stream.get_final_message()
    except anthropic.APIError as e:
        raise RuntimeError(_error_amable(e)) from e
    if final.stop_reason == "refusal":
        raise RuntimeError("El modelo no pudo analizar este documento.")
    if final.stop_reason == "max_tokens":
        raise RuntimeError("El análisis quedó incompleto por longitud. Intenta con un contrato más corto.")
    texto_json = next((b.text for b in final.content if b.type == "text"), "")
    return json.loads(texto_json)
