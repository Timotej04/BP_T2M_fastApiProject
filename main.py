from fastapi import FastAPI, HTTPException, Depends, Query, status
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from contextlib import contextmanager
from datetime import datetime, timezone

import os
import json
import requests
import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

print(">>> Nacitavam main.py (so zabezpecenim + kategoriami + Postgres/SQLite podpora)")

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
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("❌ JWT_SECRET_KEY nie je nastavený v .env!")
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── PYDANTIC MODELY ──────────────────────────────────────────
class Node(BaseModel):
    id: str
    type: str
    label: str
    actor: Optional[str] = None
    duration_minutes: Optional[int] = None
    cost_euros: Optional[int] = None


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
    include_kpi: Optional[bool] = False


class EditModelRequest(BaseModel):
    instruction: str
    current_model: dict


class CatalogSaveRequest(BaseModel):
    title: str
    prompt: str
    min_nodes: int
    max_nodes: int
    final_node_count: int
    model_json: dict
    is_public: bool = False
    category: str = "Iné"


class VisibilityUpdate(BaseModel):
    is_public: bool


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


# ─── DATABASE SETUP (POSTGRESQL OR SQLITE FALLBACK) ───────────
DB_URL = os.getenv("DATABASE_URL")

if DB_URL:
    import psycopg2
    from psycopg2.extras import RealDictCursor

    USE_POSTGRES = True
    print("✅ Používam PostgreSQL")
else:
    import sqlite3

    USE_POSTGRES = False
    DB_PATH = "process_catalog.db"
    print("⚠️ DATABASE_URL nie je v .env. Používam lokálne SQLite.")

# Pomocné premenné na riešenie rozdielov v syntaxi (Postgres %s, SQLite ?)
PARAM_MARKER = "%s" if USE_POSTGRES else "?"


def init_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                created_at VARCHAR(255) NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS processes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                prompt TEXT NOT NULL,
                min_nodes INTEGER NOT NULL,
                max_nodes INTEGER NOT NULL,
                final_node_count INTEGER NOT NULL,
                model_json TEXT NOT NULL,
                is_public BOOLEAN DEFAULT FALSE,
                category VARCHAR(255) DEFAULT 'Iné',
                created_at VARCHAR(255) NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
    else:
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
            print("✅ Migrácia: stĺpec 'category' pridaný")
        except sqlite3.OperationalError:
            pass

    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Databáza inicializovaná")


@contextmanager
def get_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        conn.row_factory_cursor = cursor
        try:
            yield conn
        finally:
            cursor.close()
            conn.close()
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()


def get_cursor(conn):
    if USE_POSTGRES:
        return conn.row_factory_cursor
    else:
        return conn.cursor()


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


