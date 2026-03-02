import { ethers } from 'hardhat';

const ROUTER_ABI = [
  'function registerModule(bytes32 key, address addr) external',
];

async function main() {
  const routerAddress = process.env.CLAW_ROUTER_ADDRESS;
  const groupRegistryAddress = process.env.TELAGENT_GROUP_REGISTRY_ADDRESS;

  if (!routerAddress || !groupRegistryAddress) {
    throw new Error('CLAW_ROUTER_ADDRESS and TELAGENT_GROUP_REGISTRY_ADDRESS are required');
  }

  const [signer] = await ethers.getSigners();
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);

  const key = ethers.keccak256(ethers.toUtf8Bytes('TELAGENT_GROUP'));
  const tx = await router.registerModule(key, groupRegistryAddress);
  const receipt = await tx.wait();

  console.log('Module key:', key);
  console.log('Router tx hash:', receipt?.hash ?? tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
