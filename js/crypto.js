// Self-contained Bitcoin primitives: SHA-256, RIPEMD-160, secp256k1 (BigInt), Base58Check.
// Loaded by the page and by the cracker worker (importScripts). Exposes window/self.PuzzleCrypto.
(function(root){
  'use strict';
  /* ---------- SHA-256 ---------- */
  var K256 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var W = new Int32Array(64);
  function sha256(msg){
    var len = msg.length, bitLen = len * 8;
    var padLen = ((len + 8) >> 6 << 6) + 64;
    var buf = new Uint8Array(padLen);
    buf.set(msg); buf[len] = 0x80;
    buf[padLen-4] = (bitLen >>> 24) & 255; buf[padLen-3] = (bitLen >>> 16) & 255; buf[padLen-2] = (bitLen >>> 8) & 255; buf[padLen-1] = bitLen & 255;
    var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    for(var off=0; off<padLen; off+=64){
      for(var i=0;i<16;i++) W[i]=(buf[off+i*4]<<24)|(buf[off+i*4+1]<<16)|(buf[off+i*4+2]<<8)|buf[off+i*4+3];
      for(i=16;i<64;i++){ var w15=W[i-15], w2=W[i-2];
        var s0=((w15>>>7)|(w15<<25))^((w15>>>18)|(w15<<14))^(w15>>>3);
        var s1=((w2>>>17)|(w2<<15))^((w2>>>19)|(w2<<13))^(w2>>>10);
        W[i]=(W[i-16]+s0+W[i-7]+s1)|0; }
      var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for(i=0;i<64;i++){
        var S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
        var ch=(e&f)^(~e&g);
        var t1=(h+S1+ch+K256[i]+W[i])|0;
        var S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
        var maj=(a&b)^(a&c)^(b&c);
        var t2=(S0+maj)|0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
    }
    var out = new Uint8Array(32), H=[h0,h1,h2,h3,h4,h5,h6,h7];
    for(i=0;i<8;i++){ out[i*4]=H[i]>>>24; out[i*4+1]=(H[i]>>>16)&255; out[i*4+2]=(H[i]>>>8)&255; out[i*4+3]=H[i]&255; }
    return out;
  }
  /* ---------- RIPEMD-160 ---------- */
  var RL=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
  var RR=[5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
  var SL=[11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
  var SR=[8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];
  var KL=[0x00000000,0x5A827999,0x6ED9EBA1,0x8F1BBCDC,0xA953FD4E], KR=[0x50A28BE6,0x5C4DD124,0x6D703EF3,0x7A6D76E9,0x00000000];
  function rotl(x,n){ return (x<<n)|(x>>>(32-n)); }
  function rf(j,x,y,z){ return j<16 ? x^y^z : j<32 ? (x&y)|(~x&z) : j<48 ? (x|~y)^z : j<64 ? (x&z)|(y&~z) : x^(y|~z); }
  var X = new Int32Array(16);
  function ripemd160(msg){
    var len=msg.length, bitLen=len*8;
    var padLen=((len+8)>>6<<6)+64;
    var buf=new Uint8Array(padLen); buf.set(msg); buf[len]=0x80;
    buf[padLen-8]=bitLen&255; buf[padLen-7]=(bitLen>>>8)&255; buf[padLen-6]=(bitLen>>>16)&255; buf[padLen-5]=(bitLen>>>24)&255;
    var h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
    for(var off=0;off<padLen;off+=64){
      for(var i=0;i<16;i++) X[i]=buf[off+i*4]|(buf[off+i*4+1]<<8)|(buf[off+i*4+2]<<16)|(buf[off+i*4+3]<<24);
      var al=h0,bl=h1,cl=h2,dl=h3,el=h4, ar=h0,br=h1,cr=h2,dr=h3,er=h4, t;
      for(var j=0;j<80;j++){
        var r=j>>4;
        t=(rotl((al+rf(j,bl,cl,dl)+X[RL[j]]+KL[r])|0,SL[j])+el)|0; al=el; el=dl; dl=rotl(cl,10); cl=bl; bl=t;
        t=(rotl((ar+rf(79-j,br,cr,dr)+X[RR[j]]+KR[r])|0,SR[j])+er)|0; ar=er; er=dr; dr=rotl(cr,10); cr=br; br=t;
      }
      t=(h1+cl+dr)|0; h1=(h2+dl+er)|0; h2=(h3+el+ar)|0; h3=(h4+al+br)|0; h4=(h0+bl+cr)|0; h0=t;
    }
    var out=new Uint8Array(20), H=[h0,h1,h2,h3,h4];
    for(i=0;i<5;i++){ out[i*4]=H[i]&255; out[i*4+1]=(H[i]>>>8)&255; out[i*4+2]=(H[i]>>>16)&255; out[i*4+3]=(H[i]>>>24)&255; }
    return out;
  }
  function hash160(msg){ return ripemd160(sha256(msg)); }

  /* ---------- secp256k1 ---------- */
  var P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  var N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  var GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
  var GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  function mod(a){ var r = a % P; return r < 0n ? r + P : r; }
  function inv(a){ // extended Euclid on BigInt
    var lm=1n, hm=0n, low=mod(a), high=P;
    while(low > 1n){ var r=high/low; var nm=hm-lm*r, nw=high-low*r; hm=lm; lm=nm; high=low; low=nw; }
    return mod(lm);
  }
  // Jacobian arithmetic for scalar multiplication.
  function jDouble(X1,Y1,Z1){
    if(Y1===0n) return [0n,1n,0n];
    var S=mod(4n*X1*Y1*Y1), M=mod(3n*X1*X1);
    var X3=mod(M*M-2n*S), Y3=mod(M*(S-X3)-8n*Y1*Y1*Y1*Y1), Z3=mod(2n*Y1*Z1);
    return [X3,Y3,Z3];
  }
  function jAdd(X1,Y1,Z1,X2,Y2,Z2){
    if(Z1===0n) return [X2,Y2,Z2]; if(Z2===0n) return [X1,Y1,Z1];
    var Z1Z1=mod(Z1*Z1), Z2Z2=mod(Z2*Z2), U1=mod(X1*Z2Z2), U2=mod(X2*Z1Z1), S1=mod(Y1*Z2*Z2Z2), S2=mod(Y2*Z1*Z1Z1);
    var H=mod(U2-U1), R=mod(S2-S1);
    if(H===0n){ return R===0n ? jDouble(X1,Y1,Z1) : [0n,1n,0n]; }
    var HH=mod(H*H), HHH=mod(HH*H), V=mod(U1*HH);
    var X3=mod(R*R-HHH-2n*V), Y3=mod(R*(V-X3)-S1*HHH), Z3=mod(Z1*Z2*H);
    return [X3,Y3,Z3];
  }
  function toAffine(J){ if(J[2]===0n) return null; var zi=inv(J[2]), zi2=mod(zi*zi); return [mod(J[0]*zi2), mod(J[1]*zi2*zi)]; }
  function mulG(k){ // k*G, affine [x,y]
    k = k % N; if(k===0n) return null;
    var R=[0n,1n,0n], Q=[GX,GY,1n];
    while(k>0n){ if(k & 1n){ R=jAdd(R[0],R[1],R[2],Q[0],Q[1],Q[2]); } Q=jDouble(Q[0],Q[1],Q[2]); k >>= 1n; }
    return toAffine(R);
  }
  // Affine addition of G to many points at once using one batched inversion (Montgomery trick).
  // pts: array of [x,y]; mutates in place to pts[i] + G. Returns pts.
  function batchAddG(pts){
    var n=pts.length, d=new Array(n), acc=1n, prefix=new Array(n);
    for(var i=0;i<n;i++){ var dx=mod(GX-pts[i][0]); d[i]= dx===0n ? mod(2n*pts[i][1]) : dx; prefix[i]=acc; acc=mod(acc*d[i]); }
    var ai=inv(acc);
    for(i=n-1;i>=0;i--){
      var di=mod(ai*prefix[i]); ai=mod(ai*d[i]);
      var x=pts[i][0], y=pts[i][1];
      var l = (x===GX) ? mod(3n*x*x*di) : mod((GY-y)*di);
      var x3=mod(l*l-x-GX), y3=mod(l*(x-x3)-y);
      pts[i][0]=x3; pts[i][1]=y3;
    }
    return pts;
  }
  function compressed(pt, out){ // 33-byte compressed pubkey into out (Uint8Array(33))
    out = out || new Uint8Array(33);
    out[0] = (pt[1] & 1n) ? 3 : 2;
    var x = pt[0];
    for(var i=32;i>=1;i--){ out[i]=Number(x & 255n); x >>= 8n; }
    return out;
  }
  /* ---------- Base58Check ---------- */
  var ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58encode(bytes){
    var n=0n; for(var i=0;i<bytes.length;i++) n=(n<<8n)+BigInt(bytes[i]);
    var s=''; while(n>0n){ s=ALPHA[Number(n%58n)]+s; n/=58n; }
    for(i=0;i<bytes.length && bytes[i]===0;i++) s='1'+s;
    return s;
  }
  function b58decode(str){
    var n=0n; for(var i=0;i<str.length;i++){ var v=ALPHA.indexOf(str[i]); if(v<0) throw new Error('bad base58'); n=n*58n+BigInt(v); }
    var bytes=[]; while(n>0n){ bytes.unshift(Number(n&255n)); n>>=8n; }
    for(i=0;i<str.length && str[i]==='1';i++) bytes.unshift(0);
    return new Uint8Array(bytes);
  }
  function b58check(payload){ var c=sha256(sha256(payload)); var full=new Uint8Array(payload.length+4); full.set(payload); full.set(c.subarray(0,4),payload.length); return b58encode(full); }
  function addressToHash160(addr){ var d=b58decode(addr); if(d.length!==25||d[0]!==0) throw new Error('not a P2PKH address'); var c=sha256(sha256(d.subarray(0,21))); for(var i=0;i<4;i++) if(c[i]!==d[21+i]) throw new Error('bad checksum'); return d.subarray(1,21); }
  function hash160ToAddress(h){ var p=new Uint8Array(21); p[0]=0; p.set(h,1); return b58check(p); }
  function privToWIF(k){ var p=new Uint8Array(34); p[0]=0x80; var x=k; for(var i=32;i>=1;i--){ p[i]=Number(x&255n); x>>=8n; } p[33]=1; return b58check(p); }
  function privToAddress(k){ var pt=mulG(k); if(!pt) return null; return hash160ToAddress(hash160(compressed(pt))); }
  function hex64(k){ return k.toString(16).padStart(64,'0'); }

  /* ---------- Fast kernels ----------
     Every candidate key hashes exactly one 64-byte SHA-256 block (a 33-byte compressed
     pubkey) followed by one RIPEMD-160 block (its 32-byte digest), so both are
     specialised below: no per-call allocation, padding words precomputed, single block. */
  var SH33_W = new Int32Array(64);
  var SH33_OUT = new Uint8Array(32);
  function sha256_33(msg){ // msg: Uint8Array(33) -> SH33_OUT (32 bytes, reused scratch)
    var W = SH33_W;
    for(var i=0;i<8;i++) W[i]=(msg[i*4]<<24)|(msg[i*4+1]<<16)|(msg[i*4+2]<<8)|msg[i*4+3];
    W[8]=(msg[32]<<24)|0x00800000;
    W[9]=0; W[10]=0; W[11]=0; W[12]=0; W[13]=0; W[14]=0; W[15]=264;
    for(i=16;i<64;i++){ var w15=W[i-15], w2=W[i-2];
      var s0=((w15>>>7)|(w15<<25)) ^((w15>>>18)|(w15<<14))^(w15>>>3);
      var s1=((w2>>>17)|(w2<<15))^((w2>>>19)|(w2<<13))^(w2>>>10);
      W[i]=(W[i-16]+s0+W[i-7]+s1)|0; }
    var a=0x6a09e667,b=0xbb67ae85,c=0x3c6ef372,d=0xa54ff53a,e=0x510e527f,f=0x9b05688c,g=0x1f83d9ab,h=0x5be0cd19;
    for(i=0;i<64;i++){
      var S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      var ch=(e&f)^(~e&g);
      var t1=(h+S1+ch+K256[i]+W[i])|0;
      var S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      var maj=(a&b)^(a&c)^(b&c);
      var t2=(S0+maj)|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    var out = SH33_OUT;
    var H=[(a+0x6a09e667)|0,(b+0xbb67ae85)|0,(c+0x3c6ef372)|0,(d+0xa54ff53a)|0,(e+0x510e527f)|0,(f+0x9b05688c)|0,(g+0x1f83d9ab)|0,(h+0x5be0cd19)|0];
    for(i=0;i<8;i++){ out[i*4]=H[i]>>>24; out[i*4+1]=(H[i]>>>16)&255; out[i*4+2]=(H[i]>>>8)&255; out[i*4+3]=H[i]&255; }
    return out;
  }
  var RM32_X = new Int32Array(16);
  var RM32_OUT = new Uint8Array(20);
  function ripemd160_32(msg){ // msg: Uint8Array(32) -> RM32_OUT (20 bytes, reused scratch)
    var X = RM32_X;
    for(var i=0;i<8;i++) X[i]=msg[i*4]|(msg[i*4+1]<<8)|(msg[i*4+2]<<16)|(msg[i*4+3]<<24);
    X[8]=0x80; X[9]=0; X[10]=0; X[11]=0; X[12]=0; X[13]=0; X[14]=256; X[15]=0;
    var al=0x67452301,bl=0xEFCDAB89|0,cl=0x98BADCFE|0,dl=0x10325476,el=0xC3D2E1F0|0;
    var ar=al,br=bl,cr=cl,dr=dl,er=el, t;
    for(var j=0;j<80;j++){
      var r=j>>4;
      t=(rotl((al+rf(j,bl,cl,dl)+X[RL[j]]+KL[r])|0,SL[j])+el)|0; al=el; el=dl; dl=rotl(cl,10); cl=bl; bl=t;
      t=(rotl((ar+rf(79-j,br,cr,dr)+X[RR[j]]+KR[r])|0,SR[j])+er)|0; ar=er; er=dr; dr=rotl(cr,10); cr=br; br=t;
    }
    // Final combine with the IV (the running h0..h4 of a single block): out0 = h1+cl+dr, etc.
    var H=[(0xEFCDAB89+cl+dr)|0,(0x98BADCFE+dl+er)|0,(0x10325476+el+ar)|0,(0xC3D2E1F0+al+br)|0,(0x67452301+bl+cr)|0];
    var out = RM32_OUT;
    for(i=0;i<5;i++){ out[i*4]=H[i]&255; out[i*4+1]=(H[i]>>>8)&255; out[i*4+2]=(H[i]>>>16)&255; out[i*4+3]=(H[i]>>>24)&255; }
    return out;
  }
  function hash160_33(msg){ return ripemd160_32(sha256_33(msg)); } // -> RM32_OUT scratch

  /* Fused pipeline: hash160 of the compressed pubkey of lane i in flat limb arrays,
     without ever materialising bytes. SHA-256 input words are built straight from the
     x-coordinate limbs; RIPEMD-160 input words are byte-swapped SHA-256 state words.
     Returns RM32_W5: five int32 little-endian output words (reused scratch). */
  var RM32_W5 = new Int32Array(5);
  function bswap32(x){ return (x>>>24)|((x>>>8)&0xFF00)|((x<<8)&0xFF0000)|(x<<24); }
  function hash160x(xs,ys,i){
    var bo=i*8, W=SH33_W;
    var x0=xs[bo],x1=xs[bo+1],x2=xs[bo+2],x3=xs[bo+3],x4=xs[bo+4],x5=xs[bo+5],x6=xs[bo+6],x7=xs[bo+7];
    W[0]=((ys[bo]&1)?0x03000000:0x02000000)|(x7>>>8);
    W[1]=(x7<<24)|(x6>>>8); W[2]=(x6<<24)|(x5>>>8); W[3]=(x5<<24)|(x4>>>8); W[4]=(x4<<24)|(x3>>>8);
    W[5]=(x3<<24)|(x2>>>8); W[6]=(x2<<24)|(x1>>>8); W[7]=(x1<<24)|(x0>>>8);
    W[8]=(x0<<24)|0x00800000;
    W[9]=0; W[10]=0; W[11]=0; W[12]=0; W[13]=0; W[14]=0; W[15]=264;
    var w15, w2, s0, s1, S0, S1, ch, maj, t1, t2;
    for(i=16;i<64;i++){ w15=W[i-15]; w2=W[i-2];
      s0=((w15>>>7)|(w15<<25))^((w15>>>18)|(w15<<14))^(w15>>>3);
      s1=((w2>>>17)|(w2<<15))^((w2>>>19)|(w2<<13))^(w2>>>10);
      W[i]=(W[i-16]+s0+W[i-7]+s1)|0; }
    var a=0x6a09e667,b=0xbb67ae85,c=0x3c6ef372,d=0xa54ff53a,e=0x510e527f,f=0x9b05688c,g=0x1f83d9ab,h=0x5be0cd19;
    for(i=0;i<64;i++){
      S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      ch=(e&f)^(~e&g);
      t1=(h+S1+ch+K256[i]+W[i])|0;
      S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      maj=(a&b)^(a&c)^(b&c);
      t2=(S0+maj)|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    var X=RM32_X;
    X[0]=bswap32((a+0x6a09e667)|0); X[1]=bswap32((b+0xbb67ae85)|0); X[2]=bswap32((c+0x3c6ef372)|0); X[3]=bswap32((d+0xa54ff53a)|0);
    X[4]=bswap32((e+0x510e527f)|0); X[5]=bswap32((f+0x9b05688c)|0); X[6]=bswap32((g+0x1f83d9ab)|0); X[7]=bswap32((h+0x5be0cd19)|0);
    X[8]=0x80; X[9]=0; X[10]=0; X[11]=0; X[12]=0; X[13]=0; X[14]=256; X[15]=0;
    var al=0x67452301,bl=0xEFCDAB89|0,cl=0x98BADCFE|0,dl=0x10325476,el=0xC3D2E1F0|0;
    var ar=al,br=bl,cr=cl,dr=dl,er=el, t;
    for(var j=0;j<80;j++){
      var r=j>>4;
      t=(rotl((al+rf(j,bl,cl,dl)+X[RL[j]]+KL[r])|0,SL[j])+el)|0; al=el; el=dl; dl=rotl(cl,10); cl=bl; bl=t;
      t=(rotl((ar+rf(79-j,br,cr,dr)+X[RR[j]]+KR[r])|0,SR[j])+er)|0; ar=er; er=dr; dr=rotl(cr,10); cr=br; br=t;
    }
    var O=RM32_W5;
    O[0]=(0xEFCDAB89+cl+dr)|0; O[1]=(0x98BADCFE+dl+er)|0; O[2]=(0x10325476+el+ar)|0; O[3]=(0xC3D2E1F0+al+br)|0; O[4]=(0x67452301+bl+cr)|0;
    return O;
  }

  /* ----- fast field: 8 x 32-bit limbs, little-endian, always fully reduced -----
     Reduction exploits P = 2^256 - 2^32 - 977, so 2^256 ≡ 2^32 + 977 (mod P). */
  var PL = new Uint32Array(8), GXL = new Uint32Array(8), GYL = new Uint32Array(8);
  function fFromBig(b, out){ for(var i=0;i<8;i++){ out[i]=Number(b & 0xFFFFFFFFn); b >>= 32n; } return out; }
  function fToBig(a){ var r=0n; for(var i=7;i>=0;i--) r=(r<<32n)|BigInt(a[i]); return r; }
  fFromBig(P, PL); fFromBig(GX, GXL); fFromBig(GY, GYL);

  function mulh(a,b){ // high 32 bits of the unsigned 32x32 product, exact via 16-bit halves
    var aL=a&0xFFFF, aH=a>>>16, bL=b&0xFFFF, bH=b>>>16;
    var m=aH*bL + aL*bH + ((aL*bL)>>>16);
    return aH*bH + Math.floor(m/65536);
  }
  var FT=new Uint32Array(16), FU=new Uint32Array(10);
  function fgeq(a,b){ for(var i=7;i>=0;i--){ if(a[i]!==b[i]) return a[i]>b[i]; } return true; }
  function fsubP(a){ var b=0,v; for(var i=0;i<8;i++){ v=a[i]-PL[i]-b; if(v<0){ v+=4294967296; b=1; } else b=0; a[i]=v; } }
  function fmul(r,a,b){ // r = a*b mod P; safe for r aliasing a or b
    var T=FT, carry=0, i, v, c;
    for(var k=0;k<16;k++){
      var lo=carry, hi=0;
      var i0=k>7?k-7:0, i1=k<7?k:7;
      for(i=i0;i<=i1;i++){ var ai=a[i], bj=b[k-i]; lo+=(Math.imul(ai,bj)>>>0); hi+=mulh(ai,bj); }
      T[k]=lo; carry=Math.floor(lo/4294967296)+hi;
    }
    // First fold: U = T_lo + T_hi*(977 + 2^32), up to 10 limbs.
    var U=FU; c=0;
    for(i=0;i<8;i++){ v=T[i]+T[8+i]*977+c; U[i]=v; c=Math.floor(v/4294967296); }
    U[8]=c;
    c=0;
    for(i=0;i<8;i++){ v=U[i+1]+T[8+i]+c; U[i+1]=v; c=Math.floor(v/4294967296); }
    U[9]=c;
    // Second fold: r = U_lo + h*(977 + 2^32) where h = U[8] + U[9]*2^32 < 2^34.
    var h=U[8]+U[9]*4294967296;
    var m=h*977, mLo=m%4294967296, mHi=Math.floor(m/4294967296);
    var hLo=h%4294967296, hHi=Math.floor(h/4294967296);
    v=U[0]+mLo; r[0]=v; c=Math.floor(v/4294967296);
    v=U[1]+mHi+hLo+c; r[1]=v; c=Math.floor(v/4294967296);
    v=U[2]+hHi+c; r[2]=v; c=Math.floor(v/4294967296);
    for(i=3;i<8;i++){ v=U[i]+c; r[i]=v; c=Math.floor(v/4294967296); }
    var guard=0;
    while(c){                            // fold an escaped carry: 2^256 ≡ 977 + 2^32
      v=r[0]+c*977; r[0]=v; var c2=Math.floor(v/4294967296);
      v=r[1]+c+c2; r[1]=v; c2=Math.floor(v/4294967296);
      for(i=2;i<8 && c2;i++){ v=r[i]+c2; r[i]=v; c2=Math.floor(v/4294967296); }
      c=c2; if(++guard>4) break;         // unreachable in practice
    }
    while(fgeq(r,PL)) fsubP(r);
    return r;
  }
  function fadd(r,a,b){ // r = a+b mod P; safe for aliasing
    var c=0, v, i;
    for(i=0;i<8;i++){ v=a[i]+b[i]+c; r[i]=v; c=v>4294967295?1:0; }
    if(c){ // a+b overflowed 256 bits: add back 2^256 mod P = 977 + 2^32
      v=r[0]+977; r[0]=v; var c2=v>4294967295?1:0;
      v=r[1]+1+c2; r[1]=v; c2=v>4294967295?1:0;
      for(i=2;i<8 && c2;i++){ v=r[i]+1; r[i]=v; c2=v>4294967295?1:0; }
    }
    if(fgeq(r,PL)) fsubP(r);
    return r;
  }
  function fsub(r,a,b){ // r = a-b mod P; safe for aliasing
    var br=0, v, i;
    for(i=0;i<8;i++){ v=a[i]-b[i]-br; if(v<0){ v+=4294967296; br=1; } else br=0; r[i]=v; }
    if(br){ var c=0; for(i=0;i<8;i++){ v=r[i]+PL[i]+c; r[i]=v; c=v>4294967295?1:0; } }
    return r;
  }
  function feq8(a,b){ for(var i=0;i<8;i++) if(a[i]!==b[i]) return false; return true; }
  function fcopyFrom(r,src,off){ for(var i=0;i<8;i++) r[i]=src[off+i]; }
  function fcopyTo(dst,off,src){ for(var i=0;i<8;i++) dst[off+i]=src[i]; }

  // Scratch for the batched lane stepper: per-lane d and prefix arrays grown on demand,
  // plus fixed temporaries so the hot loop never allocates.
  var BSCR=null;
  var TX=new Uint32Array(8), TY=new Uint32Array(8), TD=new Uint32Array(8), TDI=new Uint32Array(8),
      TAI=new Uint32Array(8), TL=new Uint32Array(8), TX3=new Uint32Array(8), TY3=new Uint32Array(8),
      TT=new Uint32Array(8), TACC=new Uint32Array(8);
  // Affine addition of G to n lane points at once with one batched inversion
  // (Montgomery trick, same construction as batchAddG but on limb lanes).
  // xs/ys are flat Uint32Array(n*8) lane coordinates; mutated in place.
  function batchAddGL(xs,ys,n){
    if(!BSCR || BSCR.d.length < n*8) BSCR={ d:new Uint32Array(n*8), pf:new Uint32Array(n*8) };
    var d=BSCR.d, pf=BSCR.pf, i;
    TACC[0]=1; for(i=1;i<8;i++) TACC[i]=0;
    for(i=0;i<n;i++){
      fcopyFrom(TX,xs,i*8);
      if(feq8(TX,GXL)){ fcopyFrom(TY,ys,i*8); fadd(TD,TY,TY); } // lane point is G: doubling slope
      else fsub(TD,GXL,TX);
      fcopyTo(d,i*8,TD);
      fcopyTo(pf,i*8,TACC);
      fmul(TACC,TACC,TD);
    }
    fFromBig(inv(fToBig(TACC)),TAI); // one BigInt inversion per batch, amortised over n lanes
    for(i=n-1;i>=0;i--){
      fcopyFrom(TT,pf,i*8); fmul(TDI,TAI,TT);
      fcopyFrom(TT,d,i*8);  fmul(TAI,TAI,TT);
      fcopyFrom(TX,xs,i*8); fcopyFrom(TY,ys,i*8);
      if(feq8(TX,GXL)){ fmul(TL,TX,TX); fadd(TT,TL,TL); fadd(TL,TT,TL); fmul(TL,TL,TDI); }
      else { fsub(TL,GYL,TY); fmul(TL,TL,TDI); }
      fmul(TX3,TL,TL); fsub(TX3,TX3,TX); fsub(TX3,TX3,GXL);
      fsub(TT,TX,TX3); fmul(TT,TL,TT); fsub(TY3,TT,TY);
      fcopyTo(xs,i*8,TX3); fcopyTo(ys,i*8,TY3);
    }
  }
  function pointToLimbs(xs,ys,i,pt){ fFromBig(pt[0],TT); fcopyTo(xs,i*8,TT); fFromBig(pt[1],TT); fcopyTo(ys,i*8,TT); }
  function fastCompressed(out,xs,ys,i){ // 33-byte compressed pubkey of lane i into out
    var bo=i*8;
    out[0]=(ys[bo]&1)?3:2;
    for(var j=0;j<8;j++){ var w=xs[bo+7-j]; out[1+j*4]=w>>>24; out[2+j*4]=(w>>>16)&255; out[3+j*4]=(w>>>8)&255; out[4+j*4]=w&255; }
    return out;
  }

  root.PuzzleCrypto = { sha256:sha256, ripemd160:ripemd160, hash160:hash160, mulG:mulG, batchAddG:batchAddG, compressed:compressed, addressToHash160:addressToHash160, hash160ToAddress:hash160ToAddress, privToWIF:privToWIF, privToAddress:privToAddress, hex64:hex64, N:N, GX:GX, GY:GY,
    sha256_33:sha256_33, ripemd160_32:ripemd160_32, hash160_33:hash160_33, hash160x:hash160x, batchAddGL:batchAddGL, pointToLimbs:pointToLimbs, fastCompressed:fastCompressed,
    FastField:{ fmul:fmul, fadd:fadd, fsub:fsub, fFromBig:fFromBig, fToBig:fToBig, P:P } };
}(typeof self !== 'undefined' ? self : this));
