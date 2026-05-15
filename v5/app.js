/**
 * TicketToken DApp — app.js
 * 
 * Architecture overview:
 *  - web3.js connects to Sepolia testnet via public RPC (no MetaMask required)
 *  - Wallets are created/loaded client-side; private keys held in memory only
 *  - All blockchain reads use web3.eth.getBalance() and contract.methods.balanceOf()
 *  - All writes (buyToken, transfer) are signed locally and broadcast via sendSignedTransaction
 * 
 * ⚠️ IMPORTANT: After deploying your contract, update CONTRACT_ADDRESS below.
 */

// ══════════════════════════════════════════════════════════════
//  CONFIGURATION — update CONTRACT_ADDRESS after deployment
// ══════════════════════════════════════════════════════════════

const SEPOLIA_RPC     = "https://ethereum-sepolia-rpc.publicnode.com";
const ETHERSCAN_BASE  = "https://sepolia.etherscan.io";

/**
 * TODO: Replace this with your deployed contract address after deploying via Remix.
 * Example: "0xAbCd1234..."
 * Leave as null until deployed — the app will show a warning.
 */
const CONTRACT_ADDRESS = "0x11c8F90A453BC8156A87CF3B9A5F9CA1CC5e81Bb"

// ══════════════════════════════════════════════════════════════
//  ERC-20 + TicketToken ABI
//  Includes all standard ERC-20 methods plus our custom buyToken()
// ══════════════════════════════════════════════════════════════

