const { ethers } = require('ethers');

const ROLE_ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
];

const provider = new ethers.JsonRpcProvider('https://rpc.clawnetd.com');
const contract = new ethers.Contract('0xee9B2D7eb0CD51e1d0a14278bCA32b02548D1149', ROLE_ABI, provider);

const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('REGISTRAR_ROLE'));
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

async function main() {
  const localDev = '0xE5816fA7a1D749c3CD25c7d24c081940A3B6754D';
  const alex = '0x1FcC6D54Aa002358cD623e2d8b246Da912B2C38d';

  console.log('Local dev REGISTRAR:', await contract.hasRole(REGISTRAR_ROLE, localDev));
  console.log('Alex REGISTRAR:', await contract.hasRole(REGISTRAR_ROLE, alex));
  console.log('Local dev ADMIN:', await contract.hasRole(DEFAULT_ADMIN_ROLE, localDev));
  console.log('Alex ADMIN:', await contract.hasRole(DEFAULT_ADMIN_ROLE, alex));
  console.log('REGISTRAR admin role:', await contract.getRoleAdmin(REGISTRAR_ROLE));
}
main().catch(e => console.log('error:', e.message));
