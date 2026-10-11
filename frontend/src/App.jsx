
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

const DEFAULT_SENSORS = {
  tank_temperature: 25.4,
  nutrient_ph: 6.2,
  nutrient_ec: 1.8,
  water_level: "FULL",
  shed_temperature: 28.6,
  humidity: 72,
};

const DEFAULT_AUTO = {
  fan_on: 30,
  fan_off: 27,
  cooling_on: 28,
  cooling_off: 25,
  fogger_on: 65,
  fogger_off: 75,
};

const DEVICES = [
  { id: "exhaust_fan", name: "Exhaust Fan", group: "environment", icon: "≋", description: "Removes hot air" },
  { id: "cooling_pump", name: "Cooling Pump", group: "environment", icon: "❄", description: "Helps reduce temperature" },
  { id: "fogger", name: "Fogger", group: "environment", icon: "♧", description: "Increases humidity" },
  { id: "inlet_pump", name: "Inlet Pump", group: "tank", icon: "↓", description: "Fills the nutrient tank" },
  { id: "outlet_pump", name: "Outlet Pump", group: "tank", icon: "↑", description: "Drains the nutrient tank" },
  { id: "reservoir_pump", name: "Reservoir Pump", group: "tank", icon: "◉", description: "Circulates nutrient solution" },
];

const SENSORS = [
  { id: "tank_temperature", label: "Tank temperature", unit: "°C" },
  { id: "nutrient_ph", label: "Nutrient pH", unit: "pH" },
  { id: "nutrient_ec", label: "Nutrient EC", unit: "mS/cm" },
  { id: "shed_temperature", label: "Shed temperature", unit: "°C" },
  { id: "humidity", label: "Humidity", unit: "%" },
];

const NAV_ITEMS = [
  { label: "Dashboard", icon: "▦" },
  { label: "Calibration", icon: "◎" },
  { label: "History", icon: "◷" },
];

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function number(value, decimals = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : "--";
}

