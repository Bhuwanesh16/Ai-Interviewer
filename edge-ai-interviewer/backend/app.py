import os
from flask import Flask, request
from config import get_config
from extensions import init_extensions, db


def create_app():
    app = Flask(__name__)

    # Load configuration
    app.config.from_object(get_config())

    # Initialize extensions (DB, Migrate, CORS)
    init_extensions(app)

    # Import models (so migrations detect them)
    from models.user_model import User  # noqa: F401
    from models.session_model import InterviewSession  # noqa: F401
    from models.response_model import Response  # noqa: F401

    # Register Blueprints
    from routes.auth_routes import auth_bp
    from routes.interview_routes import interview_bp
    from routes.result_routes import result_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(interview_bp, url_prefix="/api/interview")
    app.register_blueprint(result_bp, url_prefix="/api/interview")

    # Health Check Route
    @app.get("/api/health")
    def health_check():
        return {"status": "ok"}, 200

    # Ensure CORS headers on every response (including 5xx) so browser doesn't hide real errors
    @app.after_request
    def add_cors_headers(response):
        origins = app.config.get("CORS_ORIGINS", "http://localhost:5173")
        if isinstance(origins, str):
            origins = [o.strip() for o in origins.split(",") if o.strip()]
        origin = request.origin if request.origin else "http://localhost:5173"
        if origin in origins:
            response.headers["Access-Control-Allow-Origin"] = origin
        elif origins:
            response.headers["Access-Control-Allow-Origin"] = origins[0]
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    return app


# Run server
if __name__ == "__main__":
    app = create_app()
    # Create SQLite tables if they don't exist (no migration needed for first run)
    with app.app_context():
        db.create_all()
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)