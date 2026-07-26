"""
MCP (Model Context Protocol) Server for Eco-Loop Building Agents

Implements a FastAPI-based MCP server that exposes building control tools
to the LLM agent. The server acts as the communication bus between the
EnergyPlus simulation and the AI agent.

Tools exposed:
    - get_building_state: Returns current sensor data
    - set_zone_setpoints: Adjusts thermostat setpoints
    - get_energy_summary: Returns energy consumption metrics
    - get_optimization_history: Returns past control actions and effects

SSE Streaming:
    - /stream: Server-Sent Events endpoint for real-time pipeline events
"""

import json
import time
import queue  # stdlib thread-safe queue — critical for cross-thread SSE
import asyncio
import threading
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


# FastAPI app
app = FastAPI(
    title="Eco-Loop MCP Server",
    description="Model Context Protocol server for building energy optimization",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MCPToolCall(BaseModel):
    """Incoming tool call from the LLM agent."""
    tool: str
    parameters: dict = Field(default_factory=dict)


class MCPToolResponse(BaseModel):
    """Response from a tool call."""
    tool: str
    success: bool
    data: dict = Field(default_factory=dict)
    error: Optional[str] = None


class SetpointRequest(BaseModel):
    """Request to set zone thermostat setpoints."""
    heating_setpoint: float = Field(ge=15.0, le=26.0)
    cooling_setpoint: float = Field(ge=18.0, le=30.0)


class MCPServer:
    """
    MCP Server that manages the communication between the LLM agent 
    and the EnergyPlus simulation.
    
    In a full MCP implementation, this would use SSE or stdio transport.
    For this PoC, it maintains state in-memory and exposes it via REST API.
    Includes SSE broadcasting for real-time pipeline streaming.
    
    IMPORTANT: Uses stdlib queue.Queue (not asyncio.Queue) because broadcast()
    is called from the EnergyPlus simulation thread, not the asyncio event loop.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._current_state: dict = {}
        self._control_actions: list = []
        self._energy_history: list = []
        self._baseline_results: Optional[dict] = None
        self._optimized_results: Optional[dict] = None
        self._simulation_active = False
        
        # SSE streaming infrastructure — using stdlib queue.Queue for thread safety
        self._sse_queues: list[queue.Queue] = []
        self._sse_lock = threading.Lock()
        self._pipeline_phase: str = "idle"  # idle, sensing, thinking, injecting
        self._last_sensor: Optional[dict] = None
        self._last_llm_response: Optional[str] = None
        self._last_injection: Optional[dict] = None
        
        # Live metrics tracking
        self._live_metrics: Optional[dict] = None
        self._comfort_total: int = 0
        self._comfort_violations: int = 0

    def broadcast(self, event: str, data: dict):
        """
        Broadcast an SSE event to all connected clients.
        Thread-safe — uses stdlib queue.Queue so it can be called from any thread.
        """
        payload = json.dumps(data, default=str)
        with self._sse_lock:
            dead_queues = []
            for q in self._sse_queues:
                try:
                    q.put_nowait((event, payload))
                except queue.Full:
                    dead_queues.append(q)
            for q in dead_queues:
                self._sse_queues.remove(q)

    def register_sse_client(self) -> queue.Queue:
        """Register a new SSE client and return its thread-safe queue."""
        q = queue.Queue(maxsize=1000)
        with self._sse_lock:
            self._sse_queues.append(q)
        return q

    def unregister_sse_client(self, q: queue.Queue):
        """Remove an SSE client queue."""
        with self._sse_lock:
            if q in self._sse_queues:
                self._sse_queues.remove(q)

    def update_live_metrics(self, sensor_data: dict):
        """
        Compute and store live comparison metrics from the running simulation.
        Called from the simulation thread on each AI timestep.
        """
        current_kwh = sensor_data.get("total_energy_kwh", 0)
        current_ts = sensor_data.get("timestep_count", 0)
        
        # Track comfort in real-time
        zones = sensor_data.get("zones", {})
        for zone_data in zones.values():
            temp = zone_data.get("temp_c", 22)
            self._comfort_total += 1
            if temp < 19.0 or temp > 26.0:
                self._comfort_violations += 1
        
        comfort_pct = (
            (self._comfort_total - self._comfort_violations) / self._comfort_total * 100
            if self._comfort_total > 0 else 100.0
        )
        
        # Compare against baseline if available
        baseline_kwh = 0
        energy_saved = 0
        savings_pct = 0
        
        if self._baseline_results:
            baseline_total = self._baseline_results.get("total_energy_kwh", 0)
            baseline_ts = self._baseline_results.get("total_timesteps", 1)
            
            # Pro-rate baseline energy to current timestep for fair comparison
            baseline_kwh = baseline_total * (current_ts / baseline_ts) if baseline_ts > 0 else 0
            energy_saved = baseline_kwh - current_kwh
            savings_pct = (energy_saved / baseline_kwh * 100) if baseline_kwh > 0 else 0
        
        self._live_metrics = {
            "savings": {
                "energy_saved_kwh": round(energy_saved, 2),
                "energy_savings_pct": round(savings_pct, 1),
                "baseline_kwh": round(baseline_kwh, 2),
                "optimized_kwh": round(current_kwh, 2),
            },
            "comfort": {
                "baseline_comfort_pct": self._baseline_results.get("comfort_pct", 0) if self._baseline_results else 0,
                "optimized_comfort_pct": round(comfort_pct, 1),
            },
            "timestep": current_ts,
            "is_live": True,
        }

    @property
    def tools(self) -> list:
        """List of tools available to the LLM agent."""
        return [
            {
                "name": "get_building_state",
                "description": "Get current building sensor data including zone temperatures, "
                             "outdoor conditions, energy consumption, and occupancy.",
                "parameters": {},
            },
            {
                "name": "set_zone_setpoints",
                "description": "Set heating and cooling thermostat setpoints for all zones. "
                             "Heating must be 15-24°C, cooling must be 21-26°C.",
                "parameters": {
                    "heating_setpoint": {"type": "number", "description": "Heating setpoint in °C"},
                    "cooling_setpoint": {"type": "number", "description": "Cooling setpoint in °C"},
                },
            },
            {
                "name": "get_energy_summary",
                "description": "Get cumulative energy consumption metrics for the current simulation.",
                "parameters": {},
            },
            {
                "name": "get_optimization_history",
                "description": "Get the history of control actions taken by the AI agent.",
                "parameters": {},
            },
        ]

    def update_state(self, sensor_data: dict):
        """Update the current building state from EnergyPlus sensors."""
        with self._lock:
            self._current_state = sensor_data
            self._energy_history.append({
                "timestamp": sensor_data.get("timestamp", ""),
                "facility_power_w": sensor_data.get("facility_power_w", 0),
                "hvac_power_w": sensor_data.get("hvac_power_w", 0),
                "total_energy_kwh": sensor_data.get("total_energy_kwh", 0),
            })

    def get_state(self) -> dict:
        """Get the current building state."""
        with self._lock:
            return self._current_state.copy()

    def log_action(self, action: dict):
        """Log a control action taken by the AI agent."""
        with self._lock:
            self._control_actions.append({
                **action,
                "wall_clock": time.strftime("%H:%M:%S"),
            })

    def set_results(self, mode: str, results: dict):
        """Store simulation results."""
        if mode == "baseline":
            self._baseline_results = results
        else:
            self._optimized_results = results

    def execute_tool(self, tool_name: str, parameters: dict) -> dict:
        """Execute a tool call and return the result."""
        if tool_name == "get_building_state":
            return self.get_state()
        
        elif tool_name == "set_zone_setpoints":
            return {
                "status": "applied",
                "heating_setpoint": parameters.get("heating_setpoint"),
                "cooling_setpoint": parameters.get("cooling_setpoint"),
            }
        
        elif tool_name == "get_energy_summary":
            state = self.get_state()
            return {
                "total_energy_kwh": state.get("total_energy_kwh", 0),
                "current_facility_power_w": state.get("facility_power_w", 0),
                "current_hvac_power_w": state.get("hvac_power_w", 0),
                "timestep_count": state.get("timestep_count", 0),
            }
        
        elif tool_name == "get_optimization_history":
            with self._lock:
                recent = self._control_actions[-20:]  # Last 20 actions
            return {"actions": recent, "total_actions": len(self._control_actions)}
        
        else:
            return {"error": f"Unknown tool: {tool_name}"}

    def get_comparison_data(self) -> dict:
        """Get baseline vs optimized comparison data for the dashboard."""
        return {
            "baseline": self._baseline_results,
            "optimized": self._optimized_results,
        }


# Global MCP server instance
mcp_server = MCPServer()


# ── SSE Streaming Endpoint ──

@app.get("/stream")
async def sse_stream(request: Request):
    """
    Server-Sent Events endpoint for real-time pipeline streaming.
    
    Uses stdlib queue.Queue polled with asyncio.sleep() to bridge
    the simulation thread to the async SSE generator safely.
    """
    client_queue = mcp_server.register_sse_client()

    async def event_generator():
        try:
            # Send initial connection confirmation
            yield f"event: connected\ndata: {json.dumps({'status': 'connected', 'phase': mcp_server._pipeline_phase})}\n\n"
            
            keepalive_counter = 0
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                # Drain all available events from the thread-safe queue
                events_sent = False
                try:
                    while True:
                        event, data = client_queue.get_nowait()
                        yield f"event: {event}\ndata: {data}\n\n"
                        events_sent = True
                except queue.Empty:
                    pass
                
                if not events_sent:
                    keepalive_counter += 1
                    # Send keepalive every ~15 seconds (300 * 50ms)
                    if keepalive_counter >= 300:
                        yield ": keepalive\n\n"
                        keepalive_counter = 0
                
                # Poll interval — 50ms gives responsive streaming feel
                await asyncio.sleep(0.05)
        finally:
            mcp_server.unregister_sse_client(client_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/pipeline_state")
def get_pipeline_state():
    """Get the current pipeline state for late-joining clients."""
    return {
        "phase": mcp_server._pipeline_phase,
        "last_sensor": mcp_server._last_sensor,
        "last_llm_response": mcp_server._last_llm_response,
        "last_injection": mcp_server._last_injection,
    }


@app.get("/live_metrics")
def get_live_metrics():
    """
    Get live comparison metrics during a running simulation.
    Returns pro-rated baseline vs current optimized energy and comfort.
    Falls back to final results if simulation is complete.
    """
    if mcp_server._live_metrics:
        return mcp_server._live_metrics
    
    # Fall back to completed results
    if mcp_server._optimized_results and mcp_server._baseline_results:
        baseline = mcp_server._baseline_results
        optimized = mcp_server._optimized_results
        baseline_kwh = baseline.get("total_energy_kwh", 0)
        optimized_kwh = optimized.get("total_energy_kwh", 0)
        saved = baseline_kwh - optimized_kwh
        pct = (saved / baseline_kwh * 100) if baseline_kwh > 0 else 0
        return {
            "savings": {
                "energy_saved_kwh": round(saved, 2),
                "energy_savings_pct": round(pct, 1),
                "baseline_kwh": round(baseline_kwh, 2),
                "optimized_kwh": round(optimized_kwh, 2),
            },
            "comfort": {
                "baseline_comfort_pct": baseline.get("comfort_pct", 0),
                "optimized_comfort_pct": optimized.get("comfort_pct", 0),
            },
            "is_live": False,
        }
    
    return {"error": "No metrics available yet"}


# ── REST API Endpoints ──

@app.get("/")
def root():
    return {"service": "Eco-Loop MCP Server", "status": "running"}


@app.get("/tools")
def list_tools():
    """List available MCP tools."""
    return {"tools": mcp_server.tools}


@app.post("/tool")
def call_tool(call: MCPToolCall):
    """Execute a tool call."""
    result = mcp_server.execute_tool(call.tool, call.parameters)
    return MCPToolResponse(
        tool=call.tool,
        success="error" not in result,
        data=result,
    )


@app.get("/state")
def get_state():
    """Get current building state."""
    return mcp_server.get_state()


@app.get("/comparison")
def get_comparison():
    """Get baseline vs optimized comparison data."""
    return mcp_server.get_comparison_data()


@app.get("/actions")
def get_actions():
    """Get control action history."""
    with mcp_server._lock:
        return {"actions": mcp_server._control_actions}


@app.get("/energy_history")
def get_energy_history():
    """Get energy consumption timeline."""
    with mcp_server._lock:
        # Return sampled data to keep response size manageable
        data = mcp_server._energy_history
        sample_rate = max(1, len(data) // 500)
        return {"history": data[::sample_rate]}
