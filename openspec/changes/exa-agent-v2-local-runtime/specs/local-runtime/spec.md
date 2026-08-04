## Purpose

Exa runs on the user's own local model runtimes — Ollama, LM Studio, or any OpenAI-compatible server (llama.cpp, vLLM, SGLang, TGI) — discovered automatically, with cloud providers as an option rather than a requirement.

## ADDED Requirements

### Requirement: Runtime discovery and health
Studio SHALL detect locally running runtimes by probing their default endpoints (Ollama 11434, LM Studio 1234) and any user-added OpenAI-compatible base URLs, and SHALL show each runtime's health and its available models.

#### Scenario: Ollama running
- **WHEN** Ollama is serving on its default port with models pulled
- **THEN** the model picker lists those models under "Ollama (local)" without any configuration

#### Scenario: Nothing local
- **WHEN** no local runtime responds
- **THEN** the picker says so plainly and offers cloud providers and a "add an OpenAI-compatible endpoint" action — no silent failures

### Requirement: One client, streaming, per-session model
All runtimes SHALL be driven through one OpenAI-compatible chat client (Ollama via its compatible endpoint), with token streaming, tool/function calling where the runtime supports it, and the model chosen per chat session.

#### Scenario: Mid-session switch
- **WHEN** the user switches a session's model from a cloud model to a local one
- **THEN** subsequent turns run on the local model and the session records which model produced each answer

### Requirement: Local-first provider hierarchy
The model picker and defaults SHALL rank providers as (1) Local Runtime, (2) In-DB AI (Exasol-grounded: the MCP DB toolset always, plus in-database inference via the Exasol Text AI / UDF path where installed), (3) cloud providers. A cloud provider SHALL never become the default silently — selecting one is an explicit user choice.

#### Scenario: First run with a local runtime present
- **WHEN** a local runtime is discovered and no model was previously chosen
- **THEN** a local model is the default, and In-DB AI is offered above cloud options

#### Scenario: No local, cloud configured
- **WHEN** no local runtime responds but a cloud key exists
- **THEN** the picker still lists Local and In-DB AI first with setup hints, and requires an explicit pick to use cloud

### Requirement: Honest degradation for missing capabilities
When a local model/runtime lacks a capability the agent needs (e.g., tool calling), Studio SHALL say which capability is missing and continue with a reduced mode rather than fail opaquely.

#### Scenario: No tool support
- **WHEN** the selected local model cannot do function calling
- **THEN** the agent states it is running in answer-only mode for that model
