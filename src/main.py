"""
Eco-Loop Building Agents — Main Orchestrator

This is the entry point that runs the complete closed-loop pipeline:
1. Run a BASELINE simulation (no AI) to collect reference metrics
2. Run an AI-OPTIMIZED simulation with real-time LLM control
3. Compare results and generate the savings dashboard
4. Save all data for the web dashboard

Usage:
    python src/main.py                      # Default: July simulation
    python src/main.py --months 7           # July only
    python src/main.py --months 1 7         # January + July
    python src/main.py --months 1 2 3       # Q1
    python src/main.py --full-year          # Full year (slow!)
    python src/main.py --verbose            # Show LLM responses
    python src/main.py --interval 4         # Call LLM every 4th timestep
"""

import os
import sys
import json
import argparse
import threading
import time
import signal

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from src.energyplus_wrapper import EnergyPlusWrapper
from src.llm_agent import EcoLoopAgent
from src.mcp_server import mcp_server, app

# Global flag for Ctrl+C
STOP_SIMULATION = False

def signal_handler(sig, frame):
    global STOP_SIMULATION
    print("\n[INFO] Ctrl+C detected. Gracefully aborting simulation...")
    STOP_SIMULATION = True
    
signal.signal(signal.SIGINT, signal_handler)

# Paths
ENERGYPLUS_DIR = r"C:\EnergyPlusV26-1-0"
WEATHER_FILE = os.path.join(ENERGYPLUS_DIR, "WeatherData",
                            "USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw")
BASELINE_IDF = os.path.join(PROJECT_ROOT, "models", "baseline_5zone.idf")
BASELINE_OUTPUT = os.path.join(PROJECT_ROOT, "output", "baseline")
OPTIMIZED_OUTPUT = os.path.join(PROJECT_ROOT, "output", "optimized")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

# Month-to-days mapping
MONTH_DAYS = {
    1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
    7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
}


def start_mcp_server():
    """Start the MCP server in a background thread."""
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8400, log_level="warning")


def run_simulation(mode: str, wrapper: EnergyPlusWrapper,
                   agent: EcoLoopAgent = None,
                   begin_month: int = 7, begin_day: int = 1,
                   end_month: int = 7, end_day: int = 31,
                   ai_call_interval: int = 1) -> dict:
    """Run a single simulation (baseline or optimized)."""
    
    enable_ai = (mode == "optimized")
    
    def agent_callback(sensor_data):
        """Callback that bridges EnergyPlus → MCP → LLM → EnergyPlus with SSE streaming."""
        global STOP_SIMULATION
        if STOP_SIMULATION:
            print("[INFO] Aborting from inside EnergyPlus callback...")
            os._exit(0)  # Force exit immediately since sys.exit() might be caught by EnergyPlus
            
        # Update MCP server state
        mcp_server.update_state(sensor_data)
        
        # Broadcast sensor data to SSE clients
        mcp_server._pipeline_phase = "sensing"
        mcp_server._last_sensor = {
            "timestamp": sensor_data.get("timestamp", ""),
            "outdoor_temp_c": sensor_data.get("outdoor_temp_c", 0),
            "hvac_power_w": sensor_data.get("hvac_power_w", 0),
            "zones": {k: {"temp_c": v.get("temp_c", 0), "occupancy": v.get("occupancy", 0), "co2_ppm": v.get("co2_ppm", 400)} 
                      for k, v in sensor_data.get("zones", {}).items()},
            "grid_carbon_intensity_g_kwh": sensor_data.get("grid_carbon_intensity_g_kwh", 300),
        }
        mcp_server.broadcast("pipeline:sensor", mcp_server._last_sensor)
        mcp_server.broadcast("pipeline:phase", {"phase": "sensing"})
        
        # Update live metrics on every sensor read (so KPIs update even between AI calls)
        mcp_server.update_live_metrics(sensor_data)
        mcp_server.broadcast("pipeline:metrics", mcp_server._live_metrics)
        
        if agent:
            # Create event callback that broadcasts LLM events via SSE
            def llm_event_callback(event_type, data):
                if event_type == "llm_start":
                    mcp_server._pipeline_phase = "thinking"
                    mcp_server.broadcast("pipeline:phase", {"phase": "thinking"})
                    mcp_server.broadcast("pipeline:llm_start", data)
                elif event_type == "llm_chunk":
                    mcp_server.broadcast("pipeline:llm_chunk", {"token": data.get("token", "")})
                elif event_type == "llm_done":
                    mcp_server._last_llm_response = data
                    mcp_server.broadcast("pipeline:llm_done", data)
            
            # Get AI decision with streaming
            actions = agent.reason_and_act(sensor_data, event_callback=llm_event_callback)
            
            # Log action to MCP server
            mcp_server.log_action(actions)
            
            # Broadcast injection event
            mcp_server._pipeline_phase = "injecting"
            mcp_server._last_injection = {
                "heating_setpoint": actions.get("heating_setpoint"),
                "cooling_setpoint": actions.get("cooling_setpoint"),
                "reasoning": actions.get("reasoning", ""),
            }
            mcp_server.broadcast("pipeline:phase", {"phase": "injecting"})
            mcp_server.broadcast("pipeline:injection", mcp_server._last_injection)
            
            # Brief pause to let frontend show injection state before returning to idle
            import time as _time
            _time.sleep(0.3)
            mcp_server._pipeline_phase = "idle"
            mcp_server.broadcast("pipeline:phase", {"phase": "idle"})
            
            return actions
        return None

    results = wrapper.run(
        enable_ai=enable_ai,
        agent_callback=agent_callback if enable_ai else None,
        ai_call_interval=ai_call_interval,
        begin_month=begin_month,
        begin_day=begin_day,
        end_month=end_month,
        end_day=end_day,
    )
    
    # Store results in MCP server
    mcp_server.set_results(mode, results)
    
    return results