def generate_diagram_from_text(description: str, min_nodes: int, max_nodes: int,
                               include_kpi: bool = False) -> ProcessModel:
    print(f"🎯 PROMPT: {description[:50]}... | Uzlov: {min_nodes} - {max_nodes}")

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Nastav GROQ_API_KEY v .env")

    kpi_instruction = """8. Každý uzol typu "task" MUSÍ obsahovať polia "duration_minutes" (celé číslo, odhadovaný čas v minútach) a "cost_euros" (desatinné číslo, odhadované náklady v EUR)...""" if include_kpi else ""

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
{kpi_instruction}

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
            raw_nodes = list(raw_nodes.values()) if isinstance(raw_nodes, dict) else []

        for n in raw_nodes:
            if not isinstance(n, dict): continue
            node_id = str(n.get("id", f"node_{len(nodes)}"))
            nodes.append(Node(
                id=node_id,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Neznáma úloha")),
                actor=n.get("actor"),
                duration_minutes=n.get("durationminutes") or n.get("duration_minutes"),
                cost_euros=n.get("costeuros") or n.get("cost_euros"),
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
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT id FROM users WHERE username = {PARAM_MARKER}", (user.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Používateľské meno už existuje")

        hashed_pw = get_password_hash(user.password)
        cursor.execute(
            f"INSERT INTO users (username, hashed_password, created_at) VALUES ({PARAM_MARKER}, {PARAM_MARKER}, {PARAM_MARKER})",
            (user.username, hashed_pw, datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        return {"success": True, "message": "Účet vytvorený. Môžeš sa prihlásiť."}


@app.post("/login", response_model=TokenResponse)
def login_user(user: UserLogin):
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT id, username, hashed_password FROM users WHERE username = {PARAM_MARKER}",
                       (user.username,))
        row = cursor.fetchone()

        if not row or not verify_password(user.password, row["hashed_password"]):
            raise HTTPException(status_code=401, detail="Nesprávne meno alebo heslo")

        access_token = create_access_token(data={"sub": str(row["id"]), "username": row["username"]})
        return {"access_token": access_token, "token_type": "bearer", "username": row["username"]}


@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    return generate_diagram_from_text(input.description, input.min_nodes, input.max_nodes, input.include_kpi)


@app.post("/catalog", response_model=dict)
def save_to_catalog(payload: CatalogSaveRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    category = payload.category if payload.category in PREDEFINED_CATEGORIES else "Iné"

    with get_db() as conn:
        cursor = get_cursor(conn)

        if USE_POSTGRES:
            cursor.execute(
                f"""
                INSERT INTO processes 
                (user_id, title, prompt, min_nodes, max_nodes, final_node_count, model_json, is_public, category, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, payload.title, payload.prompt, payload.min_nodes, payload.max_nodes, payload.final_node_count,
                 json.dumps(payload.model_json), payload.is_public, category, datetime.now(timezone.utc).isoformat())
            )
            inserted_id = cursor.fetchone()["id"]
        else:
            cursor.execute(
                f"""
                INSERT INTO processes 
                (user_id, title, prompt, min_nodes, max_nodes, final_node_count, model_json, is_public, category, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, payload.title, payload.prompt, payload.min_nodes, payload.max_nodes, payload.final_node_count,
                 json.dumps(payload.model_json), payload.is_public, category, datetime.now(timezone.utc).isoformat())
            )
            inserted_id = cursor.lastrowid

        conn.commit()
        return {"id": inserted_id, "success": True, "category": category}


@app.get("/catalog", response_model=List[dict])
def list_catalog(q: str = Query(None, description="Fulltext hľadanie"),
                 category: str = Query(None, description="Filter podľa kategórie"),
                 current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    is_admin = current_user["username"] == "ADMIN_USER"

    with get_db() as conn:
        cursor = get_cursor(conn)

        if is_admin:
            conditions = ["1=1"]
            params = []
        else:
            conditions = [f"p.user_id = {PARAM_MARKER}"]
            params = [user_id]

        if q:
            like = f"%{q}%"
            conditions.append(
                f"(p.title LIKE {PARAM_MARKER} OR p.prompt LIKE {PARAM_MARKER} OR p.model_json LIKE {PARAM_MARKER})")
            params.extend([like, like, like])

        if category and category not in ["", "Všetky"]:
            conditions.append(f"p.category = {PARAM_MARKER}")
            params.append(category)

        where_clause = " AND ".join(conditions)

        cursor.execute(f'''
            SELECT p.id, p.title, p.prompt, p.min_nodes, p.max_nodes, p.final_node_count, p.is_public, p.category, p.created_at, p.model_json, u.username
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE {where_clause} ORDER BY p.id DESC
        ''', params)

        rows = cursor.fetchall()
        result = []
        for row in rows:
            r = dict(row)
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


@app.get("/catalog/{process_id}", response_model=dict)
def get_process(process_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    is_admin = current_user["username"] == "ADMIN_USER"

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f'''
            SELECT p.*, u.username 
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = {PARAM_MARKER}
        ''', (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Proces {process_id} neexistuje")

        if not is_admin and row["user_id"] != user_id and not row["is_public"]:
            raise HTTPException(status_code=403, detail="Nemáš prístup k tomuto diagramu")

        result = dict(row)
        result["model_json"] = json.loads(result["model_json"])
        result["owner"] = result["username"]

        if not result.get("category"):
            result["category"] = "Iné"

        return result


@app.delete("/catalog/{process_id}", response_model=dict)
def delete_process(process_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT user_id FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Proces #{process_id} neexistuje")

        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Môžeš zmazať len svoje vlastné diagramy")

        cursor.execute(f"DELETE FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        conn.commit()
        return {"success": True, "deleted_id": process_id}


@app.patch("/catalog/{process_id}/visibility")
def update_visibility(process_id: int, payload: VisibilityUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    is_admin = current_user["username"] == "ADMIN_USER"

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT user_id FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Proces neexistuje")

        if not is_admin and row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Môžeš upravovať len svoje diagramy")

        is_pub = payload.is_public if USE_POSTGRES else (1 if payload.is_public else 0)

        cursor.execute(f"UPDATE processes SET is_public = {PARAM_MARKER} WHERE id = {PARAM_MARKER}",
                       (is_pub, process_id))
        conn.commit()

        return {"success": True, "is_public": payload.is_public}


def edit_diagram_with_ai(instruction: str, current_model: dict) -> ProcessModel:
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Nastav GROQ_API_KEY v .env")

    current_json = json.dumps(current_model, ensure_ascii=False, indent=2)

    prompt = f"""Mas existujuci JSON diagram business procesu. Pouzivatel chce urobit zmenu.
Tvojou JEDINOU ulohou je vratit upraveny JSON a ABSOLUTNE ZIADEN INY TEXT.

EXISTUJUCI DIAGRAM:
{current_json}

POZIADAVKA POUZIVATELA:
{instruction}

PRAVIDLA (MUSI STRIKTNE DODRZIA):
1. Vrat KOMPLETNY JSON objekt v ROVNAKOM formate ako vstup (kluce: "nodes" a "edges").
2. ZACHOVAJ vsetky povodne ID uzlov a hran, ktore sa NEMENIA.
3. ZACHOVAJ vsetky povodne hodnoty: duration_minutes, cost_euros, actor - ak ich explicitne nemenies.
4. Pridavaj/uprav/maz IBA to, co pouzivatel ziada.
5. Nove uzly dostavaju ID s prefixom "n" (napr. nt1, nt2) a nove hrany "ne1", "ne2" atd.
6. Kazdy gateway musi mat aspon 2 odchadzajuce hrany s vyplnenym label.
7. Posledny element v zoznamoch NESMIE mat ciarku!
8. Vrat LEN validny JSON bez akehokolvek textu pred alebo za nim.
"""

    try:
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a JSON editor. You output only valid JSON."},
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

        content = data["choices"]["message"]["content"].strip()
        if content.startswith("```"):
            lines = content.split('\n')
            lines = lines[1:] if lines[0].startswith("```") else lines
            lines = lines[:-1] if lines and lines[-1].startswith("```") else lines
            content = '\n'.join(lines).strip()

        diagram = json.loads(content)
        original_nodes_map = {n["id"]: n for n in current_model.get("nodes", [])}

        nodes = []
        node_ids = set()
        for n in diagram.get("nodes", []):
            if not isinstance(n, dict): continue
            nid = str(n.get("id", f"node_{len(nodes)}"))
            orig = original_nodes_map.get(nid, {})
            nodes.append(Node(
                id=nid,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Neznama uloha")),
                actor=n.get("actor") or orig.get("actor"),
                duration_minutes=n.get("duration_minutes") if n.get("duration_minutes") is not None else orig.get(
                    "duration_minutes"),
                cost_euros=n.get("cost_euros") if n.get("cost_euros") is not None else orig.get("cost_euros"),
            ))
            node_ids.add(nid)

        edges = []
        for e in diagram.get("edges", []):
            if not isinstance(e, dict): continue
            src = str(e.get("source", ""))
            tgt = str(e.get("target", ""))
            if src in node_ids and tgt in node_ids:
                edges.append(Edge(
                    id=str(e.get("id", f"edge_{len(edges)}")),
                    source=src,
                    target=tgt,
                    label=e.get("label"),
                ))

        return ProcessModel(nodes=nodes, edges=edges)

    except Exception as exc:
        print(f"Copilot chyba: {exc}")
        return dummy_model(f"Copilot chyba: {str(exc)[:40]}")


@app.post("/edit-model", response_model=ProcessModel)
def edit_model(input: EditModelRequest) -> ProcessModel:
    return edit_diagram_with_ai(input.instruction, input.current_model)


@app.get("/public-catalog", response_model=List[dict])
def list_public_catalog(
        q: str = Query("", description="Fulltext hľadanie"),
        category: str = Query("", description="Filter podľa kategórie"),
):
    with get_db() as conn:
        cursor = get_cursor(conn)

        # Pre postgres používame booleany, pre sqlite 1/0
        is_pub_cond = "p.is_public = TRUE" if USE_POSTGRES else "p.is_public = 1"
        conditions = [is_pub_cond]
        params = []

        if q:
            like = f"%{q}%"
            conditions.append(
                f"(p.title LIKE {PARAM_MARKER} OR p.prompt LIKE {PARAM_MARKER} OR p.model_json LIKE {PARAM_MARKER})")
            params.extend([like, like, like])

        if category and category not in ("", "Všetky"):
            conditions.append(f"p.category = {PARAM_MARKER}")
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
            params
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