require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("hardhat-contract-sizer")
require("dotenv").config()

const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL || "https://goerli.infura.io/v3/f5d542208a0a4d56bcdfc4d5616ce70f"
const GOERLI_PRIVATE_KEY =
    process.env.GOERLI_PRIVATE_KEY || "5f5b0ae2c3603a00f95a3759acd9f1369ed4cb363427b596b8daa5c041c99d63"
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "MH1VIYAQGRFCT6AS7MVCVXYDHTVNJ3FJBV"

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    defaultNetwork: "hardhat", // provides rpc_url and private_key automatically
    networks: {
        hardhat: {
            chainId: 31337,
            blockConfirmations: 5,
        },
        goerli: {
            url: GOERLI_RPC_URL,
            accounts: [GOERLI_PRIVATE_KEY],
            chainId: 5,
            blockConfirmations: 1,
            timeout: 500000, //=300sec; override default timeout: 60 sec.
            gas: 20000000000,
        },
        localhost: {
            url: "http://localhost:8545",
            chainId: 31337,
            blockConfirmations: 5,
        },
    },
    //solidity: "0.8.9",
    solidity: {
        compilers: [
            {
                version: "0.8.8",
            },
            {
                version: "0.8.9",
            },
            {
                version: "0.6.6",
            },
        ],
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
    gasReporter: {
        enabled: true,
        currency: "USD",
        outputFile: "gas-report.txt",
        noColors: true,
        //coinmarketcap: COINMARKETCAP_API_KEY,
    },
    namedAccounts: {
        deployer: {
            default: 0, // here this will by default take the first account as deployer
        },
        player: {
            default: 1,
        },
    },
    mocha: {
        timeout: 500000, // 300 sec.
    },
}
