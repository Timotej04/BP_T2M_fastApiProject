from fastapi import FastAPI, HTTPException, Depends, Query, status
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from contextlib import contextmanager
from datetime import datetime, timezone

import os
import json
import requests
import sqlite3
import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

print(">>> Nacitavam main.py (so zabezpecenim + kategoriami)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── KATEGÓRIE ────────────────────────────────────────────────

PREDEFINED_CATEGORIES = [
    "HR", "IT", "Financie", "Operácie", "Marketing",
    "Zákaznícky servis", "Územné celky", "Šport",
    "Školstvo", "Právo", "Hospodárstvo", "Iné",
]

# ─── BEZPEČNOSŤ ───────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-tajny-vyvojarsky-kluc-12345")
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── PYDANTIC MODELY ──────────────────────────────────────────

class Node(BaseModel):
    id: str
    type: str
    label: str
    actor: Optional[str] = None

class Edge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None

class ProcessModel(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class TextInput(BaseModel):
    description: str
    min_nodes: Optional[int] = 2
    max_nodes: Optional[int] = 10

class CatalogSaveRequest(BaseModel):
    title: str
    prompt: str
    min_nodes: int
    max_nodes: int
    final_node_count: int
    model_json: dict
    is_public: bool = False
    category: str = "Iné"

class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str

# ─── SQLITE SETUP ─────────────────────────────────────────────

DB_PATH = "process_catalog.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS processes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            min_nodes INTEGER NOT NULL,
            max_nodes INTEGER NOT NULL,
            final_node_count INTEGER NOT NULL,
            model_json TEXT NOT NULL,
            is_public BOOLEAN DEFAULT 0,
            category TEXT DEFAULT 'Iné',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    try:
        cursor.execute("ALTER TABLE processes ADD COLUMN category TEXT DEFAULT 'Iné'")
        conn.commit()
        print("✅ Migrácia: stĺpec 'category' pridaný")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()
    print("✅ SQLite DB inicializovaná")

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# ─── AUTH POMOCNÉ FUNKCIE ─────────────────────────────────────

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Neplatný token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        username: str = payload.get("username")
        if user_id is None or username is None:
            raise credentials_exception
    except jwt.PyJWTError as e:
        print(f"Chyba dekódovania tokenu: {e}")
        raise credentials_exception
    return {"user_id": user_id, "username": username}

# ─── GROQ ─────────────────────────────────────────────────────

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

def generate_diagram_from_text(description: str, min_nodes: int, max_nodes: int) -> ProcessModel:
    print(f"🎯 PROMPT: {description[:50]}... | Uzlov: {min_nodes} - {max_nodes}")

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Nastav GROQ_API_KEY v .env")

    prompt = f"""
Vytvor JSON model business procesu. Tvojou JEDINOU úlohou je vrátiť syntakticky správny a validný JSON a ABSOLÚTNE ŽIADEN INÝ TEXT.

Štruktúra, ktorú musíš striktne dodržať:
{{
  "nodes": [
    {{"id": "start", "type": "startEvent", "label": "Začiatok procesu"}},
    {{"id": "t1", "type": "task", "label": "Názov úlohy", "actor": "Rola"}},
    {{"id": "gw1", "type": "gateway", "label": "Rozhodnutie?"}},
    {{"id": "end", "type": "endEvent", "label": "Koniec procesu"}}
  ],
  "edges": [
    {{"id": "e1", "source": "start", "target": "t1"}},
    {{"id": "e2", "source": "t1", "target": "gw1"}},
    {{"id": "e3", "source": "gw1", "target": "end", "label": "Áno"}},
    {{"id": "e4", "source": "gw1", "target": "t1", "label": "Nie"}}
  ]
}}

PRAVIDLÁ:
1. MUSÍ to byť len JSON objekt.
2. Proces má mať medzi 1 startEvent a 1 endEvent približne {min_nodes} až {max_nodes} uzlov typu "task" alebo "gateway".
3. "actor" je voliteľný.
4. Každý uzol typu "gateway" MUSÍ mať aspoň 2 odchádzajúce hrany.
5. KAŽDÁ hrana vychádzajúca z uzla typu "gateway" MUSÍ mať vyplnené pole "label" s konkrétnou podmienkou zodpovedajúcou kontextu procesu (napr. "Áno"/"Nie", "Schválené"/"Zamietnuté"). Nikdy nepoužívaj generické "Možnosť 1" / "Možnosť 2".
6. Hrany medzi bežnými "task" uzlami label nepotrebujú.
7. Posledný element v zoznamoch (nodes, edges) NESMIE mať za sebou čiarku!

Zadanie procesu:
{description}
"""

    try:
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a JSON generator. You output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 5000,
                "temperature": 0.0,
                "response_format": {"type": "json_object"}
            },
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Groq nevrátil žiadne choices")

        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message", {})
            content = message.get("content", "") if isinstance(message, dict) else str(message)
        else:
            content = str(first)

        content = content.strip()

        if content.startswith("```"):
            lines = content.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            content = '\n'.join(lines).strip()

        try:
            diagram = json.loads(content)
        except json.JSONDecodeError as e:
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            if start_idx != -1 and end_idx != 0 and start_idx < end_idx:
                content = content[start_idx:end_idx]
                diagram = json.loads(content)
            else:
                raise e

        if isinstance(diagram, list):
            if len(diagram) > 0 and isinstance(diagram[0], dict):
                diagram = diagram[0]
            else:
                raise ValueError("AI vrátilo list namiesto JSON objektu")

        if not isinstance(diagram, dict):
            raise ValueError(f"Neočakávaný typ odpovede: {type(diagram)}")

        nodes = []
        node_ids = set()
        raw_nodes = diagram.get("nodes", [])
        if not isinstance(raw_nodes, list):
            raw_nodes = list(raw_nodes.values()) if isinstance(raw_nodes, dict) else []

        for n in raw_nodes:
            if not isinstance(n, dict): continue
            node_id = str(n.get("id", f"node_{len(nodes)}"))
            nodes.append(Node(
                id=node_id,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Neznáma úloha")),
                actor=n.get("actor")
            ))
            node_ids.add(node_id)

        edges = []
        raw_edges = diagram.get("edges", [])
        if not isinstance(raw_edges, list):
            raw_edges = list(raw_edges.values()) if isinstance(raw_edges, dict) else []

        for e in raw_edges:
            if not isinstance(e, dict): continue
            source = str(e.get("source", ""))
            target = str(e.get("target", ""))
            if source in node_ids and target in node_ids:
                edges.append(Edge(
                    id=str(e.get("id", f"edge_{len(edges)}")),
                    source=source,
                    target=target,
                    label=e.get("label")
                ))

        return ProcessModel(nodes=nodes, edges=edges)

    except Exception as exc:
        print(f"💥 CHYBA: {exc}")
        return dummy_model(f"Chyba: {str(exc)[:40]}")

def dummy_model(msg: str) -> ProcessModel:
    return ProcessModel(
        nodes=[
            Node(id="start", type="startEvent", label="Chyba AI", actor=None),
            Node(id="end", type="endEvent", label=msg, actor=None),
        ],
        edges=[Edge(id="e1", source="start", target="end")],
    )

# ─── STARTUP ──────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    init_db()

# ─── ENDPOINTY ────────────────────────────────────────────────

@app.get("/categories")
def get_categories():
    return {"categories": PREDEFINED_CATEGORIES}

@app.get("/")
def read_root():
    return {"message": "API beží"}

@app.post("/register")
def register_user(user: UserRegister):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", (user.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Používateľské meno už existuje")
        hashed_pw = get_password_hash(user.password)
        cursor.execute(
            "INSERT INTO users (username, hashed_password, created_at) VALUES (?, ?, ?)",
            (user.username, hashed_pw, datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        return {"success": True, "message": "Účet vytvorený. Môžeš sa prihlásiť."}

@app.post("/login", response_model=TokenResponse)
def login_user(user: UserLogin):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, hashed_password FROM users WHERE username = ?", (user.username,))
        row = cursor.fetchone()
        if not row or not verify_password(user.password, row["hashed_password"]):
            raise HTTPException(status_code=401, detail="Nesprávne meno alebo heslo")
        access_token = create_access_token(data={"sub": str(row["id"]), "username": row["username"]})
        return {"access_token": access_token, "token_type": "bearer", "username": row["username"]}

@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    return generate_diagram_from_text(input.description, input.min_nodes, input.max_nodes)

@app.post("/catalog", response_model=dict)
def save_to_catalog(
        payload: CatalogSaveRequest,
        current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]
    category = payload.category if payload.category in PREDEFINED_CATEGORIES else "Iné"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO processes
                (user_id, title, prompt, min_nodes, max_nodes, final_node_count,
                 model_json, is_public, category, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, payload.title, payload.prompt,
                payload.min_nodes, payload.max_nodes, payload.final_node_count,
                json.dumps(payload.model_json), payload.is_public, category,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        return {"id": cursor.lastrowid, "success": True, "category": category}

@app.get("/catalog", response_model=List[dict])
def list_catalog(
        q: str = Query("", description="Fulltext hľadanie"),
        category: str = Query("", description="Filter podľa kategórie"),
        current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = conn.cursor()

        conditions = ["user_id = ?"]
        params: list = [user_id]

        if q:
            like = f"%{q}%"
            conditions.append("(title LIKE ? OR prompt LIKE ? OR model_json LIKE ?)")
            params.extend([like, like, like])

        if category and category not in ("", "Všetky"):
            conditions.append("category = ?")
            params.append(category)

        where_clause = " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT id, title, prompt, min_nodes, max_nodes, final_node_count,
                   is_public, category, created_at, model_json
            FROM processes
            WHERE {where_clause}
            ORDER BY id DESC
            """,
            params,
        )
        rows = cursor.fetchall()

        result = []
        for row in rows:
            r = dict(row)
            r["username"] = current_user["username"]
            r["owner"] = current_user["username"]          # ← FIX: pridané owner pole
            if not r.get("category"):
                r["category"] = "Iné"
            # ← FIX: parsujeme model_json zo stringu na dict
            if isinstance(r.get("model_json"), str):
                try:
                    r["model_json"] = json.loads(r["model_json"])
                except Exception:
                    r["model_json"] = {"nodes": [], "edges": []}
            result.append(r)

        return result

@app.get("/catalog/{process_id}", response_model=dict)
def get_process(
        process_id: int,
        current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM processes WHERE id = ?", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Proces #{process_id} neexistuje")

        if row["user_id"] != user_id and not row["is_public"]:
            raise HTTPException(status_code=403, detail="Nemáš prístup k tomuto diagramu")

        result = dict(row)
        result["model_json"] = json.loads(result["model_json"])
        result["username"] = current_user["username"]
        result["owner"] = current_user["username"]
        if not result.get("category"):
            result["category"] = "Iné"
        return result

@app.delete("/catalog/{process_id}", response_model=dict)
def delete_process(
        process_id: int,
        current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM processes WHERE id = ?", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Proces #{process_id} neexistuje")

        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Môžeš zmazať len svoje vlastné diagramy")

        cursor.execute("DELETE FROM processes WHERE id = ?", (process_id,))
        conn.commit()
        return {"success": True, "deleted_id": process_id}

@app.get("/public-catalog", response_model=List[dict])
def list_public_catalog(
        q: str = Query("", description="Fulltext hľadanie"),
        category: str = Query("", description="Filter podľa kategórie"),
):
    with get_db() as conn:
        cursor = conn.cursor()

        conditions = ["p.is_public = 1"]
        params: list = []

        if q:
            like = f"%{q}%"
            conditions.append("(p.title LIKE ? OR p.prompt LIKE ? OR p.model_json LIKE ?)")
            params.extend([like, like, like])

        if category and category not in ("", "Všetky"):
            conditions.append("p.category = ?")
            params.append(category)

        where_clause = " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT p.id, p.title, p.prompt, p.min_nodes, p.max_nodes,
                   p.final_node_count, p.created_at, p.category, p.model_json,
                   u.username
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE {where_clause}
            ORDER BY p.id DESC
            """,
            params,
        )
        rows = cursor.fetchall()

        result = []
        for row in rows:
            r = dict(row)
            r["is_public"] = True
            r["owner"] = r["username"]
            if not r.get("category"):
                r["category"] = "Iné"
            if isinstance(r.get("model_json"), str):
                try:
                    r["model_json"] = json.loads(r["model_json"])
                except Exception:
                    r["model_json"] = {"nodes": [], "edges": []}
            result.append(r)

        return result
