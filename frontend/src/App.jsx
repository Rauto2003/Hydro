
import { useEffect, useState } from "react";
import "./App.css";
import {
  getSensors,
  getNutrients,
  setNutrient,
  controlActuator,
  getAutomation,
  saveAutomation,
} from "./services/api";

const API_FALLBACK = "https://hydro-api-v30z.onrender.com";

const DEFAULT_AUTO = {
  fan_on: 30,
  fan_off: 27,
  cooling_on: 28,
  cooling_off: 25,
  fogger_on: 65,
  fogger_off: 75,
};

const DEFAULT_TANK = {
  tank_temperature: null,
  nutrient_ph: null,
  nutrient_ec: null,
  water_level: null,
};

const DEFAULT_SHADES = {
  shade_1: {
    temperature: null,
    humidity: null,
    light_intensity: null,
  },
};

const DEVICES = [
  {
    id: "exhaust_fan",
    name: "Exhaust Fan",
    group: "environment",
    description: "Removes hot air from the growing area.",
  },
  {
    id: "cooling_pump",
    name: "Cooling Pump",
    group: "environment",
    description: "Helps reduce growing-area temperature.",
  },
  {
    id: "fogger",
    name: "Fogger",
    group: "environment",
    description: "Increases humidity.",
  },
  {
    id: "inlet_pump",
    name: "Inlet Pump",
    group: "tank",
    description: "Fills the nutrient tank.",
  },
  {
    id: "outlet_pump",
    name: "Outlet Pump",
    group: "tank",
    description: "Drains the nutrient tank.",
  },
  {
    id: "reservoir_pump",
    name: "Reservoir Pump",
    group: "tank",
    description: "Circulates nutrient solution.",
  },
];

function number(value, decimals = 1) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "--";
  }

  return Number(value).toFixed(decimals);
}

function average(shades, field) {
  const values = Object.values(shades)
    .map((shade) => shade?.[field])
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value))
    )
    .map(Number);

  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) /
    values.length;
}

// Handles the common API response formats without losing readings.
function extractSensorData(response) {
  let data = response;

  for (let i = 0; i < 3; i += 1) {
    if (!data || typeof data !== "object") break;

    if (data.received && typeof data.received === "object") {
      data = data.received;
      continue;
    }

    if (data.sensors && typeof data.sensors === "object") {
      data = data.sensors;
      continue;
    }

    break;
  }

  return data || {};
}

