// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPolymerProver {
    function validateEvent(
        uint256 logIndex,
        bytes calldata proof
    )
        external
        view
        returns (
            string memory chainId,
            address emittingContract,
            bytes[] memory topics,
            bytes memory data
        );
}

contract StateSync {
    // Polymer prover contract
    IPolymerProver public immutable polymerProver;

    // Mapping from keccak256(abi.encodePacked(originalSender, key)) => value
    mapping(bytes32 => bytes) private store;
    // Mapping to track original senders for each key
    mapping(bytes32 => address) private keyOwners;
    // Mapping to track nonces for each sender
    mapping(address => uint256) private nonces;
    // Mapping to track used proof hashes
    mapping(bytes32 => bool) private usedProofHashes;
    // Mapping to track versions for each key
    mapping(bytes32 => uint256) private keyVersions;

    event ValueSet(
        address indexed sender,
        string key,
        bytes value,
        uint256 nonce,
        bytes32 indexed hashedKey,
        uint256 version
    );

    event ValueUpdated(bytes32 indexed hashedKey, bytes value, uint256 version);

    constructor(address _polymerProver) {
        polymerProver = IPolymerProver(_polymerProver);
    }

    // Get the current version of a key
    function getKeyVersion(
        address sender,
        string calldata key
    ) external view returns (uint256) {
        bytes32 hashedKey = keccak256(abi.encodePacked(sender, key));
        return keyVersions[hashedKey];
    }

    // Get the current version of a key by its hashed key
    function getKeyVersionByHash(
        bytes32 hashedKey
    ) external view returns (uint256) {
        return keyVersions[hashedKey];
    }

    // Set or update a value
    function setValue(string calldata key, bytes calldata value) external {
        bytes32 hashedKey = keccak256(abi.encodePacked(msg.sender, key));

        // If key exists, only original sender can update
        if (keyOwners[hashedKey] != address(0)) {
            require(
                keyOwners[hashedKey] == msg.sender,
                "Not authorized to update this key"
            );
        } else {
            keyOwners[hashedKey] = msg.sender;
        }

        store[hashedKey] = value;
        uint256 currentNonce = nonces[msg.sender]++;
        uint256 newVersion = keyVersions[hashedKey] + 1;
        keyVersions[hashedKey] = newVersion;

        // Pack the event data to include version
        emit ValueSet(
            msg.sender,
            key,
            value,
            currentNonce,
            hashedKey,
            newVersion
        );
    }

    // Function to be called by the relayer on the destination chain
    function setValueFromSource(
        uint256 logIndex,
        bytes calldata proof
    ) external {
        // Validate the event using Polymer's prover
        (
            string memory sourceChainId,
            address sourceContract,
            bytes[] memory topics,
            bytes memory eventData
        ) = polymerProver.validateEvent(logIndex, proof);

        // Extract sender from topic[1] and hashedKey from topic[2]
        address sender = address(uint160(uint256(bytes32(topics[1]))));
        bytes32 hashedKey = bytes32(topics[2]);

        // Decode the unindexed event data
        (, bytes memory value, uint256 nonce, uint256 version) = abi.decode(
            eventData,
            (string, bytes, uint256, uint256)
        );

        // Create a unique hash based on the event's unique identifiers including nonce
        bytes32 proofHash = keccak256(
            abi.encodePacked(sourceChainId, sourceContract, hashedKey, nonce)
        );
        require(!usedProofHashes[proofHash], "Proof already used");
        usedProofHashes[proofHash] = true;

        // Ensure the version is newer than what we have
        require(
            version > keyVersions[hashedKey],
            "Version must be newer than current version"
        );
        keyVersions[hashedKey] = version;

        // Store the value and emit event
        store[hashedKey] = value;
        if (keyOwners[hashedKey] == address(0)) {
            keyOwners[hashedKey] = sender;
        }

        emit ValueUpdated(hashedKey, value, version);
    }

    // Query a value
    function getValue(
        address originalSender,
        string calldata key
    ) external view returns (bytes memory) {
        bytes32 hashedKey = keccak256(abi.encodePacked(originalSender, key));
        return store[hashedKey];
    }
}
