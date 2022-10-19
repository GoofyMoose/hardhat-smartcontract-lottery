const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains, VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat-config.js")
const { verify } = require("../utils/verify.js")
const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("1")

module.exports = async (hre) => {
    const { getNamedAccounts, deployments } = hre //note: 'hre' is the hardhat runtime environment (=require("hardhat"))
    // the above is the same as...
    //    hre.getNamedAccounts
    //    hre.deployments
    //          ...or all could be written ad: module.exports = async ({ getNamedAccounts, deployments }) => {}

    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts() // NamedAccounts can be set in harthat.config.js
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock // using 'let' so we can change the variable

    if (developmentChains.includes(network.name)) {
        /* get contract address */
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // constant is an object that represents the contract previously deployed
        // const vrfCoordinatorV2Mock = await deployments.get("VRFCoordinatorV2Mock")   //alternative way of getting the contract
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address

        /* get subscription ID */
        // vrfCoordinatorV2 constract has a createSubscription function
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId

        /* Fund the subscription */
        // vrfCoordinatorV2 constract has a fundSubscription function
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const waitBlockConfirmations = developmentChains.includes(network.name) ? 1 : VERIFICATION_BLOCK_CONFIRMATIONS

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]
    const arguments = [vrfCoordinatorV2Address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: waitBlockConfirmations, //network.config.blockConfirmations || 1,
    })

    // add consumer to Mock subscription (otherwise, it will create errors during testing)
    // source: https://ethereum.stackexchange.com/questions/131426/chainlink-keepers-getting-invalidconsumer
    if (developmentChains.includes(network.name)) {
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }

    // Verify the contract on Etherscan
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        console.log("Verifying contract...")
        await verify(raffle.address, arguments)
    }
    log("********************************")
}

module.exports.tags = ["all", "raffle"]
