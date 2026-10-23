/**
 * Boundary guard for the self-editing strategy loop, mirroring Phil's
 * core/validate.py. Run in CI on every push:
 *   - config/protected.json must parse and its caps must stay within
 *     sane absolute ceilings (catches a bad edit, not just an agent one).
 *   - realExecution.autoExecuteEnabled must stay false until an operator
 *     deliberately flips it (tripwire equivalent to real_trading_enabled).
 *   - a commit that touches any protectedPaths entry must have an
 *     "operator:" prefixed message; anything else is treated as an agent
 *     commit and fails the check.
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const PROTECTED_PATH = path.join(process.cwd(), "config", "protected.json");

interface ProtectedConfig {
  caps: {
    maxTradePerOrderUsd: number;
    maxDailySpendUsd: number;
    maxOpenPositions: number;
    maxConsecutiveLosses: number;
    dailyLossLimitPctFloor: number;
    dailyLossLimitPctCeiling: number;
    riskPerTradePctCeiling: number;
    minMinutesToClose: number;
  };
  realExecution: { autoExecuteEnabled: boolean };
  protectedPaths: string[];
}

const ABSOLUTE_CEILINGS = {
  maxTradePerOrderUsd: 5000,
  maxDailySpendUsd: 10000,
  maxOpenPositions: 10,
  riskPerTradePctCeiling: 5,
};

function loadConfig(): ProtectedConfig {
  const raw = readFileSync(PROTECTED_PATH, "utf-8");
  return JSON.parse(raw) as ProtectedConfig;
}

function checkCaps(config: ProtectedConfig): string[] {
  const errors: string[] = [];
  const { caps, realExecution } = config;

  if (caps.maxTradePerOrderUsd > ABSOLUTE_CEILINGS.maxTradePerOrderUsd) {
    errors.push(
      `maxTradePerOrderUsd (${caps.maxTradePerOrderUsd}) exceeds absolute ceiling (${ABSOLUTE_CEILINGS.maxTradePerOrderUsd})`,
    );
  }
  if (caps.maxDailySpendUsd > ABSOLUTE_CEILINGS.maxDailySpendUsd) {
    errors.push(
      `maxDailySpendUsd (${caps.maxDailySpendUsd}) exceeds absolute ceiling (${ABSOLUTE_CEILINGS.maxDailySpendUsd})`,
    );
  }
  if (caps.maxOpenPositions > ABSOLUTE_CEILINGS.maxOpenPositions) {
    errors.push(
      `maxOpenPositions (${caps.maxOpenPositions}) exceeds absolute ceiling (${ABSOLUTE_CEILINGS.maxOpenPositions})`,
    );
  }
  if (caps.riskPerTradePctCeiling > ABSOLUTE_CEILINGS.riskPerTradePctCeiling) {
    errors.push(
      `riskPerTradePctCeiling (${caps.riskPerTradePctCeiling}) exceeds absolute ceiling (${ABSOLUTE_CEILINGS.riskPerTradePctCeiling})`,
    );
  }
  if (realExecution.autoExecuteEnabled) {
    errors.push(
      "realExecution.autoExecuteEnabled is true — this must only ever be flipped by a deliberate operator: commit",
    );
  }

  return errors;
}

function checkCommitBoundary(config: ProtectedConfig): string[] {
  const errors: string[] = [];

  let commitMessage: string;
  let changedFiles: string[];
  try {
    commitMessage = execSync("git log -1 --pretty=%B").toString().trim();
    changedFiles = execSync("git diff --name-only HEAD~1 HEAD")
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    // No previous commit (first commit in repo, or shallow clone) — skip.
    return errors;
  }

  const isOperatorCommit = commitMessage.startsWith("operator:");
  const touchesProtected = changedFiles.some((file) =>
    config.protectedPaths.some((protectedPath) => file.startsWith(protectedPath)),
  );

  if (touchesProtected && !isOperatorCommit) {
    errors.push(
      `Commit touches protected path(s) but is not prefixed "operator:": ${changedFiles
        .filter((file) => config.protectedPaths.some((p) => file.startsWith(p)))
        .join(", ")}`,
    );
  }

  return errors;
}

function main(): void {
  const config = loadConfig();
  const errors = [...checkCaps(config), ...checkCommitBoundary(config)];

  if (errors.length > 0) {
    console.error("validate-protected: FAILED");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log("validate-protected: OK");
}

main();
