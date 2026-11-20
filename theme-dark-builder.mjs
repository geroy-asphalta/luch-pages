// Deterministic dark-theme compiler. Converts only color declarations in existing
// CSS, preserving all layout geometry, fonts, animations and media queries.
// The human-reviewed semantic palette is kept in theme-dark-overrides.css.
export function generateDarkTheme(sources,overrides=''){
 function rgb(hex){
  let raw=hex.slice(1);
  if(raw.length===3||raw.length===4)raw=[...raw].map(ch=>ch+ch).join('');
  const channels=[0,2,4].map(i=>parseInt(raw.slice(i,i+2),16)/255);
  const alpha=raw.length===8?raw.slice(6,8):null;
  return {channels,alpha};
 }
 function toHsl(channels){
  const [r,g,b]=channels,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(d){
   s=d/(1-Math.abs(2*l-1));
   switch(max){
    case r:h=((g-b)/d)%6;break;
    case g:h=(b-r)/d+2;break;
    default:h=(r-g)/d+4;
   }
   h=(h*60+360)%360;
  }
  return {h,s,l};
 }
 function fromHsl(h,s,l){
  const a=s*Math.min(l,1-l);
  const f=n=>{
   const k=(n+h/30)%12;
   return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));
  };
  return '#'+[f(0),f(8),f(4)].map(n=>n.toString(16).padStart(2,'0')).join('');
 }
 function convertColor(hex,property,selector){
  const {channels,alpha}=rgb(hex);
  const {h,s,l}=toHsl(channels);
  const prop=property.toLowerCase();
  const isBg=prop==='background'||prop==='background-color';
  const isText=prop==='color'||prop==='caret-color'||prop==='fill'||prop==='stroke'||prop.endsWith('text-fill-color');
  const isBorder=prop.startsWith('border')||prop.startsWith('outline');
  const semantic=/(?:\.day[.:\[]|\.calendar-event|(?:^|[\s.#-])(?:lab|chemo|hlt|eln|maintenance|breakdown|skip|issued|delivered|holiday|workday|production|status|warning|danger|error|done)(?:[-.\s:\[]|$)|\.type-tag)/i.test(selector);
  const tinted=s>.19&&h>13&&h<350;
  let value;
  if(isText){
   if(s>.43&&l<.86)value=fromHsl(h,Math.min(.74,Math.max(.47,s)),.73);
   else if(l>.92)value='#eff5f8';
   else if(l>.66)value='#afc1cf';
   else if(l>.44)value='#c7d5df';
   else value='#e8f0f5';
  }else if(isBg){
   if(selector.trim()===':root')value='#151d26';
   else if(/\.topbar\b/.test(selector)&&!/button|cloud|theme/.test(selector))value='#111a23';
   else if(tinted&&(semantic||l>.66))value=fromHsl(h,Math.max(.31,Math.min(.49,s*.67)),l>.74?.255:.32);
   else if(l>.975)value='#202c38';
   else if(l>.92)value='#253544';
   else if(l>.82)value='#2b3b49';
   else if(l>.62)value='#344656';
   else if(l>.36)value='#2a3948';
   else value='#192935';
  }else if(isBorder){
   if(tinted&&semantic)value=fromHsl(h,.39,.42);
   else value=l<.2?'#4c6070':'#3c5060';
  }else if(prop==='box-shadow'||prop==='text-shadow'){
   value='#000000';
  }else{
   value=isText?'#e8f0f5':'#344656';
  }
  return value+(alpha||'');
 }
 const hexColor=/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
 function transformValue(value,property,selector){
  const p=property.trim().toLowerCase();
  if(!/^(?:color|caret-color|background|background-color|border(?:-(?:top|bottom|left|right|color))?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|-webkit-text-fill-color)$/.test(p))return null;
  let mapped=value.replace(hexColor,color=>convertColor(color,p,selector));
  // Explicit named CSS colors also occur in the original light theme.
  if(p==='background'||p==='background-color'||p==='color'){
   mapped=mapped.replace(/\b(white|black)\b/g,(word)=>{
    if(p==='color')return word==='white'?'#eff5f8':'#e8f0f5';
    return word==='white'?'#202c38':'#151d26';
   });
  }
  // Leave RGBA backdrop and shadow transparency unchanged (never turn
  // opaque), and keep transparent/inherit/currentColor untouched.
  return mapped!==value?mapped:null;
 }
 function splitComma(selector){
  const items=[];let depth=0,quote='',start=0;
  for(let i=0;i<selector.length;i++){
   const c=selector[i];
   if(quote){if(c===quote&&selector[i-1]!=='\\')quote='';continue;}
   if(c==='"'||c==="'"){quote=c;continue;}
   if(c==='('||c==='[')depth++;
   else if(c===')'||c===']')depth--;
   else if(c===','&&depth===0){items.push(selector.slice(start,i).trim());start=i+1;}
  }
  items.push(selector.slice(start).trim());
  return items.filter(Boolean);
 }
 function splitStatements(body){
  const list=[];let depth=0,quote='',start=0;
  for(let i=0;i<body.length;i++){
   const c=body[i];
   if(quote){if(c===quote&&body[i-1]!=='\\')quote='';continue;}
   if(c==='"'||c==="'"){quote=c;continue;}
   if(c==='('||c==='[')depth++;
   else if(c===')'||c===']')depth--;
   else if(c===';'&&depth===0){list.push(body.slice(start,i));start=i+1;}
  }
  list.push(body.slice(start));
  return list;
 }
 function prefix(selector){
  if(selector===':root'||selector==='html')return 'html[data-theme="dark"]';
  if(/^html(?=[\s.:#[>])/i.test(selector))return selector.replace(/^html/i,'html[data-theme="dark"]');
  return 'html[data-theme="dark"] '+selector;
 }
 function walk(css){
  const input=css.replace(/\/\*[\s\S]*?\*\//g,'');
  let output='',cursor=0;
  while(cursor<input.length){
   const start=input.indexOf('{',cursor);
   if(start<0)break;
   const selector=input.slice(cursor,start).trim();
   let i=start+1,depth=1,quote='';
   for(;i<input.length&&depth;i++){
    const ch=input[i];
    if(quote){if(ch===quote&&input[i-1]!=='\\')quote='';continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}')depth--;
   }
   const body=input.slice(start+1,i-1);cursor=i;
   if(!selector)continue;
   if(/^@(?:media|supports|container|layer)\b/.test(selector)){
    const nested=walk(body);
    if(nested)output+=selector+'{\n'+nested+'}\n';
    continue;
   }
   if(selector.startsWith('@'))continue; // animations, @font-face etc.
   const declarations=[];
   for(const statement of splitStatements(body)){
    const colon=statement.indexOf(':');if(colon<1)continue;
    const key=statement.slice(0,colon).trim(),value=statement.slice(colon+1).trim();
    const converted=transformValue(value,key,selector);
    if(converted!==null)declarations.push(key+':'+converted);
   }
   if(!declarations.length)continue;
   const convertedSelector=splitComma(selector).map(prefix).join(',\n');
   output+=convertedSelector+'{'+declarations.join(';')+'}\n';
  }
  return output;
 }
 const input=Array.isArray(sources)?sources:[sources];
 const sections=input.map((s,i)=>'/* Generated dark declarations: source '+(i+1)+' */\n'+walk(s)).join('\n');
 return '/* AUTO-GENERATED by theme-dark-builder.mjs. Do not edit generated rules. */\n'+
  sections+'\n/* Carefully reviewed contrast, semantic treatment colors and chrome */\n'+overrides.trim()+'\n';
}