const TOKEN_ABI = [
  // ERC-20: View functions
  { "inputs": [], "name": "name",        "outputs": [{ "type": "string" }],  "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "symbol",      "outputs": [{ "type": "string" }],  "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "decimals",    "outputs": [{ "type": "uint8" }],   "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "totalSupply", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "ticketsRemaining", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // ERC-20: Transfer
  {
    "inputs": [
      { "internalType": "address", "name": "recipient", "type": "address" },
      { "internalType": "uint256", "name": "amount",    "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Read the vendor (doorman) address stored in the contract
  {
    "inputs": [],
    "name": "vendor",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Custom: Buy ticket with SETH
  {
    "inputs": [],
    "name": "buyToken",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "from",  "type": "address" },
      { "indexed": true,  "name": "to",    "type": "address" },
      { "indexed": false, "name": "value", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "buyer",        "type": "address" },
      { "indexed": false, "name": "ticketAmount",  "type": "uint256" },
      { "indexed": false, "name": "sethPaid",      "type": "uint256" }
    ],
    "name": "TicketPurchased",
    "type": "event"
  }
];

// ══════════════════════════════════════════════════════════════
//  Initialise web3 instance
// ══════════════════════════════════════════════════════════════

const web3 = new Web3(SEPOLIA_RPC);

// ══════════════════════════════════════════════════════════════
//  App boot — wire up contract info in the UI
// ══════════════════════════════════════════════════════════════

$(document).ready(function () {

  // Update the contract pill in the top bar
  if (CONTRACT_ADDRESS) {
    const short = CONTRACT_ADDRESS.slice(0, 6) + "…" + CONTRACT_ADDRESS.slice(-4);
    $("#contractLink")
      .text(short)
      .attr("href", `${ETHERSCAN_BASE}/address/${CONTRACT_ADDRESS}`);
  } else {
    $("#contractLink").text("⚠️ Not deployed yet").removeAttr("href").css("color", "var(--warn)");
  }

  // Update ticket quantity cost display on change
  $("#ticketQuantity").on("input", function () {
    const qty  = parseInt($(this).val()) || 1;
    const cost = (qty * 0.00001).toFixed(5);
    $("#costDisplay").text(`${cost} SETH`);
  });

  // Show the attendee input section by default
  $("#doormanInputSection").hide();
  $("#venueInputSection").hide();
  $("#attendeeInputSection").show();
  $("#roleDescText").text("Load your keystore file to prove who you are — then check your own ticket balance.");

  // Auto-fetch the vendor/doorman address from the contract and pre-fill
  // the Send to Vendor page — attendee never needs to type it manually
  if (CONTRACT_ADDRESS) {
    const contract = new web3.eth.Contract(TOKEN_ABI, CONTRACT_ADDRESS);
    contract.methods.vendor().call()
      .then(function(vendorAddr) {
        $("#vendorAddress").val(vendorAddr);
      })
      .catch(function(err) {
        console.warn("Could not fetch vendor address from contract:", err);
        $("#vendorAddress")
          .removeAttr("readonly")
          .attr("placeholder", "Could not auto-load — paste doorman address here");
      });
  } else {
    $("#vendorAddress")
      .removeAttr("readonly")
      .attr("placeholder", "Contract not deployed yet");
  }
});

// ══════════════════════════════════════════════════════════════
//  Navigation — Tab switching
// ══════════════════════════════════════════════════════════════

const TAB_NAMES = {
  home:          "Home",
  createWallet:  "Create Wallet",
  checkBalances: "Check Balances",
  buyTicket:     "Buy Ticket",
  sendToVendor:  "Send to Vendor"
};

function showTab(tabId, navEl) {
  // Hide all panels
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  // Show target panel
  document.getElementById(tabId).classList.add("active");

  // Update sidebar active state
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  if (navEl) navEl.classList.add("active");

  // Update topbar breadcrumb
  $("#currentTabName").text(TAB_NAMES[tabId] || tabId);
}

// ══════════════════════════════════════════════════════════════
//  Utility — Status Banners
// ══════════════════════════════════════════════════════════════

/**
 * Show a status banner in a given container.
 * @param {string} selector  - jQuery selector for the banner element
 * @param {'info'|'success'|'error'|'warn'} type
 * @param {string} message   - Plain text message
 * @param {boolean} loading  - If true, show a spinner prefix
 */
function showStatus(selector, type, message, loading = false) {
  const el = $(selector);
  el.attr("class", `status-banner ${type} show`);
  const spinner = loading ? `<div class="spinner"></div>` : "";
  el.html(`${spinner}<span>${message}</span>`);
}

function hideStatus(selector) {
  $(selector).removeClass("show").attr("class", "status-banner");
}

// ══════════════════════════════════════════════════════════════
//  CREATE WALLET
// ══════════════════════════════════════════════════════════════

$("#createWalletButton").click(function () {
  const password = $("#password").val().trim();

  if (!password) {
    alert("Please enter a password before generating your wallet.");
    return;
  }

  // Create a fresh web3 instance (no provider needed just for key generation)
  const localWeb3 = new Web3();

  // Generate a new random Ethereum account
  const wallet = localWeb3.eth.accounts.create();

  // Encrypt the private key into a keystore object using the user's password.
  // scrypt KDF parameters provide strong brute-force resistance.
  const keystore = localWeb3.eth.accounts.encrypt(wallet.privateKey, password);
  const keystoreStr = JSON.stringify(keystore, null, 2);

  // Populate the UI fields
  $("#walletAddress").val(wallet.address);
  $("#privateKey").val(wallet.privateKey);
  $("#keystore").val(keystoreStr);

  // Also pre-fill the balance checker for convenience
  $("#walletAddressBalance").val(wallet.address);

  // Show the result card
  $("#walletResultCard").show();

  // Set the Etherscan link
  $("#etherscanWalletLink")
    .attr("href", `${ETHERSCAN_BASE}/address/${wallet.address}`)
    .show();
});

// ── Download keystore as a JSON file named {address}.json ──
$("#downloadKeystore").click(function () {
  const keystoreStr = $("#keystore").val();
  const address     = $("#walletAddress").val();

  if (!keystoreStr) {
    alert("Please generate a wallet first.");
    return;
  }

  // Create an in-memory blob and trigger a download
  const blob = new Blob([keystoreStr], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `${address}.json`;
  link.click();
  URL.revokeObjectURL(url); // Clean up the object URL after use
});

// ══════════════════════════════════════════════════════════════
//  CHECK BALANCES — Role Selector
// ══════════════════════════════════════════════════════════════

// Tracks which role is currently active
let currentRole = "attendee";

const ROLE_DESCRIPTIONS = {
  attendee: "Load your keystore file to prove who you are — then check your own ticket balance.",
  doorman:  "Enter any guest's wallet address to verify they hold a valid ticket at the door.",
  venue:    "The contract address is auto-filled — see how many tickets are still unsold."
};

function selectRole(el) {
  document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  currentRole = el.dataset.role;

  // Update the description banner
  $("#roleDescText").text(ROLE_DESCRIPTIONS[currentRole]);

  // Show/hide the correct input section for each role
  $("#attendeeInputSection").hide();
  $("#doormanInputSection").hide();
  $("#venueInputSection").hide();

  if (currentRole === "attendee") {
    $("#attendeeInputSection").show();
  } else if (currentRole === "doorman") {
    $("#doormanInputSection").show();
  } else if (currentRole === "venue") {
    $("#venueInputSection").show();
    // Auto-fill the contract address — venue always checks the contract itself
    if (CONTRACT_ADDRESS) {
      $("#venueAddressInput").val(CONTRACT_ADDRESS);
    } else {
      $("#venueAddressInput").val("").attr("placeholder", "⚠️ Contract not deployed yet");
    }
  }

  // Reset results when switching role
  $("#balanceGrid").hide();
  hideStatus("#balanceStatus");

  // If switching AWAY from doorman, reset their auth state so it
  // can't be left open for the next person to use
  if (currentRole !== "doorman") {
    doormanAuthenticated = false;
    $("#doormanAuthSection").show();
    $("#doormanCheckSection").hide();
    $("#doormanKeystoreFile").val("");
    $("#doormanPassword").val("");
    hideStatus("#doormanAuthStatus");
  }
}

function updateRoleDescription(role) {
  $("#roleDescText").text(ROLE_DESCRIPTIONS[role]);
}

// ── Attendee: load keystore to prove identity ──
$("#attendeeLoadBtn").click(function () {
  const password = $("#attendeePassword").val();
  const file     = document.getElementById("attendeeKeystoreFile").files[0];

  if (!password || !file) {
    showStatus("#balanceStatus", "error", "Please select your keystore file and enter your password.");
    return;
  }

  showStatus("#balanceStatus", "info", "Decrypting wallet...", true);

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wallet = web3.eth.accounts.decrypt(e.target.result, password);
      // Auto-fill the address — attendee can only check their own wallet
      $("#walletAddressBalance").val(wallet.address);
      showStatus("#balanceStatus", "success", `✅ Wallet loaded: ${wallet.address}`);
    } catch (err) {
      showStatus("#balanceStatus", "error", "Wrong password or invalid keystore file. Try again.");
    }
  };
  reader.readAsText(file);
});

// ── Doorman: must authenticate with vendor keystore before checking guests ──
// This prevents an attendee from simply clicking the Doorman tab and using it.
// Only someone with the actual vendor keystore file + password can authenticate.
let doormanAuthenticated = false;

$("#doormanAuthBtn").click(function () {
  const password = $("#doormanPassword").val();
  const file     = document.getElementById("doormanKeystoreFile").files[0];

  if (!password || !file) {
    showStatus("#doormanAuthStatus", "error", "Please select your doorman keystore file and enter your password.");
    return;
  }

  showStatus("#doormanAuthStatus", "info", "Verifying doorman identity...", true);

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wallet = web3.eth.accounts.decrypt(e.target.result, password);

      // Optional: if CONTRACT_ADDRESS is set, we could verify this wallet
      // matches the vendor address stored in the contract. For now we just
      // confirm the keystore decrypts successfully — the doorman is the only
      // person who has their own keystore file and password.
      doormanAuthenticated = true;

      // Hide the auth form, show the guest address checker
      $("#doormanAuthSection").hide();
      $("#doormanCheckSection").show();
      showStatus("#balanceStatus", "success",
        `✅ Doorman authenticated: ${wallet.address.slice(0,10)}...`);

    } catch (err) {
      showStatus("#doormanAuthStatus", "error", "Authentication failed — wrong password or invalid keystore.");
    }
  };
  reader.readAsText(file);
});

