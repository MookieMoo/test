
const uWS = require('uWebSockets.js');
const port = 8080;
const gameSize = {x: 10000, y: 10000};


//taken from nengi update loop
const hrtimeMs = function() {
    let time = process.hrtime()
    return time[0] * 1000 + time[1] / 1000000
}

//will be used to write binary data for clients to unpack
function buffWriter(byteSize){
    this.idx = 0;
    this.arrayBuffer = new ArrayBuffer(byteSize);
    this.buffer = new Uint8Array(this.arrayBuffer, 0, byteSize);
}

//pack a byte 255
buffWriter.prototype.packInt8 = function(int8){
    this.buffer[this.idx] = 0xff & int8;
    this.idx++;
}

// 2 bytes 65535
buffWriter.prototype.packInt16 = function(int16){
    this.buffer[this.idx] = 0xff & int16, //low 
    this.buffer[this.idx+1] = int16 >> 8 & 0xff, //high
    this.idx+=2;
}

//get the buffer
buffWriter.prototype.getBuffer = function(){
    const buf = new Uint8Array(this.buffer, 0, this.idx);
    return this.idx = 0, 
        buf;
}

//send the stored buffer and reset for a new arraybuffer to be written to
buffWriter.prototype.send = function(ws){
    if(this.idx > this.arrayBuffer.byteLength) console.log("Pool wasnt big enough");
    ws.send(new Uint8Array(this.arrayBuffer, 0, this.idx), true),
    this.idx = 0;
}

//spatial hash that uses bitshift to shift values down by in my case 2^9 
function makeKeysFn(shift) {
    return function(obj) {
      return "" + (obj.x >> shift) + ":" + (obj.y >> shift);
    };
} 

//same as above but supports widtha and height, returning an array of keys
function makeViewPort(shift) {
    return function(x, y, w ,h) {
        var sx = x >> shift,
          sy = y >> shift,
          ex = (x + w) >> shift,
          ey = (y + h) >> shift,
          x, y, keys = [];
        for(y=sy;y<=ey;y++) {
          for(x=sx;x<=ex;x++) {
            keys.push("" + x + ":" + y);
          }
        }
        return keys;
    }
}  

//Constructor for the spatial hash
function SpatialHash(power_of_two = 8) {
    this.getKeys = makeKeysFn(power_of_two);
    this.getViewportKeys = makeViewPort(power_of_two);
    this.hash = {};
  }

  
  //clear it to rebuild for new entities
  SpatialHash.prototype.clear = function() {
    var key;
    for (key in this.hash) {
      if (this.hash[key].length === 0) {
        delete this.hash[key];
      } else {
        this.hash[key] = [];
      }
    }
  };

SpatialHash.prototype.rebuild = function(objects) {
    let obj, key
    for(let i = 0 ; i < objects.length; i++){
        obj = objects[i];
        key = this.getKeys(obj);
        if (this.hash[key]) {
            this.hash[key].push(obj);
        } else {
            this.hash[key] = [obj];
        }
    }
  };

  //Insert method to readd entities
  SpatialHash.prototype.insert = function(obj) {
    var key = this.getKeys(obj);
    if (this.hash[key]) {
        this.hash[key].push(obj);
    } else {
        this.hash[key] = [obj];
    }
  };
  
  //retreives entities within an aera
  SpatialHash.prototype.retrieve = function(x, y, w ,h) {
    var ret = [], keys, i, key;
    keys = this.getViewportKeys(x,y, w, h);
    for (i=0;i<keys.length;i++) {
      key = keys[i];
      if (this.hash[key]) {
        ret.push(...this.hash[key]);
      }
    }
    return ret;
  };


  //create our buffer writer with 2048 bytes of pool
const bufferWriter = new buffWriter(2048);

//declare server
//players with be stored here
const players = [];

//clamp values between two ints
function clamp(num, min, max) {
    return num <= min ? min : num >= max ? max : num;
  }


  //Player structure
class Player{
    constructor(ws){
        this.x = 400;
        this.y = 400;
        this.id = null;
        this.direction = 0;
        this.speed = 200;
        this.visible_entities = [];
        this.active = true;
        this.ws = ws;
        this.lastVisionSync = +new Date();
    }
}

const app = uWS./*SSL*/App({
    key_file_name: 'misc/key.pem',
    cert_file_name: 'misc/cert.pem',
    passphrase: '1234'
  }).ws('/*', {
    /* Options */
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 100,
    /* Handlers */
    open: (ws) => {

        if(players.length > 65535){
            //game is full
            ws.close();
            return;
        }
        //instantiate Player structure
        ws.player = new Player(ws);
        ws.player.id = players.length;
        ws.player.x = Math.random() * gameSize.x;
        ws.player.y = Math.random() * gameSize.y;
    
        //respond with id and positionto the client
        ws.send(JSON.stringify([
            ws.player.id, ws.player.x, ws.player.y
        ]));
        // add reference of player to the players structure
    
        players.push(ws.player);

    },
    message: (ws, message, isBinary) => {
    
        if(message instanceof ArrayBuffer){
            data = new Uint8Array(message);
            ws.player.direction = data[0];
        }
    },
    drain: (ws) => {
      console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
    },
    close: (ws, code, message) => {
        for(let i = 0 ; i < players.length; i++){
            if(players[i] === ws.player){
                players.splice(i, 1);
                ws.player = null
                return;
            }
        }
    }
  }).any('/*', (res, req) => {
    res.end('Nothing to see here!');
  }).listen(port, (token) => {
    if (token) {
      console.log('Listening to port ' + port);
    } else {
      console.log('Failed to listen to port ' + port);
    }
  });


