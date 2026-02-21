// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MeditationReward {
    string public name = "JIBJIB Meditation Reward";
    string public symbol = "JIBJIB";
    uint8 public decimals = 18;

    uint256 public constant REWARD_AMOUNT = 1 * 10**18;
    uint256 public constant MEDITATION_DURATION = 300 seconds;

    mapping(address => uint256) public lastMeditationTime;
    mapping(address => bool) public hasClaimedToday;
    mapping(address => uint256) public totalMeditationSessions;

    address public owner;
    address public rewardToken;

    event MeditationStarted(address indexed user, uint256 timestamp);
    event MeditationCompleted(address indexed user, uint256 reward);
    event RewardClaimed(address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function startMeditation() external {
        require(lastMeditationTime[msg.sender] == 0, "Already meditating");
        lastMeditationTime[msg.sender] = block.timestamp;
        emit MeditationStarted(msg.sender, block.timestamp);
    }

    function completeMeditation() external {
        require(lastMeditationTime[msg.sender] > 0, "No active meditation");
        require(
            block.timestamp - lastMeditationTime[msg.sender] >= MEDITATION_DURATION,
            "Meditation not complete"
        );

        lastMeditationTime[msg.sender] = 0;
        totalMeditationSessions[msg.sender]++;

        emit MeditationCompleted(msg.sender, REWARD_AMOUNT);
        emit RewardClaimed(msg.sender, REWARD_AMOUNT);
    }

    function getRewardAmount() external pure returns (uint256) {
        return REWARD_AMOUNT;
    }

    function getMeditationDuration() external pure returns (uint256) {
        return MEDITATION_DURATION;
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

    function setRewardToken(address _token) external onlyOwner {
        rewardToken = _token;
    }

    function withdrawTokens(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(0), "Invalid token");
        require(_amount > 0, "Invalid amount");
    }
}
