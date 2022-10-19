const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config.js")

// if the current network is not one of the development chains, then skip
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Test", function () {
          let raffle, vrfCoordinatorV2Mock, chainId, raffleEntranceFee, interval

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              accounts = await ethers.getSigners()
              await deployments.fixture(["all"])
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffle = await ethers.getContract("Raffle", deployer)
              chainId = network.config.chainId
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("Constructor", async function () {
              it("intitializes the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("Enter Raffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered")
              })
              it("records players when they enter raffle", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const contractPlayer = await raffle.getPlayers(0)
                  assert.equal(deployer, contractPlayer)
              })
              it("emits an event on raffle enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(raffle, "raffleEntered")
              })
              it("reverts if raffle is not in OPEN status", async function () {
                  // 1. Enter raffle
                  await raffle.enterRaffle({ value: raffleEntranceFee })

                  // 2. Trick the blockchain to think that the time interval has already passed (and an extra block has been mined)
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // documentation: https://hardhat.org/hardhat-network/docs/reference
                  await network.provider.send("evm_mine", []) // mine one extra block
                  // same as above: await network.provider.request({method: "evm_mine", params: []})

                  // 3. We pretend to be a Chainlink Keeper (and call the upkeep function)
                  await raffle.performUpkeep([]) // empty call data

                  // 4. Test statement
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith("Raffle__NotOpen")
              })
          })

          describe("Check upkeep", function () {
              it("returns false if no one sent any ETH", async function () {
                  // set up
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // documentation: https://hardhat.org/hardhat-network/docs/reference
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) // callStatic executes a function and returns the result without making state changes
                  assert(!upkeepNeeded)
              })
              it("returns false if the raffle status isn't OPEN", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // documentation: https://hardhat.org/hardhat-network/docs/reference
                  await network.provider.send("evm_mine", []) // mine one extra block
                  await raffle.performUpkeep([]) // empty call data
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) // callStatic executes a function and returns the result without making state changes
                  assert.equal(raffleState.toString(), "1")
                  assert(!upkeepNeeded)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] }) // mine the next block
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("Perform upkeep", function () {
              it("can only run if checkUpkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] }) // mine the next block
                  const tx = await raffle.performUpkeep([]) // empty call data
                  assert(tx)
              })
              it("reverts when checkUpkeep is false", async function () {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith("Raffle__UpkeepNotNeeded")
              })
              it("updates the raffle state, emits an event and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] }) // mine the next block
                  const txResponse = await raffle.performUpkeep([]) // empty call data
                  const txReceipt = await txResponse.wait(1)
                  const requestId = await txReceipt.events[1].args.requestId // not 0'th event as the function callrequestRandomWords() inside performUpkeep() also emits an event
                  const raffleState = await raffle.getRaffleState()
                  assert(raffleState.toString() == "1")
                  assert(requestId.toNumber() > 0)
              })
          })
          describe("Fulfill RandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] }) // mine the next block
              })

              it("can only be called after performUpkeep", async function () {
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith(
                      "nonexistent request"
                  )
              })

              // The following should be split into individual 'it' sections
              it("picks a winner, resets the lottery, and sends ETH to the winner", async function () {
                  /* set up */
                  // add 3 players
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // 0 = deployer
                  //const accounts = await ethers.getSigners()
                  for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                      const accountConnectedRaffle = await raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }

                  // store initial state values
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  // add event listener (will be triggered after we call performUpkeep)
                  await new Promise(async (resolve, reject) => {
                      raffle.once("raffleWinnerPaid", async () => {
                          console.log("Event fired: Found a new winner!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner)
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)

                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[1].getBalance()

                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              //assert.equal(winnerEndingBalance, winnerStartingBalance.add(raffleStartingBalance))   // this does not work
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance
                                      .add(raffleEntranceFee.mul(additionalEntrants))
                                      .add(raffleEntranceFee)
                                      .toString()
                              )
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      // performUpkeep
                      //await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                      //await network.provider.request({ method: "evm_mine", params: [] }) // mine the next block
                      const txResponse = await raffle.performUpkeep("0x") // empty call data
                      const txReceipt = await txResponse.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      const raffleStartingBalance = await raffle.provider.getBalance(raffle.address)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, raffle.address)
                  })
              })
          })
      })
