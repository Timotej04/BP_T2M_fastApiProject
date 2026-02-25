from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS – pre vývoj povolíme všetko, nech to nezavadzia
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # na produkcii sprísniš
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextInput(BaseModel):
    description: str

@app.get("/")
def read_root():
    return {"message": "API beží"}

@app.post("/generate-model")
def generate_model(input: TextInput):
    # zatiaľ napevno – testovací model
    return {
        "nodes": [
            {"id": "start", "type": "startEvent", "label": "Začiatok"},
            {"id": "task1", "type": "task", "label": "Prijať žiadosť"},
            {"id": "end", "type": "endEvent", "label": "Koniec"}
        ],
        "edges": [
            {"id": "e1", "source": "start", "target": "task1"},
            {"id": "e2", "source": "task1", "target": "end"}
        ]
    }
