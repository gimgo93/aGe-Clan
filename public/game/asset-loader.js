/* Bounded downloads; successful images survive retries. No gameplay starts until ready. */
window.GameAssets={
 async load(names,urlFor,images,onProgress=()=>{},options={}){
  let cursor=0,completed=0;const errors=[];
  async function worker(){while(cursor<names.length){const name=names[cursor++];
   try{if(!images[name])images[name]=await new Promise((resolve,reject)=>{
    const image=new Image();let done=false;
    const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;error?reject(error):resolve(image);};
    const timer=setTimeout(()=>{finish(Error(name+' 로딩 시간이 초과됐습니다.'));image.src='';},options.timeoutMs||20000);
    image.decoding='async';image.onload=async()=>{try{if(image.decode)await image.decode();finish();}catch{finish(Error(name+' 이미지 준비에 실패했습니다.'));}};
    image.onerror=()=>finish(Error(name+' 이미지를 불러오지 못했습니다.'));image.src=urlFor(name);
   });}catch(error){errors.push(error);}finally{onProgress(++completed,names.length);}
  }}
  await Promise.all(Array.from({length:Math.min(options.concurrency||4,names.length)},worker));
  if(errors.length)throw errors[0];
 }
};
