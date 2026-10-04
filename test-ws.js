const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws'); // wait, let's check if ws is installed or use node 22 WebSocket

console.log('Testing WebSocket support:', typeof WebSocket !== 'undefined' || typeof global.WebSocket !== 'undefined');
