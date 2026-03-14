from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

print(">>> Nacitavam main.py")

# CORS – pre vývoj povolíme všetko
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# --------- Groq LLM konfigurácia ---------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"  # kvalitný a free


def generate_diagram_from_text(description: str) -> ProcessModel:
    print(f"🎯 PROMPT: {description[:50]}...")
    print(f"🔑 KEY LEN: {len(GROQ_API_KEY) if GROQ_API_KEY else 0}")

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        print("❌ CHYBA: GROQ_API_KEY prázdny alebo krátky!")
        return dummy_model("Nastav GROQ_API_KEY v .env")

    # TU BOLA CHYBA - prompt musí byť kompletný!
    prompt = f"""
Si asistent na modelovanie procesov.
Z popisu procesu vytvoríš JSON v tomto formáte:

{{
  "nodes": [
    {{"id": "start", "type": "startEvent", "label": "Začiatok"}},
    {{"id": "task1", "type": "task", "label": "Objednanie", "actor": "Klient"}},
    {{"id": "end", "type": "endEvent", "label": "Koniec"}}
  ],
  "edges": [
    {{"id": "e1", "source": "start", "target": "task1"}},
    {{"id": "e2", "source": "task1", "target": "end"}}
  ]
}}

Použi nasledujúci popis procesu:

\"\"\"{description}\"\"\"

POVINNÉ PRAVIDLÁ:
- Vráť IBA čistý JSON, žiadny text ani ``` okolo.
- 1 startEvent (id napr. "start"), 1 endEvent (id napr. "end").
- 1–6 uzlov typu "task" medzi nimi.
- "actor" je voliteľný (môže byť null).
- ID hrán: "e1", "e2", ...
- ID v edges musia odkazovať na existujúce nodes.
"""

    try:
        print("🚀 Volám Groq...")
        resp = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 800,
                "temperature": 0.1,
            },
            timeout=30,
        )

        print(f"📡 STATUS: {resp.status_code}")

        resp.raise_for_status()
        data = resp.json()

        # BEZPEČNÉ PARSOVANIE (opravuje chybu s indexami)
        # Groq odpovede majú väčšinou list v "choices", musíme ho odchytiť bezpečne
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Odpoveď od AI neobsahuje žiadne dáta (prázdne 'choices').")

        first_choice = choices[0]

        # message môže byť string alebo dict, pre istotu overíme
        message = first_choice.get("message", {})
        if isinstance(message, dict):
            content = message.get("content", "")
        else:
            content = str(message)

        content = content.strip()
        print(f"🤖 AI CONTENT: {content[:100]}...")

        # Agresívny cleanup markdownu
        if "```json" in content:
            content = content.split("```json").split("```").strip()[1]
        elif "```" in content:
            # Ak použil len ``` bez json
            parts = content.split("```")
            if len(parts) >= 3:
                content = parts[1].strip()

        # Posledná záchrana – ak by model pridal nejaký text PRED znak '{'
        if "{" in content and not content.startswith("{"):
            content = content[content.find("{"):]
        if "}" in content and not content.endswith("}"):
            content = content[:content.rfind("}") + 1]

        diagram = json.loads(content)
        print(f"✅ PARSED: {len(diagram.get('nodes', []))} nodes")

        # konverzia z json na objekty
        nodes = [Node(**n) for n in diagram.get("nodes", [])]
        edges = [Edge(**e) for e in diagram.get("edges", [])]

        return ProcessModel(nodes=nodes, edges=edges)

    except json.JSONDecodeError as exc:
        print(f"💥 CHYBA PARSOVANIA JSONU: AI vrátilo zlý formát: {content[:200]}")
        return dummy_model("Zlý formát od AI, skús iný prompt")
    except Exception as exc:
        print(f"💥 DETAIL CHYBA: {type(exc).__name__}: {exc}")
        return dummy_model(f"Chyba: {str(exc)[:30]}")


def dummy_model(msg: str) -> ProcessModel:
    """Fallback ak AI zlyhá"""
    return ProcessModel(
        nodes=[
            Node(id="start", type="startEvent", label="Chyba AI", actor=None),
            Node(id="end", type="endEvent", label=msg, actor=None),
        ],
        edges=[Edge(id="e1", source="start", target="end")],
    )


@app.get("/")
def read_root():
    return {"message": "API beží"}


@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    return generate_diagram_from_text(input.description)


@app.post("/save-model", response_model=ProcessModel)
def save_model(model: ProcessModel) -> ProcessModel:
    print(
        "Dostal som model so",
        len(model.nodes),
        "uzlami a",
        len(model.edges),
        "hranami.",
    )
    return model


for route in app.routes:
    print("ROUTE:", route.path, route.methods)
