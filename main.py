from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional, List

app = FastAPI()

# CORS – pre vývoj povolíme všetko, nech to nezavadzia
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # na produkcii sprísniš
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Node(BaseModel):
    id: str
    type: str
    label: str
    actor: Optional[str] = None  # kto vykonáva činnosť (rola/osoba)

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

@app.get("/")
def read_root():
    return {"message": "API beží"}

@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    # zatiaľ napevno – testovací model
    nodes = [
        Node(id="start", type="startEvent", label="Začiatok", actor=None),
        Node(id="task1", type="task", label="Prijať žiadosť", actor="Operátor"),
        Node(id="end", type="endEvent", label="Koniec", actor=None),
    ]

    edges = [
        Edge(id="e1", source="start", target="task1"),
        Edge(id="e2", source="task1", target="end"),
    ]

    return ProcessModel(nodes=nodes, edges=edges)