function App() {
  const [page, setPage] = useState("Dashboard");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(
    () => sessionStorage.getItem("hydro_logged_in") === "true"
  );
  const [loginError, setLoginError] = useState("");

  const [shades, setShades] = useState(DEFAULT_SHADES);
  const [tank, setTank] = useState(DEFAULT_TANK);

  const [nutrients, setNutrients] = useState({
    A: 0,
    B: 0,
    C: 0,
  });

  const [doses, setDoses] = useState({
    A: "0",
    B: "0",
    C: "0",
  });

  const [automation, setAutomation] = useState(DEFAULT_AUTO);

  const [devices, setDevices] = useState(() =>
    Object.fromEntries(
      DEVICES.map((device) => [
        device.id,
        { state: "OFF", mode: "MANUAL" },
      ])
    )
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  function notify(text, isError = false) {
    setMessage(isError ? "" : text);
    setError(isError ? text : "");
  }

  function login(event) {
    event.preventDefault();

    if (
      username.trim() !== "admin" ||
      password !== "admin123"
    ) {
      setLoginError("Invalid username or password.");
      return;
    }

    sessionStorage.setItem("hydro_logged_in", "true");
    setLoggedIn(true);
    setLoginError("");
    setPage("Dashboard");
  }

  function logout() {
    sessionStorage.removeItem("hydro_logged_in");
    setLoggedIn(false);
    setUsername("");
    setPassword("");
    setPage("Dashboard");
    setMessage("");
    setError("");
  }

  // Fetch the latest sensor values from the deployed API.
  async function refreshData() {
    try {
      const response = await getSensors();

      console.log("HydroControl API response:", response);

      const data = extractSensorData(response);

      console.log("HydroControl parsed sensor data:", data);

      // Growing-area sensor readings.
      const shadeData = data.shades?.shade_1;

      if (shadeData && typeof shadeData === "object") {
        setShades({
          shade_1: {
            temperature: shadeData.temperature ?? null,
            humidity: shadeData.humidity ?? null,
            light_intensity: shadeData.light_intensity ?? null,
          },
        });
      } else {
        const temperature =
          data.shed_temperature ?? data.temperature ?? null;
        const humidity = data.humidity ?? null;
        const lightIntensity = data.light_intensity ?? null;

        setShades({
          shade_1: {
            temperature,
            humidity,
            light_intensity: lightIntensity,
          },
        });
      }

      // Nutrient-tank readings.
      const tankData = data.nutrient_tank;

      if (tankData && typeof tankData === "object") {
        setTank({
          tank_temperature: tankData.tank_temperature ?? null,
          nutrient_ph: tankData.nutrient_ph ?? null,
          nutrient_ec: tankData.nutrient_ec ?? null,
          water_level: tankData.water_level ?? null,
        });
      } else {
        setTank(DEFAULT_TANK);
      }

      setLastUpdated(new Date().toLocaleTimeString());
      setError("");

      // Load nutrient dosing settings separately.
      try {
        const nutrientResponse = await getNutrients();
        const nutrientData =
          nutrientResponse?.nutrients ?? nutrientResponse ?? {};

        setNutrients((old) => ({
          ...old,
          ...nutrientData,
        }));

        setDoses((old) => ({
          ...old,
          ...Object.fromEntries(
            ["A", "B", "C"]
              .filter((key) => nutrientData[key] !== undefined)
              .map((key) => [key, String(nutrientData[key])])
          ),
        }));
      } catch (err) {
        console.warn("Nutrient endpoint unavailable:", err.message);
      }
    } catch (err) {
      console.error("Sensor refresh failed:", err);
      setError(
        `Unable to reach the API. Check your API URL and backend. ${
          err.message || ""
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshAutomation() {
    try {
      const response = await getAutomation();
      const settings = response?.settings ?? response ?? {};

      setAutomation((old) => ({
        ...old,
        ...settings,
      }));
    } catch (err) {
      console.warn("Automation endpoint unavailable:", err.message);
    }
  }

  useEffect(() => {
    if (!loggedIn) {
      setLoading(false);
      return undefined;
    }

    refreshData();
    refreshAutomation();

    const timer = setInterval(() => {
      refreshData();
    }, 5000);

    return () => clearInterval(timer);
  }, [loggedIn]);

  async function toggleDevice(device) {
    const current = devices[device.id] || { state: "OFF" };
    const next = current.state === "ON" ? "OFF" : "ON";

    setBusy(device.id);

    try {
      await controlActuator(device.id, next);

      setDevices((old) => ({
        ...old,
        [device.id]: {
          state: next,
          mode: "MANUAL",
        },
      }));

      notify(`${device.name}: ${next} command sent.`);
    } catch (err) {
      notify(`Device command failed: ${err.message}`, true);
    } finally {
      setBusy("");
    }
  }

  async function sendDose(letter) {
    const dose = Number(doses[letter]);

    if (
      doses[letter].trim() === "" ||
      !Number.isFinite(dose) ||
      dose < 0
    ) {
      notify("Enter a valid non-negative dose.", true);
      return;
    }

    setBusy(`dose-${letter}`);

    try {
      await setNutrient(letter, dose);

      setNutrients((old) => ({
        ...old,
        [letter]: dose,
      }));

      notify(`Nutrient ${letter} dose saved.`);
    } catch (err) {
      notify(`Unable to save dose: ${err.message}`, true);
    } finally {
      setBusy("");
    }
  }

  async function submitAutomation(event) {
    event.preventDefault();

    const values = Object.fromEntries(
      Object.entries(automation).map(([key, value]) => [
        key,
        Number(value),
      ])
    );

    if (
      Object.values(values).some(
        (value) => !Number.isFinite(value)
      ) ||
      values.fan_off >= values.fan_on ||
      values.cooling_off >= values.cooling_on ||
      values.fogger_on >= values.fogger_off
    ) {
      notify("Check your automation thresholds.", true);
      return;
    }

    setBusy("automation");

    try {
      const response = await saveAutomation(values);

      setAutomation((old) => ({
        ...old,
        ...(response?.settings ?? values),
      }));

      notify("Automation settings saved.");
    } catch (err) {
      notify(`Unable to save automation: ${err.message}`, true);
    } finally {
      setBusy("");
    }
  }

  function renderShade(shadeId, shade) {
    const label = shadeId.replace("_", " ").toUpperCase();

    return (
      <article className="device-card" key={shadeId}>
        <div className="device-card-top">
          <span className="device-icon">♧</span>
          <span className={`state-pill ${error ? "" : "on"}`}>
            <i /> {error ? "CONNECTION ISSUE" : "LIVE DATA"}
          </span>
        </div>

        <h3>{label}</h3>
        <p>Growing environment readings</p>

        <div className="device-meta">
          <span>Temperature</span>
          <strong>{number(shade.temperature)} °C</strong>
        </div>

        <div className="device-meta">
          <span>Humidity</span>
          <strong>{number(shade.humidity, 0)} %</strong>
        </div>

        <div className="device-meta">
          <span>Light intensity</span>
          <strong>{number(shade.light_intensity, 0)}</strong>
        </div>
      </article>
    );
  }

  function renderDevice(device) {
    const current = devices[device.id] || { state: "OFF" };
    const isOn = current.state === "ON";

    return (
      <article className="device-card" key={device.id}>
        <div className="device-card-top">
          <span className="device-icon">◉</span>
          <span className={`state-pill ${isOn ? "on" : ""}`}>
            <i /> {current.state}
          </span>
        </div>

        <h3>{device.name}</h3>
        <p>{device.description}</p>

        <div className="device-meta">
          <span>Control mode</span>
          <strong>MANUAL</strong>
        </div>

        <button
          className={`button ${
            isOn ? "button-stop" : "button-primary"
          } full-width`}
          disabled={busy === device.id}
          onClick={() => toggleDevice(device)}
        >
          {busy === device.id
            ? "Sending..."
            : `Turn ${isOn ? "OFF" : "ON"}`}
        </button>
      </article>
    );
  }

  function renderDose(letter) {
    return (
      <article className="nutrient-card" key={letter}>
        <div className={`nutrient-letter nutrient-${letter}`}>
          {letter}
        </div>

        <div className="nutrient-info">
          <h3>Nutrient {letter}</h3>
          <p>Liquid nutrient dosing</p>
        </div>

        <label htmlFor={`dose-${letter}`}>Dose rate</label>

        <div className="input-with-unit">
          <input
            id={`dose-${letter}`}
            type="number"
            min="0"
            step="0.1"
            value={doses[letter]}
            onChange={(event) =>
              setDoses((old) => ({
                ...old,
                [letter]: event.target.value,
              }))
            }
          />
          <span>ml/min</span>
        </div>

        <div className="last-dose">
          Last saved: {number(nutrients[letter])} ml/min
        </div>

        <button
          className="button button-primary full-width"
          disabled={busy === `dose-${letter}`}
          onClick={() => sendDose(letter)}
        >
          {busy === `dose-${letter}` ? "Saving..." : "Save dose"}
        </button>
      </article>
    );
  }

  if (!loggedIn) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={login}>
          <div className="login-mark">H</div>
          <p className="eyebrow">SMART HYDROPONICS SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="login-description">
            Sign in to access your hydroponics dashboard.
          </p>

          <div className="login-demo-info">
            <strong>Demo login</strong>
            <p>Username: admin</p>
            <p>Password: admin123</p>
          </div>

          <label className="form-field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {loginError && (
            <p className="login-error">{loginError}</p>
          )}

          <button
            className="button button-primary full-width"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </div>
    );
  }

  const shade1 = shades.shade_1;
  const avgTemperature = average(shades, "temperature");
  const avgHumidity = average(shades, "humidity");

  const waterLevel =
    tank.water_level === null ||
    tank.water_level === undefined ||
    tank.water_level === ""
      ? null
      : Number(tank.water_level);

  const waterLevelText =
    waterLevel === null || !Number.isFinite(waterLevel)
      ? "--"
      : waterLevel >= 90
        ? "FULL"
        : waterLevel >= 60
          ? "NORMAL"
          : waterLevel >= 30
            ? "LOW"
            : "VERY LOW";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-box">
            <span className="logo-fallback">H</span>
          </div>

          <div className="brand-text">
            <strong>HydroControl</strong>
            <small>HYDROPONICS CONTROL</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="main-nav">
          {[
            "Dashboard",
            "Environment Control",
            "Tank Control",
            "Automation",
          ].map((item) => (
            <button
              key={item}
              className={`nav-item ${page === item ? "active" : ""}`}
              onClick={() => {
                setPage(item);
                setMessage("");
              }}
            >
              <span>▦</span>
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-status">
            <i />
            {error ? "API connection issue" : "API monitored"}
          </div>
          <small>HydroControl · v1.0</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            HydroControl <span>/</span> {page}
          </div>

          <div className="topbar-right">
            <span className="system-chip">
              <i />
              {error ? "Connection issue" : "Monitoring"}
            </span>

            <button
              className="button button-secondary"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">SMART HYDROPONICS SYSTEM</div>
              <h1>{page}</h1>
              <p>Live sensor data from your online Hydroponics API.</p>
            </div>

            <button
              className="button button-secondary"
              onClick={refreshData}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          {(error || message) && (
            <div className={`notice ${error ? "notice-error" : ""}`}>
              <span>{error || message}</span>
              <button
                onClick={() => {
                  setError("");
                  setMessage("");
                }}
              >
                ×
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-note">
              Connecting to HydroControl API...
            </div>
          )}

          {page === "Dashboard" && (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <span className="banner-kicker">
                    SMART HYDROPONICS SYSTEM
                  </span>
                  <h2>
                    Precision growing.
                    <br />
                    Simplified control.
                  </h2>
                  <p>
                    Monitor your growing shade and nutrient tank
                    from one online dashboard.
                  </p>
                </div>

                <div className="banner-graphic">
                  <span>H</span>
                  <i>+</i>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>Growing Area Monitor</h2>
                  <p>Live readings from your single growing shade</p>
                </div>
                <span className="live-tag">
                  <i />
                  {error ? "OFFLINE" : "LIVE"}
                </span>
              </div>

              <div className="device-grid">
                {renderShade("shade_1", shade1)}
              </div>

              <div className="dashboard-grid">
                <section className="panel tank-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">
                        GROWING AREA SUMMARY
                      </span>
                      <h2>Shade 1 Environment</h2>
                    </div>
                  </div>

                  <div className="tank-bottom-stats">
                    <div>
                      <span>Temperature</span>
                      <strong>{number(avgTemperature)} °C</strong>
                    </div>
                    <div>
                      <span>Humidity</span>
                      <strong>{number(avgHumidity)}%</strong>
                    </div>
                    <div>
                      <span>Monitoring</span>
                      <strong>{error ? "OFFLINE" : "LIVE"}</strong>
                    </div>
                  </div>

                  <button
                    className="button button-secondary"
                    onClick={() => setPage("Environment Control")}
                  >
                    Control Environment
                  </button>
                </section>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Nutrient Tank</h2>
                  <p>
                    Reservoir temperature, pH, EC and water level
                  </p>
                </div>
                <span className="live-tag">
                  <i />
                  {error ? "OFFLINE" : "LIVE"}
                </span>
              </div>

              <div className="dashboard-grid">
                <section className="panel tank-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">RESERVOIR MONITOR</span>
                      <h2>Nutrient Solution</h2>
                    </div>
                  </div>

                  <div className="tank-bottom-stats">
                    <div>
                      <span>Tank temperature</span>
                      <strong>
                        {number(tank.tank_temperature)} °C
                      </strong>
                    </div>
                    <div>
                      <span>pH level</span>
                      <strong>{number(tank.nutrient_ph, 2)}</strong>
                    </div>
                    <div>
                      <span>EC level</span>
                      <strong>
                        {number(tank.nutrient_ec, 2)} mS/cm
                      </strong>
                    </div>
                    <div>
                      <span>Water level</span>
                      <strong>{number(tank.water_level, 0)}%</strong>
                    </div>
                    <div>
                      <span>Water status</span>
                      <strong>{waterLevelText}</strong>
                    </div>
                  </div>

                  <button
                    className="button button-secondary"
                    onClick={() => setPage("Tank Control")}
                  >
                    Control Tank
                  </button>
                </section>
              </div>

              <p className="panel-description">
                Last API update: {lastUpdated || "Waiting for data"}
              </p>
            </>
          )}

          {page === "Environment Control" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Environment Devices</h2>
                  <p>Send manual commands to your backend.</p>
                </div>
              </div>

              <div className="device-grid">
                {DEVICES.filter(
                  (device) => device.group === "environment"
                ).map(renderDevice)}
              </div>
            </>
          )}

          {page === "Tank Control" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Tank Equipment</h2>
                  <p>Control pumps connected to your controller.</p>
                </div>
              </div>

              <div className="device-grid">
                {DEVICES.filter(
                  (device) => device.group === "tank"
                ).map(renderDevice)}
              </div>

              <div className="section-heading">
                <div>
                  <h2>Nutrient Dosing</h2>
                  <p>Configure nutrient A, B and C.</p>
                </div>
              </div>

              <div className="nutrient-grid">
                {["A", "B", "C"].map(renderDose)}
              </div>
            </>
          )}

          {page === "Automation" && (
            <section className="panel automation-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">AUTOMATION RULES</span>
                  <h2>Automatic Thresholds</h2>
                </div>
              </div>

              <form onSubmit={submitAutomation}>
                {[
                  ["fan_on", "Fan ON temperature (°C)"],
                  ["fan_off", "Fan OFF temperature (°C)"],
                  ["cooling_on", "Cooling ON temperature (°C)"],
                  ["cooling_off", "Cooling OFF temperature (°C)"],
                  ["fogger_on", "Fogger ON humidity (%)"],
                  ["fogger_off", "Fogger OFF humidity (%)"],
                ].map(([key, label]) => (
                  <label className="form-field" key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={automation[key]}
                      onChange={(event) =>
                        setAutomation((old) => ({
                          ...old,
                          [key]: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                ))}

                <button
                  className="button button-primary"
                  disabled={busy === "automation"}
                >
                  {busy === "automation"
                    ? "Saving..."
                    : "Save settings"}
                </button>
              </form>
            </section>
          )}

          <footer className="page-footer">
            <span>HydroControl · Hydroponics monitoring</span>
            <span>
              {loading
                ? "Connecting"
                : error
                  ? "Connection issue"
                  : "Dashboard active"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
