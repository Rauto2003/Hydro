
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
    icon: "✣",
    description: "Removes hot air from the growing area.",
  },
  {
    id: "cooling_pump",
    name: "Cooling Pump",
    group: "environment",
    icon: "❄",
    description: "Helps reduce growing-area temperature.",
  },
  {
    id: "fogger",
    name: "Fogger",
    group: "environment",
    icon: "☁",
    description: "Increases humidity in the growing shade.",
  },
  {
    id: "inlet_pump",
    name: "Inlet Pump",
    group: "tank",
    icon: "↘",
    description: "Fills the nutrient tank.",
  },
  {
    id: "outlet_pump",
    name: "Outlet Pump",
    group: "tank",
    icon: "↗",
    description: "Drains the nutrient tank.",
  },
  {
    id: "reservoir_pump",
    name: "Reservoir Pump",
    group: "tank",
    icon: "⟳",
    description: "Circulates the nutrient solution.",
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

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

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

    if (username.trim() !== "admin" || password !== "admin123") {
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

  async function refreshData() {
    try {
      const response = await getSensors();
      const data = extractSensorData(response);

      console.log("HydroControl API response:", response);

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
        setShades({
          shade_1: {
            temperature: data.shed_temperature ?? data.temperature ?? null,
            humidity: data.humidity ?? null,
            light_intensity: data.light_intensity ?? null,
          },
        });
      }

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
        `Unable to reach the API. Check your backend. ${err.message || ""}`
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
      Object.entries(automation).map(([key, value]) => [key, Number(value)])
    );

    if (
      Object.values(values).some((value) => !Number.isFinite(value)) ||
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
      <article className="shade-card" key={shadeId}>
        <div className="shade-card-header">
          <div className="metric-icon plant-icon">♧</div>
          <span className={`status-badge ${error ? "offline" : "online"}`}>
            <i />
            {error ? "CONNECTION ISSUE" : "LIVE SENSOR"}
          </span>
        </div>

        <h3>{label}</h3>
        <p className="muted">Growing environment</p>

        <div className="shade-metrics">
          <div className="shade-metric">
            <div className="metric-icon temperature-icon">♨</div>
            <div>
              <span>Temperature</span>
              <strong>{number(shade.temperature)} °C</strong>
            </div>
          </div>

          <div className="shade-metric">
            <div className="metric-icon humidity-icon">◉</div>
            <div>
              <span>Humidity</span>
              <strong>{number(shade.humidity, 0)}%</strong>
            </div>
          </div>

          <div className="shade-metric">
            <div className="metric-icon light-icon">☼</div>
            <div>
              <span>Light intensity</span>
              <strong>{number(shade.light_intensity, 0)}</strong>
            </div>
          </div>
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
          <div className="device-icon">{device.icon}</div>
          <span className={`state-pill ${isOn ? "on" : ""}`}>
            <i />
            {current.state}
          </span>
        </div>

        <h3>{device.name}</h3>
        <p className="device-description">{device.description}</p>

        <div className="device-meta">
          <span>Control mode</span>
          <strong>MANUAL</strong>
        </div>

        <button
          type="button"
          className={`button ${
            isOn ? "button-stop" : "button-primary"
          } full-width`}
          disabled={busy === device.id}
          onClick={() => toggleDevice(device)}
        >
          {busy === device.id
            ? "Sending command..."
            : `Turn ${isOn ? "OFF" : "ON"}`}
        </button>
      </article>
    );
  }

  function renderDose(letter) {
    return (
      <article className="nutrient-card" key={letter}>
        <div className={`nutrient-letter nutrient-${letter}`}>{letter}</div>

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
          type="button"
          className="button button-primary full-width"
          disabled={busy === `dose-${letter}`}
          onClick={() => sendDose(letter)}
        >
          {busy === `dose-${letter}` ? "Saving..." : "Save dose"}
        </button>
      </article>
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

  const validWaterLevel =
    waterLevel !== null && Number.isFinite(waterLevel);

  const waterPercent = validWaterLevel
    ? Math.max(0, Math.min(100, waterLevel))
    : 0;

  const waterLevelText = !validWaterLevel
    ? "NO DATA"
    : waterLevel >= 90
      ? "FULL"
      : waterLevel >= 60
        ? "NORMAL"
        : waterLevel >= 30
          ? "LOW"
          : "VERY LOW";

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-decoration decoration-one" />
        <div className="login-decoration decoration-two" />

        <form className="login-card" onSubmit={login}>
          <div className="login-mark">H</div>
          <p className="eyebrow">SMART HYDROPONICS SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="login-description">
            Sign in to access your HydroControl dashboard.
          </p>

          <div className="login-demo-info">
            <strong>Demo credentials</strong>
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

          {loginError && <p className="login-error">{loginError}</p>}

          <button className="button button-primary full-width" type="submit">
            Sign in to dashboard →
          </button>

          <p className="login-footnote">
            HydroControl · Smart growing, made simpler
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-box">H</div>
          <div className="brand-text">
            <strong>HydroControl</strong>
            <small>SMART HYDROPONICS</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="main-nav">
          {[
            { name: "Dashboard", icon: "▦" },
            { name: "Environment Control", icon: "☼" },
            { name: "Tank Control", icon: "◉" },
            { name: "Automation", icon: "⚙" },
          ].map((item) => (
            <button
              type="button"
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              onClick={() => {
                setPage(item.name);
                setMessage("");
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>
              {page === item.name && <span className="nav-arrow">›</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-grow" />

        <div className="sidebar-info">
          <div className="sidebar-info-icon">♧</div>
          <strong>One shade. Total control.</strong>
          <p>Monitor your growing environment and nutrient tank.</p>
        </div>

        <div className="sidebar-bottom">
          <div className="connection-status">
            <i className={error ? "offline-dot" : ""} />
            {error ? "API connection issue" : "API monitored"}
          </div>
          <small>HydroControl · v1.0</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {page}
          </div>

          <div className="topbar-right">
            <span className={`system-chip ${error ? "chip-error" : ""}`}>
              <i />
              {error ? "Connection issue" : "Monitoring"}
            </span>

            <button
              type="button"
              className="button button-secondary logout-button"
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
              <p>
                {page === "Dashboard"
                  ? "Your growing shade and nutrient tank at a glance."
                  : page === "Environment Control"
                    ? "Monitor and control your single growing shade."
                    : page === "Tank Control"
                      ? "Manage your nutrient solution and reservoir equipment."
                      : "Configure automatic equipment thresholds."}
              </p>
            </div>

            <button
              type="button"
              className="button button-secondary refresh-button"
              onClick={refreshData}
              disabled={loading}
            >
              ↻ Refresh data
            </button>
          </div>

          {(error || message) && (
            <div className={`notice ${error ? "notice-error" : ""}`}>
              <span>{error || message}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
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
              <span className="loading-spinner" />
              Connecting to HydroControl API...
            </div>
          )}

          {page === "Dashboard" && (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <span className="banner-kicker">
                    YOUR SMART GROWING SPACE
                  </span>
                  <h2>
                    Grow smarter.
                    <br />
                    Monitor better.
                  </h2>
                  <p>
                    All your important hydroponics readings in one place.
                    One growing shade, one connected dashboard.
                  </p>
                  <button
                    type="button"
                    className="button banner-button"
                    onClick={() => setPage("Environment Control")}
                  >
                    View environment <span>→</span>
                  </button>
                </div>

                <div className="banner-graphic" aria-hidden="true">
                  <div className="plant-circle circle-back" />
                  <div className="plant-circle circle-front">
                    <span>♧</span>
                  </div>
                  <div className="banner-sparkle sparkle-one">✦</div>
                  <div className="banner-sparkle sparkle-two">✧</div>
                  <div className="banner-leaf">♧</div>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>Growing Shade</h2>
                  <p>Your single shade's live environmental readings.</p>
                </div>
                <span className={`live-tag ${error ? "offline" : ""}`}>
                  <i />
                  {error ? "OFFLINE" : "LIVE"}
                </span>
              </div>

              <div className="shade-grid">
                {renderShade("shade_1", shade1)}
              </div>

              <div className="section-heading">
                <div>
                  <h2>Nutrient Tank Overview</h2>
                  <p>Live reservoir readings and water-level status.</p>
                </div>
                <span className={`live-tag ${error ? "offline" : ""}`}>
                  <i />
                  {error ? "OFFLINE" : "LIVE"}
                </span>
              </div>

              <div className="tank-overview-grid">
                <section className="panel tank-visual-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">RESERVOIR MONITOR</span>
                      <h2>Water Level</h2>
                    </div>
                    <span className="tank-mini-icon">♧</span>
                  </div>

                  <div className="water-visual">
                    <div className="water-tank">
                      <div
                        className="water-fill"
                        style={{ height: `${waterPercent}%` }}
                      >
                        <div className="water-wave wave-one" />
                        <div className="water-wave wave-two" />
                      </div>
                      <div className="water-label">
                        <strong>
                          {validWaterLevel ? `${number(waterLevel, 0)}%` : "--"}
                        </strong>
                        <span>water level</span>
                      </div>
                    </div>

                    <div className="water-status">
                      <span className="water-status-dot" />
                      <div>
                        <strong>{waterLevelText}</strong>
                        <span>Reservoir status</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button button-secondary full-width"
                    onClick={() => setPage("Tank Control")}
                  >
                    Open Tank Control →
                  </button>
                </section>

                <section className="panel tank-readings-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">SOLUTION QUALITY</span>
                      <h2>Tank Readings</h2>
                    </div>
                    <span className="tank-mini-icon">◉</span>
                  </div>

                  <div className="reading-row">
                    <div className="reading-icon temp-reading">♨</div>
                    <div className="reading-copy">
                      <span>Tank temperature</span>
                      <strong>{number(tank.tank_temperature)} °C</strong>
                    </div>
                    <span className="reading-indicator" />
                  </div>

                  <div className="reading-row">
                    <div className="reading-icon ph-reading">pH</div>
                    <div className="reading-copy">
                      <span>Nutrient pH</span>
                      <strong>{number(tank.nutrient_ph, 2)}</strong>
                    </div>
                    <span className="reading-indicator" />
                  </div>

                  <div className="reading-row">
                    <div className="reading-icon ec-reading">EC</div>
                    <div className="reading-copy">
                      <span>Electrical conductivity</span>
                      <strong>{number(tank.nutrient_ec, 2)} mS/cm</strong>
                    </div>
                    <span className="reading-indicator" />
                  </div>

                  <button
                    type="button"
                    className="button button-primary full-width"
                    onClick={() => setPage("Tank Control")}
                  >
                    View all tank controls →
                  </button>
                </section>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Environment Summary</h2>
                  <p>A quick summary of Shade 1.</p>
                </div>
              </div>

              <div className="summary-grid">
                <article className="summary-card">
                  <div className="summary-icon temperature-icon">♨</div>
                  <span>Shade temperature</span>
                  <strong>{number(avgTemperature)} °C</strong>
                  <small>Live sensor reading</small>
                </article>

                <article className="summary-card">
                  <div className="summary-icon humidity-icon">◉</div>
                  <span>Shade humidity</span>
                  <strong>{number(avgHumidity, 0)}%</strong>
                  <small>Live sensor reading</small>
                </article>

                <article className="summary-card">
                  <div className="summary-icon light-icon">☼</div>
                  <span>Light intensity</span>
                  <strong>{number(shade1.light_intensity, 0)}</strong>
                  <small>Shade 1 sensor</small>
                </article>
              </div>

              <div className="dashboard-action-row">
                <div>
                  <strong>Need to adjust your growing environment?</strong>
                  <p>Open the device controls for your shade.</p>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setPage("Environment Control")}
                >
                  Environment Control →
                </button>
              </div>

              <p className="last-updated">
                Last API update: {lastUpdated || "Waiting for data"}
                <span> · Refreshes every 5 seconds</span>
              </p>
            </>
          )}

          {page === "Environment Control" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Shade 1 Sensor Monitor</h2>
                  <p>Live environmental readings from your one shade.</p>
                </div>
                <span className={`live-tag ${error ? "offline" : ""}`}>
                  <i />
                  {error ? "OFFLINE" : "LIVE"}
                </span>
              </div>

              <div className="environment-metric-grid">
                <article className="environment-metric-card">
                  <div className="metric-top">
                    <div className="metric-icon temperature-icon">♨</div>
                    <span>01</span>
                  </div>
                  <span>Temperature</span>
                  <strong>{number(shade1.temperature)} <small>°C</small></strong>
                  <div className="metric-track">
                    <div
                      className="metric-track-fill temp-fill"
                      style={{
                        width: `${
                          shade1.temperature == null
                            ? 0
                            : Math.max(
                                0,
                                Math.min(100, Number(shade1.temperature) * 2)
                              )
                        }%`,
                      }}
                    />
                  </div>
                  <p>Growing-area temperature</p>
                </article>

                <article className="environment-metric-card">
                  <div className="metric-top">
                    <div className="metric-icon humidity-icon">◉</div>
                    <span>02</span>
                  </div>
                  <span>Humidity</span>
                  <strong>{number(shade1.humidity, 0)} <small>%</small></strong>
                  <div className="metric-track">
                    <div
                      className="metric-track-fill humidity-fill"
                      style={{
                        width: `${
                          shade1.humidity == null
                            ? 0
                            : Math.max(
                                0,
                                Math.min(100, Number(shade1.humidity))
                              )
                        }%`,
                      }}
                    />
                  </div>
                  <p>Relative humidity</p>
                </article>

                <article className="environment-metric-card">
                  <div className="metric-top">
                    <div className="metric-icon light-icon">☼</div>
                    <span>03</span>
                  </div>
                  <span>Light intensity</span>
                  <strong>{number(shade1.light_intensity, 0)}</strong>
                  <div className="metric-track">
                    <div
                      className="metric-track-fill light-fill"
                      style={{
                        width: `${
                          shade1.light_intensity == null
                            ? 0
                            : Math.max(
                                0,
                                Math.min(
                                  100,
                                  Number(shade1.light_intensity) / 100
                                )
                              )
                        }%`,
                      }}
                    />
                  </div>
                  <p>Sensor-reported light value</p>
                </article>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Environment Devices</h2>
                  <p>Send manual commands to your backend controller.</p>
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
                  <h2>Nutrient Tank Monitor</h2>
                  <p>Reservoir readings and solution status.</p>
                </div>
                <span className={`live-tag ${error ? "offline" : ""}`}>
                  <i />
                  {error ? "OFFLINE" : "LIVE"}
                </span>
              </div>

              <div className="tank-overview-grid tank-control-overview">
                <section className="panel tank-visual-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">WATER RESERVOIR</span>
                      <h2>Water Level</h2>
                    </div>
                  </div>

                  <div className="water-visual">
                    <div className="water-tank">
                      <div
                        className="water-fill"
                        style={{ height: `${waterPercent}%` }}
                      >
                        <div className="water-wave wave-one" />
                        <div className="water-wave wave-two" />
                      </div>
                      <div className="water-label">
                        <strong>
                          {validWaterLevel ? `${number(waterLevel, 0)}%` : "--"}
                        </strong>
                        <span>water level</span>
                      </div>
                    </div>

                    <div className="water-status">
                      <span className="water-status-dot" />
                      <div>
                        <strong>{waterLevelText}</strong>
                        <span>Reservoir status</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel tank-readings-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">SOLUTION PARAMETERS</span>
                      <h2>Live Readings</h2>
                    </div>
                  </div>

                  <div className="reading-row">
                    <div className="reading-icon temp-reading">♨</div>
                    <div className="reading-copy">
                      <span>Tank temperature</span>
                      <strong>{number(tank.tank_temperature)} °C</strong>
                    </div>
                  </div>

                  <div className="reading-row">
                    <div className="reading-icon ph-reading">pH</div>
                    <div className="reading-copy">
                      <span>Nutrient pH</span>
                      <strong>{number(tank.nutrient_ph, 2)}</strong>
                    </div>
                  </div>

                  <div className="reading-row">
                    <div className="reading-icon ec-reading">EC</div>
                    <div className="reading-copy">
                      <span>Electrical conductivity</span>
                      <strong>{number(tank.nutrient_ec, 2)} mS/cm</strong>
                    </div>
                  </div>
                </section>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Tank Equipment</h2>
                  <p>Control the pumps connected to your controller.</p>
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
                  <p>Configure nutrient A, B and C dosing rates.</p>
                </div>
              </div>

              <div className="nutrient-grid">
                {["A", "B", "C"].map(renderDose)}
              </div>
            </>
          )}

          {page === "Automation" && (
            <>
              <div className="automation-intro">
                <div className="automation-intro-icon">⚙</div>
                <div>
                  <h2>Smart Automation</h2>
                  <p>
                    Set the thresholds your backend should use to control
                    equipment automatically.
                  </p>
                </div>
              </div>

              <section className="panel automation-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">AUTOMATION RULES</span>
                    <h2>Temperature & Humidity Thresholds</h2>
                    <p>Set separate activation and deactivation values.</p>
                  </div>
                </div>

                <form onSubmit={submitAutomation}>
                  {[
                    ["fan_on", "Fan ON temperature", "°C"],
                    ["fan_off", "Fan OFF temperature", "°C"],
                    ["cooling_on", "Cooling ON temperature", "°C"],
                    ["cooling_off", "Cooling OFF temperature", "°C"],
                    ["fogger_on", "Fogger ON humidity", "%"],
                    ["fogger_off", "Fogger OFF humidity", "%"],
                  ].map(([key, label, unit]) => (
                    <label className="form-field" key={key}>
                      <span>{label}</span>
                      <div className="input-with-unit">
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
                        <span>{unit}</span>
                      </div>
                    </label>
                  ))}

                  <div className="automation-form-footer">
                    <p>
                      Check that each ON/OFF pair has a valid threshold gap.
                    </p>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={busy === "automation"}
                    >
                      {busy === "automation"
                        ? "Saving settings..."
                        : "Save automation settings"}
                    </button>
                  </div>
                </form>
              </section>

              <div className="notice automation-notice">
                <span>
                  Saving thresholds sends settings to your API. Automatic
                  physical control requires the backend and Raspberry Pi
                  automation logic to be implemented.
                </span>
              </div>
            </>
          )}

          <footer className="page-footer">
            <span>HydroControl · Hydroponics monitoring</span>
            <span>
              {loading
                ? "Connecting..."
                : error
                  ? "Connection issue"
                  : `Last updated ${lastUpdated || "waiting for data"}`}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
