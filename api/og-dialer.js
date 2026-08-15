'use strict';

const zlib = require('zlib');
let cached;

const FONT = {
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'C':['01111','10000','10000','10000','10000','10000','01111'],
  'D':['11110','10001','10001','10001','10001','10001','11110'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'F':['11111','10000','10000','11110','10000','10000','10000'],
  'G':['01111','10000','10000','10111','10001','10001','01111'],
  'H':['10001','10001','10001','11111','10001','10001','10001'],
  'I':['11111','00100','00100','00100','00100','00100','11111'],
  'J':['00111','00010','00010','00010','10010','10010','01100'],
  'K':['10001','10010','10100','11000','10100','10010','10001'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'Q':['01110','10001','10001','10001','10101','10010','01101'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'W':['10001','10001','10001','10101','10101','10101','01010'],
  'X':['10001','10001','01010','00100','01010','10001','10001'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'Z':['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00001','01110'],
  '?':['01110','10001','00001','00010','00100','00000','00100'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],
  '_':['00000','00000','00000','00000','00000','00000','11111'],
  '.':['00000','00000','00000','00000','00000','00110','00110'],
  ':':['00000','00110','00110','00000','00110','00110','00000'],
  '(':['00010','00100','01000','01000','01000','00100','00010'],
  ')':['01000','00100','00010','00010','00010','00100','01000'],
  '*':['00000','10101','01110','11111','01110','10101','00000'],
  '#':['01010','11111','01010','01010','11111','01010','00000'],
  ' ':['00000','00000','00000','00000','00000','00000','00000']
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length,0); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([length,t,data,crc]);
}

function makeImage() {
  const width=1200, height=630, pixels=Buffer.alloc(width*height*3);
  const C={ bg:[6,14,22], bg2:[10,24,35], panel:[8,19,29], panel2:[14,29,41], border:[38,63,80], white:[239,247,252], muted:[113,139,157], cyan:[126,212,247], green:[69,214,151], dark:[3,14,20] };
  function px(x,y,c){ if(x<0||y<0||x>=width||y>=height)return; const i=(y*width+x)*3; pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2]; }
  function rect(x,y,w,h,c){ for(let yy=Math.max(0,y);yy<Math.min(height,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(width,x+w);xx++)px(xx,yy,c); }
  function outline(x,y,w,h,c,t=2){rect(x,y,w,t,c);rect(x,y+h-t,w,t,c);rect(x,y,t,h,c);rect(x+w-t,y,t,h,c);}
  function circle(cx,cy,r,c){const rr=r*r;for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy<=rr)px(x,y,c);}}
  function ring(cx,cy,r,c,t=2){const o=r*r,i=(r-t)*(r-t);for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){const dx=x-cx,dy=y-cy,d=dx*dx+dy*dy;if(d<=o&&d>=i)px(x,y,c);}}
  function text(str,x,y,scale,c,spacing=1){str=String(str).toUpperCase();let xx=x;for(const ch of str){const g=FONT[ch]||FONT['?'];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(g[row][col]==='1')rect(xx+col*scale,y+row*scale,scale,scale,c);xx+=(5+spacing)*scale;}return xx;}
  function centered(str,cx,y,scale,c,spacing=1){const w=String(str).length*(5+spacing)*scale-spacing*scale;text(str,Math.round(cx-w/2),y,scale,c,spacing);}

  for(let y=0;y<height;y++){const t=y/(height-1);const c=C.bg.map((v,i)=>Math.round(v+(C.bg2[i]-v)*t));rect(0,y,width,1,c);}
  // soft grid / aviation scan lines
  for(let x=0;x<width;x+=48)rect(x,0,1,height,[10,27,39]);
  for(let y=0;y<height;y+=48)rect(0,y,width,1,[10,27,39]);

  // Brand block
  rect(58,48,66,66,C.panel2);outline(58,48,66,66,C.cyan,2);text('24',71,67,5,C.cyan,0);
  text('24PILOT DEVIATION',148,57,5,C.white,1);
  text('ATC24 PILOT RESPONSE',148,91,2,C.muted,1);

  text('RECEIVED A',58,168,5,C.cyan,1);
  text('POSSIBLE PILOT',58,214,7,C.white,1);
  text('DEVIATION?',58,274,7,C.white,1);
  text('ENTER THE 24PD NUMBER PROVIDED BY ATC',58,354,2,C.muted,1);
  text('TO REVIEW THE REPORT AND RESPOND.',58,378,2,C.muted,1);

  // Steps
  const stepY=[449,493,537];
  ['1','2','3'].forEach((n,i)=>{circle(73,stepY[i],17,C.panel2);ring(73,stepY[i],17,C.cyan,2);centered(n,73,stepY[i]-10,3,C.white,0);});
  text('ENTER YOUR 24PD NUMBER',108,438,3,C.white,1); text('REVIEW THE CASE',108,482,3,C.white,1); text('SUBMIT YOUR RESPONSE',108,526,3,C.white,1);
  text('UNOFFICIAL ATC24 COMMUNITY SYSTEM',58,588,2,C.muted,1);

  // Dialer card
  rect(720,42,420,548,C.panel);outline(720,42,420,548,C.border,2);
  text('PILOT RESPONSE',754,70,3,C.cyan,1);
  rect(754,105,352,76,[7,24,36]);outline(754,105,352,76,C.border,2);
  centered('(555) 2__-____',930,131,4,C.white,1);
  text('24PD CONTACT',774,163,2,C.muted,1);

  const xs=[800,930,1060], ys=[232,316,400,484];
  const nums=[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']];
  let k=0;
  for(let r=0;r<4;r++)for(let c=0;c<3;c++){
    const [n,l]=nums[k++];circle(xs[c],ys[r],35,C.panel2);ring(xs[c],ys[r],35,C.border,2);centered(n,xs[c],ys[r]-18,5,C.white,0);if(l&&l!=='+')centered(l,xs[c],ys[r]+13,1,C.muted,1);
  }
  circle(930,552,31,C.green);
  // phone handset icon
  rect(915,537,7,16,C.dark);rect(938,552,7,12,C.dark);rect(921,550,20,7,C.dark);circle(919,539,6,C.dark);circle(941,560,6,C.dark);
  centered('LOCATE REPORT',930,604,2,C.cyan,1);

  const raw=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++){const row=y*(width*3+1);raw[row]=0;pixels.copy(raw,row+1,y*width*3,(y+1)*width*3);}
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

module.exports=function handler(req,res){if(!cached)cached=makeImage();res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','public, max-age=86400, s-maxage=86400');res.status(200).send(cached);};
