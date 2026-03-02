// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IClawIdentity {
    function isActive(bytes32 didHash) external view returns (bool);
    function getController(bytes32 didHash) external view returns (address);
}
