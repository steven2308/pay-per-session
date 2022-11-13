// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.16;

error AlreadyRegistered();
error CategoryNotFound();
error DuplicateCategory();
error InactiveSession();
error IncorrectRegisterPayment();
error IncorrectSessionFee();
error InvalidCategoryConfiguration();
error NotOwner();
error NotRegistered();
error NothingToWithdraw();

contract PayPerSession {
    struct Producer {
        address producer;
        string contentType;
        string contentDescription;
    }

    struct Category {
        string name;
        string description;
        uint256 fee;
        uint256 sessionDuration;
    }

    uint256 public constant BASE_POINTS = 10000;
    address private _owner;
    string private _name;
    string private _description;
    uint256 private _feeInBasePoints;
    uint256 private _registerPayment;

    Producer[] private _producers;
    mapping(address => bool) private _isProducer;
    mapping(address => mapping(string => bool)) private _isProducerCategory;
    mapping(address => Category[]) private _producerCategories;
    mapping(address => mapping(string => string[])) private _producerContent;
    mapping(address => uint256) private _producerClaimableRoyalties;
    uint256 private _platformClaimableRoyalties;

    // Maping from consumer to producer to category to end of session
    mapping(address => mapping(address => mapping(string => uint256)))
        private _endOfSession;

    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    modifier onlyProducer() {
        if (!_isProducer[msg.sender]) revert NotRegistered();
        _;
    }

    modifier validCategory(address producer, string memory category) {
        if (!_isProducerCategory[producer][category]) revert CategoryNotFound();
        _;
    }

    constructor(
        string memory name,
        string memory description,
        uint256 feeInBasePoints,
        uint256 registerPayment
    ) {
        _name = name;
        _description = description;
        _feeInBasePoints = feeInBasePoints;
        _registerPayment = registerPayment;
        _owner = msg.sender;
    }

    function getName() public view returns (string memory) {
        return _name;
    }

    function getDescription() public view returns (string memory) {
        return _description;
    }

    function getFeeInBasePoints() public view returns (uint256) {
        return _feeInBasePoints;
    }

    function getRegisterPayment() public view returns (uint256) {
        return _registerPayment;
    }

    function producers() public view returns (Producer[] memory) {
        return _producers;
    }

    function isProducer(address maybeProducer) public view returns (bool) {
        return _isProducer[maybeProducer];
    }

    function producerCategories(
        address producer
    ) public view returns (Category[] memory) {
        return _producerCategories[producer];
    }

    function producerClaimableRoyalties(
        address producer
    ) public view returns (uint256) {
        return _producerClaimableRoyalties[producer];
    }

    function platformClaimableRoyalties() public view returns (uint256) {
        return _platformClaimableRoyalties;
    }

    function updateRegisterPayment(uint256 newFee) public onlyOwner {
        _registerPayment = newFee;
    }

    function updatePlatformFee(uint256 newFeeInBasePoints) public onlyOwner {
        _feeInBasePoints = newFeeInBasePoints;
    }

    function register(
        string memory contentType,
        string memory contentDescription
    ) public payable {
        if (msg.value != _registerPayment) revert IncorrectRegisterPayment();
        if (_isProducer[msg.sender]) revert AlreadyRegistered();
        _isProducer[msg.sender] = true;
        _producers.push(
            Producer({
                producer: msg.sender,
                contentType: contentType,
                contentDescription: contentDescription
            })
        );
        _platformClaimableRoyalties += msg.value;
    }

    function addCategory(
        string memory name,
        string memory description,
        uint256 fee,
        uint sessionDuration
    ) public onlyProducer {
        if (fee == 0 || sessionDuration == 0)
            revert InvalidCategoryConfiguration();

        Category memory newCategory = Category({
            name: name,
            description: description,
            fee: fee,
            sessionDuration: sessionDuration
        });
        _producerCategories[msg.sender].push(newCategory);
        _isProducerCategory[msg.sender][name] = true;
    }

    function addContent(
        string memory category,
        string memory content
    ) public onlyProducer validCategory(msg.sender, category) {
        _producerContent[msg.sender][category].push(content);
    }

    function getContent(
        address consumer,
        address producer,
        string memory category
    )
        public
        view
        validCategory(producer, category)
        returns (string[] memory)
    {
        // This is playable, you can get content on others behalf.
        // But you would need to know who paid for what and you wouldn't be using the platform
        // We expect the platform to be good enough people are willing to pay for it and honor producers royalties
        if (!isSessionActive(consumer, producer, category))
            revert InactiveSession();
        return _producerContent[producer][category];
    }

    function activateSession(
        address producer,
        string memory category
    ) public payable validCategory(producer, category) {
        Category memory fullCategory = findCategory(producer, category);
        if (msg.value != fullCategory.fee) revert IncorrectSessionFee();
        
        _endOfSession[msg.sender][producer][category] =
            block.timestamp +
            fullCategory.sessionDuration;
        _distributeFee(producer);
    }

    function isSessionActive(
        address consumer,
        address producer,
        string memory category
    ) public view returns (bool) {
        return _endOfSession[consumer][producer][category] > block.timestamp;
    }

    function findCategory(
        address producer,
        string memory category
    ) public view returns (Category memory) {
        // TODO: This can be improved by storing a mapping of category to index or similar.
        Category memory fullCategory;
        uint256 len = _producerCategories[producer].length;
        bytes32 encodedCategoryName = keccak256(abi.encodePacked((category)));
        for (uint256 i; i < len; ) {
            if (
                keccak256(
                    abi.encodePacked((_producerCategories[producer][i].name))
                ) == encodedCategoryName
            ) {
                fullCategory = _producerCategories[producer][i];
                break;
            }
            unchecked {
                ++i;
            }
        }
        if (fullCategory.fee == 0) revert CategoryNotFound();

        return fullCategory;
    }

    function _distributeFee(address producer) private {
        uint256 platformPart = (msg.value * _feeInBasePoints) / BASE_POINTS;
        uint256 producerPart = msg.value - platformPart;
        _platformClaimableRoyalties += platformPart;
        _producerClaimableRoyalties[producer] += producerPart;
    }

    function claimPlatformRoyalties(address to) public onlyOwner {
        uint256 amount = _platformClaimableRoyalties;
        _platformClaimableRoyalties = 0;
        _withdraw(to, amount);
    }

    function claimProducerRoyalties(address to) public onlyProducer {
        uint256 amount = _producerClaimableRoyalties[msg.sender];
        _producerClaimableRoyalties[msg.sender] = 0;
        _withdraw(to, amount);
    }

    function _withdraw(address to, uint256 amount) private {
        if (amount == 0) revert NothingToWithdraw();
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed.");
    }
}