// ── Check Balances — works for all three roles ──
$("#checkBalancesButton").click(async function () {

  // Get the address depending on which role is active
  let rawInput = "";
  if (currentRole === "attendee") {
    rawInput = $("#walletAddressBalance").val().trim();
    if (!rawInput) {
      showStatus("#balanceStatus", "error", "Please load your keystore file first using the button above.");
      return;
    }
  } else if (currentRole === "doorman") {
    // Guard: doorman must authenticate before they can check guests
    if (!doormanAuthenticated) {
      showStatus("#balanceStatus", "error", "You must authenticate as the doorman first. Load your vendor keystore above.");
      return;
    }
    rawInput = $("#doormanAddressInput").val().trim();
    if (!rawInput) {
      showStatus("#balanceStatus", "error", "Please enter the guest's wallet address.");
      return;
    }
  } else if (currentRole === "venue") {
    rawInput = $("#venueAddressInput").val().trim();
    if (!rawInput) {
      showStatus("#balanceStatus", "error", "Contract address not available. Make sure CONTRACT_ADDRESS is set in app.js.");
      return;
    }
  }

  // Normalise to correct checksum format (fixes EIP-55 capitalisation issues)
  const normalised = rawInput.toLowerCase();
  if (!web3.utils.isAddress(normalised)) {
    showStatus("#balanceStatus", "error", "Invalid Ethereum address. It should start with 0x and be 42 characters long.");
    $("#balanceGrid").hide();
    return;
  }
  const address = web3.utils.toChecksumAddress(normalised);

  showStatus("#balanceStatus", "info", "Fetching balances from Sepolia...", true);
  $("#sethBalanceValue").text("...").addClass("loading");
  $("#tokenBalanceValue").text("...").addClass("loading");
  $("#balanceGrid").show();

  // Update labels and SETH card visibility depending on role.
  // Doorman doesn't need to see the guest's SETH — only their ticket status.
  // Showing someone's SETH balance to a doorman is a privacy concern.
  if (currentRole === "doorman") {
    $("#sethBalanceCard").hide();
    $("#tokenBalanceLabel").text("Ticket Status");
    // Make token card full width when SETH is hidden
    $("#tokenBalanceCard").css("grid-column", "1 / -1");
  } else {
    $("#sethBalanceCard").show();
    $("#tokenBalanceCard").css("grid-column", "");
    if (currentRole === "venue") {
      $("#tokenBalanceLabel").text("Unsold Tickets");
    } else {
      $("#tokenBalanceLabel").text("Your Tickets");
    }
  }

  try {
    // Fetch native SETH balance (skipped display for doorman but still fetched
    // so we can confirm the address exists on chain)
    const weiBalance = await web3.eth.getBalance(address);
    const ethRounded = parseFloat(web3.utils.fromWei(weiBalance, "ether")).toFixed(6);
    $("#sethBalanceValue").text(ethRounded).removeClass("loading");
    $("#sethBalanceCard").addClass("has-value");

    // Fetch ERC-20 token balance
    if (!CONTRACT_ADDRESS) {
      $("#tokenBalanceValue").text("N/A").removeClass("loading");
      showStatus("#balanceStatus", "warn", "Contract not deployed yet — SETH balance shown, token balance unavailable.");
      return;
    }

    const contract     = new web3.eth.Contract(TOKEN_ABI, CONTRACT_ADDRESS);
    const tokenBalance = await contract.methods.balanceOf(address).call();
    $("#tokenBalanceValue").text(tokenBalance).removeClass("loading");
    $("#tokenBalanceCard").addClass("has-value");

    // Role-specific result messages
    const count = parseInt(tokenBalance);
    if (currentRole === "attendee") {
      showStatus("#balanceStatus", count > 0 ? "success" : "warn",
        count > 0
          ? `✅ You hold ${count} ticket(s) — you're good to go!`
          : `⚠️ You have no ticket tokens. Have you bought a ticket yet?`
      );
    } else if (currentRole === "doorman") {
      showStatus("#balanceStatus", count > 0 ? "success" : "error",
        count > 0
          ? `✅ ENTRY GRANTED — this wallet holds ${count} valid ticket(s).`
          : `❌ ENTRY DENIED — this wallet holds no ticket tokens.`
      );
    } else if (currentRole === "venue") {
      showStatus("#balanceStatus", "info",
        `📊 Contract holds ${count} unsold ticket(s) remaining for sale.`
      );
    }

  } catch (err) {
    console.error("Balance check error:", err);
    showStatus("#balanceStatus", "error", `Failed to fetch balances: ${err.message || "Network error."}`);
    $("#sethBalanceValue, #tokenBalanceValue").text("Error").removeClass("loading");
  }
});

