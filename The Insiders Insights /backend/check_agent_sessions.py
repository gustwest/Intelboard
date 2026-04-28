import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys

# Add backend to path
sys.path.append('/Users/gustavwestergren/Documents/AntiGravityRepo/The Insiders Insights /backend')
import models

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./app.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

sessions = db.query(models.AgentSession).order_by(models.AgentSession.created_at.desc()).limit(5).all()

print(f"Latest 5 Agent Sessions:")
for s in sessions:
    print(f"- Session ID: {s.id}")
    print(f"  Title: {s.title}")
    print(f"  Claude Session ID: {s.claude_session_id}")
    for t in s.tasks:
        print(f"    - Task ID: {t.id}, Status: {t.status}, Claude Session ID: {t.claude_session_id}")
