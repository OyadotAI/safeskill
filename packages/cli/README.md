# SafeSkill

**Your AI tools can read your SSH keys. We check if they do.**

## Install

```bash
# Run without installing (recommended)
npx skillsafe scan <package>

# Or install globally
npm i -g skillsafe
skillsafe scan <package>
```

One command. Under 3 seconds. Scans for code exploits AND prompt injection.

```
┌──────────────────────────────────────────────────┐
│  SafeSkill Report: @evil/mcp-server              │
├──────────────────────────────────────────────────┤
│  Overall Score: 18/100 (Blocked)                 │
│                                                  │
│  Code Safety:    40/100 █████░░░░░░░             │
│  Content Safety: 0/100  ░░░░░░░░░░░░             │
│                                                  │
│  ✖ 16 critical prompt injection risks            │
│  ⚠ 10 data flow risks (source → sink)            │
│  ⚠ 8 description ↔ code mismatches               │
└──────────────────────────────────────────────────┘
```

## Why

Every `npx @someone/mcp-server` gives that tool **full access to your machine**. Your files. Your SSH keys. Your API tokens. No review. No scan.

Worse: a `skills.md` with hidden instructions can make the AI exfiltrate your credentials without any malicious code.

SafeSkill catches both.

## Usage

```bash
# Scan npm packages
npx skillsafe scan chalk
npx skillsafe scan @modelcontextprotocol/server-filesystem

# Scan local directory
npx skillsafe scan ./my-project

# JSON output (for CI/CD)
npx skillsafe scan some-package --json

# Skip dependency analysis (faster)
npx skillsafe scan some-package --skip-deps
```

### Exit codes

Exits with code `1` if the package scores below 40 (Blocked). Use in CI:

```bash
npx skillsafe scan suspicious-pkg || echo "BLOCKED — do not install"
```

### Web scanner

You can also scan packages on [safeskill.dev](https://safeskill.dev) — full reports with score breakdowns, findings, permissions, and taint flow analysis.

## What We Detect

**8 Code Detectors**: filesystem access, network calls, env theft, process spawn, crypto, obfuscation, install scripts, dynamic require

**8 Prompt Injection Detectors**: instruction overrides, hidden unicode, data exfil prompts, tool abuse, persona hijack, CoT manipulation, delimiter escape, indirect injection

**Taint Tracking**: `readFile('~/.ssh/id_rsa')` → `base64 encode` → `fetch(evil_url)` = blocked

**Code ↔ Content Correlation**: README says "safe", code reads `~/.aws` = mismatch flagged

## Scoring

| Score | Grade |
|:------|:------|
| 90-100 | Verified Safe |
| 70-89 | Passes with Notes |
| 40-69 | Use with Caution |
| 0-39 | Blocked |

Add a badge to your README:

```markdown
[![SafeSkill](https://img.shields.io/badge/SafeSkill-92%2F100_Verified-brightgreen)](https://safeskill.dev/scan/YOUR-PACKAGE)
```

## Links

- **Website**: [safeskill.dev](https://safeskill.dev)
- **Browse 10K+ skills**: [safeskill.dev/browse](https://safeskill.dev/browse)
- **Docs**: [safeskill.dev/docs](https://safeskill.dev/docs)
- **GitHub**: [github.com/OyadotAI/safeskill](https://github.com/OyadotAI/safeskill)

## License

MIT

---

Built by [Oya.ai](https://oya.ai) — AI Employees Builder
