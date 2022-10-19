// Raffle Assignment:
// ******************
// Enter the lottery (paying some amount)
// Pick a random winner (verifiably random)
// Winner to be selected every X minutes -> completely automated
// Chainlink Oracle -> Randomness, Automated Execution

// Style Guide
// **********
// General layout: Pragma, imports, interfaces, libraries, errors, contracts
// Inside each contract: Type declarations, State variables, Events, Modifyers, Functions
// Function order: constructor, receive, fallback, external, public, internal, private, view/pure

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

// Imports
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
import "hardhat/console.sol";

// Note: As per chainlink documentation (see imported smart contract under node_modules/@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol) its properties need to be inherited
// To inherit the properties of the chainlink contract, we create our contract as "contract Raffle is VRFConsumerBaseV2 {..."

// Custom errors
error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**@title A sample Raffle Contract
 * @author Marco Heuscher
 * @notice This contract is for creating a sample raffle contract
 * @dev This implements the Chainlink VRF Version 2
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type declarations */
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    /* State variables */
    uint256 private immutable i_entranceFee; // make private & immutable for gas efficiency
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator; // Interface from imported contract
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    /* Raffle state variables */
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval; // interval in seconds

    /* Events */
    event raffleEntered(address indexed player); // Note: Name events with the function names reversed
    event raffleWinnerRequested(uint256 indexed requestId);
    event raffleWinnerPaid(address indexed recentWinner);

    /* Functions */
    // Note: constructor syntax is shown in chainlink's documentation (see dev comments in VRFConsumerBaseV2.sol)
    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_entranceFee = entranceFee;
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        // use custom errors for gas efficiency (no error msg string to be saved in storage)
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        // add player's address to the list of players
        s_players.push(payable(msg.sender)); // requires payable addres. Since msg.sender is not payable, we need to type-cast using payable() function

        // Emit an event when we update a dynamic array or mapping
        emit raffleEntered(msg.sender);
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0); // reset the list of players -> empty array
        s_lastTimeStamp = block.timestamp;
        //uint256 amountPaid = address(this).balance;

        // send ETH to winner
        (bool success, ) = recentWinner.call{value: address(this).balance}(""); // ("") stands for 'passing no Data'
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit raffleWinnerPaid(recentWinner);
    }

    // This is the function that the Chainlink Keeper nodes call
    // they look for the 'upkeepNeeded' to return true (documentation: https://docs.chain.link/docs/chainlink-automation/compatible-contracts/)
    // The following needs to be tue in order to return true:
    //    1. Our time interval should have passed
    //    2. The lottery should have at least 1 player, and have some ETH
    //    3. Our chainlink subscription is funded with link
    //    4. The lottery should be in an 'open' state
    // Note: 'bytes calldata' allows us to specify anything, incl. calling functions
    function checkUpkeep(
        bytes memory /*checkData */ //this is call data
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        // check conditions
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        // check if upkeep is needed
        (bool upkeepNeeded, ) = checkUpkeep(""); //pass blank call data
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(address(this).balance, s_players.length, uint256(s_raffleState));
        }

        // Request the random number
        // Once we get it, do something with it
        // 2-transaction process (here implemented with two functions: performUpkeep() and fulfillRandomWords())
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, // keyHash, also called 'gas lane' --> get from chainlink website 'get a Random Number' page
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit raffleWinnerRequested(requestId);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayers(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS; // not reading from state variables, so function can be made 'pure'
    }

    function getNumConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS; // not reading from state variables, so function can be made 'pure'
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
