import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-chai-matchers';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'hardhat-contract-sizer';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.16',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    coinmarketcap: process.env.COIN_MARKET_CAP_KEY || '',
    token: 'GLMR',
    gasPriceApi: 'https://api-moonbeam.moonscan.io/api?module=proxy&action=eth_gasPrice',
  },
  networks: {
    moonbaseAlpha: {
      url: 'https://rpc.testnet.moonbeam.network',
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    moonriver: {
      url: 'https://rpc.api.moonriver.moonbeam.network',
      chainId: 1285, // (hex: 0x505),
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      moonriver: process.env.MOONRIVER_MOONSCAN_APIKEY || '', // Moonriver Moonscan API Key
      moonbaseAlpha: process.env.MOONBEAM_MOONSCAN_APIKEY || '', // Moonbeam Moonscan API Key
    },
  },
};

export default config;
