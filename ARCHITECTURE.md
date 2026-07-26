# Eco-Loop Building Agents Architecture

This document describes the system architecture for the Eco-Loop Building Agents platform, a cutting-edge closed-loop control system built to optimize HVAC energy consumption. It bridges rigorous building physics simulation (EnergyPlus) with real-time generative AI control (Local LLMs) via a custom Model Context Protocol (MCP) server.

## System Overview

The system operates continuously, reading high-frequency telemetry from the simulation, streaming it to an LLM for reasoning, and injecting the resulting setpoints back into the simulation without ever stopping the engine.

```mermaid
graph TD
    EP[EnergyPlus Engine] <-->|PyEnergyPlus API| EW[EnergyPlus Wrapper]
    EW <-->|Sensor Data / Actions| MCP[FastAPI MCP Server]
    MCP <-->|State & Tools| LLM[LLM Agent Ollama]
    MCP <-->|SSE Stream & JSON| WEB[Next.js Dashboard]
    LLM -->|Control Logic JSON| MCP
```

## 1. True Runtime Injection (PyEnergyPlus)

Traditional EnergyPlus optimization involves statically modifying `.idf` files, running the simulation, parsing the output, and repeating. This system uses the `PyEnergyPlus` Python API for **True Runtime Injection**.

- **Callbacks**: We register a Python callback for the `BeginSystemTimestepBeforePredictor` event. This function is called by the C++ engine on every single simulation timestep.
- **State Reading**: At each timestep, the wrapper reads current values for `Zone Air Temperature`, `Occupant Count`, `Outdoor Air Drybulb Temperature`, and `Facility Total HVAC Electricity Demand Rate` using the EnergyPlus API state handles.
- **Actuation**: Once the LLM makes a decision, the wrapper writes directly to the `Heating Setpoint` and `Cooling Setpoint` schedule actuators using `set_actuator_value()`. This pushes the LLM's decisions back into the physics engine *while the simulation is paused mid-timestep*, dynamically altering the building's trajectory.

## 2. LLM Agent Control Loop (`src/llm_agent.py`)

The core decision-making is handled by `EcoLoopAgent`, interfacing with local LLMs via Ollama.

- **Dynamic Model Selection**: By default, it uses Qwen 3.5 9B (`qwen3.5:9b`). This can be easily overridden using the `OLLAMA_MODEL` environment variable to test different local models (e.g., Llama 3). The 7B-9B parameter class offers the perfect balance of low-latency real-time inference and sufficient reasoning capabilities.
- **Prompt Engineering**: The LLM is provided a heavily engineered system prompt demanding strict JSON responses. It receives a concise state string summarizing the current telemetry (e.g., "Zone temps: avg=22.1°C...").
- **Streaming Inference**: The agent requests a streaming response from Ollama (`stream=True`), capturing each token as it is generated and triggering a callback. This allows the UI to display a "typewriter" effect of the model's reasoning in real-time.
- **Hallucination Prevention**: 
    1. The system prompt strictly enforces structural schema (`{"heating_setpoint": X, "cooling_setpoint": Y}`).
    2. Post-processing validates data types and clamps temperature bounds (heating 15-24°C, cooling 21-26°C).
    3. If the LLM hallucinates an invalid response or crashes, a **Rule-Based Fallback Strategy** instantly takes over for that timestep, ensuring the building remains safe and comfortable.

## 3. MCP Server & Event Bus (`src/mcp_server.py`)

The custom MCP server acts as the central nervous system, managing state and bridging the synchronous EnergyPlus thread with asynchronous Web clients.

- **FastAPI**: Exposes REST endpoints for late-joining clients to fetch current state, optimization history, and comparison data.
- **Thread-Safe SSE Broadcasting**: Uses a standard Python `queue.Queue` to safely pass events from the EnergyPlus execution thread to the FastAPI `asyncio` event loop. This drives a Server-Sent Events (SSE) `/stream` endpoint.
- **Live Metrics**: Calculates pro-rated energy savings and thermal comfort scores on the fly during the simulation, broadcasting them via SSE so the dashboard KPIs update in real-time.
- **Event Flow**: As data flows through the system, the server emits a sequence of events (`pipeline:sensor` → `pipeline:llm_start` → `pipeline:llm_chunk` → `pipeline:llm_done` → `pipeline:injection` → `pipeline:metrics`).

## 4. Next.js Digital Twin Dashboard (`web/`)

The frontend is built with **Next.js (App Router)** and features a premium "liquid glass" aesthetic using CSS custom variables and backdrop blurs.

- **Real-Time Pipeline View**: Connects to the SSE `/stream` endpoint. Visualizes the exact flow of data: EnergyPlus nodes light up when sensors are read, the LLM node displays streaming tokens with a typewriter cursor, and the Injector node lights up when setpoints are pushed back.
- **Three.js Digital Twin**: Uses `@react-three/fiber` and `@react-three/drei` to render an interactive 3D model of the 5-zone building. Hovering over zones reveals live telemetry tooltips.
- **Live Telemetry & KPIs**: Uses Plotly (`react-plotly.js`) for dynamic line charts comparing Baseline vs. AI-Optimized performance. The KPI cards read directly from the SSE metrics stream to show accumulating energy savings as the simulation progresses.
