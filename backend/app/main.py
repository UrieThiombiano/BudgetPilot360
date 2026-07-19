from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.modules.ai_assistant.router import router as ai_router
from app.modules.categories.router import router as categories_router
from app.modules.companies.router import router as companies_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.expenses.router import router as expenses_router
from app.modules.notifications.router import router as notifications_router
from app.modules.platform.router import router as platform_router
from app.modules.profiles.router import router as profiles_router
from app.modules.recurring.router import router as recurring_router
from app.modules.recurring.router import revenues_router as recurring_revenues_router
from app.modules.registration.router import router as registration_router
from app.modules.reports.router import router as reports_router
from app.modules.revenues.router import router as revenues_router
from app.modules.team.router import router as team_router

app = FastAPI(title="BudgetPilot360 API", version="0.1.0")

# CORS restreint aux origines déclarées (FRONTEND_URL, séparées par des virgules
# si besoin : domaine Vercel de prod + previews). Jamais "*" en production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.FRONTEND_URL.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


app.include_router(profiles_router, prefix="/profiles", tags=["profiles"])
app.include_router(companies_router, prefix="/companies", tags=["companies"])
app.include_router(team_router, prefix="/team", tags=["team"])
app.include_router(categories_router, prefix="/categories", tags=["categories"])
app.include_router(expenses_router, prefix="/expenses", tags=["expenses"])
app.include_router(recurring_router, prefix="/recurring-expenses", tags=["recurring"])
app.include_router(recurring_revenues_router, prefix="/recurring-revenues", tags=["recurring"])
app.include_router(revenues_router, prefix="/revenues", tags=["revenues"])
app.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
app.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
app.include_router(reports_router, prefix="/reports", tags=["reports"])
app.include_router(ai_router, prefix="/ai", tags=["ai"])
app.include_router(platform_router, prefix="/platform", tags=["platform"])
app.include_router(registration_router, prefix="/registration", tags=["registration"])

# Les prochains routers métier (categories, budgets, expenses, ai_assistant)
# seront branchés ici sur le même modèle.
