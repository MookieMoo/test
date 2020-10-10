
const port = 8080;
const gameSize = {x: 10000, y: 10000};


//taken from nengi update loop
const hrtimeMs = function() {
    let time = process.hrtime()
    return time[0] * 1000 + time[1] / 1000000
}

//server refresh rate set for low 5 ticks
const tickLengthMs = 1000 / 1;
const visionTickLengthMs = 1000; //vision is updated every second (will explain what this is)

var previousVisionTick = hrtimeMs();
var previousTick = hrtimeMs();

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


//perform all operations in a loop
var gameLoop = function () {
  let now = hrtimeMs()

  if (previousVisionTick + visionTickLengthMs <= now) {
    previousVisionTick = now;

    
  }

  if (previousTick + tickLengthMs <= now) {
    var delta = (now - previousTick) / 1000;
    previousTick = now;

    update();
    

    
  }

  if (hrtimeMs() - previousTick < tickLengthMs - 16) {
    setTimeout(gameLoop)
  } else {
    setImmediate(gameLoop)
  }
}

gameLoop();

