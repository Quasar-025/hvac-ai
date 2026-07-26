# Eco-Loop Building Agents

An autonomous building energy optimization system leveraging True Runtime Injection (PyEnergyPlus) and Local LLMs (Ollama) to perform real-time, closed-loop HVAC control.

This project uses an LLM to read real-time telemetry from a running EnergyPlus simulation and inject dynamic thermostat setpoints to maximize thermal comfort and minimize energy consumption and carbon emissions. It features a stunning liquid-glass Next.js dashboard that visualizes the pipeline (EnergyPlus → LLM → Runtime Injector) and displays live metrics and a 3D digital twin.

## Results Summary

The AI-driven closed-loop strategy achieves **10.6% energy savings** over the standard rule-based baseline while **maintaining identical thermal comfort**.

| Metric | Baseline (Rule-Based) | AI-Optimized (Llama 3) | Δ |
|---|---|---|---|
| **Total HVAC Energy** | 147.86 kWh | 132.19 kWh | **−15.67 kWh (−10.6%)** |
| **Thermal Comfort** | 94.5% in bounds | 94.5% in bounds | **0% degradation** |
| **Avg HVAC Power** | 198.7 W | 177.7 W | −21.0 W |
| **Simulation Period** | July 1–31 (Chicago) | July 1–31 (Chicago) | — |
| **LLM Success Rate** | — | 100% (124/124 calls) | 0 fallbacks |
| **Avg LLM Latency** | — | 1.54s per decision | — |

> The AI agent achieves energy savings by dynamically widening the HVAC deadband during unoccupied hours, pre-cooling before peak heat, and shedding load during high grid carbon intensity periods — all while never letting zone temperatures leave the 19–26°C comfort bounds.

## Architecture Highlights
- **Physics Engine**: EnergyPlus V26.1.0 with PyEnergyPlus for true runtime injection
- **AI Agent**: Ollama with Llama 3 (configurable via `OLLAMA_MODEL` environment variable)
- **State Bus**: FastAPI MCP Server with Server-Sent Events (SSE) broadcasting
- **Frontend**: Next.js App Router, TailwindCSS, Plotly, React Three Fiber (Digital Twin)

For a detailed architecture breakdown, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites
- Python 3.9+
- Node.js & npm
- EnergyPlus V26.1.0 (must be installed at `C:\EnergyPlusV26-1-0` for the Python API to link correctly)
  - The Chicago O'Hare TMY3 weather file (`USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw`) must be present in the `WeatherData/` subdirectory of your EnergyPlus installation (it ships with the default installer).
- Ollama installed locally with the `llama3:latest` model pulled

## Detailed Setup Steps

### 1. Python Backend Setup

Clone the repository and install the dependencies:
```bash
git clone https://github.com/Quasar-025/hvac-ai.git
cd hvac-ai
pip install -r requirements.txt
```

### 2. Ollama & AI Model Setup

Ensure Ollama is running on your machine. By default, the system uses the `llama3:latest` model for its balance of speed and reasoning, and reliable strict JSON formatting.

Pull the default model:
```bash
ollama pull llama3:latest
```

*(Optional)* If you want to use a different model, simply pull it and set the `OLLAMA_MODEL` environment variable before running the simulation:
```powershell
# Example: Using Qwen 3.5 9B
ollama pull qwen3.5:9b
$env:OLLAMA_MODEL="qwen3.5:9b"
```

### 3. Frontend Dashboard Setup

Install the Node dependencies for the Next.js frontend:
```bash
cd web
npm install
```

## Running the System

You need two terminal windows: one for the backend simulation and one for the frontend dashboard.

### Terminal 1: Run the AI Simulation Pipeline

This will launch the MCP server and run the EnergyPlus simulation in a closed loop with the LLM agent. By default, it runs both a Baseline (rule-based) and an AI-Optimized simulation for the month of July.

```bash
# In the root repository directory
python src/main.py
```

Other available options:
```bash
# Run for specific months (e.g., January and July)
python src/main.py --months 1 7

# Run with verbose LLM logging
python src/main.py --verbose

# Run for fewer days (faster demo)
python src/main.py --months 7 --days 3
```

### Terminal 2: Run the Next.js Dashboard

Start the development server for the UI:
```bash
cd web
npm run dev
```

Open `http://localhost:3000` in your browser.

- **Dashboard View**: View live comparison metrics (Baseline vs. AI), Energy/Temperature charts, and the 3D Digital Twin.
- **Pipeline View**: Watch the real-time SSE stream as the EnergyPlus Engine sends sensor data to the LLM, the LLM streams its reasoning token-by-token, and the Runtime Injector pushes the setpoints back into the physics engine.

### Output Artifacts

After the simulation completes, the results are saved in the following directories:
- **`data/`**: Contains the refined JSON files used by the dashboard to prove energy savings (`results.json`, `baseline_timestep_data.json`, `optimized_timestep_data.json`, `control_actions.json`).
- **`output/baseline/` & `output/optimized/`**: Contains the raw, verbose EnergyPlus engine artifacts (e.g., `.eso`, `.err`, `.csv`) for deep physical inspection.
- **`models/generated/`**: Contains the dynamically evaluated IDF files (`baseline_run.idf` and `optimized_run.idf`).

## Challenges Faced

During the development and testing of this project, we encountered and resolved several technical challenges:

**LLM Inference Latency & VRAM Limitations:** We initially used Qwen 3.5 9B for our agent, but we found it was occupying too much GPU VRAM and occasionally caused parsing failures (hallucinated text outside of strict JSON bounds). We switched the default model to **Llama 3** (`llama3:latest`) because its smaller footprint fits perfectly in standard VRAM, it delivers significantly faster response times for real-time control, and it strictly adheres to JSON formatting. The architecture remains fully configurable to scale up to better models depending on available GPU hardware.

**EnergyPlus Actuator Handle Acquisition:** The PyEnergyPlus API requires acquiring actuator handles by exact component type, control type, and actuator key. The 5-zone model's thermostat configuration changed between EnergyPlus versions, and we initially couldn't acquire per-zone "Zone Temperature Control" actuators. We implemented a **two-tier fallback**: first attempt per-zone actuators, then fall back to global `Schedule:Compact` overrides for `Htg-SetP-Sch` and `Clg-SetP-Sch`. This ensures the system works across different IDF configurations.

**Thread Safety Between EnergyPlus & Web Clients:** EnergyPlus runs its simulation in a single blocking thread, while our FastAPI SSE endpoint serves async web clients. Directly sharing state caused race conditions. We solved this by using Python's stdlib `queue.Queue` (thread-safe, non-async) for the SSE broadcast channel, with the FastAPI event loop polling via `asyncio.sleep(0.05)`. This bridges the two execution models without locks or deadlocks.

**Preventing Actuator Reset on Non-AI Timesteps:** We discovered that EnergyPlus resets actuator overrides on every timestep unless you explicitly re-write them. With the LLM only called every Nth timestep for latency reasons, the setpoints would revert to the IDF defaults between AI calls. We fixed this by caching the last valid AI action and re-applying it on every single timestep callback, while only logging it on AI-call timesteps.
