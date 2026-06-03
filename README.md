# Phase 6 — Workflow Memory

IMPORTANT

Current benchmark performance is approximately 45%.

The project already has:

✓ Browser Runtime
✓ Semantic Snapshot
✓ Action Resolver
✓ Verifier
✓ Agent Loop
✓ Multi-step execution

Do NOT build:

- Reflection
- OmniParser
- Vision systems
- Multi-agent systems
- RL
- Fine-tuning
- Hybrid API routing
- WebWrite planner rewrite

The goal of this phase is to learn from successful trajectories.

--------------------------------------------------

# Objective

Build Workflow Memory.

The agent should remember:

"How did I solve similar tasks before?"

and reuse successful procedures.

--------------------------------------------------

# Core Concept

Convert successful trajectories into reusable workflows.

Example:

Task:
Create GitLab Issue

Trajectory:

1. Open Issues
2. Click New Issue
3. Fill Title
4. Submit
5. Verify

Store as:

Workflow:
gitlab_create_issue

--------------------------------------------------

# Create

workflow.ts

memory.ts

Keep implementation simple.

No vector database.

No embeddings.

No external memory systems.

Use JSON files initially.

--------------------------------------------------

# Workflow Structure

interface Workflow {

  id: string;

  taskType: string;

  description: string;

  steps: WorkflowStep[];

  successRate: number;

  usageCount: number;
}

--------------------------------------------------

# Workflow Extraction

When task succeeds:

Store:

Goal

Action sequence

Verification outcome

Task metadata

Example:

{
  "goal": "create issue",
  "steps": [...]
}

--------------------------------------------------

# Retrieval

Before planning:

Goal
↓
Workflow Search
↓
Relevant Workflows
↓
Inject Into Prompt

--------------------------------------------------

# Retrieval Strategy

Initially:

Keyword matching

Task type matching

Domain matching

No embeddings.

No semantic search.

Keep simple.

--------------------------------------------------

# Prompt Augmentation

Current:

Goal
+
Snapshot

Future:

Goal
+
Snapshot
+
Relevant Workflows

--------------------------------------------------

# Example

Goal:

Create issue

Retrieved Workflow:

1. Open Issues
2. Click New Issue
3. Fill Title
4. Submit
5. Verify

Agent may reuse workflow.

--------------------------------------------------

# Metrics

Track:

workflow_retrieval_rate

workflow_usage_rate

workflow_success_rate

benchmark_improvement

--------------------------------------------------

# Testing

Create tests proving:

Workflow saved

Workflow loaded

Workflow retrieved

Workflow injected

Workflow improves planning

--------------------------------------------------

# Benchmark Evaluation

Run benchmark:

Before Memory

After Memory

Measure:

Success Rate

Average Steps

Average LLM Calls

Average Completion Time

--------------------------------------------------

# Constraints

No vector database

No Pinecone

No Weaviate

No embeddings

No reflection

No RL

No fine-tuning

No OmniParser

No vision

Keep implementation lightweight.

Laptop-friendly.

--------------------------------------------------

# Success Criteria

Agent can:

1. Solve task
2. Store successful trajectory
3. Retrieve similar trajectory later
4. Reuse workflow
5. Improve benchmark performance

Target:

45%
↓
50-55%+

--------------------------------------------------

# Deliverables

phase6-report.md

Include:

Files Added

Lines Added

Workflows Stored

Retrieval Accuracy

Benchmark Before

Benchmark After

Success Rate Change

Failure Analysis

Recommended Next Phase
