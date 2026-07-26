# Eco-Loop Building Agents

An autonomous building energy optimization system leveraging True Runtime Injection (PyEnergyPlus) and Local LLMs (Ollama) to perform real-time, closed-loop HVAC control.

This project uses an LLM to read real-time telemetry from a running EnergyPlus simulation and inject dynamic thermostat setpoints to maximize thermal comfort and minimize energy consumption and carbon emissions. It features a stunning liquid-glass Next.js dashboard that visualizes the pipeline (EnergyPlus → LLM → Runtime Injector) and displays live metrics and a 3D digital twin.

## Architecture Highlights
- **Physics Engine**: EnergyPlus V26.1.0 with PyEnergyPlus for runtime injection
- **AI Agent**: Ollama with Qwen 3.5 9B (configurable via environment variables)
- **State Bus**: FastAPI MCP Server with Server-Sent Events (SSE) broadcasting
- **Frontend**: Next.js App Router, TailwindCSS, Recharts, React Three Fiber (Digital Twin)

For a detailed architecture breakdown, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites
- Python 3.9+
- Node.js & npm
- EnergyPlus V26.1.0 (Must be installed exactly at `C:\EnergyPlusV26-1-0` for the Python API to link correctly)
- Ollama installed locally

## Detailed Setup Steps

### 1. Python Backend Setup

Clone the repository and install the dependencies:
```bash
git clone <your-repo>
cd honeywell
pip install -r requirements.txt
```

### 2. Ollama & AI Model Setup

Ensure Ollama is running on your machine. By default, the system uses the `qwen3.5:9b` model for its balance of speed and reasoning.

Pull the default model:
```bash
ollama pull qwen3.5:9b
```

*(Optional)* If you want to use a different model, simply pull it and set the `OLLAMA_MODEL` environment variable before running the simulation:
```powershell
# Example: Using Llama 3 8B
ollama pull llama3
$env:OLLAMA_MODEL="llama3"
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
