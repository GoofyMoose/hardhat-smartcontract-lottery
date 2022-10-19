const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config.js")

/* Notes:
1. Get our SubscriptionId for Chainlink VRF 
2. Deploy our contract using the SubId
3. Register the contract with Chainlink VRF & it's subId
4. Register the contract with Chainlink Keepers
5. Rung staging test
*/

// if the current network is one of the development chains, then skip
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Test", function () {
          let raffle, chainId, raffleEntranceFee, interval

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              accounts = await ethers.getSigners()
              raffle = await ethers.getContract("Raffle", deployer)
              chainId = network.config.chainId
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keeper and VRF, returns a random winner", async function () {
                  /* Set up */
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  /* Setup event listener (before we enter raffle, in case the blockchain moves very fast)*/
                  await new Promise(async (resolve, reject) => {
                      raffle.once("raffleWinnerPaid", async () => {
                          console.log("Event fired: Found a new winner!")
                          try {
                              // add asserts
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[0].getBalance()

                              await expect(raffle.getPlayers(0)).to.be.reverted // or: assert.equal(numPlayers, 0)
                              assert.equal(recentWinner.toString(), accounts[0].address.toString())
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString()
                              )

                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      const winnerStartingBalance = await accounts[0].getBalance()

                      // this code won't complete until our listener has finished listening
                  })
              })
          })
      })
