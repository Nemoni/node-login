const express = require("express");
const WebSocket = require("ws");
const app = express();
const server = require("http").createServer(app);
const net = require('net');
const wss = new WebSocket.Server({ server });
const bodyParser = require('body-parser');
const session = require('express-session');
const useragent = require('useragent');

app.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: true, }));
// 从"public"目录提供静态网页
app.use(express.static('public'));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    console.log('username:' + username);
    console.log('password:' + password);
    if (username === 'pni' && password === '123456') {
        req.session.user = { username: 'pni', password: '123456' };
        res.redirect('chat.html');
    } else {
        res.status(401).send('Unauthorized');
    }
});
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});
app.get('/chat.html', (req, res) => {
    console.log('get chat.html');
    console.log('__dirname:' + __dirname);
    if (typeof req.session !== 'undefined' && typeof req.session.user !== 'undefined') {
        console.log('req.session.user:' + req.session.user);
        // 获取客户端的User Agent字符串
        let userAgentString = req.headers['user-agent'];
        // 使用useragent模块解析User Agent字符串
        let agent = useragent.parse(userAgentString);
        console.log('agent.device.type:' + agent.device.type);
        if (agent.device.type === 'mobile') {
            // 如果是手机，提供手机页面
            console.log('It is mobile.');
            res.sendFile(__dirname + '/public/mchat.html');
        } else {
            // 如果是电脑，提供电脑页面
            console.log('It is computer.');
            res.sendFile(__dirname + '/public/mchat.html');
        }
    } else {
        console.log('user not defined!');
        res.sendFile(__dirname + "/public/index.html");
    }
});

// 连接script进程
let socketTimer;
let client;
function socketConnection() {
    client = new net.Socket();
    client.connect(3001, '127.0.0.1', function () {
        console.log('Connected script process!');
    });
    client.on('error', (error) => {
        console.error(`Error: ${error.message}`);
        client.end();
    });
    client.on('close', () => {
        console.log('Connection with script closed');
        let text = '\xff';
        sendDataToHtml(text);
        socketTimer = setTimeout(socketConnection, 5000);
    });
    client.on('connect', () => {
        console.log('Connection with script established');
        clearTimeout(socketTimer);
        socketTimer = null;
        let text = '\xef'; // \f表示error，\e表示清除error
        sendDataToHtml(text);
    });
    // 接收到来自script脚本的数据
    client.on('data', function (data) {
        if (!data.processed) {
            data.processed = true;
            // 把数据发送给HTML页面
            //console.log('received data from script: ' + data);
            let text = Buffer.from(data).toString();
            if (data[data.length - 1] === 0xff) {
                text = text.slice(0, -1);
                text += '\0'; // \0表示数据发送结束
            }
            sendDataToHtml(text);
        }
    });
}

function sendDataToHtml(text) {
    wss.clients.forEach(function each(webclient) {
        if (webclient.readyState === WebSocket.OPEN) {
            //id = webclient.id;
            //console.log('Send to client: ' + id + ', data:' + text);
            // 发送数据给html
            webclient.send(text);
        } else {
            console.log("client is not open!");
        }
    });
}
// 连接script并注册回调函数
socketConnection();
sid = 1;
// 接收websocket连接
wss.on("connection", (socket) => {
    console.log('WebSocket connected!');
    socket.id = sid; 
    sid += 1;
    console.log("connection id:"+socket.id);
    // 接收到来自html的数据
    socket.on('message', function (data) {
        data = data + '';
        if (data.trim() !== "") {
            console.log('send data to script: ' + data);
            // 把来自html的数据发送给script脚本
            client.write(data);
        }
    });
    // websocket关闭时打印信息
    socket.on('close', () => {
        console.log('WebSocket connection closed!');
    });
});
wss.on('open', function open() {
    // 发送心跳消息
    setInterval(function ping() {
        wss.ping();
    }, 15000);
});
wss.on('error', function error(err) {
    console.log(`WebSocket error: ${err}`);
    // 停止心跳消息
    clearInterval(ping);
});
wss.on('close', function close() {
    console.log('WebSocket server closed!');
    // 停止心跳消息
    clearInterval(ping);
});

const PORT = 2221;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

