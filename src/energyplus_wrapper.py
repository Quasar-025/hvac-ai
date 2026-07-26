"""
EnergyPlus Runtime API Wrapper for Closed-Loop Building Control

Uses the PyEnergyPlus API for TRUE dynamic runtime injection — NOT static IDF
modification. The EnergyPlus `state` object is passed directly into Python
callbacks at every simulation timestep, allowing real-time sensor reads and
actuator writes via set_actuator_value().

Architecture:
    EnergyPlus Runtime → callback_begin_system_timestep_before_predictor()
                       → read sensors (zone temps, energy, weather)
                       → send to AI agent for reasoning
                       → apply control actions via actuators
                       → EnergyPlus continues with modified setpoints
"""

import sys
import os
import re
import json
import time
import shutil
import tempfile
import threading
from pathlib import Path
from typing import Optional, Callable

# Add EnergyPlus to Python path for pyenergyplus imports
ENERGYPLUS_DIR = r"C:\EnergyPlusV26-1-0"
sys.path.insert(0, ENERGYPLUS_DIR)

from pyenergyplus.api import EnergyPlusAPI


# Zone names in the 5ZoneAirCooled model
ZONE_NAMES = ["SPACE1-1", "SPACE2-1", "SPACE3-1", "SPACE4-1", "SPACE5-1"]

# Baseline setpoints (from the IDF schedules)
BASELINE_HEATING_SETPOINT = 22.2  # °C during occupied hours (6-20)
BASELINE_COOLING_SETPOINT = 23.9  # °C during occupied hours (6-20)
BASELINE_HEATING_SETBACK = 16.7   # °C during unoccupied hours
BASELINE_COOLING_SETBACK = 29.4   # °C during unoccupied hours

# Comfort bounds — AI must keep zones within these limits
COMFORT_TEMP_MIN = 19.0  # °C absolute minimum
COMFORT_TEMP_MAX = 26.0  # °C absolute maximum


def create_run_period_idf(source_idf: str, output_idf: str,
                          begin_month: int, begin_day: int,
                          end_month: int, end_day: int):
    """
    Create a copy of an IDF file with a modified RunPeriod.
    This is only used to set the simulation time window — all HVAC control
    is still done via runtime injection, not IDF modification.
    """
    with open(source_idf, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    # Replace the RunPeriod object's begin/end month/day
    # Match the RunPeriod block and replace month/day fields
    pattern = (
        r"(RunPeriod,\s*\n\s*Run Period 1,\s*!-[^\n]*\n\s*)"
        r"\d+(\s*,\s*!-\s*Begin Month\s*\n\s*)"
        r"\d+(\s*,\s*!-\s*Begin Day of Month\s*\n\s*"
        r",\s*!-[^\n]*\n\s*)"
        r"\d+(\s*,\s*!-\s*End Month\s*\n\s*)"
        r"\d+(\s*,\s*!-\s*End Day of Month)"
    )
    replacement = (
        rf"\g<1>{begin_month}\g<2>{begin_day}\g<3>"
        rf"{end_month}\g<4>{end_day}\g<5>"
    )
    content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)

    with open(output_idf, "w", encoding="utf-8") as f:
        f.write(content)


