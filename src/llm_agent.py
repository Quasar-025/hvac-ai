"""
LLM Agent for Eco-Loop Building Energy Optimization

Uses Ollama with Qwen 3.5 9B for real-time building control decisions.
The agent receives sensor data from EnergyPlus and returns structured 
control actions (thermostat setpoints) in strict JSON format.

Prompt Engineering Strategy:
- System prompt defines the agent's role, constraints, and output format
- Sensor data is formatted as a concise, structured summary (not raw logs)
- LLM is instructed to respond ONLY in a strict JSON schema
- Response parsing has validation + fallback to prevent hallucinated data
- Temperature bounds are enforced both in prompts and in code
"""

import json
import time
from typing import Optional

try:
    import ollama
except ImportError:
    print("[WARN] ollama package not installed. Run: pip install ollama")
    ollama = None


# Default model configuration
DEFAULT_MODEL = "huihui_ai/qwen3.5-abliterated:9b"

# System prompt — carefully engineered to prevent hallucination
SYSTEM_PROMPT = """You are an AI building energy management agent controlling a 5-zone office HVAC system in Chicago.

YOUR OBJECTIVE: Minimize energy consumption while keeping ALL zones between 20°C and 25°C during occupied hours (6:00-20:00) and between 15°C and 28°C during unoccupied hours.

RULES:
1. You receive REAL sensor data from EnergyPlus. Do NOT invent or assume data.
2. You must respond with ONLY a valid JSON object — no text before or after.
3. heating_setpoint must be between 15.0 and 24.0 °C.
4. cooling_setpoint must be between 21.0 and 26.0 °C.
5. cooling_setpoint must be at least 1°C above heating_setpoint.
6. During unoccupied hours: widen the deadband (lower heating, raise cooling) to save energy.
7. During occupied hours: keep zones comfortable but optimize aggressively.
8. Peak Demand & Carbon: When Local Carbon Grid Intensity > 300 gCO2/kWh, heavily widen deadbands to shed load!
9. Air Quality & PMV: If CO2 > 1000 ppm or PMV goes beyond +/- 1.0, prioritize comfort over energy savings.

RESPONSE FORMAT (strict JSON, no markdown, no explanation outside JSON):
{"heating_setpoint": <float>, "cooling_setpoint": <float>, "reasoning": "<brief 1-line reason, mention carbon/PMV if applicable>"}"""


def format_sensor_summary(sensor_data: dict) -> str:
    """
    Format sensor data into a concise prompt for the LLM.
    Only includes essential information to minimize token usage and latency.
    """
    zones = sensor_data.get("zones", {})
    
    # Calculate aggregated zone stats
    temps = [z["temp_c"] for z in zones.values()]
    occupancies = [z["occupancy"] for z in zones.values()]
    avg_temp = sum(temps) / len(temps) if temps else 0
    max_temp = max(temps) if temps else 0
    min_temp = min(temps) if temps else 0
    total_occupancy = sum(occupancies)
    
    # Get current setpoints from first zone (all zones share same schedule)
    first_zone = list(zones.values())[0] if zones else {}
    current_htg = first_zone.get("htg_setpoint_c", 22.2)
    current_clg = first_zone.get("clg_setpoint_c", 23.9)
    
    hour = sensor_data.get("hour", 12)
    is_occupied = 6 <= hour < 20
    
    # New Hackathon Metrics
    pmvs = [z.get("pmv", 0) for z in zones.values()]
    co2s = [z.get("co2_ppm", 400) for z in zones.values()]
    avg_pmv = sum(pmvs) / len(pmvs) if pmvs else 0
    avg_co2 = sum(co2s) / len(co2s) if co2s else 400
    grid_carbon = sensor_data.get("grid_carbon_intensity_g_kwh", 300.0)
    
    summary = (
        f"Time: {sensor_data.get('timestamp', 'N/A')} | "
        f"{'OCCUPIED' if is_occupied else 'UNOCCUPIED'}\n"
        f"Outdoor: {sensor_data.get('outdoor_temp_c', 0)}°C, "
        f"RH: {sensor_data.get('outdoor_rh_pct', 0)}%\n"
        f"Zone temps: avg={avg_temp:.1f}°C, min={min_temp:.1f}°C, max={max_temp:.1f}°C\n"
        f"Occupancy: {total_occupancy:.0f} people | CO2: {avg_co2:.0f} ppm | PMV: {avg_pmv:.2f}\n"
        f"Current setpoints: heating={current_htg}°C, cooling={current_clg}°C\n"
        f"HVAC power: {sensor_data.get('hvac_power_w', 0):.0f}W | "
        f"Grid Carbon: {grid_carbon:.0f} gCO2/kWh\n"
        f"Decide optimal setpoints."
    )
    
    return summary


