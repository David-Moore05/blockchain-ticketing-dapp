// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title  TicketToken
 * @author David (Student No. 2015261)
 * @notice An ERC-20 token representing event tickets, purchasable with
 *         native Sepolia ETH. Implements a ReentrancyGuard to prevent
 *         reentrancy attacks on state-changing functions.
 *
 * @dev    Design decisions:
 *         - decimals = 0: tickets are indivisible whole units.
 *         - All tickets start in the contract's own balance, ready to sell.
 *         - Price is fixed at 0.00001 SETH (TICKET_PRICE constant).
 *         - Excess SETH sent above a whole ticket price is refunded to sender.
 *         - The vendor address is set at deploy time and stored immutably.
 *         - Owner can withdraw accumulated SETH from ticket sales.
 */
contract TicketToken {

    // ──────────────────────────────────────────────
    //  ERC-20 State Variables
    // ──────────────────────────────────────────────

    /// @notice Human-readable name of the token (e.g. "Concert Ticket")
    string public name;

    /// @notice Shortened ticker symbol for the token (e.g. "TCKT")
    string public symbol;

    /// @notice Number of decimal places. Zero means tickets are whole units only.
    uint8 public decimals;

    /// @dev Internal total supply counter
    uint256 private _totalSupply;

    /// @dev Maps each address to its current token balance
    mapping(address => uint256) private _balances;

    /// @dev Maps owner → spender → approved spending amount (ERC-20 allowance)
    mapping(address => mapping(address => uint256)) private _allowances;

    // ──────────────────────────────────────────────
    //  Custom State Variables
    // ──────────────────────────────────────────────

    /// @notice Address of the contract deployer. Receives SETH withdrawals.
    address public owner;

    /// @notice Address of the venue doorman/vendor wallet. Set at deployment.
    address public vendor;

    /// @notice Fixed price per ticket in wei. 0.00001 ETH = 10000000000000 wei.
    uint256 public constant TICKET_PRICE = 0.00001 ether;

    // ──────────────────────────────────────────────
    //  ReentrancyGuard
    // ──────────────────────────────────────────────

    /**
     * @dev Boolean lock that prevents nested (reentrant) calls into
     *      functions marked nonReentrant. Set to true on entry, false on exit.
     *      Without this, a malicious contract could call buyToken() again
     *      before the first call finishes, draining the contract.
     */
    bool private _locked;

    /// @dev Throws if the function is called while _locked is true.
    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /**
     * @dev  Emitted when tokens move from one address to another.
     *       Required by the ERC-20 standard.
     * @param from   The address sending the tokens (address(0) on mint).
     * @param to     The address receiving the tokens.
     * @param value  The number of tokens transferred.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev  Emitted when an owner approves a spender to spend on their behalf.
     *       Required by the ERC-20 standard.
     * @param owner   The address granting the allowance.
     * @param spender The address being approved to spend.
     * @param value   The maximum number of tokens the spender may use.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev  Emitted when a ticket is successfully purchased via buyToken().
     * @param buyer        The wallet address that purchased the ticket(s).
     * @param ticketAmount The number of ticket tokens received.
     * @param sethPaid     The amount of SETH (in wei) charged for the purchase.
     */
    event TicketPurchased(address indexed buyer, uint256 ticketAmount, uint256 sethPaid);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploys the TicketToken contract and mints the full supply
     *         into the contract's own balance, ready to be sold.
     *
     * @dev    msg.sender becomes the owner. The contract address holds all
     *         tickets initially — balanceOf(address(this)) == initialSupply.
     *
     * @param _name         Display name for the token (e.g. "Concert Ticket").
     * @param _symbol       Ticker symbol for the token (e.g. "TCKT").
     * @param initialSupply Total number of tickets available for sale.
     * @param _vendor       Wallet address of the venue doorman who receives
     *                      tokens when attendees transfer at the door.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 initialSupply,
        address _vendor
    ) {
        require(_vendor != address(0), "Vendor address cannot be zero");

        name         = _name;
        symbol       = _symbol;
        decimals     = 0;
        _totalSupply = initialSupply;
        owner        = msg.sender;
        vendor       = _vendor;

        // Assign all tickets to the contract itself, not the deployer
        _balances[address(this)] = _totalSupply;
        emit Transfer(address(0), address(this), _totalSupply);
    }

    // ──────────────────────────────────────────────
    //  ERC-20 View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Returns the total number of tickets ever created.
     * @dev    Does not decrease as tickets are sold — reflects initial supply.
     * @return uint256 The total token supply.
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Returns the ticket token balance of a given wallet address.
     * @dev    Called by the DApp's Check Balances page for all three roles.
     *         When called on address(this), returns unsold tickets remaining.
     * @param  account The wallet address to query.
     * @return uint256 The number of ticket tokens held by that address.
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Returns how many tokens a spender is approved to use on
     *         behalf of an owner.
     * @param  _owner   The address that owns the tokens.
     * @param  spender  The address authorised to spend them.
     * @return uint256  The remaining allowance in token units.
     */
    function allowance(address _owner, address spender) external view returns (uint256) {
        return _allowances[_owner][spender];
    }

    /**
     * @notice Returns the number of ticket tokens still held by the
     *         contract and available for purchase.
     * @dev    Convenience wrapper around balanceOf(address(this)).
     *         Used by the Venue role in the DApp's balance checker.
     * @return uint256 Number of unsold tickets remaining.
     */
    function ticketsRemaining() external view returns (uint256) {
        return _balances[address(this)];
    }

    // ──────────────────────────────────────────────
    //  ERC-20 State-Changing Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Transfers tokens from the caller's wallet to another address.
     * @dev    Used by the DApp's "Send to Vendor" page — the attendee calls
     *         this to hand their ticket token to the doorman at entry.
     *         Emits a {Transfer} event on success.
     * @param  recipient The address to send tokens to.
     * @param  amount    The number of tokens to transfer.
     * @return bool      True if the transfer succeeded.
     */
    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    /**
     * @notice Approves a third-party address to spend tokens on the caller's
     *         behalf, up to a specified amount.
     * @dev    Part of the ERC-20 allowance mechanism. Emits an {Approval} event.
     * @param  spender The address being granted spending rights.
     * @param  amount  The maximum number of tokens the spender may transfer.
     * @return bool    True if approval succeeded.
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfers tokens from one address to another using a prior
     *         approval — the caller must have sufficient allowance.
     * @dev    Reduces the caller's allowance by the transferred amount.
     *         Emits a {Transfer} event on success.
     * @param  sender    The address whose tokens are being spent.
     * @param  recipient The address receiving the tokens.
     * @param  amount    The number of tokens to transfer.
     * @return bool      True if the transfer succeeded.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, currentAllowance - amount);
        return true;
    }

    // ──────────────────────────────────────────────
    //  Ticket Purchase (Custom Extension)
    // ──────────────────────────────────────────────

    /**
     * @notice Purchase one or more tickets by sending Sepolia ETH.
     * @dev    Calculates how many whole tickets the sent value can buy.
     *         Any excess ETH above exact ticket cost is refunded to the sender.
     *         Protected against reentrancy via the nonReentrant modifier —
     *         without this, a malicious contract could re-enter buyToken()
     *         before state updates complete, receiving free tickets.
     *         Emits a {Transfer} and {TicketPurchased} event on success.
     *
     * @custom:example Send 0.00003 SETH → receive 3 tickets, no refund needed.
     * @custom:example Send 0.000025 SETH → receive 2 tickets, 0.000005 refunded.
     */
    function buyToken() external payable nonReentrant {
        require(msg.value >= TICKET_PRICE, "Insufficient SETH: minimum 0.00001 SETH per ticket");

        // Calculate whole ticket count from SETH sent
        uint256 ticketAmount = msg.value / TICKET_PRICE;
        require(_balances[address(this)] >= ticketAmount, "Not enough tickets remaining");

        // Calculate exact cost and any refund owed
        uint256 cost   = ticketAmount * TICKET_PRICE;
        uint256 refund = msg.value - cost;

        // Move tickets from contract balance to buyer
        _transfer(address(this), msg.sender, ticketAmount);

        // Refund excess SETH if any was sent
        if (refund > 0) {
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Refund failed");
        }

        emit TicketPurchased(msg.sender, ticketAmount, cost);
    }

    // ──────────────────────────────────────────────
    //  Owner Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Withdraws all accumulated SETH from ticket sales to the owner.
     * @dev    Only callable by the address stored in `owner` (the deployer).
     *         Protected against reentrancy — without this, a malicious owner
     *         contract could repeatedly call withdraw() before state settles.
     *         Uses call{value} instead of transfer() to avoid gas limit issues.
     */
    function withdraw() external nonReentrant {
        require(msg.sender == owner, "Only the owner can withdraw");
        uint256 balance = address(this).balance;
        require(balance > 0, "No SETH to withdraw");
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────

    /**
     * @dev    Core transfer logic shared by transfer(), transferFrom(),
     *         and buyToken(). Updates both balances and emits Transfer event.
     * @param  sender    The address losing tokens. Cannot be address(0).
     * @param  recipient The address gaining tokens. Cannot be address(0).
     * @param  amount    Number of tokens to move. Must not exceed sender balance.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender    != address(0), "ERC20: transfer from zero address");
        require(recipient != address(0), "ERC20: transfer to zero address");
        require(_balances[sender] >= amount, "ERC20: insufficient balance");

        _balances[sender]    -= amount;
        _balances[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev    Core approval logic shared by approve() and transferFrom().
     *         Sets the allowance mapping and emits Approval event.
     * @param  _owner   The address granting permission. Cannot be address(0).
     * @param  spender  The address receiving permission. Cannot be address(0).
     * @param  amount   The number of tokens the spender is approved to use.
     */
    function _approve(address _owner, address spender, uint256 amount) internal {
        require(_owner  != address(0), "ERC20: approve from zero address");
        require(spender != address(0), "ERC20: approve to zero address");
        _allowances[_owner][spender] = amount;
        emit Approval(_owner, spender, amount);
    }
}
