from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS

# Create extension objects (without binding to app yet)
db = SQLAlchemy()
migrate = Migrate()


def init_extensions(app):
    """
    Initialize Flask extensions with the given app.
    """
    # Initialize database
    db.init_app(app)

    # Initialize migrations
    migrate.init_app(app, db)

    # CORS: allow frontend origin so browser accepts API responses
    origins = app.config.get("CORS_ORIGINS", "http://localhost:5173")
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(",") if o.strip()]
    CORS(
        app,
        origins=origins,
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )