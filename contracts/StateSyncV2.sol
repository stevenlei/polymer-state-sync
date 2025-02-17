// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPolymerProver {
    function validateEvent(
        bytes calldata proof
    )
        external
        view
        returns (
            uint32 chainId,
            address emittingContract,
            bytes memory topics,
            bytes memory data
        );
}

contract StateSyncV2 {
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

    // Example events for demonstration
    event OnlyTopics(
        address indexed sender,      // indexed (topic)
        bytes32 indexed hashedKey,   // indexed (topic)
        uint256 indexed version      // indexed (topic)
    );

    event OnlyData(
        string key,                  // not indexed (data)
        bytes value,                 // not indexed (data)
        uint256 nonce,              // not indexed (data)
        string message              // not indexed (data)
    );

    // Original ValueSet event (mixed topics and data)
    event ValueSet(
        address indexed sender,      // indexed (topic)
        string key,                  // not indexed (data)
        bytes value,                 // not indexed (data)
        uint256 nonce,              // not indexed (data)
        bytes32 indexed hashedKey,   // indexed (topic)
        uint256 version             // not indexed (data)
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

        // Emit topic-only event (easier to query, more gas efficient)
        emit OnlyTopics(
            msg.sender,
            hashedKey,
            newVersion
        );

        // Main event with both topics and data
        emit ValueSet(
            msg.sender,
            key,
            value,
            currentNonce,
            hashedKey,
            newVersion
        );

        // Emit data-only event (harder to query, less gas efficient)
        emit OnlyData(
            key,
            value,
            currentNonce,
            "State updated successfully"
        );
    }

    /**
     * @notice Process a cross-chain state update using a Polymer proof
     * @dev This function validates and processes proofs from source chain events
     * @param proof The proof bytes from Polymer prover
     *
     * Proof Validation and Decoding Process:
     * 1. Polymer Prover Returns:
     *    - sourceChainId (uint32): ID of the source chain
     *    - sourceContract (address): Address that emitted the event
     *    - topics (bytes): Concatenated event topics (3 x 32 bytes)
     *    - unindexedData (bytes): ABI-encoded non-indexed event parameters
     *
     * 2. Topics Decoding (3 x 32 bytes):
     *    - topics[0]: Event signature hash (keccak256 of event signature)
     *    - topics[1]: Indexed sender address (padded to 32 bytes)
     *    - topics[2]: Indexed hashedKey (bytes32)
     *
     * 3. Unindexed Data Decoding:
     *    Original Event: ValueSet(address indexed sender, string key, bytes value, uint256 nonce, bytes32 indexed hashedKey, uint256 version)
     *    Decoded as: (string, bytes, uint256, uint256)
     *    - string: key (skipped as we use hashedKey from topics)
     *    - bytes: value to store
     *    - uint256: nonce for replay protection
     *    - uint256: version for state updates
     *
     * 4. Replay Protection:
     *    - Creates unique proofHash from: sourceChainId + sourceContract + hashedKey + nonce
     *    - Checks if proofHash was previously used
     *
     * 5. Version Control:
     *    - Ensures new version is higher than current version
     *    - Updates version in storage
     *
     * 6. State Update:
     *    - Stores value using hashedKey
     *    - Sets key owner if not already set
     *    - Emits ValueUpdated event
     */
    function setValueFromSource(bytes calldata proof) external {
        // Step 1: Validate and decode the proof using Polymer's prover
        // Returns: sourceChainId, sourceContract, topics (3x32 bytes), and unindexed data
        (
            uint32 sourceChainId,
            address sourceContract,
            bytes memory topics,
            bytes memory unindexedData
        ) = polymerProver.validateEvent(proof);

        // Step 2: Split concatenated topics into individual 32-byte values
        bytes32[] memory topicsArray = new bytes32[](3);  // [eventSig, sender, hashedKey]
        require(topics.length >= 96, "Invalid topics length"); // 3 * 32 bytes

        // Use assembly for efficient memory operations when splitting topics
        assembly {
            // Skip first 32 bytes (length prefix of bytes array)
            let topicsPtr := add(topics, 32)
            
            // Load each 32-byte topic into the array
            // topicsArray structure: [eventSig, sender, hashedKey]
            for { let i := 0 } lt(i, 3) { i := add(i, 1) } {
                mstore(
                    add(add(topicsArray, 32), mul(i, 32)),
                    mload(add(topicsPtr, mul(i, 32)))
                )
            }
        }

        // Step 3: Verify this is the correct event type
        // This check is crucial for security:
        // 1. Ensures we're processing a ValueSet event, not any other event type
        // 2. Prevents processing of events from different contracts with same parameter structure
        // 3. Validates the exact parameter types and order match our expected format
        bytes32 expectedSelector = keccak256("ValueSet(address,string,bytes,uint256,bytes32,uint256)");
        require(topicsArray[0] == expectedSelector, "Invalid event signature");

        // Step 4: Extract indexed parameters from topics
        // Convert the padded address from bytes32 to address type
        address sender = address(uint160(uint256(topicsArray[1])));
        // Get the hashedKey directly (already bytes32)
        bytes32 hashedKey = topicsArray[2];

        // Step 5: Decode non-indexed event parameters
        // Original event: ValueSet(address indexed sender, string key, bytes value, uint256 nonce, bytes32 indexed hashedKey, uint256 version)
        (
            ,                       // skip key (we use hashedKey from topics)
            bytes memory value,     // actual value to store
            uint256 nonce,         // used for replay protection
            uint256 version        // used for version control
        ) = abi.decode(
            unindexedData, 
            (string, bytes, uint256, uint256)
        );

        // Step 6: Create and verify unique proof hash for replay protection
        bytes32 proofHash = keccak256(
            abi.encodePacked(sourceChainId, sourceContract, hashedKey, nonce)
        );
        require(!usedProofHashes[proofHash], "hashKey already used");
        usedProofHashes[proofHash] = true;

        // Step 7: Version control check
        require(
            version > keyVersions[hashedKey],
            "Version must be newer than current version"
        );
        keyVersions[hashedKey] = version;

        // Step 8: Update state
        store[hashedKey] = value;
        // Set the key owner if this is the first time this key is being used
        if (keyOwners[hashedKey] == address(0)) {
            keyOwners[hashedKey] = sender;
        }

        // Step 9: Emit event for indexing and tracking
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
