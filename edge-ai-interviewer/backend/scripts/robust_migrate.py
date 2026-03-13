import sqlite3
import os
import shutil

db_file = "edge_ai_interviewer.db"
possible_paths = [
    os.path.join("instance", db_file),
    db_file
]

print("--- Robust Migration Starting ---")

for path in possible_paths:
    full_path = os.path.abspath(path)
    if os.path.exists(full_path):
        print(f"Checking: {full_path}")
        try:
            # Check if locked
            with open(full_path, 'a+b') as f:
                pass
                
            conn = sqlite3.connect(full_path)
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(interview_sessions);")
            cols = [c[1] for c in cursor.fetchall()]
            
            if "skills" not in cols:
                print("Columns found:", cols)
                print("Adding 'skills' column...")
                cursor.execute("ALTER TABLE interview_sessions ADD COLUMN skills TEXT;")
                conn.commit()
                print("SUCCESS")
            else:
                print("'skills' column already exists.")
            conn.close()
        except Exception as e:
            print(f"FAILED to migrate {full_path}: {e}")
            print("Suggesting DB recreate if this persists.")
    else:
        print(f"Path not found: {full_path}")

print("--- Migration Finished ---")
