"""
Client Mistral — seul point de contact avec l'API Mistral (CLAUDE.md : Mistral
uniquement, clé côté backend exclusivement). httpx synchrone ; le truststore
injecté dans app/__init__ gère le TLS intercepté de ce poste.
"""

import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions"
TIMEOUT_SECONDS = 30.0


def ask_mistral(system_prompt: str, question: str) -> str:
    if not settings.MISTRAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Assistant IA non configuré : renseignez MISTRAL_API_KEY dans "
                "backend/.env (clé disponible sur console.mistral.ai)."
            ),
        )

    try:
        resp = httpx.post(
            MISTRAL_CHAT_URL,
            headers={"Authorization": f"Bearer {settings.MISTRAL_API_KEY}"},
            json={
                "model": settings.MISTRAL_MODEL,
                "temperature": 0.2,  # factuel avant tout
                "max_tokens": 1024,  # analyses structurées pour décideurs
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question},
                ],
            },
            timeout=TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        logger.warning("Erreur API Mistral : %s — %s", exc.response.status_code, exc.response.text[:300])
        if exc.response.status_code == 401:
            detail = "Clé API Mistral invalide ou expirée."
        elif exc.response.status_code == 429:
            detail = "Quota Mistral atteint, réessayez dans un instant."
        else:
            detail = "L'assistant IA est momentanément indisponible."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    except Exception as exc:
        logger.warning("Appel Mistral impossible", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="L'assistant IA est momentanément indisponible.",
        ) from exc
