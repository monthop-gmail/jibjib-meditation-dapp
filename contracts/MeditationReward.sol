// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract MeditationReward {
    string public name = "JIBJIB Meditation Reward";
    string public symbol = "JIBJIB";
    uint8 public decimals = 18;

    uint256 public constant MEDITATION_DURATION = 300 seconds;

    mapping(address => uint256) public lastMeditationTime;
    mapping(address => bool) public hasClaimedToday;
    mapping(address => uint256) public totalMeditationSessions;

    address public owner;
    address[] public supportedTokens;
    mapping(address => uint256) public rewardAmounts;
    mapping(address => bool) public isTokenSupported;
    
    mapping(address => uint256) public tokenBalances;
    uint256 public nativeBalance;

    event MeditationStarted(address indexed user, uint256 timestamp);
    event MeditationCompleted(address indexed user, uint256 reward, address token);
    event RewardClaimed(address indexed user, uint256 amount, address token);
    event Donated(address indexed donor, address token, uint256 amount);
    event Withdrawn(address indexed owner, address token, uint256 amount);
    event TokenRewardSet(address indexed token, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        supportedTokens.push(address(0));
        isTokenSupported[address(0)] = true;
    }

    function startMeditation() external {
        require(lastMeditationTime[msg.sender] == 0, "Already meditating");
        lastMeditationTime[msg.sender] = block.timestamp;
        emit MeditationStarted(msg.sender, block.timestamp);
    }

    function completeMeditation(address token) external {
        require(lastMeditationTime[msg.sender] > 0, "No active meditation");
        require(
            block.timestamp - lastMeditationTime[msg.sender] >= MEDITATION_DURATION,
            "Meditation not complete"
        );
        require(isTokenSupported[token], "Token not supported");
        
        uint256 reward = rewardAmounts[token];
        require(reward > 0, "Reward not set for this token");

        lastMeditationTime[msg.sender] = 0;
        totalMeditationSessions[msg.sender]++;

        if (token == address(0)) {
            require(nativeBalance >= reward, "Insufficient native balance");
            nativeBalance -= reward;
            payable(msg.sender).transfer(reward);
        } else {
            require(tokenBalances[token] >= reward, "Insufficient token balance");
            tokenBalances[token] -= reward;
            IERC20(token).transfer(msg.sender, reward);
        }

        emit MeditationCompleted(msg.sender, reward, token);
        emit RewardClaimed(msg.sender, reward, token);
    }

    function getRewardAmount(address token) external view returns (uint256) {
        return rewardAmounts[token];
    }

    function getMeditationDuration() external pure returns (uint256) {
        return MEDITATION_DURATION;
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function getUserStats(address user) external view returns (
        uint256 totalSessions,
        uint256 lastSessionTime,
        bool isMeditating
    ) {
        return (
            totalMeditationSessions[user],
            lastMeditationTime[user],
            lastMeditationTime[user] > 0
        );
    }

    function setRewardAmount(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        rewardAmounts[token] = amount;
        if (!isTokenSupported[token]) {
            supportedTokens.push(token);
            isTokenSupported[token] = true;
        }
        emit TokenRewardSet(token, amount);
    }

    function donate(address token, uint256 amount) external payable {
        if (token == address(0)) {
            nativeBalance += msg.value;
            emit Donated(msg.sender, address(0), msg.value);
        } else {
            require(amount > 0, "Invalid amount");
            IERC20(token).transferFrom(msg.sender, address(this), amount);
            tokenBalances[token] += amount;
            emit Donated(msg.sender, token, amount);
        }
    }

    function getTokenBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return nativeBalance;
        }
        return tokenBalances[token];
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        
        if (token == address(0)) {
            require(nativeBalance >= amount, "Insufficient balance");
            nativeBalance -= amount;
            payable(owner).transfer(amount);
            emit Withdrawn(owner, address(0), amount);
        } else {
            require(tokenBalances[token] >= amount, "Insufficient balance");
            tokenBalances[token] -= amount;
            IERC20(token).transfer(owner, amount);
            emit Withdrawn(owner, token, amount);
        }
    }

    receive() external payable {
        nativeBalance += msg.value;
    }
}
