// Returns the actual width of frozen horizontal columns. Headers may remain
// vertically sticky on tablets while scrolling horizontally with the dates.
export function frozenHeaderWidth(calendar){
 return [...calendar.querySelectorAll('thead th.sticky')].reduce((sum,th)=>{
  const style=typeof getComputedStyle==='function'?getComputedStyle(th):null;
  if(style&&(style.display==='none'||style.position!=='sticky'||style.left==='auto'))return sum;
  return sum+th.getBoundingClientRect().width;
 },0);
}
