import sqlite3
import os

db_path = "instance/edge_ai_interviewer.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE interview_sessions ADD COLUMN skills TEXT;")
        conn.commit()
        print("Column 'skills' added successfully.")
    except sqlite3.OperationalError as e:
        print(f"Error or already exists: {e}")
    conn.close()
else:
    print("Database file not found.")
