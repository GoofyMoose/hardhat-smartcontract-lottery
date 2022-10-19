//imports
const { run } = require("hardhat") //'run' is the hardhat task/command

const verify = async (contractAddress, args) => {
    console.log("Verifying contract...")
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        })
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Contract is already verified.")
        } else {
            console.log(e)
        }
    }
}

module.exports = { verify }

// command to run:
// yarn hardhat run scripts/deploy_simple-storage.js --network goerli
