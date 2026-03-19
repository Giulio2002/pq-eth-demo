#!/usr/bin/env python3
"""
PQ-ETH Demo — Multi-Agent Builder

Coordinates specialized Claude agents to build a post-quantum Ethereum
smart wallet demo: chain devnet, smart contracts, Go backend, Next.js frontend,
and a block explorer showing PQ signature schemes per transaction.

Phases:
  1. Foundation (parallel): chain infrastructure + smart contracts
  2. Backend (sequential): Go API + tx relay + indexer + explorer endpoints
  3. UI (parallel): Next.js wallet UI + block explorer

Usage:
    python build.py                          # build everything
    python build.py /path/to/target
    python build.py --phase 1                # chain + contracts only
    python build.py --agent backend          # single agent
    python build.py --max-attempts 5 --data-dir /tmp/pq-build
"""

import argparse
import os
import queue
import re
import sys
import threading
import time

# Each run gets a unique data dir — no accidental resume from old state.
_DEFAULT_DATA_DIR = f"/tmp/pq-eth-build-{int(time.time())}"

# framework.py lives in the Zabaniya directory
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "Zabaniya"))

from framework import (
    Agent,
    AgentConfig,
    AgentEvent,
    CompletionEvent,
    ContinuationEvent,
    PhaseStartEvent,
    ResumeEvent,
    SessionStartEvent,
    TaskCompleteEvent,
    TaskFailedEvent,
    TextEvent,
    ToolCallEvent,
    ToolResultEvent,
    TurnStartEvent,
)

# ── ANSI colors ────────────────────────────────────────────────────────────────

RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
RED     = "\033[31m"
GREEN   = "\033[32m"
YELLOW  = "\033[33m"
BLUE    = "\033[34m"
MAGENTA = "\033[35m"
CYAN    = "\033[36m"
WHITE   = "\033[37m"

AGENT_COLORS = {
    "chain":     CYAN,
    "contracts": GREEN,
    "backend":   MAGENTA,
    "frontend":  BLUE,
    "explorer":  WHITE,
}

# ── Phase definitions ──────────────────────────────────────────────────────────

PHASE_1 = ["chain", "contracts"]     # Parallel: devnet + smart contracts
PHASE_2 = ["backend"]                # Sequential: Go API (needs chain + contracts)
PHASE_3 = ["frontend", "explorer"]   # Parallel: wallet UI + block explorer (both need backend)

ALL_PHASES = [PHASE_1, PHASE_2, PHASE_3]
PHASE_NAMES = ["Foundation (Chain + Contracts)", "Backend", "Frontend + Explorer"]

AGENTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agents")


# ── File loading ───────────────────────────────────────────────────────────────


def _read(path: str) -> str:
    with open(path) as f:
        return f.read()


def load_agent_files(agent_name: str, shared_context: str) -> tuple[str, str, str]:
    """Load specification, objective, and assembled context for an agent."""
    agent_dir = os.path.join(AGENTS_DIR, agent_name)

    spec_path = os.path.join(agent_dir, "specification.md")
    obj_path  = os.path.join(agent_dir, "objective.md")

    if not os.path.isfile(spec_path):
        raise FileNotFoundError(f"Missing specification: {spec_path}")
    if not os.path.isfile(obj_path):
        raise FileNotFoundError(f"Missing objective: {obj_path}")

    spec      = _read(spec_path)
    objective = _read(obj_path)
    context   = shared_context

    # Load extra per-agent context if present
    extra_ctx = os.path.join(agent_dir, "context.md")
    if os.path.isfile(extra_ctx):
        context += "\n\n" + _read(extra_ctx)

    return spec, objective, context


# ── Event display ──────────────────────────────────────────────────────────────


def _strip_ansi(text: str) -> str:
    return re.sub(r'\033\[[0-9;]*m', '', text)


