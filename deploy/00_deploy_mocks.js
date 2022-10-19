const { network } = require("hardhat")
const { developmentChains, DECIMALS, INITIAL_ANSWER } = require("../helper-hardhat-config.js")
const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25 is the Premium (see https://docs.chain.link/docs/vrf/v2/subscription/supported-networks/). Each request costs 0.25 LINK.
const GAS_PRICE_LINK = 1e9 // refers to LINK per gas of the network we're on. 1e9 is a generic substitute for the real price calculation using an oracle service

module.exports = async (hre) => {
    const { getNamedAccounts, deployments } = hre //note: 'hre' is the hardhat runtime environment

    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts() // NamedAccounts can be set in harthat.config.js
    const chainId = network.config.chainId

    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mock contract...")
        await deploy("VRFCoordinatorV2Mock" /* not: VRFCoordinatorV2Mock.sol */, {
            contract: "VRFCoordinatorV2Mock",
            from: deployer,
            log: true,
            args: [BASE_FEE, GAS_PRICE_LINK],
        })
        log("Mock contract successfully deployed!")
        log("**************************************")
    }
}

module.exports.tags = ["all", "mocks"] // flag for the commandline. If provided (--tags mocks), then script will execute
