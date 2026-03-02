import { ethers, upgrades } from 'hardhat';

async function main() {
  const identityAddress = process.env.CLAW_IDENTITY_ADDRESS;
  if (!identityAddress) {
    throw new Error('CLAW_IDENTITY_ADDRESS is required');
  }

  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);
  console.log('Identity:', identityAddress);

  const factory = await ethers.getContractFactory('TelagentGroupRegistry');
  const proxy = await upgrades.deployProxy(factory, [deployer.address, identityAddress], {
    kind: 'uups',
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  console.log('TelagentGroupRegistry proxy:', proxyAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