class EnergyPlusWrapper:
    """
    Wraps the PyEnergyPlus runtime API for true, step-by-step dynamic control.
    
    This class registers callbacks at simulation timesteps, reads sensor data 
    (zone temperatures, energy consumption, outdoor conditions), and writes 
    actuator values (thermostat setpoints) — all through the runtime state 
    object, without ever modifying the .idf file statically.
    """

    def __init__(self, idf_path: str, epw_path: str, output_dir: str):
        self.idf_path = idf_path
        self.epw_path = epw_path
        self.output_dir = output_dir
        
        # EnergyPlus API instance
        self.api = EnergyPlusAPI()
        
        # Sensor handles (populated after warmup)
        self._handles_ready = False
        self._zone_temp_handles = {}       # zone_name -> handle
        self._zone_htg_sp_handles = {}     # zone_name -> handle
        self._zone_clg_sp_handles = {}     # zone_name -> handle
        self._zone_occupancy_handles = {}  # zone_name -> handle
        self._outdoor_temp_handle = -1
        self._outdoor_rh_handle = -1
        self._facility_power_handle = -1
        self._hvac_power_handle = -1
        
        # Actuator handles for thermostat setpoint override
        self._htg_actuator_handles = {}  # zone_name -> handle
        self._clg_actuator_handles = {}  # zone_name -> handle
        self._schedule_actuator_mode = False  # True = using schedule override
        
        # Data collection
        self.timestep_data = []            # All sensor readings per timestep
        self.control_actions_log = []      # All AI control actions
        self.total_energy_j = 0.0          # Cumulative energy in Joules
        
        # AI agent callback — set externally
        self.agent_callback: Optional[Callable] = None
        
        # Control flags
        self.ai_enabled = False
        self.timestep_count = 0
        self.ai_call_interval = 1          # Call AI every N timesteps
        self._last_actions = {}            # Cache last valid AI actions
        
        # Thread safety
        self._lock = threading.Lock()
        
        # Simulation status
        self.sim_complete = False
        self.sim_success = False

    def _get_handles(self, state) -> bool:
        """
        Obtain all sensor and actuator handles from the running simulation.
        Must be called after api_data_fully_ready() returns True.
        """
        if self._handles_ready:
            return True
            
        if not self.api.exchange.api_data_fully_ready(state):
            return False
        
        # Zone temperature sensors
        for zone in ZONE_NAMES:
            h = self.api.exchange.get_variable_handle(
                state, "Zone Mean Air Temperature", zone
            )
            if h == -1:
                return False
            self._zone_temp_handles[zone] = h
        
        # Zone thermostat setpoint sensors
        for zone in ZONE_NAMES:
            h_htg = self.api.exchange.get_variable_handle(
                state, "Zone Thermostat Heating Setpoint Temperature", zone
            )
            h_clg = self.api.exchange.get_variable_handle(
                state, "Zone Thermostat Cooling Setpoint Temperature", zone
            )
            if h_htg == -1 or h_clg == -1:
                return False
            self._zone_htg_sp_handles[zone] = h_htg
            self._zone_clg_sp_handles[zone] = h_clg
        
        # Zone occupancy sensors
        for zone in ZONE_NAMES:
            h = self.api.exchange.get_variable_handle(
                state, "Zone People Occupant Count", zone
            )
            if h == -1:
                return False
            self._zone_occupancy_handles[zone] = h
        
        # Outdoor conditions
        self._outdoor_temp_handle = self.api.exchange.get_variable_handle(
            state, "Site Outdoor Air Drybulb Temperature", "Environment"
        )
        self._outdoor_rh_handle = self.api.exchange.get_variable_handle(
            state, "Site Outdoor Air Relative Humidity", "Environment"
        )
        
        # Energy meters
        self._facility_power_handle = self.api.exchange.get_meter_handle(
            state, "Electricity:Facility"
        )
        self._hvac_power_handle = self.api.exchange.get_meter_handle(
            state, "Electricity:HVAC"
        )
        
        # Actuators for thermostat setpoint override
        # Try per-zone Zone Temperature Control actuators first
        success = True
        for zone in ZONE_NAMES:
            h_htg = self.api.exchange.get_actuator_handle(
                state,
                "Zone Temperature Control",
                "Heating Setpoint",
                zone
            )
            h_clg = self.api.exchange.get_actuator_handle(
                state,
                "Zone Temperature Control",
                "Cooling Setpoint",
                zone
            )
            if h_htg == -1 or h_clg == -1:
                success = False
                break
            self._htg_actuator_handles[zone] = h_htg
            self._clg_actuator_handles[zone] = h_clg
        
        # Fallback: use global schedule override
        if not success:
            self._schedule_actuator_mode = True
            h_htg = self.api.exchange.get_actuator_handle(
                state,
                "Schedule:Compact",
                "Schedule Value",
                "Htg-SetP-Sch"
            )
            h_clg = self.api.exchange.get_actuator_handle(
                state,
                "Schedule:Compact",
                "Schedule Value",
                "Clg-SetP-Sch"
            )
            if h_htg != -1 and h_clg != -1:
                for zone in ZONE_NAMES:
                    self._htg_actuator_handles[zone] = h_htg
                    self._clg_actuator_handles[zone] = h_clg
                print("[INFO] Using schedule-based actuator override (global)")
            else:
                print("[WARN] Could not acquire any actuator handles!")
        
        self._handles_ready = True
        print("[INFO] All EnergyPlus handles acquired successfully")
        return True

    def get_sensor_data(self, state) -> dict:
        """
        Read all sensors from the running EnergyPlus simulation.
        Returns a structured dict with current building state.
        """
        # Time info
        month = self.api.exchange.month(state)
        day = self.api.exchange.day_of_month(state)
        hour = self.api.exchange.hour(state)
        minute = self.api.exchange.minutes(state)
        warmup = self.api.exchange.warmup_flag(state)
        
        if warmup:
            return {}
        
        # Zone temperatures and setpoints
        zones = {}
        for zone in ZONE_NAMES:
            zones[zone] = {
                "temp_c": round(self.api.exchange.get_variable_value(
                    state, self._zone_temp_handles[zone]
                ), 2),
                "htg_setpoint_c": round(self.api.exchange.get_variable_value(
                    state, self._zone_htg_sp_handles[zone]
                ), 2),
                "clg_setpoint_c": round(self.api.exchange.get_variable_value(
                    state, self._zone_clg_sp_handles[zone]
                ), 2),
                "occupancy": round(self.api.exchange.get_variable_value(
                    state, self._zone_occupancy_handles[zone]
                ), 1),
            }
            
            # Synthesize PMV and CO2 (Hackathon feedback requirements)
            temp = zones[zone]["temp_c"]
            occ = zones[zone]["occupancy"]
            
            # Fanger PMV approximation (Ideal = 22.5°C)
            zones[zone]["pmv"] = round((temp - 22.5) * 0.33, 2)
            
            # CO2 approximation (Baseline 400 ppm + 25 ppm per occupant)
            zones[zone]["co2_ppm"] = round(400 + (occ * 25), 1)
        
        # Outdoor conditions
        outdoor_temp = round(self.api.exchange.get_variable_value(
            state, self._outdoor_temp_handle
        ), 2)
        outdoor_rh = round(self.api.exchange.get_variable_value(
            state, self._outdoor_rh_handle
        ), 1)
        
        # Energy
        # Energy meters return Joules per timestep
        facility_energy_j = self.api.exchange.get_meter_value(
            state, self._facility_power_handle
        )
        hvac_energy_j = self.api.exchange.get_meter_value(
            state, self._hvac_power_handle
        )
        
        # Get timestep duration in hours to calculate power in Watts
        zone_ts = self.api.exchange.zone_time_step(state)
        
        facility_power_w = facility_energy_j / (zone_ts * 3600) if zone_ts > 0 else 0
        hvac_power_w = hvac_energy_j / (zone_ts * 3600) if zone_ts > 0 else 0
        
        self.total_energy_j += hvac_energy_j  # Focus purely on HVAC energy savings
        
        # Synthesize Local Carbon Grid Intensity (gCO2/kWh) - Duck curve peaking at 6-9 PM
        if 17 <= hour <= 21:
            grid_carbon = 450.0  # High carbon peak
        elif 10 <= hour <= 15:
            grid_carbon = 150.0  # Solar abundance
        else:
            grid_carbon = 300.0  # Baseline coal/gas
            
        data = {
            "timestamp": f"{month:02d}/{day:02d} {hour:02d}:{minute:02d}",
            "month": month,
            "day": day,
            "hour": hour,
            "minute": minute,
            "zones": zones,
            "outdoor_temp_c": outdoor_temp,
            "outdoor_rh_pct": outdoor_rh,
            "facility_power_w": round(facility_power_w, 1),
            "hvac_power_w": round(hvac_power_w, 1),
            "total_energy_kwh": round(self.total_energy_j / 3_600_000, 2),
            "grid_carbon_intensity_g_kwh": grid_carbon,
            "timestep_count": self.timestep_count,
        }
        
        return data

    def apply_control_actions(self, state, actions: dict, log_action: bool = True):
        """
        Apply AI control actions to the running simulation via actuators.
        
        Actions dict format:
        {
            "heating_setpoint": float,  # Global heating setpoint (°C)
            "cooling_setpoint": float,  # Global cooling setpoint (°C)
        }
        
        Safety: Clamps setpoints to comfort bounds.
        """
        htg_sp = actions.get("heating_setpoint", BASELINE_HEATING_SETPOINT)
        clg_sp = actions.get("cooling_setpoint", BASELINE_COOLING_SETPOINT)
        
        # Safety clamping — never exceed comfort bounds
        htg_sp = max(COMFORT_TEMP_MIN, min(htg_sp, COMFORT_TEMP_MAX - 2))
        clg_sp = max(htg_sp + 1, min(clg_sp, COMFORT_TEMP_MAX))
        
        # Ensure heating < cooling (deadband of at least 1°C)
        if htg_sp >= clg_sp:
            clg_sp = htg_sp + 1.0
        
        # Apply to all zones via actuators
        for zone in ZONE_NAMES:
            if zone in self._htg_actuator_handles:
                self.api.exchange.set_actuator_value(
                    state, self._htg_actuator_handles[zone], htg_sp
                )
            if zone in self._clg_actuator_handles:
                self.api.exchange.set_actuator_value(
                    state, self._clg_actuator_handles[zone], clg_sp
                )
        
        # Log the action only when requested
        if log_action:
            self.control_actions_log.append({
                "timestep": self.timestep_count,
                "heating_setpoint": round(htg_sp, 1),
                "cooling_setpoint": round(clg_sp, 1),
                "reasoning": actions.get("reasoning", ""),
            })

    def _callback_timestep(self, state):
        """
        Main callback — called at every zone timestep BEFORE the predictor.
        This is the heart of the closed-loop: read → reason → act.
        """
        # Skip warmup
        if self.api.exchange.warmup_flag(state):
            return
        
        # Get handles on first non-warmup timestep
        if not self._get_handles(state):
            return
        
        self.timestep_count += 1
        
        # Read all sensors
        sensor_data = self.get_sensor_data(state)
        if not sensor_data:
            return
        
        # Store timestep data
        with self._lock:
            self.timestep_data.append(sensor_data)
        
        # If AI is enabled and we have an agent callback, get control actions
        if self.ai_enabled and self.agent_callback:
            if self.timestep_count % self.ai_call_interval == 0:
                try:
                    actions = self.agent_callback(sensor_data)
                    if actions and isinstance(actions, dict):
                        self._last_actions = actions
                except Exception as e:
                    print(f"[WARN] AI agent error at ts={self.timestep_count}: {e}")
            
            # CRITICAL: Actuators must be set on EVERY timestep in EnergyPlus, 
            # otherwise they revert to the default IDF schedules!
            if self._last_actions:
                is_ai_call_timestep = (self.timestep_count % self.ai_call_interval == 0)
                self.apply_control_actions(state, self._last_actions, log_action=is_ai_call_timestep)
                
                # Periodically save data to disk so the dashboard updates live!
                try:
                    mode = "optimized" if self.ai_enabled else "baseline"
                    
                    # Also save to data directory for the UI
                    data_dir = os.path.join(os.path.dirname(os.path.dirname(self.output_dir)), "data")
                    
                    sample_rate = max(1, len(self.timestep_data) // 2000)
                    sampled_data = self.timestep_data[::sample_rate]
                    
                    # Save to output_dir
                    with open(os.path.join(self.output_dir, f"{mode}_timestep_data.json"), "w") as f:
                        json.dump(sampled_data, f, indent=2)
                    
                    # Save to data_dir for UI live updates
                    with open(os.path.join(data_dir, f"{mode}_timestep_data.json"), "w") as f:
                        json.dump(sampled_data, f, indent=2)
                        
                    if self.control_actions_log:
                        # Save to output_dir
                        with open(os.path.join(self.output_dir, f"{mode}_control_actions.json"), "w") as f:
                            json.dump(self.control_actions_log[-50:], f, indent=2)
                            
                        # Save to data_dir with the name the UI expects
                        with open(os.path.join(data_dir, "control_actions.json"), "w") as f:
                            json.dump(self.control_actions_log[-50:], f, indent=2)
                except Exception as e:
                    print(f"[WARN] Failed to write live data: {e}")

    def _request_variables(self, state):
        """Request all needed output variables before simulation starts."""
        variables = [
            ("Zone Mean Air Temperature", "*"),
            ("Zone Thermostat Heating Setpoint Temperature", "*"),
            ("Zone Thermostat Cooling Setpoint Temperature", "*"),
            ("Zone People Occupant Count", "*"),
            ("Site Outdoor Air Drybulb Temperature", "Environment"),
            ("Site Outdoor Air Relative Humidity", "Environment"),
        ]
        for var_name, var_key in variables:
            self.api.exchange.request_variable(state, var_name, var_key)

    def run(self, enable_ai: bool = False, agent_callback: Callable = None,
            ai_call_interval: int = 1,
            begin_month: int = 1, begin_day: int = 1,
            end_month: int = 12, end_day: int = 31) -> dict:
        """
        Run the EnergyPlus simulation.
        
        Args:
            enable_ai: Whether to enable AI closed-loop control
            agent_callback: Function that takes sensor_data dict and returns actions dict
            ai_call_interval: Call AI every N timesteps (default: every timestep)
            begin_month: Start month for simulation (1-12)
            begin_day: Start day for simulation (1-31)
            end_month: End month for simulation (1-12)
            end_day: End day for simulation (1-31)
        
        Returns:
            dict with simulation results and metrics
        """
        self.ai_enabled = enable_ai
        self.agent_callback = agent_callback
        self.ai_call_interval = ai_call_interval
        self.timestep_count = 0
        self.total_energy_j = 0.0
        self.timestep_data = []
        self.control_actions_log = []
        self._handles_ready = False
        self._schedule_actuator_mode = False
        self.sim_complete = False
        
        # Create a temporary IDF with the desired run period
        run_idf = os.path.join(self.output_dir, "run_model.idf")
        os.makedirs(self.output_dir, exist_ok=True)
        create_run_period_idf(
            self.idf_path, run_idf,
            begin_month, begin_day, end_month, end_day
        )
        
        # Create new state
        state = self.api.state_manager.new_state()
        
        # Request output variables
        self._request_variables(state)
        
        # Register the main timestep callback
        self.api.runtime.callback_begin_system_timestep_before_predictor(
            state, self._callback_timestep
        )
        
        # Suppress EnergyPlus console output to reduce noise
        self.api.runtime.set_console_output_status(state, False)
        
        # Build command line arguments
        args = [
            "-w", self.epw_path,
            "-d", self.output_dir,
            run_idf,
        ]
        
        mode = "AI-OPTIMIZED" if enable_ai else "BASELINE"
        period = f"{begin_month}/{begin_day} - {end_month}/{end_day}"
        print(f"\n{'='*60}")
        print(f"  Running EnergyPlus Simulation [{mode}]")
        print(f"  IDF: {os.path.basename(self.idf_path)}")
        print(f"  Period: {period}")
        print(f"  Weather: {os.path.basename(self.epw_path)}")
        print(f"  Output: {self.output_dir}")
        print(f"{'='*60}\n")
        
        start_time = time.time()
        
        # Run the simulation — this blocks until complete
        exit_code = self.api.runtime.run_energyplus(state, args)
        
        elapsed = time.time() - start_time
        self.sim_complete = True
        self.sim_success = (exit_code == 0)
        
        print(f"\n[{'OK' if self.sim_success else 'FAIL'}] Simulation completed in {elapsed:.1f}s "
              f"(exit code: {exit_code})")
        print(f"  Total timesteps processed: {self.timestep_count}")
        print(f"  Total energy: {self.total_energy_j / 3_600_000:.2f} kWh")
        
        # Clean up
        self.api.state_manager.delete_state(state)
        self.api.runtime.clear_callbacks()
        
        # Calculate results
        results = self._compute_results()
        results["period"] = period
        results["elapsed_seconds"] = round(elapsed, 1)
        
        # Save data
        self._save_data(results)
        
        return results

    def _compute_results(self) -> dict:
        """Compute summary metrics from collected timestep data."""
        if not self.timestep_data:
            return {"error": "No timestep data collected"}
        
        # Zone temperature statistics
        zone_temps = {zone: [] for zone in ZONE_NAMES}
        outdoor_temps = []
        hvac_powers = []
        facility_powers = []
        
        for td in self.timestep_data:
            for zone in ZONE_NAMES:
                if zone in td.get("zones", {}):
                    zone_temps[zone].append(td["zones"][zone]["temp_c"])
            outdoor_temps.append(td.get("outdoor_temp_c", 0))
            hvac_powers.append(td.get("hvac_power_w", 0))
            facility_powers.append(td.get("facility_power_w", 0))
        
        # Comfort analysis
        total_readings = 0
        comfort_violations = 0
        for zone in ZONE_NAMES:
            for temp in zone_temps[zone]:
                total_readings += 1
                if temp < COMFORT_TEMP_MIN or temp > COMFORT_TEMP_MAX:
                    comfort_violations += 1
        
        comfort_pct = ((total_readings - comfort_violations) / total_readings * 100
                       if total_readings > 0 else 0)
        
        results = {
            "total_energy_kwh": round(self.total_energy_j / 3_600_000, 2),
            "total_timesteps": self.timestep_count,
            "avg_hvac_power_w": round(sum(hvac_powers) / len(hvac_powers), 1) if hvac_powers else 0,
            "avg_outdoor_temp_c": round(sum(outdoor_temps) / len(outdoor_temps), 1) if outdoor_temps else 0,
            "comfort_pct": round(comfort_pct, 1),
            "comfort_violations": comfort_violations,
            "total_comfort_readings": total_readings,
            "zone_avg_temps": {
                zone: round(sum(temps) / len(temps), 2) if temps else 0
                for zone, temps in zone_temps.items()
            },
            "ai_enabled": self.ai_enabled,
            "control_actions_count": len(self.control_actions_log),
            "sim_success": self.sim_success,
        }
        
        return results

    def _save_data(self, results: dict):
        """Save timestep data and results to JSON files."""
        mode = "optimized" if self.ai_enabled else "baseline"
        
        # Save timestep data (sampled to keep file size manageable)
        sample_rate = max(1, len(self.timestep_data) // 2000)
        sampled_data = self.timestep_data[::sample_rate]
        
        ts_path = os.path.join(self.output_dir, f"{mode}_timestep_data.json")
        with open(ts_path, "w") as f:
            json.dump(sampled_data, f, indent=2)
        
        # Save results summary
        results_path = os.path.join(self.output_dir, f"{mode}_results.json")
        with open(results_path, "w") as f:
            json.dump(results, f, indent=2)
        
        # Save control actions log
        if self.control_actions_log:
            actions_path = os.path.join(self.output_dir, f"{mode}_control_actions.json")
            with open(actions_path, "w") as f:
                json.dump(self.control_actions_log, f, indent=2)
        
        print(f"[INFO] Data saved to {self.output_dir}")
