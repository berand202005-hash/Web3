#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

PROJECT_NAME="my-web3-monorepo"

echo "🚀 Initializing Fullstack Web3 Monorepo: $PROJECT_NAME..."
mkdir -p "$PROJECT_NAME"
cd "$PROJECT_NAME"

# ---------------------------------------------------------------------
# 1. GENERATE THE SPECIALIZED .ANTIGRAVITYRULES FILE
# ---------------------------------------------------------------------
echo "📝 Creating .antigravityrules configuration..."
cat << 'EOF' > .antigravityrules
# Web3 Fullstack Development Rules

## 1. Stack & Architecture Definitions
- Frontend: Next.js (App Router), TypeScript, TailwindCSS
- Web3 Interaction: Wagmi v2, Viem, RainbowKit
- Smart Contracts: Solidity (Latest stable), Foundry Framework (prefer over Hardhat)

## 2. Agent Workflow Roles & Engine Routing
- ARCHITECTURE & FRONTEND (Cloud Brain): Use primary Antigravity agents for cross-file architecture, multi-hook setups, and UI design matching.
- DATA CRUNCHING & LOCAL TASKS (Ollama Brain): Delegate repetitive boilerplate generation, heavy transaction log parsing, and raw JSON ABI parsing to local Ollama MCP tools (`qwen2.5-coder`).

## 3. Smart Contract Protocol (Strict)
- TESTING: Write all smart contract edge cases and invariant testing in Solidity using Foundry (`forge test`). Never write raw JS/TS tests for smart contracts unless explicitly asked.
- SECURITY: Actively check for reentrancy, integer overflows (if pre-0.8), and flash-loan vulnerabilities. Leverage the local Ollama model to run sanity audits on compiling code before concluding tasks.
- GAS OPTIMIZATION: Prioritize custom errors over revert strings, optimize variable packing (slots), and utilize efficient iteration loops.

## 4. Execution Guardrails
- Always execute terminal commands with flags that bypass interactive prompts (e.g., `forge init --no-git`).
EOF

# ---------------------------------------------------------------------
# 2. INITIALIZE SMART CONTRACTS LAYER (FOUNDRY)
# ---------------------------------------------------------------------
echo "⛓️ Initializing Foundry (Contracts Layer)..."
# Force non-interactive and bypass internal git initialization to keep monorepo clean
#forge init contracts --no-git --no-commit
#forge init contracts --no-git
cd contracts

# Install OpenZeppelin Contracts via Forge
echo "📦 Installing OpenZeppelin Contract Libraries..."
#forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install OpenZeppelin/openzeppelin-contracts

# Setup basic remappings for clean imports
echo "mappings"
cat << 'EOF' > remappings.txt
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
EOF

cd ..

# ---------------------------------------------------------------------
# 3. INITIALIZE FRONTEND LAYER (NEXT.JS + WAGMI + VIEM)
# ---------------------------------------------------------------------
echo "🌐 Initializing Frontend (Next.js Layer)..."
# Create Next.js app using non-interactive flags
npx create-next-app@latest frontend \
  --ts \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm \
  --skip-install

cd frontend

echo "📦 Installing Web3 frontend dependencies (Wagmi, Viem, RainbowKit)..."
# Install essential Web3 interface primitives
npm install @rainbowkit/wallet-sdk wagmi viem @tanstack/react-query

cd ..

# ---------------------------------------------------------------------
# 4. WRAP UP
# ---------------------------------------------------------------------
echo "✨ Setup complete!"
echo "--------------------------------------------------------"
echo "👉 Next steps for your Antigravity workflow:"
echo "1. Open the '$PROJECT_NAME' folder inside Antigravity."
echo "2. Prompt the Agent: 'Verify the Foundry project compiles and check the frontend structure.'"
echo "3. The agent will read '.antigravityrules' automatically and operate inside your hybrid cloud/Ollama architecture."
echo "--------------------------------------------------------"