def parse_llm_response(response_text: str) -> Optional[dict]:
    """
    Parse LLM response into a validated control action dict.
    Handles common issues: markdown wrapping, extra text, invalid values.
    Returns None if response cannot be parsed.
    """
    if not response_text:
        return None
    
    text = response_text.strip()
    
    # Remove markdown code block wrapping if present
    if "```json" in text:
        text = text.split("```json")[-1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    
    # Try to find JSON object in the response
    # Look for the first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        print(f"[DEBUG-PARSE] Missing brackets in text: {text}")
        return None
    
    json_str = text[start:end + 1]
    
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"[DEBUG-PARSE] JSONDecodeError: {e} on string: {json_str}")
        return None
    
    # Validate required fields
    if "heating_setpoint" not in data or "cooling_setpoint" not in data:
        print(f"[DEBUG-PARSE] Missing required fields in: {data}")
        return None
    
    htg = data["heating_setpoint"]
    clg = data["cooling_setpoint"]
    
    # Validate types
    if not isinstance(htg, (int, float)) or not isinstance(clg, (int, float)):
        print(f"[DEBUG-PARSE] Invalid types for setpoints: htg={htg}, clg={clg}")
        return None
    
    # Validate ranges (strict — reject hallucinated values)
    if htg < 10 or htg > 30 or clg < 15 or clg > 35:
        print(f"[DEBUG-PARSE] Out of bounds: htg={htg}, clg={clg}")
        return None
    
    return {
        "heating_setpoint": float(htg),
        "cooling_setpoint": float(clg),
        "reasoning": str(data.get("reasoning", "")),
    }


class EcoLoopAgent:
    """
    AI agent that uses a local open-source LLM (via Ollama) to make 
    real-time building energy optimization decisions.
    
    The agent:
    1. Receives structured sensor data from EnergyPlus
    2. Formats it into a concise prompt
    3. Sends to Ollama/Qwen for reasoning
    4. Parses the structured JSON response
    5. Validates and returns control actions
    
    If the LLM fails or returns invalid data, the agent falls back to
    a rule-based strategy to ensure building safety.
    """

    def __init__(self, model: str = DEFAULT_MODEL, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.call_count = 0
        self.success_count = 0
        self.fallback_count = 0
        self.total_latency = 0.0
        
        # Verify Ollama is available
        if ollama is None:
            raise RuntimeError("ollama package not installed")
        
        try:
            ollama.list()
            print(f"[INFO] Ollama connected. Using model: {self.model}")
        except Exception as e:
            raise RuntimeError(f"Cannot connect to Ollama: {e}")

    def reason_and_act(self, sensor_data: dict) -> dict:
        """
        Main agent method: takes sensor data, returns control actions.
        
        Args:
            sensor_data: Dict from EnergyPlusWrapper.get_sensor_data()
            
        Returns:
            Dict with heating_setpoint, cooling_setpoint, reasoning
        """
        self.call_count += 1
        
        # Format sensor data into concise prompt
        user_prompt = format_sensor_summary(sensor_data)
        
        if self.verbose:
            print(f"\n[AGENT] Call #{self.call_count}")
            print(f"[AGENT] Prompt: {user_prompt}")
        
        start = time.time()
        
        try:
            # Call Ollama
            response = ollama.chat(
                model=self.model,
                format="json",
                options={"num_ctx": 8192},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ]
            )
            
            latency = time.time() - start
            self.total_latency += latency
            
            response_text = response["message"]["content"]
            
            if self.verbose:
                print(f"[AGENT] Response ({latency:.1f}s): {response_text}")
            
            # Parse and validate
            actions = parse_llm_response(response_text)
            
            if actions:
                self.success_count += 1
                if self.verbose:
                    print(f"[AGENT] Actions: htg={actions['heating_setpoint']}°C, "
                          f"clg={actions['cooling_setpoint']}°C")
                return actions
            else:
                if self.verbose:
                    print(f"[AGENT] Failed to parse response, using fallback")
                
        except Exception as e:
            latency = time.time() - start
            self.total_latency += latency
            if self.verbose:
                print(f"[AGENT] LLM error ({latency:.1f}s): {e}")
        
        # Fallback: rule-based strategy
        self.fallback_count += 1
        return self._rule_based_fallback(sensor_data)

    def _rule_based_fallback(self, sensor_data: dict) -> dict:
        """
        Rule-based fallback strategy when LLM is unavailable or returns bad data.
        Still saves energy vs baseline through simple but effective rules.
        """
        hour = sensor_data.get("hour", 12)
        outdoor_temp = sensor_data.get("outdoor_temp_c", 22)
        
        is_occupied = 6 <= hour < 20
        
        if is_occupied:
            if outdoor_temp > 30:
                # Very hot: accept warmer indoor temps
                htg, clg = 20.0, 25.5
                reason = "Fallback: hot day, accepting 25.5°C ceiling"
            elif outdoor_temp > 24:
                # Warm: moderate cooling
                htg, clg = 20.0, 25.0
                reason = "Fallback: warm day, target 25°C"
            elif outdoor_temp < 5:
                # Cold: moderate heating
                htg, clg = 20.5, 24.0
                reason = "Fallback: cold day, minimum heat"
            else:
                # Mild: widen deadband for free cooling
                htg, clg = 20.0, 25.0
                reason = "Fallback: mild conditions, wide deadband"
        else:
            # Unoccupied: aggressive setback
            htg, clg = 15.5, 28.0
            reason = "Fallback: unoccupied setback"
        
        return {
            "heating_setpoint": htg,
            "cooling_setpoint": clg,
            "reasoning": reason,
        }

    def get_stats(self) -> dict:
        """Return agent performance statistics."""
        avg_latency = self.total_latency / self.call_count if self.call_count > 0 else 0
        return {
            "total_calls": self.call_count,
            "successful_llm_calls": self.success_count,
            "fallback_calls": self.fallback_count,
            "success_rate_pct": round(
                self.success_count / self.call_count * 100, 1
            ) if self.call_count > 0 else 0,
            "avg_latency_s": round(avg_latency, 2),
            "total_latency_s": round(self.total_latency, 1),
        }