def format_event(agent_name: str, event: AgentEvent) -> str | None:
    color  = AGENT_COLORS.get(agent_name, WHITE)
    prefix = f"{color}[{agent_name:<10}]{RESET}"

    if isinstance(event, TextEvent):
        first = event.text.split("\n")[0][:120]
        return f"{prefix} {DIM}{first}{RESET}"

    elif isinstance(event, ToolCallEvent):
        tool  = event.tool_name
        brief = ""
        inp   = event.tool_input
        if tool == "Bash":
            brief = (inp.get("description") or inp.get("command", ""))[:80]
        elif tool in ("Read", "Write", "Edit"):
            brief = inp.get("file_path", "")
        elif tool == "Glob":
            brief = inp.get("pattern", "")
        else:
            brief = str(inp)[:80]
        return f"{prefix} {CYAN}{tool:<6}{RESET} {DIM}{brief}{RESET}"

    elif isinstance(event, TurnStartEvent):
        return f"{prefix} {BOLD}── Turn {event.turn_number} ──{RESET}"

    elif isinstance(event, CompletionEvent):
        if event.subtype == "success":
            st = f"{GREEN}success{RESET}"
        elif event.is_error:
            st = f"{RED}{event.subtype}{RESET}"
        else:
            st = f"{YELLOW}{event.subtype}{RESET}"
        cost = f"${event.total_cost_usd:.2f}"
        mins = event.duration_ms / 1000 / 60
        return f"{prefix} {BOLD}DONE{RESET} {st} — {event.num_turns} turns, {cost}, {mins:.1f}m"

    elif isinstance(event, TaskCompleteEvent):
        return f"{prefix} {GREEN}{BOLD}APPROVED{RESET} on attempt {event.attempt}"

    elif isinstance(event, TaskFailedEvent):
        return f"{prefix} {RED}{BOLD}FAILED{RESET}: {event.reason[:160]}"

    elif isinstance(event, PhaseStartEvent):
        return f"{prefix} {BOLD}> {event.phase_label}{RESET} -> {DIM}{event.log_file}{RESET}"

    elif isinstance(event, ContinuationEvent):
        return f"{prefix} {YELLOW}auto-continue ({event.attempt}/{event.max_continuations}){RESET}"

    elif isinstance(event, ResumeEvent):
        return f"{prefix} {YELLOW}resuming attempt {event.attempt}{RESET}"

    return None


# ── Parallel agent runner ──────────────────────────────────────────────────────


