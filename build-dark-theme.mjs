// Rebuild the derived dark style after editing either light stylesheet or
// hand-reviewed dark semantic overrides. No external dependencies required.
// Usage: node build-dark-theme.mjs [--check]
import {readFileSync,writeFileSync} from 'node:fs';
import {generateDarkTheme} from './theme-dark-builder.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const rendered=generateDarkTheme([read('style.css'),read('catalog-ui.css')],read('theme-dark-overrides.css'));
const filename=new URL('theme-dark.css',import.meta.url);
if(process.argv.includes('--check')){
 if(readFileSync(filename,'utf8')!==rendered){
  console.error('theme-dark.css устарел. Запусти: node build-dark-theme.mjs');
  process.exitCode=1;
 }else console.log('Dark theme is up to date.');
}else{
 writeFileSync(filename,rendered);
 console.log('Generated theme-dark.css: '+rendered.length+' bytes.');
}