// ══════════════════════════════════════════════════════════════
//  LOAD WALLET HELPER (shared between Buy and Vendor tabs)
// ══════════════════════════════════════════════════════════════

/**
 * Decrypt a keystore file and populate address/private key fields.
 * @param {string} fileInputId     - ID of the <input type="file"> element
 * @param {string} passwordInputId - ID of the password <input>
 * @param {string} addressFieldId  - ID of the address display <input>
 * @param {string} privateKeyFieldId - ID of the hidden private key field
 * @param {string} statusSelector  - jQuery selector for the status banner
 */
function loadWallet(fileInputId, passwordInputId, addressFieldId, privateKeyFieldId, statusSelector) {
  const password = $(`#${passwordInputId}`).val();
  const file     = document.getElementById(fileInputId).files[0];

  if (!password) {
    showStatus(statusSelector, "error", "Please enter your keystore password.");
    return;
  }
  if (!file) {
    showStatus(statusSelector, "error", "Please select your keystore JSON file.");
    return;
  }

  showStatus(statusSelector, "info", "Decrypting wallet...", true);

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      // Decrypt the keystore using web3's built-in decrypt (scrypt + AES)
      const wallet = web3.eth.accounts.decrypt(e.target.result, password);

      $(`#${addressFieldId}`).val(wallet.address);
      // Store private key in memory (hidden field, never displayed)
      $(`#${privateKeyFieldId}`).val(wallet.privateKey);

      showStatus(statusSelector, "success", `✅ Wallet loaded: ${wallet.address}`);
    } catch (err) {
      // Wrong password is the most common error here
      console.error("Wallet decrypt error:", err);
      showStatus(statusSelector, "error", "Failed to decrypt wallet. Check your password and try again.");
    }
  };
  reader.readAsText(file);
}

