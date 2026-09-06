// Draw the application's own pulse mark as a PNG, without external assets.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const size=512,raw=Buffer.alloc((size*4+1)*size);const pts=[[75,270],[165,270],[210,120],[310,390],[360,270],[440,270]];
function distance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*(size*4+1)+1+x*4,d=Math.min(...pts.slice(1).map((p,j)=>distance(x,y,pts[j],p))),mix=Math.max(0,Math.min(1,12-d));raw[i]=17*(1-mix)+110*mix;raw[i+1]=24*(1-mix)+231*mix;raw[i+2]=19*(1-mix)+173*mix;const edge=Math.max(0,64-x,x-447),ey=Math.max(0,64-y,y-447);raw[i+3]=edge*edge+ey*ey>64*64?0:255;}
function crc(b){let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(t,b){const body=Buffer.concat([Buffer.from(t),b]),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(b.length);sum.writeUInt32BE(crc(body));return Buffer.concat([len,body,sum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);const dest=path.join(__dirname,'../assets');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'icon.png'),png);console.log('Generated assets/icon.png');
