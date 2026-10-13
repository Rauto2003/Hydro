
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Hydroponics Controller API")

# Allow your Vercel frontend to access the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Latest sensor readings received from the Raspberry Pi or test client.
latest_data = {
    "temperature": None,
    "humidity": None,
    "timestamp": None,
    "shades": {},
    "nutrient_tank": {
        "tank_temperature": None,
        "nutrient_ph": None,
        "nutrient_ec": None,
        "water_level": None,
    },
}

# In-memory settings and command records.
# These reset if the server restarts.
nutrients = {"A": 0, "B": 0, "C": 0}
actuators = {}
automation_settings = {}


@app.get("/")
def home():
    return {
        "status": "online",
        "message": "Hydroponics API",
    }


# ---------------- SENSOR DATA ----------------

@app.get("/api/sensors")
def get_sensor_data():
    return latest_data


@app.post("/api/sensors")
def receive_sensor_data(data: dict):
    latest_data.update(data)
    latest_data["timestamp"] = datetime.now(timezone.utc).isoformat()

    return {
        "success": True,
        "received": latest_data,
    }


# ---------------- NUTRIENTS ----------------

@app.get("/api/nutrients")
def get_nutrients():
    return {"nutrients": nutrients}


@app.post("/api/nutrients")
def set_nutrient(data: dict):
    name = str(data.get("name", "")).upper()
    value = data.get("value")

    if name not in nutrients:
        return {"success": False, "message": "Unknown nutrient"}

    try:
        value = float(value)
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid nutrient value"}

    if value < 0:
        return {"success": False, "message": "Value cannot be negative"}

    nutrients[name] = value

    return {
        "success": True,
        "nutrients": nutrients,
    }


# ---------------- ACTUATORS ----------------

@app.get("/api/actuators")
def get_actuators():
    return {"actuators": actuators}


@app.post("/api/actuators")
def control_actuator(data: dict):
    name = str(data.get("name", "")).strip()
    state = str(data.get("state", "")).upper()

    if not name:
        return {"success": False, "message": "Missing actuator name"}

    if state not in ("ON", "OFF"):
        return {
            "success": False,
            "message": "State must be ON or OFF",
        }

    # Records the command only. Physical hardware control must be
    # implemented separately through the Raspberry Pi/controller.
    actuators[name] = state

    return {
        "success": True,
        "name": name,
        "state": state,
        "message": "Command recorded; hardware is not controlled by this endpoint yet.",
    }


# ---------------- AUTOMATION ----------------

@app.get("/api/automation")
def get_automation():
    return {"settings": automation_settings}


@app.post("/api/automation")
def save_automation(data: dict):
    automation_settings.update(data)

    return {
        "success": True,
        "settings": automation_settings,
    }
