import os
from flask import Flask
from config import get_config
from extensions import init_extensions, db


def create_app():
    app = Flask(__name__)
    app.config.from_object(get_config())

    init_extensions(app)

    # Import models so Flask-Migrate sees them
    from models.user_model import User  # noqa: F401
    from models.session_model import InterviewSession  # noqa: F401
    from models.response_model import Response  # noqa: F401

    # Register blueprints
    from routes.auth_routes import auth_bp
    from routes.interview_routes import interview_bp
    from routes.result_routes import result_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(interview_bp, url_prefix="/api/interview")
    app.register_blueprint(result_bp, url_prefix="/api/interview")

    @app.get("/api/health")
    def health_check():
        return {"status": "ok"}, 200

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

