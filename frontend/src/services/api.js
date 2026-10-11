
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export const getSensors = () =>
  request("/api/sensors");

export const getNutrients = () =>
  request("/api/nutrients");

export const setNutrient = (name, value) =>
  request("/api/nutrients", {
    method: "POST",
    body: JSON.stringify({ name, value }),
  });

export const controlActuator = (name, state) =>
  request("/api/actuators", {
    method: "POST",
    body: JSON.stringify({ name, state }),
  });

export const getAutomation = () =>
  request("/api/automation");

export const saveAutomation = (settings) =>
  request("/api/automation", {
    method: "POST",
    body: JSON.stringify(settings),
  });
