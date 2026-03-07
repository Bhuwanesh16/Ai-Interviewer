from functools import wraps
from flask import request, jsonify
from routes.auth_routes import verify_token

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"message": "Unauthorized: Missing or invalid token format"}), 401
        
        token = auth_header.split(" ", 1)[1]
        user_id = verify_token(token)
        
        if not user_id:
            return jsonify({"message": "Unauthorized: Invalid or expired token"}), 401
            
        return f(user_id, *args, **kwargs)
    
    return decorated
