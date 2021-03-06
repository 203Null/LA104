COMM.onConnect = () =>
{
  COMM.send("ahoj");
  COMM.onReceive = x => {
    var buf = new Uint8Array(x.buffer);
    process(buf);
//  console.log(x.byteLength);
  }
}

class Preview
{
  constructor(id)
  {
    this.elem = document.querySelector(id);
    this.width = this.elem.width;
    this.height = this.elem.height;
    this.ctx = this.elem.getContext("2d");
  }

  clear()
  {
    this.elem.width = this.elem.width;
  }

  drawPoly(p, c, w)
  {
    this.ctx.strokeStyle = c;
    this.ctx.lineJoin="round";
    this.ctx.lineWidth = w ? w : 1;
    this.ctx.beginPath();

    this.ctx.moveTo(p[0].x, p[0].y);
    for (var i=0; i<p.length; i++)
      this.ctx.lineTo(p[i].x, p[i].y);
    this.ctx.stroke();
  }

  drawLine(p, c, w)
  {
    this.ctx.strokeStyle = c;
    this.ctx.lineJoin="round";
    this.ctx.lineWidth = w ? w : 1;
    this.ctx.beginPath();

    this.ctx.moveTo(p[0].x, p[0].y);
    this.ctx.lineTo(p[1].x, p[1].y);
    this.ctx.stroke();
  }
}

var preview = new Preview("#canvas");

window.document.addEventListener('OscDataChanged', (e) => { 
  var data1 = e.detail.wave[0];
  var data2 = e.detail.wave[1];
  var trigger = e.detail.trigThreshold;
  var ypos = y => preview.height-y*preview.height/256;
  var points1 = [], points2 = [];
  var l = data1.length;
  for (var i=0; i<l; i++)
  {
    points1.push({x:i/l*preview.width, y:ypos(data1[i])});
    points2.push({x:i/l*preview.width, y:ypos(data2[i])});
  }
  preview.clear();
  preview.drawPoly([{x:0, y:ypos(trigger)}, {x:preview.width, y:ypos(trigger)}], "#d0d0d0");
  preview.drawPoly(points1, "#b00000");
  preview.drawPoly(points2, "#0000b0");
}, false);


function drawSignal(signal, length)
{
  var ypos = y => preview.height-y*preview.height/256;
  var points = [];
  var l = 1000;

  preview.clear();
  for (var i=0; i<length; i+=4)
  {
    preview.drawLine([
      {x:(i/4)/l*preview.width, y:ypos(signal[i+2])},
      {x:(i/4)/l*preview.width, y:ypos(signal[i+3])}
    ], "rgba(255, 0, 0, 0.1)");
  }

  for (var i=0; i<length; i+=4)
  {
    if (signal[i+1] > 0)
    preview.drawLine([
      {x:(i/4)/l*preview.width, y:ypos(signal[i+0]-signal[i+1])},
      {x:(i/4)/l*preview.width, y:ypos(signal[i+0]+signal[i+1])}
    ], "rgba(255, 0, 0, 0.5)");
  }

  for (var i=0; i<length; i+=4)
  {
    points.push({x:(i/4)/l*preview.width, y:ypos(signal[i+0])});
  }
  preview.drawPoly(points, "#b00000");
}

var mipmaps = null;
var mipindex = null;

function calcDeviation(arr)
{
  if (arr.length<2)
    return 0;

  var mean = 0; 
  for (var i in arr)
    mean += arr[i];
  mean /= arr.length;

  var variance = 0;
  for (var i in arr)
    variance += (arr[i] - mean)*(arr[i] - mean);

  variance /= arr.length;
  var deviation = Math.sqrt(variance);
  return deviation;
}

// 
function resizeArray(arr)
{
//return arr;
  var l = arr.length*2;
  console.log("resizing " + arr.length + " -> " + l);
  var narr = new Uint8Array(l);
  for (var i=0; i<arr.length; i++)
    narr[i] = arr[i];
  return narr;
}

function pushSample(s)
{
//var memory = new Uint8Array(20000);

  if (s<20)
  {
    var f = 9;
  }

  if (!mipmaps)
  {
    mipmaps = [new Uint8Array(1000)];
    mipindex = [0];
  }

  s = [s, 0, s, s]; // sample, min, max, avg, sigma

  var index = 0;
  while (1)
  {
    if (mipindex[index] + 4 > mipmaps[index].length)
    {
      mipmaps[index] = resizeArray(mipmaps[index]);
    }

    var mipsignal = mipmaps[index];
    var si = mipindex[index];

    mipsignal[si++] = s[0];
    mipsignal[si++] = s[1];
    mipsignal[si++] = s[2];
    mipsignal[si++] = s[3];
    mipindex[index] += 4;

    if (((mipindex[index]/4) % 2) == 0) 
    {
      var s0i = mipindex[index]-4;
      var s0 = [mipsignal[s0i++], mipsignal[s0i++], mipsignal[s0i++], mipsignal[s0i++]];
      var s1i = mipindex[index]-8;
      var s1 = [mipsignal[s1i++], mipsignal[s1i++], mipsignal[s1i++], mipsignal[s1i++]];
      var deviation = 0;

      var eight = [];

      if (index > 4)
      {
        var mipeight = mipmaps[index-4];
        for (var j=mipindex[index-4]-16*4; j<mipindex[index-4]; j+=4)
          eight.push(mipeight[j]);
      }

      deviation = calcDeviation(eight);

      s = [Math.floor((s0[0] + s1[0])/2), deviation, Math.min(s0[2], s1[2]), Math.max(s0[3], s1[3])];

      index++;
      if (index >= mipmaps.length)
      {
        mipmaps.push(new Uint8Array(1024));
        mipindex.push(0);
      }
    } else
      break;
  }
}

function process(signal)
{
  for (var i=0; i<signal.length; i++)
    pushSample(signal[i]);
}

var lastlen = 0;
setInterval(()=>
{
  if (!mipmaps)
    return;
  var usemip=0;
  for (usemip=0; usemip<mipindex.length; usemip++)
  {
    if (mipindex[usemip]/4 > 800)
      continue;
    else
      break;
  }
//  console.log(mipindex, usemip);
  var curlen = mipindex[usemip];
  if (Math.abs(curlen/4 - lastlen/4) < 10)
    return;
  lastlen = curlen;
  drawSignal(mipmaps[usemip], mipindex[usemip]);
}, 100);
