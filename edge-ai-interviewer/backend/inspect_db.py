import sqlite3
import os
from flask import Flask
from extensions import db
from models.session_model import InterviewSession
from config import get_config

app = Flask(__name__)
app.config.from_object(get_config())
db.init_app(app)

with app.app_context():
    # Show database path
    print(f"SQLALCHEMY_DATABASE_URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
    
    # Use sqlite3 to check schema directly on the presumed file
    db_uri = app.config['SQLALCHEMY_DATABASE_URI']
    if db_uri.startswith('sqlite:///'):
        rel_path = db_uri.replace('sqlite:///', '')
        # Flask-SQLAlchemy often puts it in instance/ if it's just a filename
        # But we should check both
        paths = [rel_path, os.path.join('instance', rel_path)]
        for p in paths:
            if os.path.exists(p):
                print(f"Found DB at: {p}")
                conn = sqlite3.connect(p)
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(interview_sessions);")
                columns = cursor.fetchall()
                print(f"Columns in interview_sessions ({p}):")
                for col in columns:
                    print(f"  - {col[1]} ({col[2]})")
                conn.close()
            else:
                print(f"DB NOT found at: {p}")
