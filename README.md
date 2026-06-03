# Phase 7 — Hierarchical Planner

IMPORTANT

Current architecture already includes:

✓ Browser Runtime
✓ Semantic Snapshot
✓ Action Resolver
✓ Verifier
✓ Agent Loop
✓ Workflow Memory

Do NOT build:

- Reflection
- OmniParser
- Vision Systems
- Multi-Agent Systems
- RL
- Fine-Tuning
- Hybrid API Routing

This phase focuses exclusively on task decomposition.

--------------------------------------------------

# Objective

Build a hierarchical planner.

Convert:

Large Goal

↓

Subgoals

↓

Actions

Instead of:

Goal

↓

Direct Action

--------------------------------------------------

# Example

Input:

Create a GitLab issue titled "Bug Report"

Output:

[
  "Open issues page",
  "Create new issue",
  "Fill issue title",
  "Submit issue",
  "Verify issue exists"
]

--------------------------------------------------

# Create

planner.ts

Keep implementation simple.

No framework.

No planners inside planners.

No task graphs yet.

--------------------------------------------------

# Planner Output

interface Subgoal {

  id: string;

  description: string;

  successCriteria: string;
}

--------------------------------------------------

# Planning Flow

Goal

↓

Planner

↓

Subgoals

↓

Executor

↓

Verifier

↓

Next Subgoal

--------------------------------------------------

# Prompt Inputs

Goal

Current Snapshot

Workflow Memory Results

Action History

--------------------------------------------------

# Prompt Rules

Planner must:

- Create 3-10 subgoals
- Keep subgoals atomic
- Include success criteria
- Output JSON only

--------------------------------------------------

# Example

Goal:

Create issue

Output:

[
  {
    "description":
      "Navigate to Issues page",

    "successCriteria":
      "Issues page visible"
  },

  {
    "description":
      "Open New Issue form",

    "successCriteria":
      "Issue form visible"
  }
]

--------------------------------------------------

# Execution

Only one active subgoal at a time.

When verifier confirms:

Subgoal complete

↓

Advance

Otherwise:

Remain on current subgoal.

--------------------------------------------------

# Metrics

Track:

planner_success_rate

subgoal_completion_rate

average_subgoals_per_task

average_steps_per_subgoal

--------------------------------------------------

# Benchmarking

Compare:

Workflow Memory Only

vs

Workflow Memory + Planner

Measure:

Success Rate

Average Steps

Average LLM Calls

Task Completion

--------------------------------------------------

# Constraints

No reflection

No vision

No multi-agent

No RL

No fine-tuning

Keep implementation lightweight.

Laptop-friendly.

--------------------------------------------------

# Success Criteria

The agent can:

1. Decompose goals
2. Execute subgoals
3. Verify subgoals
4. Progress through tasks

Target:

55%
↓

60%+

--------------------------------------------------

# Deliverables

phase7-report.md

Include:

Files Added

Lines Added

Planner Success Rate

Subgoal Completion Rate

Benchmark Before

Benchmark After

Failure Analysis

Recommended Next Phase
