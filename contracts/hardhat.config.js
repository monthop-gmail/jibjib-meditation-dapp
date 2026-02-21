require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  paths: {
    sources: "./src",
  },
  networks: {
    jbchain: {
      url: "https://rpc-l1.jibchain.net",
      chainId: 8899,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    kubTestnet: {
      url: "https://rpc-testnet.bitkubchain.io",
      chainId: 25925,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    kubL2Testnet: {
      url: "https://kublayer2.testnet.kubchain.io",
      chainId: 259251,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