def generate_comparison(baseline_results: dict, optimized_results: dict,
                        agent_stats: dict) -> dict:
    """Generate a comparison summary between baseline and optimized runs."""
    
    baseline_kwh = baseline_results.get("total_energy_kwh", 0)
    optimized_kwh = optimized_results.get("total_energy_kwh", 0)
    
    if baseline_kwh > 0:
        savings_kwh = baseline_kwh - optimized_kwh
        savings_pct = (savings_kwh / baseline_kwh) * 100
    else:
        savings_kwh = 0
        savings_pct = 0
    
    comparison = {
        "baseline": baseline_results,
        "optimized": optimized_results,
        "savings": {
            "energy_saved_kwh": round(savings_kwh, 2),
            "energy_savings_pct": round(savings_pct, 1),
            "baseline_kwh": round(baseline_kwh, 2),
            "optimized_kwh": round(optimized_kwh, 2),
        },
        "comfort": {
            "baseline_comfort_pct": baseline_results.get("comfort_pct", 0),
            "optimized_comfort_pct": optimized_results.get("comfort_pct", 0),
        },
        "agent_stats": agent_stats,
    }
    
    return comparison


def print_results_table(comparison: dict):
    """Print a formatted results table to the console."""
    savings = comparison["savings"]
    comfort = comparison["comfort"]
    agent = comparison.get("agent_stats", {})
    
    print(f"\n{'='*60}")
    print(f"  ECO-LOOP BUILDING AGENTS — RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"\n  Energy Consumption:")
    print(f"    Baseline:    {savings['baseline_kwh']:>10.2f} kWh")
    print(f"    Optimized:   {savings['optimized_kwh']:>10.2f} kWh")
    print(f"    Saved:       {savings['energy_saved_kwh']:>10.2f} kWh "
          f"({savings['energy_savings_pct']:.1f}%)")
    print(f"\n  Thermal Comfort (% time in bounds):")
    print(f"    Baseline:    {comfort['baseline_comfort_pct']:>10.1f}%")
    print(f"    Optimized:   {comfort['optimized_comfort_pct']:>10.1f}%")
    print(f"\n  AI Agent Performance:")
    print(f"    Total calls:     {agent.get('total_calls', 0)}")
    print(f"    LLM success:     {agent.get('successful_llm_calls', 0)} "
          f"({agent.get('success_rate_pct', 0)}%)")
    print(f"    Fallbacks:       {agent.get('fallback_calls', 0)}")
    print(f"    Avg latency:     {agent.get('avg_latency_s', 0):.2f}s")
    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description="Eco-Loop Building Agents")
    parser.add_argument("--months", type=int, nargs="+", default=[7],
                        help="Month(s) to simulate (default: 7 for July)")
    parser.add_argument("--days", type=int, default=7,
                        help="Number of days to simulate in the first month (default: 7)")
    parser.add_argument("--full-year", action="store_true",
                        help="Simulate the full year (Jan-Dec)")
    parser.add_argument("--verbose", action="store_true",
                        help="Show detailed LLM agent output")
    parser.add_argument("--interval", type=int, default=24,
                        help="Call LLM every N timesteps (default: 24, which is hourly if 4ts/hr)")
    parser.add_argument("--model", type=str, 
                        default="huihui_ai/qwen3.5-abliterated:9b",
                        help="Ollama model name")
    parser.add_argument("--no-mcp", action="store_true",
                        help="Skip starting MCP server")
    parser.add_argument("--skip-baseline", action="store_true",
                        help="Skip baseline run (use existing data)")
    parser.add_argument("--mode", type=str, choices=["eco", "performance"], default="performance",
                        help="Select agent mode: 'eco' (max energy savings) or 'performance' (100% comfort)")
    args = parser.parse_args()
    
    # Determine simulation period
    if args.full_year:
        begin_month, begin_day = 1, 1
        end_month, end_day = 12, 31
    elif len(args.months) == 1:
        begin_month = args.months[0]
        begin_day = 1
        end_month = args.months[0]
        end_day = min(args.days, MONTH_DAYS.get(args.months[0], 31))
    else:
        begin_month = min(args.months)
        begin_day = 1
        end_month = max(args.months)
        end_day = MONTH_DAYS.get(max(args.months), 31)
    
    print("\n" + "="*60)
    print("  ECO-LOOP BUILDING AGENTS")
    print("  Autonomous AI Building Energy Optimization")
    print("="*60)
    print(f"  Model:   {args.model}")
    print(f"  Period:  {begin_month}/{begin_day} — {end_month}/{end_day}")
    print(f"  AI Interval: Every {args.interval} timesteps")
    print("="*60 + "\n")
    
    # Start MCP server in background
    if not args.no_mcp:
        mcp_thread = threading.Thread(target=start_mcp_server, daemon=True)
        mcp_thread.start()
        time.sleep(1)
        print("[INFO] MCP server started on http://localhost:8400")
    
    # Ensure output directories exist
    os.makedirs(BASELINE_OUTPUT, exist_ok=True)
    os.makedirs(OPTIMIZED_OUTPUT, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # ── Phase 1: Baseline Simulation ──
    baseline_results = None
    if not args.skip_baseline:
        print("\n[PHASE 1] Running BASELINE simulation...")
        baseline_wrapper = EnergyPlusWrapper(BASELINE_IDF, WEATHER_FILE, BASELINE_OUTPUT)
        baseline_results = run_simulation(
            "baseline", baseline_wrapper,
            begin_month=begin_month, begin_day=begin_day,
            end_month=end_month, end_day=end_day,
        )
    else:
        # Load existing baseline results
        baseline_path = os.path.join(BASELINE_OUTPUT, "baseline_results.json")
        if os.path.exists(baseline_path):
            with open(baseline_path) as f:
                baseline_results = json.load(f)
            print("[INFO] Loaded existing baseline results")
        else:
            print("[ERROR] No baseline results found. Run without --skip-baseline first.")
            return
    
    # ── Phase 2: AI-Optimized Simulation ──
    print("\n[PHASE 2] Running AI-OPTIMIZED simulation...")
    
    # Initialize the LLM agent
    agent = EcoLoopAgent(model=args.model, verbose=args.verbose, mode=args.mode)
    
    optimized_wrapper = EnergyPlusWrapper(BASELINE_IDF, WEATHER_FILE, OPTIMIZED_OUTPUT)
    optimized_results = run_simulation(
        "optimized", optimized_wrapper, agent=agent,
        begin_month=begin_month, begin_day=begin_day,
        end_month=end_month, end_day=end_day,
        ai_call_interval=args.interval,
    )
    
    # ── Phase 3: Comparison ──
    agent_stats = agent.get_stats()
    comparison = generate_comparison(baseline_results, optimized_results, agent_stats)
    
    # Print results
    print_results_table(comparison)
    
    # Save comparison data for dashboard
    comparison_path = os.path.join(DATA_DIR, "results.json")
    with open(comparison_path, "w") as f:
        json.dump(comparison, f, indent=2)
    print(f"[INFO] Comparison data saved to {comparison_path}")
    
    # Copy timestep data to data dir for dashboard
    for mode in ["baseline", "optimized"]:
        src_dir = BASELINE_OUTPUT if mode == "baseline" else OPTIMIZED_OUTPUT
        ts_file = os.path.join(src_dir, f"{mode}_timestep_data.json")
        if os.path.exists(ts_file):
            import shutil
            shutil.copy2(ts_file, os.path.join(DATA_DIR, f"{mode}_timestep_data.json"))
    
    # Copy control actions to data dir
    actions_file = os.path.join(OPTIMIZED_OUTPUT, "optimized_control_actions.json")
    if os.path.exists(actions_file):
        import shutil
        shutil.copy2(actions_file, os.path.join(DATA_DIR, "control_actions.json"))
    
    print("\n[DONE] Pipeline complete! Run the dashboard:")
    print("  python src/dashboard.py")
    print(f"  Then open http://localhost:5000")
    
    return comparison


if __name__ == "__main__":
    main()
