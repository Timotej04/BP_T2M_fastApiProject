from fastapi import FastAPI, HTTPException, Depends, Query, status
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import os
import json
import requests
import sqlite3
import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

print(">>> Nacitavam main.py (so zabezpecenim)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── KONFIGURÁCIA BEZPEČNOSTI (JWT & Heslá) ───────────────────

# Dôležité: V produkcii musí byť SECRET_KEY silný a v .env súbore!
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-tajny-vyvojarsky-kluc-12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # Token platí 7 dní

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── PYDANTIC MODELY ─────────────────────────────────────────

# Existujúce modely pre procesy
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
    is_public: bool = False  # Príprava na verejný katalóg


# Nové modely pre Auth
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

    # Tabuľka používateľov
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Tabuľka procesov (upravená: nick nahradený user_id, pridané is_public)
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
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()
    print("✅ SQLite DB (s auth tabuľkami) inicializovaná")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ─── POMOCNÉ FUNKCIE PRE AUTH ─────────────────────────────────

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict):
    to_encode = data.copy()
    # Generujeme token BEZ expiračnej doby - platí navždy kým sa neodhlási
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# Dependency pre zabezpečené endpointy
# Zistí, či používateľ poslal platný token a vráti jeho user_id a username
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


# ─── GROQ LLM KONFIGURÁCIA & GENEROVANIE ──────────────────────

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
    {{"id": "end", "type": "endEvent", "label": "Koniec procesu"}}
  ],
  "edges": [
    {{"id": "e1", "source": "start", "target": "t1"}},
    {{"id": "e2", "source": "t1", "target": "end"}}
  ]
}}

PRAVIDLÁ:
1. MUSÍ to byť len JSON objekt.
2. Proces má mať medzi 1 startEvent a 1 endEvent približne {min_nodes} až {max_nodes} uzlov typu "task" alebo "gateway".
3. "actor" je voliteľný.
4. Zachyť vetvenia.
5. Posledný element v zoznamoch (nodes, edges) NESMIE mať za sebou čiarku!

