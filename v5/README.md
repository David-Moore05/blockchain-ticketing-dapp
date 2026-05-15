# TicketToken DApp — Setup & Deployment Guide

## Running the Frontend
1. Open this folder in VS Code
2. Install the **Live Server** extension (if not installed)
3. Right-click `index.html` → **Open with Live Server**
4. The app opens at `http://127.0.0.1:5500`

---

## Deploying the Smart Contract (Remix IDE)

### Step 1 — Open Remix
Go to https://remix.ethereum.org

### Step 2 — Create the Contract File
- In the file explorer, click **+** to create a new file
- Name it `TicketToken.sol`
- Paste the contents of `TicketToken.sol` from this project

### Step 3 — Compile
- Click the **Solidity Compiler** tab (left sidebar)
- Select compiler version **0.8.x**
- Click **Compile TicketToken.sol**
- Fix any errors shown (there should be none)

### Step 4 — Get a Sepolia Wallet & Test ETH
- Create a wallet using the DApp's **Create Wallet** page
- Copy your wallet address
- Visit https://sepoliafaucet.com and paste your address to receive free Sepolia ETH
- Also visit https://faucet.quicknode.com/ethereum/sepolia for more SETH if needed

### Step 5 — Connect Remix to Sepolia
- Click the **Deploy & Run Transactions** tab
- Change **Environment** to: `Injected Provider - MetaMask`
  - (You'll need MetaMask with Sepolia network and some SETH)
  - OR use `External HTTP Provider` with RPC: `https://ethereum-sepolia-rpc.publicnode.com`
- **If using External HTTP Provider:** You must manually provide the private key for signing

**Easier alternative — use MetaMask:**
- Install MetaMask browser extension
- Import your wallet using the private key from the Create Wallet page
- Switch to Sepolia network in MetaMask
- Remix will pick it up automatically

### Step 6 — Deploy
In the Deploy tab:
- Contract: **TicketToken**
- Fill constructor parameters:
  - `_name`: "Concert Ticket" (or any name)
  - `_symbol`: "TCKT"
  - `initialSupply`: 1000 (1000 tickets available)
  - `_vendor`: your vendor/doorman wallet address (create a second wallet for this)
- Click **Deploy**
- Confirm the MetaMask transaction
- Wait ~15 seconds for confirmation

### Step 7 — Copy Contract Address
- In Remix, under **Deployed Contracts**, you'll see your contract
- Copy the address (starts with 0x)
- Paste it into `app.js` at the line: `const CONTRACT_ADDRESS = null;`
  - Replace `null` with `"0xYourContractAddress"`

### Step 8 — Fund the Contract with Tickets
The contract holds all tickets initially in its own balance. You need to check this is correct:
- In Remix under Deployed Contracts, call `ticketsRemaining()` — should show 1000
- The contract is ready to sell tickets!

---

## Contract Addresses (fill in after deployment)
| Item              | Address |
|-------------------|---------|
| Contract          | TBD     |
| Contract Creator  | TBD     |
| Ticket Purchaser  | TBD     |
| Vendor / Doorman  | TBD     |

---

## Sepolia Transaction Links (fill in for report)
| Event                        | Etherscan Link |
|------------------------------|----------------|
| Contract Deployment          | TBD            |
| Successful Token Purchase    | TBD            |
| Creator Wallet Top-up        | TBD            |
| Purchaser Wallet Top-up      | TBD            |
| Vendor Wallet Top-up         | TBD            |
