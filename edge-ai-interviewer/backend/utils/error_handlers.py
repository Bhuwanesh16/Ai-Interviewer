from flask import jsonify
from werkzeug.exceptions import HTTPException
import traceback

def register_error_handlers(app):
    """Register professional error handlers for the Flask application."""

    @app.errorhandler(Exception)
    def handle_exception(e):
        # Pass through HTTP errors
        if isinstance(e, HTTPException):
            app.logger.error(f"HTTP error: {e.description}")
            return jsonify({
                "error": e.name,
                "message": e.description
            }), e.code

        # Handle non-HTTP exceptions
        app.logger.error(f"Unhandled exception: {str(e)}")
        app.logger.error(traceback.format_exc())
        
        # In production, don't leak internal details
        if app.config.get("ENV") == "production":
            return jsonify({
                "error": "Internal Server Error",
                "message": "An unexpected error occurred. Please try again later."
            }), 500
        
        return jsonify({
            "error": "Internal Server Error",
            "message": str(e),
            "traceback": traceback.format_exc() if app.debug else None
        }), 500

    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({
            "error": "Not Found",
            "message": "The requested resource was not found on this server."
        }), 404

    @app.errorhandler(400)
    def handle_400(e):
        return jsonify({
            "error": "Bad Request",
            "message": str(e.description)
        }), 400
