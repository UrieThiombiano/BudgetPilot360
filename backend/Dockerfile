# BudgetPilot360 — backend FastAPI (déploiement Render/Railway).
# Docker est utilisé ICI uniquement pour le déploiement cloud : WeasyPrint (PDF)
# a besoin des bibliothèques natives Pango/GDK, absentes des runtimes Python
# managés. La règle « pas de Docker » de CLAUDE.md vise le dev local (Supabase
# cloud direct), pas l'empaquetage de prod.

FROM python:3.12-slim

# Dépendances natives de WeasyPrint (rendu PDF)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Render/Railway injectent $PORT ; 8000 par défaut en local
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