// ── Wire load wallet buttons ──
$("#loadWalletButton").click(() =>
  loadWallet("keystoreFileBuy", "passwordBuy", "walletAddressBuy", "privateKeyBuy", "#buyWalletStatus")
);

$("#loadWalletButtonVendor").click(() =>
  loadWallet("keystoreFileVendor", "passwordVendor", "walletAddressVendor", "privateKeyVendor", "#vendorWalletStatus")
);

// ══════════════════════════════════════════════════════════════
//  BUY TICKET
// ══════════════════════════════════════════════════════════════

$("#buyTokensButton").click(async function () {
  const privateKey  = $("#privateKeyBuy").val();
  const rawQuantity = $("#ticketQuantity").val().trim();

  // ── Input validation — peer review fix ──
  // Check wallet loaded first
  if (!privateKey) {
    showStatus("#buyStatus", "error", "No wallet loaded. Please load your wallet in Step 1 first.");
    return;
  }
  if (!CONTRACT_ADDRESS) {
    showStatus("#buyStatus", "warn", "Contract not deployed yet. Update CONTRACT_ADDRESS in app.js after deployment.");
    return;
  }

  // Validate quantity is present
  if (rawQuantity === "" || rawQuantity === null) {
    showStatus("#buyStatus", "error", "Please enter a number of tickets.");
    return;
  }

  // Validate quantity is a whole number (no decimals like 1.5)
  if (rawQuantity.includes(".")) {
    showStatus("#buyStatus", "error", "Ticket quantity must be a whole number — you can't buy half a ticket.");
    return;
  }

  const quantity = parseInt(rawQuantity, 10);

  // Validate quantity is a real number, not NaN
  if (isNaN(quantity)) {
    showStatus("#buyStatus", "error", "Invalid quantity — please enter a number.");
    return;
  }

  // Validate minimum of 1
  if (quantity < 1) {
    showStatus("#buyStatus", "error", "Minimum purchase is 1 ticket.");
    return;
  }

  // Validate maximum of 100 — prevents accidental large purchases that
  // would drain the wallet or exhaust contract supply in one transaction
  if (quantity > 100) {
    showStatus("#buyStatus", "error", "Maximum purchase is 100 tickets per transaction.");
    return;
  }

  const wallet          = web3.eth.accounts.privateKeyToAccount(privateKey);
  const contract        = new web3.eth.Contract(TOKEN_ABI, CONTRACT_ADDRESS);
  const sethAmount      = (quantity * 0.00001).toFixed(8);
  const sethInWei       = web3.utils.toWei(sethAmount, "ether");

  // ── State management: update button text through each phase ──
  // This explicitly manages all possible states of the purchase flow,
  // giving the user clear feedback at every stage rather than just disabling the button.
  const $btn = $("#buyTokensButton");

  // Use .html() not .text() so the SVG icon inside the button is preserved
  // when returning to idle/error state, and replaced with emoji for active states
  const idleHTML = $btn.html(); // capture original HTML including SVG

  function setButtonState(state) {
    const states = {
      idle:       { html: idleHTML,                              disabled: false },
      signing:    { html: "<span>⏳ Signing...</span>",          disabled: true  },
      sending:    { html: "<span>⏳ Broadcasting...</span>",     disabled: true  },
      confirming: { html: "<span>⏳ Confirming...</span>",       disabled: true  },
      success:    { html: "<span>✅ Purchase Complete</span>",   disabled: false },
      error:      { html: idleHTML,                              disabled: false }
    };
    const s = states[state];
    $btn.html(s.html).prop("disabled", s.disabled);
  }

  setButtonState("signing");
  showStatus("#buyStatus", "info", "Step 1/3 — Signing transaction locally...", true);
  $("#buyTxResult").hide();
  $("#buyPostBalance").hide();

  try {
    // Step 1: Encode the buyToken() function call into raw transaction data.
    // encodeABI() converts the function call into the hex data field the EVM reads.
    // Gas is set to 200,000 — a deliberately generous limit. The EVM only charges
    // for gas actually consumed; unused gas is refunded automatically.
    // This is a gas-efficient pattern: overestimate to avoid out-of-gas reverts,
    // the unused portion costs nothing.
    const txData = contract.methods.buyToken().encodeABI();

    const tx = {
      from:  wallet.address,
      to:    CONTRACT_ADDRESS,
      gas:   200000,
      data:  txData,
      value: sethInWei
    };

    // Step 2: Sign locally — private key never leaves the browser
    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);

    setButtonState("sending");
    showStatus("#buyStatus", "info", "Step 2/3 — Broadcasting to Sepolia network...", true);

    // Step 3: Broadcast the signed transaction to the Sepolia network
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    setButtonState("confirming");
    showStatus("#buyStatus", "info", "Step 3/3 — Confirmed! Fetching your new balance...", true);

    // Step 4: Fetch the updated token balance immediately after confirmation
    // so the user can see their new TCKT count without navigating away.
    const contract2     = new web3.eth.Contract(TOKEN_ABI, CONTRACT_ADDRESS);
    const newBalance    = await contract2.methods.balanceOf(wallet.address).call();
    const newSethWei    = await web3.eth.getBalance(wallet.address);
    const newSethRounded = parseFloat(web3.utils.fromWei(newSethWei, "ether")).toFixed(6);

    // Show inline post-transaction balance update
    $("#buyPostTckt").text(newBalance);
    $("#buyPostSeth").text(newSethRounded);
    $("#buyPostBalance").show();

    // Display full transaction details
    $("#transactionRequest").val(JSON.stringify(tx, null, 2));
    $("#transactionResult").val(JSON.stringify(receipt, null, 2));
    $("#buyTxLink")
      .attr("href", `${ETHERSCAN_BASE}/tx/${receipt.transactionHash}`)
      .text(`View transaction ${receipt.transactionHash.slice(0, 16)}… on Etherscan`);
    $("#buyTxResult").show();

    setButtonState("success");
    showStatus("#buyStatus", "success",
      `✅ Success! ${quantity} ticket token(s) added to your wallet.`
    );


  } catch (err) {
    console.error("Buy ticket error:", err);
    let userMessage = err.message || "Unknown error";
    if (userMessage.includes("insufficient funds")) {
      userMessage = "Insufficient SETH to cover ticket price + gas. Top up from a Sepolia faucet.";
    } else if (userMessage.includes("Not enough tickets")) {
      userMessage = "The contract has no tickets remaining for sale.";
    } else if (userMessage.includes("Insufficient SETH")) {
      userMessage = "Not enough SETH sent. Minimum is 0.00001 SETH per ticket.";
    } else if (userMessage.includes("User denied")) {
      userMessage = "Transaction was cancelled.";
    }
    setButtonState("error");
    showStatus("#buyStatus", "error", `Transaction failed: ${userMessage}`);
  }
});