const spatialHash = new SpatialHash(9);


//server refresh rate set for low 5 ticks
const tickLengthMs = 1000 / 5;
const visionTickLengthMs = 1000; //vision is updated every second (will explain what this is)

var previousVisionTick = hrtimeMs();
var previousTick = hrtimeMs();


//sync all players inside of the players 'visible entities' array if they have moved or performaned update
function buildSyncPacket(player){
    if(player.visible_entities === 0) retuWrn;
    bufferWriter.idx = 0;
    bufferWriter.packInt8(0);
    let entity_to_sync;
    let total = 0;
    for(let i = 0 ; i < player.visible_entities.length; i++){
        entity_to_sync = player.visible_entities[i];
        if(!entity_to_sync.active) continue;
        total++;
        bufferWriter.packInt16(entity_to_sync.id);
        bufferWriter.packInt16(entity_to_sync.x)
        bufferWriter.packInt16(entity_to_sync.y);
    }
    if(total > 0){
        bufferWriter.send(player.ws);
    }
}

//sync all players
function sync(){

    //this needs work
    let player;
    for(let i = 0 ; i < players.length; i++){
        player = players[i];
        buildSyncPacket(player);
    }
}

//calculate the players vision
function updateVision(){
    let left_viewport;
    let entered_viewport;
    let player;
    let in_view;
    let e;
    let i;
    let l;
    for(i = 0 ; i < players.length; i++){
        player = players[i];
    

        //get all objects in the players vision
        in_view = spatialHash.retrieve(player.x - 600, player.y - 600, 1200, 1200)


        //calculate the differneces in arrays to get what has entered the vision
        //and to get what has left
        left_viewport = player.visible_entities.filter(x => !in_view.includes(x));
        entered_viewport = in_view.filter(x => !player.visible_entities.includes(x)); 

        //update the player with what has left and thus can be destroyed
        if(left_viewport.length > 0){
            bufferWriter.idx = 0;
            bufferWriter.packInt8(1);
            for(l = 0; l < left_viewport.length; l++){
                bufferWriter.packInt16(left_viewport[l].id);
            }
            bufferWriter.send(player.ws);
        }

        //and what has been created and thus needs to be instantiated locally
        if(entered_viewport.length > 0){
            bufferWriter.idx = 0;
            bufferWriter.packInt8(2);
            for( e = 0; e < entered_viewport.length; e++){
                bufferWriter.packInt16(entered_viewport[e].id);
                bufferWriter.packInt16(entered_viewport[e].x);
                bufferWriter.packInt16(entered_viewport[e].y);
            }
            bufferWriter.send(player.ws);
        }

        //set the new list of visible entities to what was returned from spatial hash
        player.visible_entities = in_view;
    }
}

//updates all entities based on their direction
function update(delta){
    let player;
    let speed;
    let i;
    for(i = 0 ; i < players.length; i++){
        player = players[i];
        if(player.direction){ //remember direction is  a power of 2
            player.active = true;
            speed = player.speed;
            if((player.direction & 1) === 1){ //so it can be used to calculate direction
                player.y -= speed * delta;
            }else if((player.direction & 4) === 4){
                player.y += speed * delta;
            }
            
            if((player.direction & 2) === 2){ 
                player.x += speed * delta
            }else if((player.direction & 8) === 8){
                player.x -= speed * delta;
            }
        }else{
            player.active = false;
        }

        player.x = clamp(player.x, 0, gameSize.x);
        player.y = clamp(player.y, 0, gameSize.y);
    }


    //clear the spatial hash and rebuild it
    spatialHash.clear();

    spatialHash.rebuild(players);
}


//perform all operations in a loop
var gameLoop = function () {
  let now = hrtimeMs()

  if (previousVisionTick + visionTickLengthMs <= now) {
    previousVisionTick = now;

    let start = hrtimeMs();
    updateVision();
    let end = hrtimeMs();
    console.log("Vision took", end-start);
  }

  if (previousTick + tickLengthMs <= now) {
    var delta = (now - previousTick) / 1000;
    previousTick = now;

    let start = hrtimeMs();
    update(delta);
    sync();
    let end = hrtimeMs();
    console.log("Sync and update", end-start);

    
  }

  if (hrtimeMs() - previousTick < tickLengthMs - 16) {
    setTimeout(gameLoop)
  } else {
    setImmediate(gameLoop)
  }
}

gameLoop();

