# SafeSkill

**Your AI tools can read your SSH keys. We check if they do.**

```bash
npx skillsafe scan <any-npm-package>
```

One command. No install. Under 3 seconds. Scans for code exploits AND prompt injection.

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

## Commands

```bash
safeskill scan chalk                          # scan any npm package
safeskill scan ./my-project                   # scan local directory
safeskill install @org/mcp-server             # scan + install (safe npx)
safeskill scan some-package --share           # get shareable report URL
safeskill scan some-package --json            # JSON output
```

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

## Links

- **Website**: [safeskill.dev](https://safeskill.dev)
- **Browse 10K+ skills**: [safeskill.dev/browse](https://safeskill.dev/browse)
- **GitHub**: [github.com/OyadotAI/safeskill](https://github.com/OyadotAI/safeskill)

## License

MIT
