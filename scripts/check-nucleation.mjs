import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../node_modules/nucleation/',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const exports=new Set(WebAssembly.Module.exports(new WebAssembly.Module(await readFile(new URL('nucleation.wasm',root)))).map(e=>e.name));
const missing={};let checked=0;
for(const file of await readdir(root)){if(!file.endsWith('.mjs') || file.startsWith('diplomat'))continue;const code=await readFile(new URL(file,root),'utf8');for(const name of new Set([...code.matchAll(/wasm\.([\w]+)\(/g)].map(m=>m[1]))){checked++;if(!exports.has(name))(missing[file.replace('.mjs','')]??=[]).push(name);}}
const report={version:pkg.version,checked,missing};
const path=new URL('../client/src/generated/nucleationCapabilities.json',import.meta.url);
if(process.argv.includes('--write'))await writeFile(path,JSON.stringify(report,null,2)+'\n');
else {const baseline=JSON.parse(await readFile(path,'utf8'));if(JSON.stringify(baseline)!==JSON.stringify(report))throw new Error('Nucleation API coverage changed. Review and regenerate the capabilities report with --write.');}
console.log(JSON.stringify(report,null,2));