def run_agents_parallel(
    agent_pairs: list[tuple[str, AgentConfig]],
    data_base_dir: str,
    log_file: str | None = None,
) -> dict[str, int]:
    """
    Launch agents in parallel, multiplex events to stdout (and optional log_file).
    Returns exit code per agent name.
    """
    display_q: queue.Queue[tuple[str, AgentEvent | None]] = queue.Queue()
    handles: dict[str, object] = {}

    for name, config in agent_pairs:
        agent_data = os.path.join(data_base_dir, name)
        os.makedirs(agent_data, exist_ok=True)
        config.data_dir = agent_data

        agent  = Agent(config)
        handle = agent.start()
        handles[name] = handle

        def _stream(aname=name, h=handle):
            for event in h.stream():
                display_q.put((aname, event))
            display_q.put((aname, None))  # sentinel

        threading.Thread(target=_stream, daemon=True).start()

    remaining   = len(agent_pairs)
    exit_codes: dict[str, int] = {}
    last_action: dict[str, str] = {name: "starting..." for name, _ in agent_pairs}
    last_event_ts: dict[str, float] = {name: time.time() for name, _ in agent_pairs}
    log_fh      = open(log_file, "a") if log_file else None

    try:
        while remaining > 0:
            try:
                agent_name, event = display_q.get(timeout=30)
            except queue.Empty:
                # Print per-agent status for any agent silent > 60s
                now = time.time()
                for aname, last_ts in last_event_ts.items():
                    if aname in exit_codes:
                        continue
                    silent_s = int(now - last_ts)
                    if silent_s >= 60:
                        color = AGENT_COLORS.get(aname, WHITE)
                        act   = last_action.get(aname, "...")
                        msg   = (f"{DIM}[{time.strftime('%H:%M:%S')}]{RESET} "
                                 f"{color}[{aname:<10}]{RESET} "
                                 f"{YELLOW}working... ({silent_s}s silent){RESET} "
                                 f"{DIM}{act[:80]}{RESET}")
                        print(msg, flush=True)
                continue

            if event is None:
                ec = handles[agent_name].wait()
                exit_codes[agent_name] = ec
                status = f"{GREEN}OK{RESET}" if ec == 0 else f"{RED}FAILED (exit {ec}){RESET}"
                ts  = time.strftime("%H:%M:%S")
                msg = f"[{ts}] {AGENT_COLORS.get(agent_name, WHITE)}[{agent_name}]{RESET} done -> {status}"
                print(f"\n{msg}\n", flush=True)
                if log_fh:
                    log_fh.write(_strip_ansi(msg) + "\n")
                    log_fh.flush()
                remaining -= 1
            else:
                # Track last known action for the heartbeat
                last_event_ts[agent_name] = time.time()
                if isinstance(event, ToolCallEvent):
                    inp   = event.tool_input
                    brief = (inp.get("description") or inp.get("command") or
                             inp.get("file_path") or inp.get("pattern") or "")
                    last_action[agent_name] = f"{event.tool_name}: {str(brief)[:60]}"
                elif isinstance(event, TextEvent):
                    last_action[agent_name] = event.text.split("\n")[0][:60]

                line = format_event(agent_name, event)
                if line:
                    ts  = time.strftime("%H:%M:%S")
                    out = f"{DIM}[{ts}]{RESET} {line}"
                    print(out, flush=True)
                    if log_fh:
                        log_fh.write(_strip_ansi(out) + "\n")
                        log_fh.flush()
    finally:
        if log_fh:
            log_fh.close()

    return exit_codes


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    default_target = os.path.dirname(os.path.abspath(__file__))

    parser = argparse.ArgumentParser(
        description="PQ-ETH Demo multi-agent builder",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Agents:
  chain       Kurtosis devnet: Erigon (PQ branch) + Prysm
  contracts   Solidity: PQ smart wallets, factory, Uniswap V3 ETH-USD pool
  backend     Go: REST API, tx relay, indexer, explorer endpoints, SQLite (port 8546)
  frontend    Next.js: wallet UI, PQ key generation via WASM (port 3000)
  explorer    Next.js: block explorer with PQ signature scheme badges (port 3001)

Phases:
  1 = Foundation:       chain + contracts     (parallel — devnet + smart contracts)
  2 = Backend:          backend               (sequential — needs chain + contracts)
  3 = Frontend + Explorer: frontend + explorer (parallel — both need backend)
""",
    )
    parser.add_argument(
        "target", nargs="?", default=default_target,
        help=f"Target directory (default: {default_target})",
    )
    parser.add_argument(
        "--phase", type=int, choices=[1, 2, 3],
        help="Run only a specific phase",
    )
    parser.add_argument(
        "--agent", type=str,
        choices=["chain", "contracts", "backend", "frontend", "explorer"],
        help="Run only one specific agent",
    )
    parser.add_argument("--max-attempts",      type=int, default=99999999)
    parser.add_argument("--max-turns",         type=int, default=None)
    parser.add_argument("--max-continuations", type=int, default=99999999)
    parser.add_argument("--model",             type=str, default="claude-opus-4-6")
    parser.add_argument(
        "--data-dir", type=str, default=_DEFAULT_DATA_DIR,
        help="Directory for agent state and logs (default: unique timestamped dir in /tmp)",
    )

    args = parser.parse_args()

    target = os.path.abspath(args.target)
    os.makedirs(target, exist_ok=True)
    os.makedirs(args.data_dir, exist_ok=True)

    # Load shared context once
    shared_ctx_path = os.path.join(AGENTS_DIR, "shared_context.md")
    if not os.path.isfile(shared_ctx_path):
        print(f"[ERROR] Missing shared context: {shared_ctx_path}")
        sys.exit(1)
    shared_context = _read(shared_ctx_path)

    print(f"""
{'='*72}
  PQ-ETH Demo — Multi-Agent Builder
{'='*72}
  Target dir:      {target}
  Data dir:        {args.data_dir}
  Model:           {args.model}
  Max attempts:    {args.max_attempts}
  Continuations:   {args.max_continuations}
{'='*72}
""")

    def make_config(name: str) -> AgentConfig:
        spec, objective, context = load_agent_files(name, shared_context)
        return AgentConfig(
            spec=spec,
            objective=objective,
            target=target,
            context=context,
            max_attempts=args.max_attempts,
            max_turns=args.max_turns,
            max_continuations=args.max_continuations,
            model=args.model,
        )

    # Determine which phases/agents to run
    if args.agent:
        phases_to_run = [[args.agent]]
        phase_indices = [0]
    elif args.phase:
        phases_to_run = [ALL_PHASES[args.phase - 1]]
        phase_indices = [args.phase - 1]
    else:
        phases_to_run = ALL_PHASES
        phase_indices = list(range(len(ALL_PHASES)))

    all_exit_codes: dict[str, int] = {}

    for phase_agents, phase_idx in zip(phases_to_run, range(len(phases_to_run))):
        actual_idx  = phase_indices[phase_idx] if not args.agent else 0
        phase_label = PHASE_NAMES[actual_idx] if not args.agent else "Single Agent"
        phase_num   = actual_idx + 1 if not args.agent else "-"

        print(f"\n{'='*72}")
        print(f"  PHASE {phase_num}: {phase_label}")
        print(f"  Agents: {', '.join(phase_agents)}")
        print(f"{'='*72}\n")

        phase_log = os.path.join(args.data_dir, f"phase{phase_num}.log")
        pairs     = [(name, make_config(name)) for name in phase_agents]
        codes     = run_agents_parallel(pairs, args.data_dir, log_file=phase_log)

        all_exit_codes.update(codes)

        failures = {n: c for n, c in codes.items() if c != 0}
        if failures:
            print(f"\n{YELLOW}[warn] Phase {phase_num} failures: {list(failures.keys())}")
            print(f"Continuing to next phase...\n{RESET}")

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n{'='*72}")
    print("  BUILD SUMMARY")
    print(f"{'='*72}")
    for name, code in all_exit_codes.items():
        color  = AGENT_COLORS.get(name, WHITE)
        status = f"{GREEN}OK{RESET}" if code == 0 else f"{RED}FAILED (exit {code}){RESET}"
        print(f"  {color}{name:<15}{RESET} {status}")
    print(f"{'='*72}\n")

    overall = 0 if all(c == 0 for c in all_exit_codes.values()) else 1
    if overall == 0:
        print(f"{GREEN}{BOLD}All agents completed successfully.{RESET}")
        print(f"PQ-ETH Demo built in: {target}")
        print(f"\nTo run:")
        print(f"  1. bash chain/start.sh             # Start Kurtosis devnet")
        print(f"  2. cd contracts && bash deploy.sh   # Deploy contracts")
        print(f"  3. cd backend && go run .           # Start backend on :8546")
        print(f"  4. cd frontend && npm run dev       # Start wallet UI on :3000")
        print(f"  5. cd explorer && npm run dev       # Start block explorer on :3001")
    else:
        print(f"{RED}Some agents failed. Check logs in: {args.data_dir}{RESET}")

    sys.exit(overall)


if __name__ == "__main__":
    main()
