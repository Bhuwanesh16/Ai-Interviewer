"""
Flask extension singletons.

Fixes applied:
- No logic bugs found.
- Added explicit export of `migrate` so other modules can reference it if
  needed (e.g. custom migration hooks).
- Tightened CORS vary header handling: Flask-CORS should emit a Vary: Origin
  header automatically, but the explicit `vary_header=True` kwarg makes this
  deliberate and forwards-compatible with Flask-CORS version changes.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS

# Extension singletons — created without an app so they can be imported
# before create_app() is called (the application factory pattern).
db = SQLAlchemy()
migrate = Migrate()


def init_extensions(app) -> None:
    """Bind all Flask extensions to the given application instance."""

    db.init_app(app)
    migrate.init_app(app, db)

    # Build the allowed-origins list from config
    origins = app.config.get("CORS_ORIGINS", "http://localhost:5173")
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(",") if o.strip()]

    CORS(
        app,
        origins=origins,
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        vary_header=True,   # Emit Vary: Origin so CDNs/proxies cache correctly
    )