// test.js
const assert = require('assert');
const { checkVPNConnection, connectVPN, disconnectVPN } = require('./utils');

// 测试 checkVPNConnection 函数
function testCheckVPNConnection() {
  console.log('Testing checkVPNConnection...');

  checkVPNConnection()
    .then((message) => {
      console.log(message); // 打印 VPN 连接状态
      assert.strictEqual(message, 'VPN is connected.', 'VPN is not connected.');
    })
    .catch((error) => {
      console.error(error);
      assert.strictEqual(error, 'VPN is not connected.', 'VPN is connected.');
    });
}

// 测试 connectVPN 函数
function testConnectVPN() {
  console.log('Testing connectVPN...');

  connectVPN()
    .then((message) => {
      console.log(message); // 打印 VPN 连接状态
      assert.strictEqual(message, 'VPN connected successfully.', 'VPN connection failed.');
    })
    .catch((error) => {
      console.error(error);
    });
}

// 测试 disconnectVPN 函数
function testDisconnectVPN() {
  console.log('Testing disconnectVPN...');

  disconnectVPN()
    .then((message) => {
      console.log(message); // 打印 VPN 断开状态
      assert.strictEqual(message, 'VPN disconnected successfully.', 'VPN disconnection failed.');
    })
    .catch((error) => {
      console.error(error);
      assert.strictEqual(error, 'Failed to disconnect VPN.', 'VPN disconnection succeeded unexpectedly.');
    });
}

// 运行测试
function runTests() {
  testCheckVPNConnection();
  testConnectVPN();
  // testDisconnectVPN();
}

runTests();