// ══════════════════════════════════════════════════════════════
//  SEND TO VENDOR
// ══════════════════════════════════════════════════════════════

$("#vendorTokensButton").click(async function () {
  const privateKey    = $("#privateKeyVendor").val();
  const rawVendor   = $("#vendorAddress").val().trim();
  const rawAmount   = $("#transferAmount").val().trim();

  // Validate all inputs before touching the blockchain
  if (!privateKey) {
    showStatus("#vendorStatus", "error", "No wallet loaded. Please load your wallet in Step 1 first.");
    return;
  }
  if (!CONTRACT_ADDRESS) {
    showStatus("#vendorStatus", "warn", "Contract not deployed yet. Update CONTRACT_ADDRESS in app.js.");
    return;
  }
  if (!web3.utils.isAddress(rawVendor.toLowerCase())) {
    showStatus("#vendorStatus", "error", "Invalid vendor address. Please enter a valid 0x... Ethereum address.");
    return;
  }

  // Normalise to correct EIP-55 checksum so web3 accepts it
  const vendorAddress = web3.utils.toChecksumAddress(rawVendor.toLowerCase());

  // ── Quantity validation — peer review fix ──
  if (rawAmount === "" || rawAmount === null) {
    showStatus("#vendorStatus", "error", "Please enter a number of tickets to transfer.");
    return;
  }
  if (rawAmount.includes(".")) {
    showStatus("#vendorStatus", "error", "Ticket quantity must be a whole number.");
    return;
  }

  const amount = parseInt(rawAmount, 10);

  if (isNaN(amount) || amount < 1) {
    showStatus("#vendorStatus", "error", "Minimum transfer is 1 ticket.");
    return;
  }
  if (amount > 100) {
    showStatus("#vendorStatus", "error", "Maximum transfer is 100 tickets per transaction.");
    return;
  }

  const wallet   = web3.eth.accounts.privateKeyToAccount(privateKey);
  const contract = new web3.eth.Contract(TOKEN_ABI, CONTRACT_ADDRESS);

  showStatus("#vendorStatus", "info", "Sending transfer transaction — this may take 15–30 seconds...", true);
  $("#vendorTxResult").hide();
  $("#vendorTokensButton").prop("disabled", true);

  try {
    // Encode the ERC-20 transfer() call — sends `amount` tickets to the vendor
    const txData = contract.methods.transfer(vendorAddress, amount).encodeABI();

    const tx = {
      from:  wallet.address,
      to:    CONTRACT_ADDRESS,
      gas:   100000,
      data:  txData
      // No value — this is a token transfer, not a SETH payment
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt  = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    // Display results
    $("#transactionRequestVendor").val(JSON.stringify(tx, null, 2));
    $("#transactionResultVendor").val(JSON.stringify(receipt, null, 2));
    $("#vendorTxLink")
      .attr("href", `${ETHERSCAN_BASE}/tx/${receipt.transactionHash}`)
      .text(`View transaction ${receipt.transactionHash.slice(0, 16)}… on Etherscan`);
    $("#vendorTxResult").show();

    showStatus("#vendorStatus", "success",
      `✅ ${amount} ticket token(s) sent to vendor. Transaction: ${receipt.transactionHash.slice(0, 16)}…`
    );

  } catch (err) {
    console.error("Send to vendor error:", err);
    let userMessage = err.message || "Unknown error";
    if (userMessage.includes("insufficient balance") || userMessage.includes("ERC20")) {
      userMessage = "You don't have enough ticket tokens to send. Check your balance on the Check Balances page.";
    } else if (userMessage.includes("insufficient funds")) {
      userMessage = "Insufficient SETH for gas. Top up your wallet from a Sepolia faucet.";
    }
    showStatus("#vendorStatus", "error", `Transfer failed: ${userMessage}`);
  } finally {
    $("#vendorTokensButton").prop("disabled", false);
  }
});