Zadanie procesu:
{description}
"""

    try:
        resp = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
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
            if lines.startswith("```"):
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
            if len(diagram) > 0 and isinstance(diagram, dict):
                diagram = diagram
            else:
                raise ValueError("AI vrátilo list namiesto JSON objektu")

        if not isinstance(diagram, dict):
            raise ValueError(f"Neočakávaný typ odpovede: {type(diagram)}")

        nodes = []
        node_ids = set()
        raw_nodes = diagram.get("nodes", [])

        if not isinstance(raw_nodes, list):
            if isinstance(raw_nodes, dict):
                raw_nodes = list(raw_nodes.values())
            else:
                raise ValueError(f"'nodes' nie je list ani dict: {type(raw_nodes)}")

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
            if isinstance(raw_edges, dict):
                raw_edges = list(raw_edges.values())
            else:
                raise ValueError(f"'edges' nie je list: {type(raw_edges)}")

        for e in raw_edges:
            if not isinstance(e, dict): continue
            source = str(e.get("source", ""))
            target = str(e.get("target", ""))
            if source in node_ids and target in node_ids:
                edge_id = str(e.get("id", f"edge_{len(edges)}"))
                edges.append(Edge(
                    id=edge_id,
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


# ─── AUTH ENDPOINTY (Nové) ────────────────────────────────────

@app.post("/register")
def register_user(user: UserRegister):
    with get_db() as conn:
        cursor = conn.cursor()
        # Zistíme, či používateľ už neexistuje
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


# ─── ZÁKLADNÉ ENDPOINTY (Verejné) ─────────────────────────────

@app.get("/")
def read_root():
    return {"message": "API beží"}


@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    # Toto zostáva verejné, hostia môžu generovať diagramy
    return generate_diagram_from_text(input.description, input.min_nodes, input.max_nodes)


# ─── KATALÓG ENDPOINTY (Zabezpečené) ──────────────────────────

@app.post("/catalog", response_model=dict)
def save_to_catalog(
        payload: CatalogSaveRequest,
        current_user: dict = Depends(get_current_user)  # ← Vyžaduje sa Token!
):
    """Uloží proces pod prihláseným používateľom"""
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO processes
                (user_id, title, prompt, min_nodes, max_nodes, final_node_count, model_json, is_public, created_at)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                payload.title,
                payload.prompt,
                payload.min_nodes,
                payload.max_nodes,
                payload.final_node_count,
                json.dumps(payload.model_json),
                payload.is_public,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        new_id = cursor.lastrowid
        return {"id": new_id, "success": True}


@app.get("/catalog", response_model=List[dict])
def list_catalog(
        q: str = Query("", description="Fulltext hľadanie"),
        current_user: dict = Depends(get_current_user)  # ← Vyžaduje sa Token!
):
    """Vráti len procesy aktuálne prihláseného používateľa"""
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        if q:
            like = f"%{q}%"
            cursor.execute(
                """
                SELECT id, title, prompt, min_nodes, max_nodes, final_node_count, is_public, created_at
                FROM processes
                WHERE user_id = ?
                  AND (title LIKE ? OR prompt LIKE ? OR model_json LIKE ?)
                ORDER BY id DESC
                """,
                (user_id, like, like, like),
            )
        else:
            cursor.execute(
                """
                SELECT id, title, prompt, min_nodes, max_nodes, final_node_count, is_public, created_at
                FROM processes
                WHERE user_id = ?
                ORDER BY id DESC
                """,
                (user_id,),
            )
        rows = cursor.fetchall()

        # Pridáme informáciu o vlastníkovi priamo do odpovede
        result = [dict(row) for row in rows]
        for r in result:
            r["username"] = current_user["username"]

        return result


@app.get("/catalog/{process_id}", response_model=dict)
def get_process(
        process_id: int,
        current_user: dict = Depends(get_current_user)  # ← Vyžaduje sa Token!
):
    """Vráti detail procesu, ale len ak patrí používateľovi (alebo ak spravíme verejné)"""
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM processes WHERE id = ?", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Proces #{process_id} neexistuje")

        # Bezpečnostná kontrola: môže to čítať?
        if row["user_id"] != user_id and not row["is_public"]:
            raise HTTPException(status_code=403, detail="Nemáš prístup k tomuto diagramu")

        result = dict(row)
        result["model_json"] = json.loads(result["model_json"])
        result["username"] = current_user["username"]  # dopíšeme pre frontend
        return result


@app.delete("/catalog/{process_id}", response_model=dict)
def delete_process(
        process_id: int,
        current_user: dict = Depends(get_current_user)  # ← Vyžaduje sa Token!
):
    """Zmaže proces z katalógu (len vlastný)"""
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
):
    """Vráti VŠETKY procesy, ktoré sú označené ako verejné (od hocikoho)"""
    with get_db() as conn:
        cursor = conn.cursor()

        # Oproti obyčajnému /catalog tu nepotrebujeme token a hľadáme všade kde is_public = 1
        # Pripájame aj tabuľku users, aby sme vedeli, KTO to vytvoril (cudzí username)

        query_base = """
            SELECT p.id, p.title, p.prompt, p.min_nodes, p.max_nodes, 
                   p.final_node_count, p.created_at, u.username
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE p.is_public = 1
        """

        if q:
            like = f"%{q}%"
            cursor.execute(
                query_base + " AND (p.title LIKE ? OR p.prompt LIKE ? OR p.model_json LIKE ?) ORDER BY p.id DESC",
                (like, like, like)
            )
        else:
            cursor.execute(query_base + " ORDER BY p.id DESC")

        rows = cursor.fetchall()

        # Pripravíme výsledok, pole is_public dávame vždy na true, lebo ťaháme len verejné
        result = [dict(row) for row in rows]
        for r in result:
            r["is_public"] = True

        return result