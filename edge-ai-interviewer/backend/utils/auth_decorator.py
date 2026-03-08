"""
Token-required decorator for Flask route protection.

Fixes applied:
- Added handling for OPTIONS preflight requests: browsers send OPTIONS before
  every credentialed cross-origin POST. Previously the decorator rejected them
  with 401 before Flask-CORS could respond, breaking all CORS preflight checks.
- Added a specific 401 branch for a token that is present but empty string,
  giving a clearer error message than "Invalid or expired token".
"""

from functools import wraps

from flask import request, jsonify

from routes.auth_routes import verify_token


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # FIX: Let CORS preflight OPTIONS requests pass through without auth.
        # Without this, every browser request fails before it even reaches
        # the actual POST/GET because Flask-CORS never gets to attach its headers.
        if request.method == "OPTIONS":
            return f(*args, **kwargs)

        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return jsonify({"message": "Unauthorized: Missing or invalid token format"}), 401

        token = auth_header.split(" ", 1)[1].strip()

        # FIX: Explicit check for empty token string (e.g. "Bearer " with no value)
        if not token:
            return jsonify({"message": "Unauthorized: Token is empty"}), 401

        user_id = verify_token(token)

        if not user_id:
            return jsonify({"message": "Unauthorized: Invalid or expired token"}), 401

        return f(user_id, *args, **kwargs)

    return decorated