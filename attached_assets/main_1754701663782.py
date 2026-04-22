
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import date, timedelta, datetime
import random, os

app = FastAPI(title="Oiltracker — Replit One‑Click (API + Front)", version="0.3")

# CORS (le front est servi par le même serveur, mais on autorise tout par simplicité)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Modèles ----
class LoginBody(BaseModel):
    email: str
    password: str

class ChatPost(BaseModel):
    sender: str
    message: str

# ---- Utilisateurs mock ----
USERS = [
    {"id": 1, "name": "Youssef SAYADI", "email": "y.sayadi@direct-medical.net", "role": "admin", "password": "admin123"},
    {"id": 2, "name": "Senior Buyer", "email": "senior@oiltracker.com", "role": "senior", "password": "senior123"},
    {"id": 3, "name": "Junior Buyer", "email": "junior@oiltracker.com", "role": "junior", "password": "junior123"},
    {"id": 4, "name": "Viewer", "email": "viewer@oiltracker.com", "role": "viewer", "password": "viewer123"},
]

# ---- Données marché mock ----
GRADES = [
    {"id": 1, "name": "RBD Palm Oil"},
    {"id": 2, "name": "RBD Palm Stearin"},
    {"id": 3, "name": "RBD Palm Olein IV56"},
    {"id": 4, "name": "Olein IV64"},
    {"id": 5, "name": "RBD PKO"},
    {"id": 6, "name": "RBD CNO"},
    {"id": 7, "name": "CDSBO"},
]

def gen_prices(days=60):
    out = []
    for g in GRADES:
        base_level = 930 + g["id"]*12
        for i in range(days):
            d = (date.today() - timedelta(days=days-1-i))
            noise = (random.random()*30-15)
            drift = (i%12 - 6)
            out.append({
                "grade_id": g["id"],
                "grade_name": g["name"],
                "date": d.isoformat(),
                "price_usd": round(base_level + noise + drift, 2),
                "usd_tnd": round(3.1 + random.random()*0.4, 3)
            })
    return out

MARKET = gen_prices(60)

# ---- Chat en mémoire ----
CHAT = [
    {"id": 1, "sender": "System", "message": "Bienvenue dans Oiltracker (démo Replit)", "ts": datetime.utcnow().isoformat()+"Z"},
]

@app.get("/")
def root():
    # Redirigera vers l'interface (index.html) automatiquement via StaticFiles
    return {"message": "Oiltracker One‑Click running. Ouvrez /static/ pour l'interface.", "endpoints": ["/auth/login", "/market", "/chat"]}

@app.post("/auth/login")
def login(body: LoginBody):
    user = next((u for u in USERS if u["email"] == body.email and u["password"] == body.password), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"user_id": user["id"], "name": user["name"], "role": user["role"], "token": "mock-token"}

@app.get("/market")
def market():
    return {"data": MARKET}

@app.get("/chat")
def chat_list():
    return {"data": CHAT[-200:]}

@app.post("/chat")
def chat_post(msg: ChatPost):
    new_id = CHAT[-1]["id"] + 1 if CHAT else 1
    row = {"id": new_id, "sender": msg.sender[:40], "message": msg.message[:500], "ts": datetime.utcnow().isoformat()+"Z"}
    CHAT.append(row)
    return {"ok": True, "data": row}

# ---- Servir le frontend statique (index.html + JS inline) ----
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir, html=True), name="static")
