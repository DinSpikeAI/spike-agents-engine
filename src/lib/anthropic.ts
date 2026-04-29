// src/lib/anthropic.ts
//
// Singleton Anthropic client for all 9 agents.
//
// SERVER-ONLY: this file holds the API key. Importing it from a Client
// Component will fail the build (the server-only guard below blocks it).
// Use this from: agent runners, API routes, server actions, cron handlers.
//
// Single instance per process - connection pool is reused across calls.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "Missing ANTHROPIC_API_KEY. Check .env.local (see KNOWN_ISSUES gotcha 3)."
  );
}

export const anthropic = new Anthropic({ apiKey });
