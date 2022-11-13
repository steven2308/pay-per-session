import { ethers } from 'hardhat';
import { PayPerSession } from '../typechain-types';

const FEE = ethers.utils.parseEther('10.0');

async function main() {
  const payPerSessionFactory = await ethers.getContractFactory('PayPerSession');
  const payPerSession: PayPerSession = await payPerSessionFactory.deploy(
    'Pay per session',
    'Test platform',
    500, // 5% in base points
    FEE,
  );
  await payPerSession.deployed();
  console.log('PayPerSession deployed at ', payPerSession.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
