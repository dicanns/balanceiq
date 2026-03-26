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
echo -e "${YELLOW}⚠  Requires a built app (npm run build:mac) or running dev server${RESET}"
if npx playwright test --project=electron --reporter=list 2>&1; then
  echo -e "${GREEN}✅ Electron smoke tests passed${RESET}"
  ((PASS++))
else
  echo -e "${YELLOW}⚠  Electron smoke tests incomplete (may need running app)${RESET}"
  ((FAIL++))
fi
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
