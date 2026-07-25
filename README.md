# Eco-Loop Building Agents

An autonomous building energy optimization system leveraging True Runtime Injection (PyEnergyPlus) and Local LLMs (Ollama / Qwen 3.5 9B).

## Requirements
- Python 3.9+
- Node.js & npm (for the Next.js Dashboard)
- EnergyPlus V26.1.0 installed at `C:\EnergyPlusV26-1-0`
- Ollama installed locally with the `qwen3.5-abliterated:9b` model

## Setup

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Pull the Ollama Model:**
```bash
ollama pull huihui_ai/qwen3.5-abliterated:9b
```

3. **Install Dashboard dependencies:**
```bash
cd web
npm install
```

## Running the Simulation Pipeline

To run the complete closed-loop orchestration (Baseline + AI-Optimized runs):

```bash
# Run for the month of July (Default)
python src/main.py

# Run for January and July
python src/main.py --months 1 7

# Run with verbose LLM logging
python src/main.py --verbose
```

## Running the Dashboard

After the simulation finishes, the data is saved to the `data/` directory. You can visualize the digital twin and real-time graphs by starting the Next.js frontend:

```bash
cd web
npm run dev
```

Open `http://localhost:3000` to view the stunning digital twin and telemetry charts.
