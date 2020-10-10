
const port = 8080;
const gameSize = {x: 10000, y: 10000};

const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });
});

function update(){
    wss.clients.forEach(client=>{
        client.send("test");
    })
}


var tickLengthMs = 1000 / 20

/* gameLoop related variables */
// timestamp of each loop
var previousTick = Date.now()
// number of times gameLoop gets called
var actualTicks = 0

var gameLoop = function () {
  var now = Date.now()

  actualTicks++
  if (previousTick + tickLengthMs <= now) {
    var delta = (now - previousTick) / 1000
    previousTick = now

    update(delta)

    console.log('delta', delta, '(target: ' + tickLengthMs +' ms)', 'node ticks', actualTicks)
    actualTicks = 0
  }

  if (Date.now() - previousTick < tickLengthMs - 16) {
    setTimeout(gameLoop)
  } else {
    setImmediate(gameLoop)
  }
}