function App() {
  const [page, setPage] = useState("Dashboard");
  const [controlOpen, setControlOpen] = useState(true);

  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem("hydro_logged_in") === "true"
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [sensors, setSensors] = useState(DEFAULT_SENSORS);
  const [nutrients, setNutrients] = useState({ A: 0, B: 0, C: 0 });
  const [doses, setDoses] = useState({ A: "0", B: "0", C: "0" });
  const [automation, setAutomation] = useState(DEFAULT_AUTO);

  const [devices, setDevices] = useState(() =>
    Object.fromEntries(
      DEVICES.map((device) => [
        device.id,
        { state: "OFF", mode: "MANUAL" },
      ])
    )
  );

  const [calibrations, setCalibrations] = useState(() =>
    readLocal("hydro_calibrations", {})
  );

  const [selectedSensor, setSelectedSensor] = useState("nutrient_ph");
  const [reference, setReference] = useState("");

  const [company, setCompany] = useState(
    () => localStorage.getItem("hydro_company_name") || "HydroControl"
  );

  const [logo, setLogo] = useState(
    () => localStorage.getItem("hydro_company_logo") || ""
  );

  const [secondLogo, setSecondLogo] = useState(
    () => localStorage.getItem("hydro_second_logo") || ""
  );

  const [history, setHistory] = useState(() =>
    readLocal("hydro_history", [])
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function notify(text, isError = false) {
    setMessage(isError ? "" : text);
    setError(isError ? text : "");
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMessage("");
    setError("");
    setControlOpen(true);
  }

  // DEMO LOGIN ONLY — protect real APIs with backend authentication.
  function handleLogin(event) {
    event.preventDefault();

    if (!username.trim() || !password) {
      setLoginError("Please enter your username and password.");
      return;
    }

    if (
      username.trim() !== "admin" ||
      password !== "admin123"
    ) {
      setLoginError("Invalid username or password.");
      return;
    }

    sessionStorage.setItem("hydro_logged_in", "true");
    setIsAuthenticated(true);
    setLoginError("");
    setPassword("");
  }

  function handleLogout() {
    sessionStorage.removeItem("hydro_logged_in");
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    setLoginError("");
    navigate("Dashboard");
  }

  async function refreshData() {
    try {
      const [sensorResponse, nutrientResponse] = await Promise.all([
        getSensors(),
        getNutrients(),
      ]);

      const sensorData = sensorResponse?.sensors ?? sensorResponse ?? {};
      const nutrientData =
        nutrientResponse?.nutrients ?? nutrientResponse ?? {};

      setSensors((old) => ({ ...old, ...sensorData }));
      setNutrients((old) => ({ ...old, ...nutrientData }));

      const entry = {
        time: new Date().toLocaleString(),
        ...{ ...DEFAULT_SENSORS, ...sensorData },
      };

      setHistory((old) => {
        const updated = [entry, ...old].slice(0, 100);
        localStorage.setItem("hydro_history", JSON.stringify(updated));
        return updated;
      });

      setError("");
    } catch {
      setError(
        "Unable to reach the API. Check your Flask backend and API URL."
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshAutomation() {
    try {
      const response = await getAutomation();
      const settings = response?.settings ?? response ?? {};
      setAutomation((old) => ({ ...old, ...settings }));
    } catch {
      // Keep current settings if the API is unavailable.
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    refreshData();
    refreshAutomation();

    const timer = setInterval(refreshData, 5000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  async function sendDose(letter) {
    const dose = Number(doses[letter]);

    if (doses[letter].trim() === "" || !Number.isFinite(dose) || dose < 0) {
      notify("Enter a valid non-negative dose.", true);
      return;
    }

    setBusy(`nutrient-${letter}`);

    try {
      await setNutrient(letter, dose);
      setNutrients((old) => ({ ...old, [letter]: dose }));
      notify(`Nutrient ${letter} dose saved: ${dose} ml/min.`);
    } catch {
      notify("Unable to save the nutrient dose. Check your API.", true);
    } finally {
      setBusy("");
    }
  }

  async function toggleDevice(device) {
    const current = devices[device.id] || {
      state: "OFF",
      mode: "MANUAL",
    };

    const next = current.state === "ON" ? "OFF" : "ON";
    setBusy(device.id);

    try {
      await controlActuator(device.id, "MANUAL", next);

      setDevices((old) => ({
        ...old,
        [device.id]: { state: next, mode: "MANUAL" },
      }));

      notify(`${device.name} command sent: ${next}.`);
    } catch {
      notify("Unable to send the device command. Check your API.", true);
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
      Object.values(values).some((value) => !Number.isFinite(value)) ||
      values.fan_off >= values.fan_on ||
      values.cooling_off >= values.cooling_on ||
      values.fogger_on >= values.fogger_off
    ) {
      notify(
        "Invalid thresholds. Fan/cooling OFF must be below ON; fogger ON must be below OFF.",
        true
      );
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
    } catch {
      notify("Unable to save automation settings.", true);
    } finally {
      setBusy("");
    }
  }

  function uploadLogo(event, logoType = "primary") {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("Please choose a valid image file.", true);
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      notify("Choose a logo smaller than 2 MB.", true);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = String(reader.result);

      try {
        if (logoType === "primary") {
          localStorage.setItem("hydro_company_logo", image);
          setLogo(image);
        } else {
          localStorage.setItem("hydro_second_logo", image);
          setSecondLogo(image);
        }

        notify("Logo saved in this browser.");
      } catch {
        notify("Storage is full. Try a smaller logo image.", true);
      }

      event.target.value = "";
    };

    reader.readAsDataURL(file);
  }

  function saveCalibration(event) {
    event.preventDefault();

    const actual = Number(sensors[selectedSensor]);
    const target = Number(reference);

    if (
      reference.trim() === "" ||
      !Number.isFinite(actual) ||
      !Number.isFinite(target)
    ) {
      notify("Enter a valid reference value.", true);
      return;
    }

    const updated = {
      ...calibrations,
      [selectedSensor]: {
        reference: target,
        offset: target - actual,
      },
    };

    setCalibrations(updated);
    localStorage.setItem("hydro_calibrations", JSON.stringify(updated));

    notify(
      "Display correction saved locally. Backend readings are unchanged."
    );
  }

  function calibrated(sensorId) {
    const raw = Number(sensors[sensorId]);
    const offset = Number(calibrations[sensorId]?.offset || 0);
    return Number.isFinite(raw) ? raw + offset : NaN;
  }

  function deviceCard(device) {
    const current = devices[device.id] || {
      state: "OFF",
      mode: "MANUAL",
    };

    const isOn = current.state === "ON";

    return (
      <article className="device-card" key={device.id}>
        <div className="device-card-top">
          <span className="device-icon">{device.icon}</span>
          <span className={`state-pill ${isOn ? "on" : ""}`}>
            <i />
            {current.state}
          </span>
        </div>

        <h3>{device.name}</h3>
        <p>{device.description}</p>

        <div className="device-meta">
          <span>Control mode</span>
          <strong>{current.mode}</strong>
        </div>

        <button
          className={`button ${isOn ? "button-stop" : "button-primary"} full-width`}
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

  function nutrientCard(letter) {
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
          Last saved: {number(nutrients[letter], 1)} ml/min
        </div>

        <button
          className="button button-primary full-width"
          disabled={busy === `nutrient-${letter}`}
          onClick={() => sendDose(letter)}
        >
          {busy === `nutrient-${letter}` ? "Sending..." : "Save dose ↗"}
        </button>
      </article>
    );
  }

  function automationField(key, label, unit) {
    return (
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
    );
  }

  const pageInfo = {
    Dashboard: {
      title: "Dashboard",
      subtitle: "Monitor your nutrient tank, sensors and growing environment.",
    },
    "Environment Control": {
      title: "Environment Control",
      subtitle: "Manage ventilation, temperature and humidity.",
    },
    "Tank Control": {
      title: "Tank Control",
      subtitle: "Operate pumps and manage nutrient dosing.",
    },
    Calibration: {
      title: "Sensor Calibration",
      subtitle: "Compare sensor readings against trusted reference values.",
    },
    History: {
      title: "Sensor History",
      subtitle: "Review readings recorded by this browser.",
    },
  }[page];

  if (!isAuthenticated) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          

          <div className="login-mark">H</div>
          <p className="eyebrow">SMART HYDROPONICS SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="login-description">
            Sign in to access your HydroControl dashboard.
          </p>

          <div className="login-demo-info">
            <strong>Demo administrator login</strong>
            <p>Username: admin</p>
            <p>Password: admin123</p>
          </div>

          <label className="form-field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
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
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </label>

          {loginError && <p className="login-error">{loginError}</p>}

          <button className="button button-primary full-width" type="submit">
            Sign in →
          </button>

          <p className="login-footer">HydroControl · Admin Portal</p>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <label className="logo-box" title="Click to change first logo">
            {logo ? <img src={logo} alt="HydroControl logo" /> : <span className="logo-fallback">H</span>}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => uploadLogo(event, "primary")}
            />
          </label>

          <label className="logo-box" title="Click to change second logo">
            {secondLogo ? (
              <img src={secondLogo} alt="Second organization logo" />
            ) : (
              <span className="logo-fallback">+</span>
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => uploadLogo(event, "secondary")}
            />
          </label>

          <div className="brand-text">
            <input
              aria-label="Company name"
              value={company}
              onChange={(event) => {
                setCompany(event.target.value);
                localStorage.setItem("hydro_company_name", event.target.value);
              }}
            />
            <small>HYDROPONICS CONTROL</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="main-nav">
          <button
            className={`nav-item ${page === "Dashboard" ? "active" : ""}`}
            onClick={() => navigate("Dashboard")}
          >
            <span>▦</span>
            Dashboard
          </button>

          <button
            className={`nav-item ${page.includes("Control") ? "active" : ""}`}
            onClick={() => {
              setControlOpen((old) => !old);
              if (!page.includes("Control")) navigate("Environment Control");
            }}
          >
            <span>⌘</span>
            Control
            <b>{controlOpen ? "−" : "+"}</b>
          </button>

          {controlOpen && (
            <div className="subnav">
              <button
                className={`subnav-item ${page === "Environment Control" ? "active" : ""}`}
                onClick={() => navigate("Environment Control")}
              >
                <span>◌</span>
                Environment Control
              </button>

              <button
                className={`subnav-item ${page === "Tank Control" ? "active" : ""}`}
                onClick={() => navigate("Tank Control")}
              >
                <span>♧</span>
                Tank Control
              </button>
            </div>
          )}

          {NAV_ITEMS.slice(1).map((item) => (
            <button
              key={item.label}
              className={`nav-item ${page === item.label ? "active" : ""}`}
              onClick={() => navigate(item.label)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-status">
            <i />
            API connection monitored
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
              Monitoring
            </span>
            <button className="button button-secondary" onClick={handleLogout}>
              Log out
            </button>
            <div className="avatar">HC</div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                CONTROL CENTER / {page.toUpperCase()}
              </div>
              <h1>{pageInfo.title}</h1>
              <p>{pageInfo.subtitle}</p>
            </div>

            <button className="button button-secondary" onClick={refreshData}>
              ↻ Refresh
            </button>
          </div>

          {(message || error) && (
            <div className={`notice ${error ? "notice-error" : ""}`}>
              <span>{error || message}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => {
                  setMessage("");
                  setError("");
                }}
              >
                ×
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-note">Connecting to HydroControl API...</div>
          )}

          {page === "Dashboard" && (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <span className="banner-kicker">SMART HYDROPONICS SYSTEM</span>
                  <h2>Precision growing.<br />Simplified control.</h2>
                  <p>
                    Monitor reservoir conditions and manage your hydroponic
                    equipment from one workspace.
                  </p>
                </div>
                <div className="banner-graphic">
                  <span>H</span>
                  <i>+</i>
                </div>
              </section>

              <div className="dashboard-grid">
                <section className="panel tank-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">RESERVOIR MONITOR</span>
                      <h2>Nutrient tank</h2>
                    </div>
                    <span className="live-tag"><i />LIVE</span>
                  </div>

                  <div className="tank-stage">
                    <div className="tank-side-note">
                      <small>TANK TEMP</small>
                      <strong>{number(calibrated("tank_temperature"))}°C</strong>
                    </div>
                    <div className="tank-drawing">
                      <TankIllustration waterLevel={sensors.water_level} />
                    </div>
                    <div className="tank-side-note">
                      <small>WATER LEVEL</small>
                      <strong>{String(sensors.water_level || "UNKNOWN")}</strong>
                    </div>
                  </div>

                  <div className="tank-bottom-stats">
                    <div><span>pH level</span><strong>{number(calibrated("nutrient_ph"), 2)}</strong></div>
                    <div><span>EC level</span><strong>{number(calibrated("nutrient_ec"), 2)} <small>mS/cm</small></strong></div>
                    <div><span>Water status</span><strong>{String(sensors.water_level || "UNKNOWN")}</strong></div>
                  </div>

                  <button
                    className="button button-primary full-width"
                    onClick={() => navigate("Tank Control")}
                  >
                    Open Tank Control →
                  </button>
                </section>

                <section className="panel environment-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">GROWING AREA MONITOR</span>
                      <h2>Shed environment</h2>
                    </div>
                    <span className="live-tag"><i />LIVE</span>
                  </div>

                  <div className="tank-stage">
                    <div className="tank-side-note">
                      <small>TEMPERATURE</small>
                      <strong>{number(calibrated("shed_temperature"))}°C</strong>
                    </div>
                    <div className="tank-drawing">
                      <ShedIllustration
                        temperature={calibrated("shed_temperature")}
                        humidity={calibrated("humidity")}
                      />
                    </div>
                    <div className="tank-side-note">
                      <small>HUMIDITY</small>
                      <strong>{number(calibrated("humidity"), 0)}%</strong>
                    </div>
                  </div>

                  <div className="tank-bottom-stats">
                    <div><span>Shed temperature</span><strong>{number(calibrated("shed_temperature"))}°C</strong></div>
                    <div><span>Humidity</span><strong>{number(calibrated("humidity"), 0)}%</strong></div>
                    <div><span>Monitoring</span><strong>LIVE</strong></div>
                  </div>

                  <div className="environment-tip">
                    <span>↗</span>
                    <div>
                      <strong>Manage environment</strong>
                      <p>Control the fan, cooling pump and fogger.</p>
                    </div>
                  </div>

                  <button
                    className="button button-secondary full-width"
                    onClick={() => navigate("Environment Control")}
                  >
                    Open Environment Control →
                  </button>
                </section>
              </div>
            </>
          )}

          {page === "Environment Control" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Environment devices</h2>
                  <p>Send manual commands through your Flask API.</p>
                </div>
              </div>

              <div className="device-grid">
                {DEVICES.filter((device) => device.group === "environment").map(deviceCard)}
              </div>

              <section className="panel automation-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">AUTOMATION RULES</span>
                    <h2>Automatic thresholds</h2>
                    <p>Set when your environment devices should switch.</p>
                  </div>
                  <span className="automation-badge">AUTO SETTINGS</span>
                </div>

                <form onSubmit={submitAutomation}>
                  <div className="threshold-group">
                    <h3>Exhaust fan · Temperature</h3>
                    <div className="form-grid">
                      {automationField("fan_on", "Turn ON at", "°C")}
                      {automationField("fan_off", "Turn OFF at", "°C")}
                    </div>
                  </div>

                  <div className="threshold-group">
                    <h3>Cooling pump · Temperature</h3>
                    <div className="form-grid">
                      {automationField("cooling_on", "Turn ON at", "°C")}
                      {automationField("cooling_off", "Turn OFF at", "°C")}
                    </div>
                  </div>

                  <div className="threshold-group">
                    <h3>Fogger · Humidity</h3>
                    <div className="form-grid">
                      {automationField("fogger_on", "Turn ON at or below", "%")}
                      {automationField("fogger_off", "Turn OFF at or above", "%")}
                    </div>
                  </div>

                  <button className="button button-primary" disabled={busy === "automation"}>
                    {busy === "automation" ? "Saving..." : "Save automation settings"}
                  </button>
                </form>
              </section>
            </>
          )}

          {page === "Tank Control" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Tank equipment</h2>
                  <p>Operate the pumps connected to your tank controller.</p>
                </div>
              </div>

              <div className="device-grid">
                {DEVICES.filter((device) => device.group === "tank").map(deviceCard)}
              </div>

              <div className="section-heading nutrient-heading">
                <div>
                  <h2>Nutrient dosing</h2>
                  <p>Configure nutrient A, B and C dosing rates.</p>
                </div>
              </div>

              <div className="nutrient-grid">
                {["A", "B", "C"].map(nutrientCard)}
              </div>

              <div className="info-banner">
                <strong>Hardware connection</strong>
                <p>
                  The website sends commands to Flask. Your Raspberry Pi or
                  controller must read those commands and operate the physical
                  relays, pumps and dosing equipment.
                </p>
              </div>
            </>
          )}

          {page === "Calibration" && (
            <>
              <div className="info-banner">
                <strong>Sensor calibration</strong>
                <p>
                  Select a sensor, enter a trusted reference reading and save
                  its correction. Corrections are stored in this browser and
                  adjust displayed values only. They do not calibrate the
                  physical sensor or change backend readings.
                </p>
              </div>

              <div className="calibration-layout">
                <section className="panel calibration-panel">
                  <span className="eyebrow">SENSOR CONFIGURATION</span>
                  <h2>Calibrate sensor</h2>
                  <p className="panel-description">Compare the current reading with a known reference.</p>

                  <form onSubmit={saveCalibration}>
                    <label className="form-field">
                      <span>Select sensor</span>
                      <select
                        value={selectedSensor}
                        onChange={(event) => {
                          setSelectedSensor(event.target.value);
                          setReference("");
                        }}
                      >
                        {SENSORS.map((sensor) => (
                          <option key={sensor.id} value={sensor.id}>{sensor.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="calibration-reading">
                      <span>Current raw reading</span>
                      <strong>
                        {number(sensors[selectedSensor], 2)}{" "}
                        <small>{SENSORS.find((sensor) => sensor.id === selectedSensor)?.unit}</small>
                      </strong>
                    </div>

                    <label className="form-field">
                      <span>Reference value</span>
                      <input
                        type="number"
                        step="any"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Enter reference reading"
                        required
                      />
                    </label>

                    <button className="button button-primary full-width">
                      Save calibration correction
                    </button>
                  </form>
                </section>

                <section className="panel calibration-panel">
                  <span className="eyebrow">CALIBRATION STATUS</span>
                  <h2>Saved corrections</h2>

                  {SENSORS.map((sensor) => {
                    const saved = calibrations[sensor.id];

                    return (
                      <div className="calibration-row" key={sensor.id}>
                        <div>
                          <strong>{sensor.label}</strong>
                          <span>Adjusted display value</span>
                        </div>
                        <div className="calibration-values">
                          <strong>{number(calibrated(sensor.id), 2)} <small>{sensor.unit}</small></strong>
                          <span>
                            {saved ? `Offset ${Number(saved.offset).toFixed(2)}` : "Not calibrated"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </section>
              </div>
            </>
          )}

          {page === "History" && (
            <section className="panel history-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">RECORDED READINGS</span>
                  <h2>Sensor history</h2>
                  <p>Readings recorded by this browser during monitoring.</p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem("hydro_history");
                    notify("Local history cleared.");
                  }}
                >
                  Clear history
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Tank °C</th>
                      <th>pH</th>
                      <th>EC</th>
                      <th>Water</th>
                      <th>Shed °C</th>
                      <th>Humidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr><td colSpan="7" className="empty-state">No readings recorded yet.</td></tr>
                    ) : (
                      history.map((row, index) => (
                        <tr key={`${row.time}-${index}`}>
                          <td>{row.time}</td>
                          <td>{number(row.tank_temperature)}</td>
                          <td>{number(row.nutrient_ph, 2)}</td>
                          <td>{number(row.nutrient_ec, 2)}</td>
                          <td>{row.water_level || "--"}</td>
                          <td>{number(row.shed_temperature)}</td>
                          <td>{number(row.humidity, 0)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="page-footer">
            <span>HydroControl · Hydroponics monitoring</span>
            <span>
              <i />
              {loading ? "Connecting" : error ? "Connection issue" : "Dashboard active"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function TankIllustration({ waterLevel }) {
  const level = String(waterLevel || "").toUpperCase();
  const isFull = ["FULL", "HIGH"].includes(level);
  const isEmpty = ["EMPTY", "LOW", "CRITICAL"].includes(level);
  const waterY = isFull ? 100 : isEmpty ? 190 : 145;
  const waterHeight = 220 - waterY;
  const waterLabel = level || "UNKNOWN";

  return (
    <svg className="tank-svg" viewBox="0 0 300 280" role="img" aria-label={`Hydroponic nutrient tank, water level ${waterLabel}`}>
      <defs>
        <linearGradient id="tankBody" x1="0" x2="1">
          <stop offset="0%" stopColor="#e5f3e9" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d5eadb" />
        </linearGradient>
        <linearGradient id="tankWater" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#72dba0" />
          <stop offset="100%" stopColor="#23945c" />
        </linearGradient>
        <clipPath id="tankClip">
          <rect x="61" y="63" width="178" height="163" rx="12" />
        </clipPath>
      </defs>

      <ellipse cx="150" cy="244" rx="112" ry="13" fill="#b5c9bb" opacity=".5" />
      <g clipPath="url(#tankClip)">
        <rect x="61" y="63" width="178" height="163" fill="url(#tankBody)" />
        <rect x="61" y={waterY} width="178" height={waterHeight} fill="url(#tankWater)" opacity=".95" />
        <path d={`M61 ${waterY} q22 -8 44 0 t44 0 t44 0 t46 0`} fill="none" stroke="#eafff0" strokeWidth="3" />
        <path d="M78 178 q22 -7 44 0 t44 0 t44 0" fill="none" stroke="#ffffff" opacity=".4" />
      </g>
      <rect x="61" y="63" width="178" height="163" rx="12" fill="none" stroke="#419766" strokeWidth="3" />
      <ellipse cx="150" cy="64" rx="89" ry="13" fill="#e7f5eb" stroke="#419766" strokeWidth="3" />
      <ellipse cx="150" cy="64" rx="65" ry="7" fill="#d1e8d9" />
      <path d="M130 58 V38 Q130 31 137 31 H163 Q170 31 170 38 V58" fill="#e7f5eb" stroke="#419766" strokeWidth="3" />
      <path d="M61 111 H43 V133 H61 M239 193 H256 V213 H273" fill="none" stroke="#419766" strokeWidth="7" strokeLinecap="round" />
      <path d="M94 226 V238 M206 226 V238 M79 239 H109 M191 239 H221" stroke="#419766" strokeWidth="5" strokeLinecap="round" />
      <text x="150" y="151" textAnchor="middle" fill={isEmpty ? "#245c3a" : "#ffffff"} fontSize="11" fontWeight="700">NUTRIENT TANK</text>
      <text x="150" y="169" textAnchor="middle" fill={isEmpty ? "#245c3a" : "#f1fff5"} fontSize="10">LEVEL: {waterLabel}</text>
    </svg>
  );
}

function ShedIllustration({ temperature, humidity }) {
  const temp = Number(temperature);
  const hum = Number(humidity);

  const tempColor = !Number.isFinite(temp)
    ? "#94a3b8"
    : temp >= 35 ? "#ef4444" : temp >= 30 ? "#f59e0b" : "#23945c";

  const humidityColor = !Number.isFinite(hum)
    ? "#94a3b8"
    : hum >= 80 ? "#f59e0b" : hum < 40 ? "#ef4444" : "#23945c";

  return (
    <svg className="tank-svg" viewBox="0 0 300 280" role="img" aria-label={`Shed temperature ${number(temperature)} degrees Celsius and humidity ${number(humidity, 0)} percent`}>
      <defs>
        <linearGradient id="shedBody" x1="0" x2="1">
          <stop offset="0%" stopColor="#e5f3e9" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d5eadb" />
        </linearGradient>
        <linearGradient id="shedAir" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#72dba0" />
          <stop offset="100%" stopColor="#23945c" />
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="244" rx="112" ry="13" fill="#b5c9bb" opacity=".5" />
      <path d="M42 105 L150 36 L258 105" fill="#d5eadb" stroke="#419766" strokeWidth="5" strokeLinejoin="round" />
      <rect x="55" y="103" width="190" height="127" rx="5" fill="url(#shedBody)" stroke="#419766" strokeWidth="3" />
      <rect x="70" y="117" width="160" height="98" rx="5" fill="url(#shedAir)" />
      <path d="M150 117 V215 M75 163 H225" stroke="#ffffff" strokeWidth="3" opacity=".55" />
      <circle cx="103" cy="144" r="15" fill="#ffffff" opacity=".95" />
      <path d="M101 136 V149 A5 5 0 1 0 107 149 V136 A3 3 0 0 0 101 136Z" fill={tempColor} />
      <text x="158" y="149" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">{Number.isFinite(temp) ? temp.toFixed(1) : "--"}°C</text>
      <path d="M103 168 C103 168 93 181 93 187 A10 10 0 0 0 113 187 C113 181 103 168 103 168Z" fill="#ffffff" />
      <text x="161" y="189" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">{Number.isFinite(hum) ? hum.toFixed(0) : "--"}% RH</text>
      <rect x="124" y="199" width="52" height="31" rx="3" fill="#e5f3e9" stroke="#419766" strokeWidth="2" />
      <circle cx="166" cy="215" r="2.5" fill="#419766" />
      <circle cx="83" cy="126" r="4" fill={tempColor} />
      <circle cx="217" cy="126" r="4" fill={humidityColor} />
      <text x="150" y="260" textAnchor="middle" fill="#419766" fontSize="10" fontWeight="700">SMART GROWING SHED</text>
    </svg>
  );
}

export default App;
