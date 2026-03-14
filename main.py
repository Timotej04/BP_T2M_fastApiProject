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
    min_nodes: Optional[int] = 2
    max_nodes: Optional[int] = 10


# --------- Groq LLM konfigurácia ---------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"  # kvalitný a free


# --------- Groq LLM konfigurácia ---------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# ZMENA: Silnejší model, oveľa lepší na zložitú logiku a udržanie JSONu
GROQ_MODEL = "llama-3.3-70b-versatile"


def generate_diagram_from_text(description: str, min_nodes: int, max_nodes: int) -> ProcessModel:
    print(f"🎯 PROMPT: {description[:50]}... | Uzlov: {min_nodes} - {max_nodes}")

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Nastav GROQ_API_KEY v .env")

    # ZMENA: Extrémne prísny prompt pre JSON.
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
1. MUSÍ to byť len JSON objekt, žiadne vysvetlenia, žiadne markdown bloky (bez ```json).
2. Proces má mať medzi 1 startEvent a 1 endEvent približne {min_nodes} až {max_nodes} uzlov typu "task" alebo "gateway". 
3. "actor" je voliteľný. 
4. Zachyť vetvenia (napr. ak sú podmienky v texte, urob z jedného uzla 2 rôzne hrany).
5. Posledný element v zoznamoch (nodes, edges) NESMIE mať za sebou čiarku!

Zadanie procesu:
{description}
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
                "messages": [{"role": "system", "content": "You are a JSON generator. You output only valid JSON."},
                             {"role": "user", "content": prompt}],
                "max_tokens": 5000,   # Zvýšené, lebo 25 uzlov zaberá dosť znakov
                "temperature": 0.0,   # 0.0 = absolútne deterministický (vždy ten istý formát)
                "response_format": {"type": "json_object"} # NÚTI Groq vrátiť len JSON (kľúčová zmena!)
            },
            timeout=45,
        )

        resp.raise_for_status()
        data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Odpoveď od AI neobsahuje žiadne dáta.")

        first_choice = choices[0]

        message = first_choice.get("message", {})
        if isinstance(message, dict):
            content = message.get("content", "")
        else:
            content = str(message)

        content = content.strip()
        print(f"🤖 AI CONTENT (ukážka): {content[:150]}...")

        # Aj keď sme vynútili JSON format, očistíme to pre istotu
        if "```json" in content:
            content = content.split("```json")[2].split("```")[0].strip()
        elif "```" in content:
            parts = content.split("```")
            if len(parts) >= 3:
                content = parts[1].strip()

        if "{" in content and not content.startswith("{"):
            content = content[content.find("{"):]
        if "}" in content and not content.endswith("}"):
            content = content[:content.rfind("}") + 1]

        # Konverzia textu na JSON
        diagram = json.loads(content)

        # Bezpečná extrakcia a konverzia na pydantic modely s overením existencie ID a Targetov
        nodes = []
        node_ids = set()
        for n in diagram.get("nodes", []):
            node_id = str(n.get("id", f"node_{len(nodes)}"))
            nodes.append(Node(
                id=node_id,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Neznáma úloha")),
                actor=n.get("actor")
            ))
            node_ids.add(node_id)

        edges = []
        for e in diagram.get("edges", []):
            source = str(e.get("source"))
            target = str(e.get("target"))
            # Hrana sa pridá len ak oba uzly naozaj existujú
            if source in node_ids and target in node_ids:
                edges.append(Edge(
                    id=str(e.get("id", f"edge_{len(edges)}")),
                    source=source,
                    target=target,
                    label=e.get("label")
                ))

        print(f"✅ PARSED: {len(nodes)} nodes, {len(edges)} edges")
        return ProcessModel(nodes=nodes, edges=edges)

    except json.JSONDecodeError as exc:
        print(f"💥 CHYBA PARSOVANIA JSONU: AI vrátilo zlý formát")
        return dummy_model("AI nezvládlo vygenerovať platný JSON, skús znížiť zložitosť")
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
    return generate_diagram_from_text(input.description, input.min_nodes, input.max_nodes)


@app.post("/save-model", response_model=ProcessModel)
def save_model(model: ProcessModel) -> ProcessModel:
    print(f"Dostal som model so {len(model.nodes)} uzlami.")
    return model
