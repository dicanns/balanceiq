#!/bin/bash
# BalanceIQ Stress Test Suite
# Usage: bash scripts/stress-test.sh
# Runs all test layers and reports pass/fail counts.

set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0

echo ""
echo -e "${BOLD}${CYAN}🧪 BalanceIQ Stress Test Suite${RESET}"
echo -e "${CYAN}================================${RESET}"
echo ""

# Ensure better-sqlite3 is compiled for system Node (vitest steps 1–2 need NMV 141).
# Steps 1–2 bypass the npm pretest hook, so rebuild explicitly here.
npm rebuild better-sqlite3 --quiet 2>&1

# ── 1/4 Business Logic Tests ──────────────────────────────────────────────────
echo -e "${BOLD}1/4 Business logic tests (financial calculations)...${RESET}"
if npx vitest run src/__tests__/calculations.test.js --reporter=verbose 2>&1; then
  echo -e "${GREEN}✅ Financial calculation tests passed${RESET}"
  ((PASS++))
else
  echo -e "${RED}❌ Financial calculation tests FAILED${RESET}"
  ((FAIL++))
fi
echo ""

# ── 2/4 Database Integrity Tests ──────────────────────────────────────────────
echo -e "${BOLD}2/4 Database integrity tests...${RESET}"
if npx vitest run src/__tests__/database/ --reporter=verbose 2>&1; then
  echo -e "${GREEN}✅ Database integrity tests passed${RESET}"
  ((PASS++))
else
  echo -e "${RED}❌ Database integrity tests FAILED${RESET}"
  ((FAIL++))
fi
echo ""

# ── 3/4 Electron Smoke Tests ──────────────────────────────────────────────────
echo -e "${BOLD}3/4 Electron smoke tests (Playwright)...${RESET}"
# Rebuild better-sqlite3 for Electron's NMV (prebuilt binary for Electron 31).
# Restore to system-Node build afterwards so any post-suite vitest calls still work.
echo -e "${YELLOW}  Rebuilding better-sqlite3 for Electron runtime...${RESET}"
npx @electron/rebuild -f -w better-sqlite3 2>&1 | tail -3
if npx playwright test --project=electron --reporter=list 2>&1; then
  echo -e "${GREEN}✅ Electron smoke tests passed${RESET}"
  ((PASS++))
else
  echo -e "${RED}❌ Electron smoke tests FAILED${RESET}"
  ((FAIL++))
fi
echo -e "${YELLOW}  Restoring better-sqlite3 for system Node...${RESET}"
npm rebuild better-sqlite3 --quiet 2>&1
echo ""

# ── 4/4 Build Verification ────────────────────────────────────────────────────
echo -e "${BOLD}4/4 Build verification (Vite)...${RESET}"
if npx vite build 2>&1; then
  echo -e "${GREEN}✅ Build successful${RESET}"
  ((PASS++))
else
  echo -e "${RED}❌ Build FAILED${RESET}"
  ((FAIL++))
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "${CYAN}================================${RESET}"
echo -e "${BOLD}Results: ${GREEN}${PASS} passed${RESET}${BOLD}, ${RED}${FAIL} failed${RESET}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 All test suites green!${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}💥 ${FAIL} suite(s) failed. Check output above.${RESET}"
  exit 1
fi
