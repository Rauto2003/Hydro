
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone

app = FastAPI(title="Hydroponics Controller API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

latest_data = {
    "temperature": None,
    "humidity": None,
    "timestamp": None
}

@app.get("/")
def home():
    return {"status": "online", "message": "Hydroponics API"}

@app.post("/api/sensors")
def receive_sensor_data(data: dict):
    latest_data.update(data)
    latest_data["timestamp"] = datetime.now(timezone.utc).isoformat()
    return {"success": True, "received": latest_data}

@app.get("/api/sensors")
def get_sensor_data():
    return latest_data
