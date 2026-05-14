import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base
from routers import auth as auth_router
from routers import users as users_router
from routers import connections as connections_router
from routers import schema as schema_router
from routers import docs as docs_router
from routers import tracker as tracker_router
from routers import erd as erd_router
from routers import assistant as assistant_router
from routers import optimizer as optimizer_router
from routers import license_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="DB Hub", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(connections_router.router)
app.include_router(schema_router.router)
app.include_router(docs_router.router)
app.include_router(tracker_router.router)
app.include_router(erd_router.router)
app.include_router(assistant_router.router)
app.include_router(optimizer_router.router)
app.include_router(license_router.router)

FRONTEND = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(FRONTEND):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        return FileResponse(os.path.join(FRONTEND, "index.html"))
