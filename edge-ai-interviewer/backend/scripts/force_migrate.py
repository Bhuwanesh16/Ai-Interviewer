import sqlite3
import os

db_paths = ["instance/edge_ai_interviewer.db", "edge_ai_interviewer.db"]

for db_path in db_paths:
    if os.path.exists(db_path):
        print(f"Migrating {db_path}...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column exists
        cursor.execute("PRAGMA table_info(interview_sessions);")
        columns = [row[1] for row in cursor.fetchall()]
        
        if "skills" not in columns:
            try:
                cursor.execute("ALTER TABLE interview_sessions ADD COLUMN skills TEXT;")
                conn.commit()
                print(f"Successfully added 'skills' to {db_path}")
            except Exception as e:
                print(f"Error migrating {db_path}: {e}")
        else:
            print(f"'skills' already exists in {db_path}")
        conn.close()
    else:
        print(f"Not found: {db_path}")
