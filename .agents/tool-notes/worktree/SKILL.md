---
name: worktree
description: Governed skill for managing, inspecting, and navigating Worktree Rust workspace crates, storage backends, and Turborepo web apps within SecB.
---

# Worktree Management & Integration Skill

## Overview

The `worktree` skill enables SecB agents to interact with the Worktree repository structure (`c:\laragon\www\SecB\worktree`), inspect Rust workspace crates, verify content-addressable storage backends (`StorageBackend`), and manage integration with SecB control plane tooling.

## Key Components & Architecture

1. **Rust Workspace (`crates/`)**:
   - `worktree-admin`: Admin CLI and governance tooling.
   - `worktree-cli`: Core developer command-line interface.
   - `worktree-git`: Git object and worktree interaction primitives.
   - `worktree-protocol`: Content hashing (`ContentHash`), IPC schemas, and wire framing.
   - `worktree-sdk`: Rust client SDK for worktree services.
   - `worktree-server`: Content-addressable storage engine (`StorageBackend`), file watcher, and sync daemon.

2. **Web Dashboard (`apps/web`)**:
   - Next.js / TypeScript web application managed via Turborepo (`turbo.json`).

3. **Storage & Assets**:
   - Content-Addressable Storage (CAS) backend contract in `crates/worktree-server/src/storage/backend.rs`.

## Governed Operational Rules

1. **Read-Only Inspection**: All MCP tools provided for Worktree (`secb_worktree_status`, `secb_worktree_list_crates`, `secb_worktree_inspect_storage`) are read-only projections under SecB governance (GOV-MCP-01..09).
2. **Classification Ceiling**: Access to Worktree skill details and MCP execution requires `INTERNAL` data classification ceiling or higher.
3. **No Direct Remote Activation**: Modifications or sync operations must follow SecB's governed implementation sequence and authorization controls.
