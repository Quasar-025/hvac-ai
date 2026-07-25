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
"""

import json
import time
import threading
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._current_state: dict = {}
        self._control_actions: list = []
        self._energy_history: list = []
        self._baseline_results: Optional[dict] = None
        self._optimized_results: Optional[dict] = None
        self._simulation_active = False

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
